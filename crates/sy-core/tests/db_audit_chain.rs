//! Database-backed tests of the audit chain in `audit.entries`: events the
//! server records are linked and signed, verification catches an edited entry
//! and a deleted start of history while accepting retention, and the audit and
//! security-event routes read the real chain. Skipped unless
//! `SY_TEST_DATABASE_URL` is set (see `common::db_state`).
//!
//! The chain is one per database, so this file holds a single test that
//! starts from an empty `audit.entries` — run it against a test database only.

#[allow(dead_code)]
mod common;

use axum::Router;
use axum::http::StatusCode;
use common::{authed_request as req, json, send};
use serde_json::Value;
use sqlx::PgPool;
use sy_core::db::audit::{self, NewAuditEntry};
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

/// The newest entry's `seq` (0 when the chain is empty).
async fn last_seq(pool: &PgPool) -> i64 {
    sqlx::query_scalar("SELECT COALESCE(MAX(seq), 0) FROM audit.entries")
        .fetch_one(pool)
        .await
        .unwrap()
}

/// Wait for the background writer to record an `event` entry after `after`.
async fn wait_for_event(pool: &PgPool, event: &str, after: i64) -> audit::AuditEntryRow {
    for _ in 0..100 {
        let filter = audit::EntryFilter {
            events: vec![event],
            ..Default::default()
        };
        let (rows, _) = audit::list_entries(pool, &filter, 10, 0).await.unwrap();
        if let Some(row) = rows.into_iter().find(|r| r.seq > after) {
            return row;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    panic!("no {event} audit entry was recorded");
}

#[tokio::test]
async fn the_audit_chain_is_written_verified_and_served() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let pool = state.db().unwrap().clone();
    let key = state.audit().unwrap().signing_key().to_string();
    let app = build_router(state);
    let admin = common::test_token("admin");
    let auditor = common::test_token("auditor");
    let viewer = common::test_token_for("viewer-7", "viewer");

    sqlx::query("DELETE FROM audit.entries")
        .execute(&pool)
        .await
        .unwrap();

    // ── Appends link and sign; an empty chain and a written one verify ──
    let v = audit::verify_chain(&pool, &key).await.unwrap();
    assert!(v.valid && v.entries_checked == 0, "{v:?}");
    let written = audit::append_batch(
        &pool,
        &key,
        &[
            NewAuditEntry::new("auth_success", "info", "first").user("u1"),
            NewAuditEntry::new("config_change", "info", "second")
                .metadata(serde_json::json!({"changes": ["allowSwarms"], "nul": "a\0b"})),
            NewAuditEntry::new("task_completed", "info", "third"),
        ],
    )
    .await
    .unwrap();
    assert_eq!(written[0].integrity_previous_hash, audit::GENESIS_HASH);
    assert_eq!(
        written[1].integrity_previous_hash,
        audit::entry_hash(&written[0])
    );
    // A NUL (which Postgres cannot store) does not fail the batch.
    assert_eq!(written[1].metadata.as_ref().unwrap()["nul"], "a\u{fffd}b");
    let v = audit::verify_chain(&pool, &key).await.unwrap();
    assert!(v.valid && v.entries_checked == 3, "{v:?}");

    // ── An edited entry is caught, at that entry ──
    sqlx::query("UPDATE audit.entries SET message = 'edited' WHERE id = $1")
        .bind(&written[0].id)
        .execute(&pool)
        .await
        .unwrap();
    let v = audit::verify_chain(&pool, &key).await.unwrap();
    assert!(!v.valid, "{v:?}");
    assert_eq!(v.broken_at.as_deref(), Some(written[0].id.as_str()));
    sqlx::query("UPDATE audit.entries SET message = 'first' WHERE id = $1")
        .bind(&written[0].id)
        .execute(&pool)
        .await
        .unwrap();
    // So is an entry signed with another key.
    let v = audit::verify_chain(&pool, "another-key-that-is-at-least-32-bytes")
        .await
        .unwrap();
    assert!(!v.valid, "{v:?}");

    // ── The routes read the chain ──
    let (status, body) = call(&app, &auditor, "POST", "/api/v1/audit/verify", None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["valid"], true, "{body}");
    assert_eq!(body["entriesChecked"], 3);

    let (status, body) = call(&app, &auditor, "GET", "/api/v1/audit/stats", None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["totalEntries"], 3);
    assert_eq!(body["chainValid"], true);

    let (status, body) = call(
        &app,
        &auditor,
        "GET",
        "/api/v1/audit?event=config_change,task_completed&limit=1",
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["total"], 2, "total counts every match: {body}");
    assert_eq!(body["entries"].as_array().unwrap().len(), 1);
    assert_eq!(body["entries"][0]["message"], "third", "newest first");

    let (status, body) = call(&app, &admin, "GET", "/api/v1/metrics", None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["security"]["auditEntriesTotal"], 3);
    assert_eq!(body["security"]["auditChainValid"], true);

    // Repair would re-sign tampered entries; it is refused.
    let (status, _) = call(&app, &admin, "POST", "/api/v1/audit/repair", None).await;
    assert_eq!(status, StatusCode::NOT_IMPLEMENTED);

    // ── A refused request is recorded, and is a security event ──
    let mark = last_seq(&pool).await;
    let (status, _) = call(&app, &viewer, "GET", "/api/v1/audit", None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let denial = wait_for_event(&pool, "permission_denied", mark).await;
    assert_eq!(denial.user_id.as_deref(), Some("viewer-7"));
    assert_eq!(denial.level, "warn");
    assert_eq!(denial.metadata.as_ref().unwrap()["path"], "/api/v1/audit");

    let (status, body) = call(&app, &auditor, "GET", "/api/v1/security/events", None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let events = body["events"].as_array().unwrap();
    let types: Vec<&str> = events.iter().filter_map(|e| e["event"].as_str()).collect();
    assert!(types.contains(&"permission_denied"), "{body}");
    assert!(
        !types.contains(&"task_completed"),
        "not a security event: {body}"
    );
    assert_eq!(body["total"], events.len());
    // Naming only types that are not security events matches nothing — not
    // the whole audit log.
    let (status, body) = call(
        &app,
        &auditor,
        "GET",
        "/api/v1/security/events?type=task_completed",
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["total"], 0, "{body}");
    let (status, _) = call(
        &app,
        &auditor,
        "GET",
        &format!("/api/v1/security/events/{}", written[2].id),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, body) = call(
        &app,
        &auditor,
        "GET",
        &format!("/api/v1/security/events/{}", denial.id),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["event"], "permission_denied");

    // ── A policy change is validated, applied and recorded ──
    let (status, before) = call(&app, &admin, "GET", "/api/v1/security/policy", None).await;
    assert_eq!(status, StatusCode::OK, "{before}");
    let storybook_before = before["allowStorybook"].as_bool().unwrap_or(false);
    for bad in [
        r#"{"allowStorybook":"yes"}"#,
        r#"{"promptGuardMode":"sometimes"}"#,
        r#"{"notAField":true}"#,
        r#"[true]"#,
    ] {
        let (status, body) =
            call(&app, &admin, "PATCH", "/api/v1/security/policy", Some(bad)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{bad}: {body}");
    }
    let mark = last_seq(&pool).await;
    let patch = serde_json::json!({ "allowStorybook": !storybook_before }).to_string();
    let (status, after) = call(
        &app,
        &admin,
        "PATCH",
        "/api/v1/security/policy",
        Some(&patch),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{after}");
    assert_eq!(after["allowStorybook"], !storybook_before);
    let change = wait_for_event(&pool, "config_change", mark).await;
    assert_eq!(change.message, "Security policy updated via dashboard");
    assert_eq!(
        change.metadata.as_ref().unwrap()["changes"],
        serde_json::json!(["allowStorybook"])
    );
    let mark = last_seq(&pool).await;
    let restore = serde_json::json!({ "allowStorybook": storybook_before }).to_string();
    let (status, _) = call(
        &app,
        &admin,
        "PATCH",
        "/api/v1/security/policy",
        Some(&restore),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    // The dead PUT (it wrote a table the schema does not have) is gone.
    let (status, _) = call(
        &app,
        &admin,
        "PUT",
        "/api/v1/security/policy",
        Some(r#"{"name":"x","policyJson":{}}"#),
    )
    .await;
    assert_eq!(status, StatusCode::METHOD_NOT_ALLOWED);

    // ── Retention keeps the chain verifiable; deleting history does not ──
    // Let the writer record the restore first.
    wait_for_event(&pool, "config_change", mark).await;
    let mark = last_seq(&pool).await;
    let total = audit::count_entries(&pool).await.unwrap();
    let (deleted, remaining) = audit::enforce_retention(&pool, &key, 3650, 3, Some("admin"))
        .await
        .unwrap();
    assert_eq!(deleted, total - 2, "keeps max_entries - 1, then records");
    assert_eq!(remaining, 3);
    let v = audit::verify_chain(&pool, &key).await.unwrap();
    assert!(v.valid, "retention is accounted for: {v:?}");
    let record = wait_for_event(&pool, audit::RETENTION_EVENT, mark).await;
    assert_eq!(record.user_id.as_deref(), Some("admin"));

    // Someone deleting the oldest retained entry is caught.
    let oldest: audit::AuditEntryRow = sqlx::query_as(
        "SELECT id, correlation_id, event, level, message, user_id, task_id, metadata,
                \"timestamp\", integrity_version, integrity_signature,
                integrity_previous_hash, tenant_id, seq
         FROM audit.entries ORDER BY seq ASC LIMIT 1",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query("DELETE FROM audit.entries WHERE id = $1")
        .bind(&oldest.id)
        .execute(&pool)
        .await
        .unwrap();
    let v = audit::verify_chain(&pool, &key).await.unwrap();
    assert!(!v.valid, "a deleted start of history is caught: {v:?}");

    // Leave a verifiable chain behind.
    sqlx::query("DELETE FROM audit.entries")
        .execute(&pool)
        .await
        .unwrap();
}
