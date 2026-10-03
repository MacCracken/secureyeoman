//! Database-backed tests of the per-personality integration access modes
//! (TS `integrationAccess`): writes through Gmail, GitHub and Twitter follow
//! the active personality's mode — `suggest` (the default) refuses them,
//! `draft` allows drafts and answers other writes with a preview, `auto`
//! acts. Skipped unless `SY_TEST_DATABASE_URL` is set.
//!
//! No integration is configured here, so a write the gate lets through
//! fails afterwards for lack of credentials — a different answer from the
//! gate's own.

#[allow(dead_code)]
mod common;

use axum::Router;
use axum::http::StatusCode;
use common::{authed_request as req, json, send};
use serde_json::{Value, json};
use sqlx::PgPool;
use sy_core::server::build_router;

async fn post(app: &Router, token: &str, path: &str, body: Value) -> (StatusCode, Value) {
    let (status, bytes) = send(
        app.clone(),
        req("POST", path, token, Some(&body.to_string())),
    )
    .await;
    let value = if bytes.is_empty() {
        Value::Null
    } else {
        json(&bytes)
    };
    (status, value)
}

async fn set_access(pool: &PgPool, id: &str, access: Value) {
    sqlx::query(
        "UPDATE soul.personalities
         SET body = jsonb_set(body, '{integrationAccess}', $2), updated_at = $3
         WHERE id = $1",
    )
    .bind(id)
    .bind(access)
    .bind(chrono::Utc::now().timestamp_millis())
    .execute(pool)
    .await
    .unwrap();
}

/// The gate refused with a message naming `mode`.
fn refused(answer: &(StatusCode, Value), mode: &str) -> bool {
    answer.0 == StatusCode::FORBIDDEN
        && answer.1["error"]
            .as_str()
            .is_some_and(|e| e.contains(&format!("mode is '{mode}'")))
}

#[tokio::test]
async fn writes_follow_the_active_personality_access_mode() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let pool = state.db().unwrap().clone();
    let app = build_router(state);
    let admin = common::test_token("admin");

    // This test's personality is the only active one while it runs.
    let previously_active: Vec<String> =
        sqlx::query_scalar("SELECT id FROM soul.personalities WHERE is_active = true")
            .fetch_all(&pool)
            .await
            .unwrap();
    sqlx::query("UPDATE soul.personalities SET is_active = false WHERE is_active = true")
        .execute(&pool)
        .await
        .unwrap();
    let id = format!("access-{}", uuid::Uuid::now_v7());
    sqlx::query(
        "INSERT INTO soul.personalities (id, name, is_active, body, created_at, updated_at)
         VALUES ($1, $1, true, '{}', 0, 0)",
    )
    .bind(&id)
    .execute(&pool)
    .await
    .unwrap();

    let mail = json!({"to": "a@example.com", "subject": "s", "body": "b"});
    let pr = json!({"title": "t", "head": "h", "base": "main"});
    let tweet = json!({"text": "hello"});

    // No entry: suggest. Every write is refused.
    let send_mail = post(&app, &admin, "/api/v1/gmail/send", mail.clone()).await;
    assert!(refused(&send_mail, "suggest"), "{send_mail:?}");
    let draft = post(&app, &admin, "/api/v1/gmail/drafts", mail.clone()).await;
    assert!(refused(&draft, "suggest"), "{draft:?}");
    let pull = post(&app, &admin, "/api/v1/github/repos/o/r/pulls", pr.clone()).await;
    assert!(refused(&pull, "suggest"), "{pull:?}");
    let posted = post(&app, &admin, "/api/v1/twitter/tweets", tweet.clone()).await;
    assert!(refused(&posted, "suggest"), "{posted:?}");
    let liked = post(&app, &admin, "/api/v1/twitter/tweets/123/like", json!({})).await;
    assert!(refused(&liked, "suggest"), "{liked:?}");

    // Draft: drafts pass the gate; sending is refused; PRs and tweets
    // answer with a preview and do nothing.
    set_access(
        &pool,
        &id,
        json!([
            {"id": "gmail", "mode": "draft"},
            {"id": "github", "mode": "draft"},
            {"id": "twitter", "mode": "draft"},
        ]),
    )
    .await;
    let send_mail = post(&app, &admin, "/api/v1/gmail/send", mail.clone()).await;
    assert!(refused(&send_mail, "draft"), "{send_mail:?}");
    let draft = post(&app, &admin, "/api/v1/gmail/drafts", mail.clone()).await;
    assert!(
        !refused(&draft, "draft") && draft.0 != StatusCode::OK,
        "{draft:?}"
    );
    let pull = post(&app, &admin, "/api/v1/github/repos/o/r/pulls", pr.clone()).await;
    assert_eq!(pull.0, StatusCode::OK, "{pull:?}");
    assert_eq!(pull.1["preview"], true);
    assert_eq!(pull.1["title"], "t");
    let posted = post(&app, &admin, "/api/v1/twitter/tweets", tweet.clone()).await;
    assert_eq!(posted.0, StatusCode::OK, "{posted:?}");
    assert_eq!(posted.1["draftMode"], true);
    assert_eq!(posted.1["preview"]["text"], "hello");
    let liked = post(&app, &admin, "/api/v1/twitter/tweets/123/like", json!({})).await;
    assert!(refused(&liked, "draft"), "{liked:?}");

    // Auto: the gate lets everything through (here to a missing credential).
    set_access(
        &pool,
        &id,
        json!([
            {"id": "gmail", "mode": "auto"},
            {"id": "github", "mode": "auto"},
        ]),
    )
    .await;
    let send_mail = post(&app, &admin, "/api/v1/gmail/send", mail).await;
    assert!(
        send_mail.0 != StatusCode::FORBIDDEN && send_mail.0 != StatusCode::OK,
        "{send_mail:?}"
    );
    let pull = post(&app, &admin, "/api/v1/github/repos/o/r/pulls", pr).await;
    assert!(pull.1.get("preview").is_none(), "{pull:?}");
    // Twitter has no entry any more: back to suggest.
    let posted = post(&app, &admin, "/api/v1/twitter/tweets", tweet).await;
    assert!(refused(&posted, "suggest"), "{posted:?}");

    sqlx::query("DELETE FROM soul.personalities WHERE id = $1")
        .bind(&id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE soul.personalities SET is_active = true WHERE id = ANY($1)")
        .bind(&previously_active)
        .execute(&pool)
        .await
        .unwrap();
}
