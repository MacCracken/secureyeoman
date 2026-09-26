//! Database-backed marketplace tests: NULL JSON columns, the community status
//! derived from synced rows, community personalities read from what the sync
//! stored and installed into the soul, and the git-fetch policy gate. Skipped
//! unless `SY_TEST_DATABASE_URL` is set (see `common::db_state`).

#[allow(dead_code)]
mod common;

use axum::Router;
use axum::http::StatusCode;
use common::{authed_request as req, json, send};
use serde_json::Value;
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

const PERSONALITY_MD: &str = "---\nname: Ares\ndescription: God of war\ntraits: [bold]\nsex: male\n---\nYou are Ares.\n\n- **humor**: dry\n";

#[tokio::test]
async fn community_content_reads_from_the_synced_rows() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let pool = state.db().unwrap().clone();
    let app = build_router(state);
    let admin = common::test_token("admin");

    let tag = uuid::Uuid::now_v7();
    let (skill, persona) = (format!("skill-{tag}"), format!("persona-{tag}"));
    let far_future = 32_503_680_000_000_i64; // year 3000: the newest community row
    sqlx::query(
        "INSERT INTO marketplace.skills (id, name, source, category, tags, tools, published_at, updated_at)
         VALUES ($1, $1, 'community', 'general', NULL, NULL, 1, 2)",
    )
    .bind(&skill)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO marketplace.skills (id, name, description, author, version, source, category, instructions, published_at, updated_at)
         VALUES ($1, 'Ares', 'God of war', 'olympus', '2.0.0', 'community', 'personality:antagonist', $2, 1, $3)",
    )
    .bind(&persona)
    .bind(PERSONALITY_MD)
    .bind(far_future)
    .execute(&pool)
    .await
    .unwrap();

    // NULL tags/tools read as empty lists.
    let (status, got) = call(
        &app,
        &admin,
        "GET",
        &format!("/api/v1/marketplace/skills/{skill}"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{got}");
    assert_eq!(got["tags"], serde_json::json!([]));
    assert_eq!(got["tools"], serde_json::json!([]));

    // Status: community skills (not personalities), last synced = newest row.
    let (status, community) = call(
        &app,
        &admin,
        "GET",
        "/api/v1/marketplace/community/status",
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(community["skillCount"].as_i64().unwrap() >= 1);
    assert_eq!(community["lastSyncedAt"], far_future);
    assert!(community["communityRepoPath"].is_string());

    // Personalities in the dashboard's shape; `filename` names the row.
    let (status, list) = call(
        &app,
        &admin,
        "GET",
        "/api/v1/marketplace/community/personalities",
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let ares = list["personalities"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["filename"] == persona.as_str())
        .expect("synced personality listed")
        .clone();
    assert_eq!(ares["category"], "antagonist");
    assert_eq!(ares["systemPrompt"], "You are Ares.\n\n- **humor**: dry");
    assert_eq!(
        ares["traits"],
        serde_json::json!({ "humor": "dry", "bold": "bold" })
    );
    assert_eq!(ares["sex"], "male");
    assert_eq!(ares["version"], "2.0.0");

    // Install creates a soul personality from it.
    let body = serde_json::json!({ "filename": persona }).to_string();
    let (status, installed) = call(
        &app,
        &admin,
        "POST",
        "/api/v1/marketplace/community/personalities/install",
        Some(&body),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{installed}");
    let personality = &installed["personality"];
    assert_eq!(personality["name"], "Ares");
    assert_eq!(
        personality["description"],
        "[community:antagonist] God of war"
    );
    assert_eq!(personality["sex"], "male");
    let personality_id = personality["id"].as_str().unwrap().to_string();
    for (bad, want) in [
        ("{}", StatusCode::BAD_REQUEST),
        (
            r#"{"filename":"no-such-personality"}"#,
            StatusCode::NOT_FOUND,
        ),
    ] {
        let (status, _) = call(
            &app,
            &admin,
            "POST",
            "/api/v1/marketplace/community/personalities/install",
            Some(bad),
        )
        .await;
        assert_eq!(status, want, "{bad}");
    }
    let (status, _) = call(
        &app,
        &admin,
        "GET",
        "/api/v1/marketplace/community/personalities/avatar/ares.svg",
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // A caller-chosen repository needs the security policy's consent.
    let (status, denied) = call(
        &app,
        &admin,
        "POST",
        "/api/v1/marketplace/community/sync",
        Some(r#"{"repoUrl":"file:///etc"}"#),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{denied}");
    // With the policy on, a local repository is still the admins' alone
    // (refused before any git command runs).
    let saved: Option<String> =
        sqlx::query_scalar("SELECT value FROM security.policy WHERE key = 'security_policy'")
            .fetch_optional(&pool)
            .await
            .unwrap();
    sqlx::query(
        "INSERT INTO security.policy (key, value, updated_at)
         VALUES ('security_policy', '{\"allowCommunityGitFetch\":true}', 1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    )
    .execute(&pool)
    .await
    .unwrap();
    let operator = common::test_token("operator");
    let (status, local) = call(
        &app,
        &operator,
        "POST",
        "/api/v1/marketplace/community/sync",
        Some(r#"{"repoUrl":"file:///etc"}"#),
    )
    .await;
    match saved {
        Some(value) => {
            sqlx::query("UPDATE security.policy SET value = $1 WHERE key = 'security_policy'")
                .bind(value)
                .execute(&pool)
                .await
                .unwrap()
        }
        None => sqlx::query("DELETE FROM security.policy WHERE key = 'security_policy'")
            .execute(&pool)
            .await
            .unwrap(),
    };
    assert_eq!(status, StatusCode::FORBIDDEN, "{local}");
    assert!(
        local["error"].as_str().unwrap().contains("Only admins"),
        "{local}"
    );

    sqlx::query("DELETE FROM soul.personalities WHERE id = $1")
        .bind(&personality_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM marketplace.skills WHERE id = ANY($1)")
        .bind(vec![skill, persona])
        .execute(&pool)
        .await
        .unwrap();
}
