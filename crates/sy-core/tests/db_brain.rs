//! Database-backed brain tests: knowledge-base documents on the shipped
//! `brain.documents` (text learned as `document:{id}:chunk{n}` knowledge) and
//! the pgvector store over the memories' and knowledge entries' `embedding`
//! columns. Skipped unless `SY_TEST_DATABASE_URL` is set (see
//! `common::db_state`).

#[allow(dead_code)]
mod common;

use axum::Router;
use axum::http::StatusCode;
use common::{authed_request as req, json, send};
use serde_json::Value;
use sy_core::brain::pg_vector::{EMBEDDING_DIMENSIONS, PgVectorStore};
use sy_core::brain::vector::{VectorError, VectorStore};
use sy_core::server::build_router;

async fn call(
    app: &Router,
    token: &str,
    method: &str,
    path: &str,
    body: Option<&str>,
) -> (StatusCode, Value) {
    let (status, bytes) = send(app.clone(), req(method, path, token, body)).await;
    let value = if bytes.is_empty() {
        Value::Null
    } else {
        json(&bytes)
    };
    (status, value)
}

async fn chunk_sizes(pool: &sqlx::PgPool, doc_id: &str) -> Vec<i32> {
    sqlx::query_scalar(
        "SELECT octet_length(content) FROM brain.knowledge
         WHERE starts_with(source, $1) ORDER BY source",
    )
    .bind(format!("document:{doc_id}:"))
    .fetch_all(pool)
    .await
    .unwrap()
}

#[tokio::test]
async fn text_documents_are_learned_listed_and_deleted_with_their_chunks() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let pool = state.db().unwrap().clone();
    let app = build_router(state);
    let admin = common::test_token("admin");

    let title = format!("Runbook {}", uuid::Uuid::now_v7());
    let body = serde_json::json!({
        "title": title,
        "text": "Restart the ingest worker first.\n\nThen drain the queue.",
        "visibility": "shared",
    })
    .to_string();
    let (status, created) = call(
        &app,
        &admin,
        "POST",
        "/api/v1/brain/documents/ingest-text",
        Some(&body),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    let doc = &created["document"];
    assert_eq!(doc["status"], "ready");
    assert_eq!(doc["format"], "txt");
    assert_eq!(doc["visibility"], "shared");
    assert_eq!(doc["trustScore"], 0.5);
    assert!(doc["chunkCount"].as_i64().unwrap() >= 1);
    let id = doc["id"].as_str().unwrap().to_string();
    assert!(!chunk_sizes(&pool, &id).await.is_empty());

    // Listed, filtered by visibility; fetched by id.
    let (status, list) = call(
        &app,
        &admin,
        "GET",
        "/api/v1/brain/documents?visibility=shared",
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        list["documents"]
            .as_array()
            .unwrap()
            .iter()
            .any(|d| d["id"] == id.as_str())
    );
    assert!(list["total"].as_i64().unwrap() >= 1);
    let (_, private) = call(
        &app,
        &admin,
        "GET",
        "/api/v1/brain/documents?visibility=private",
        None,
    )
    .await;
    assert!(
        !private["documents"]
            .as_array()
            .unwrap()
            .iter()
            .any(|d| d["id"] == id.as_str())
    );
    let path = format!("/api/v1/brain/documents/{id}");
    let (status, got) = call(&app, &admin, "GET", &path, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(got["document"]["title"], title.as_str());

    // Long multi-byte text is split to fit, never inside a character.
    let long = serde_json::json!({ "title": "accents", "text": "é".repeat(5_000) }).to_string();
    let (status, accents) = call(
        &app,
        &admin,
        "POST",
        "/api/v1/brain/documents/ingest-text",
        Some(&long),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{accents}");
    let accents_id = accents["document"]["id"].as_str().unwrap().to_string();
    let sizes = chunk_sizes(&pool, &accents_id).await;
    assert!(
        sizes.len() >= 4,
        "10,000 bytes in pieces of at most 3,200: {sizes:?}"
    );
    assert!(sizes.iter().all(|&n| n <= 3_200 && n % 2 == 0), "{sizes:?}");

    // Delete removes the document and its chunks.
    for doc_id in [&id, &accents_id] {
        let path = format!("/api/v1/brain/documents/{doc_id}");
        let (status, _) = call(&app, &admin, "DELETE", &path, None).await;
        assert_eq!(status, StatusCode::NO_CONTENT);
        assert!(chunk_sizes(&pool, doc_id).await.is_empty());
        for method in ["GET", "DELETE"] {
            let (status, _) = call(&app, &admin, method, &path, None).await;
            assert_eq!(status, StatusCode::NOT_FOUND, "{method}");
        }
    }

    // Validation, an unknown personality, and URL ingestion (not ported).
    for bad in [r#"{"title":"t"}"#, r#"{"text":"x","title":"  "}"#] {
        let (status, _) = call(
            &app,
            &admin,
            "POST",
            "/api/v1/brain/documents/ingest-text",
            Some(bad),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{bad}");
    }
    let (status, _) = call(
        &app,
        &admin,
        "POST",
        "/api/v1/brain/documents/ingest-text",
        Some(r#"{"text":"x","title":"t","personalityId":"no-such-personality"}"#),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, _) = call(
        &app,
        &admin,
        "POST",
        "/api/v1/brain/documents/ingest-url",
        Some(r#"{"url":"file:///etc/passwd"}"#),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, _) = call(
        &app,
        &admin,
        "POST",
        "/api/v1/brain/documents/ingest-url",
        Some(r#"{"url":"https://example.com"}"#),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_IMPLEMENTED);
}

/// A unit vector along `axis`, with a little weight on the next axis.
fn embedding(axis: usize) -> Vec<f32> {
    let mut v = vec![0.0_f32; EMBEDDING_DIMENSIONS];
    v[axis] = 1.0;
    v[(axis + 1) % EMBEDDING_DIMENSIONS] = 0.1;
    v
}

#[tokio::test]
async fn pg_vector_indexes_memories_and_knowledge_in_place() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let pool = state.db().unwrap().clone();
    let tenant = format!("vec-{}", uuid::Uuid::now_v7());
    let store = PgVectorStore::new(pool.clone(), tenant.clone());

    let (memory, knowledge) = (
        uuid::Uuid::now_v7().to_string(),
        uuid::Uuid::now_v7().to_string(),
    );
    sqlx::query(
        "INSERT INTO brain.memories (id, type, content, source, created_at, updated_at, tenant_id)
         VALUES ($1, 'semantic', 'm', 'test', 1, 1, $2)",
    )
    .bind(&memory)
    .bind(&tenant)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO brain.knowledge (id, topic, content, source, created_at, updated_at, tenant_id)
         VALUES ($1, 't', 'k', 'test', 1, 1, $2)",
    )
    .bind(&knowledge)
    .bind(&tenant)
    .execute(&pool)
    .await
    .unwrap();

    store
        .insert(&memory, &embedding(3), Value::Null)
        .await
        .unwrap();
    store
        .insert_batch(&[(knowledge.clone(), embedding(200), Value::Null)])
        .await
        .unwrap();
    assert_eq!(store.count().await.unwrap(), 2);

    // Unknown ids, wrong widths and zero vectors are not indexed.
    assert!(
        store
            .insert("no-such-entry", &embedding(1), Value::Null)
            .await
            .is_err()
    );
    assert!(matches!(
        store.insert(&memory, &[1.0, 0.0], Value::Null).await,
        Err(VectorError::DimensionMismatch {
            expected: 384,
            got: 2
        })
    ));
    store
        .insert(&memory, &[0.0; EMBEDDING_DIMENSIONS], Value::Null)
        .await
        .unwrap();
    assert_eq!(store.count().await.unwrap(), 2);

    // Nearest first, across both kinds; a zero query finds nothing.
    let hits = store.search(&embedding(3), 5, 0.5).await.unwrap();
    assert_eq!(hits.len(), 1, "{hits:?}");
    assert_eq!(hits[0].id, memory);
    assert!((hits[0].score - 1.0).abs() < 1e-4);
    assert_eq!(hits[0].metadata["kind"], "memory");
    let hits = store.search(&embedding(200), 5, 0.5).await.unwrap();
    assert_eq!(hits[0].id, knowledge);
    assert_eq!(hits[0].metadata["kind"], "knowledge");
    assert!(
        store
            .search(&[0.0; EMBEDDING_DIMENSIONS], 5, 0.0)
            .await
            .unwrap()
            .is_empty()
    );

    // A zero embedding written by an older build scores NaN: never a hit.
    sqlx::query("UPDATE brain.knowledge SET embedding = $1::vector WHERE id = $2")
        .bind(vec![0.0_f32; EMBEDDING_DIMENSIONS])
        .bind(&knowledge)
        .execute(&pool)
        .await
        .unwrap();
    let hits = store.search(&embedding(3), 5, 0.0).await.unwrap();
    assert!(
        hits.iter().all(|h| h.id != knowledge && !h.score.is_nan()),
        "{hits:?}"
    );

    // Delete clears the vector, not the entry.
    assert!(store.delete(&memory).await.unwrap());
    assert!(!store.delete(&memory).await.unwrap());
    let still_there: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM brain.memories WHERE id = $1")
        .bind(&memory)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(still_there, 1);

    sqlx::query("DELETE FROM brain.memories WHERE tenant_id = $1")
        .bind(&tenant)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM brain.knowledge WHERE tenant_id = $1")
        .bind(&tenant)
        .execute(&pool)
        .await
        .unwrap();
}
