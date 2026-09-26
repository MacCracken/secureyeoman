//! Database-backed chat tests: "remember this" and response feedback, stored
//! as brain memories the way the TS gateway stored them. Skipped unless
//! `SY_TEST_DATABASE_URL` is set (see `common::db_state`).

#[allow(dead_code)]
mod common;

use axum::http::StatusCode;
use common::{authed_request as req, json, send};
use sy_core::server::build_router;

#[tokio::test]
async fn remember_stores_an_episodic_memory() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let app = build_router(state);
    let admin = common::test_token("admin");

    let (status, body) = send(
        app.clone(),
        req(
            "POST",
            "/api/v1/chat/remember",
            &admin,
            Some(r#"{"content":"  The deploy key rotates on Fridays.  ","context":{"conversationId":"c-1"}}"#),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&body));
    let memory = json(&body)["memory"].clone();
    assert_eq!(memory["type"], "episodic");
    assert_eq!(memory["content"], "The deploy key rotates on Fridays.");
    assert_eq!(memory["source"], "dashboard_chat");
    assert_eq!(memory["context"]["conversationId"], "c-1");

    for bad in [r#"{"content":"   "}"#, "{}"] {
        let (status, _) = send(
            app.clone(),
            req("POST", "/api/v1/chat/remember", &admin, Some(bad)),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{bad}");
    }
}

#[tokio::test]
async fn feedback_becomes_a_weighted_preference_memory() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let pool = state.db().unwrap().clone();
    let app = build_router(state);
    let admin = common::test_token("admin");

    let message_id = uuid::Uuid::now_v7().to_string();
    let body = format!(
        r#"{{"conversationId":"c-2","messageId":"{message_id}","feedback":"correction","details":"use metric units"}}"#
    );
    let (status, resp) = send(
        app.clone(),
        req("POST", "/api/v1/chat/feedback", &admin, Some(&body)),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&resp));
    assert_eq!(json(&resp)["stored"], true);

    let (memory_type, content, importance, feedback_type): (String, String, f64, Option<String>) =
        sqlx::query_as(
            "SELECT type, content, importance, context->>'feedbackType' FROM brain.memories
             WHERE source = 'user_feedback' AND context->>'messageId' = $1",
        )
        .bind(&message_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(memory_type, "preference");
    assert_eq!(content, "User corrected response: use metric units");
    assert!((importance - 0.9).abs() < 1e-9);
    assert_eq!(feedback_type.as_deref(), Some("correction"));

    for bad in [
        r#"{"conversationId":"c","messageId":"m","feedback":"meh"}"#,
        r#"{"messageId":"m","feedback":"positive"}"#,
    ] {
        let (status, _) = send(
            app.clone(),
            req("POST", "/api/v1/chat/feedback", &admin, Some(bad)),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{bad}");
    }
}
