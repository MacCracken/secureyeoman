//! Database-backed integration tests: an integration's stored credentials
//! never leave the server. Viewers read integrations, so every response masks
//! the credential-like keys of `config` (TS `maskIntegration`), while the
//! database keeps the real values. Skipped unless `SY_TEST_DATABASE_URL` is
//! set (see `common::db_state`).

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

#[tokio::test]
async fn integration_credentials_are_masked_in_every_response() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let pool = state.db().unwrap().clone();
    let app = build_router(state);
    let admin = common::test_token("admin");
    let viewer = common::test_token("viewer");

    let name = format!("Telegram {}", uuid::Uuid::now_v7());
    let body = serde_json::json!({
        "platform": "telegram",
        "displayName": name,
        "config": {
            "botToken": "123456:SECRET-bot-token",
            "chatId": "42",
            "provider": { "clientSecret": "SECRET-client", "redirectUri": "https://example.com/cb" },
        },
    })
    .to_string();
    let (status, created) = call(&app, &admin, "POST", "/api/v1/integrations", Some(&body)).await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    assert!(!created.to_string().contains("SECRET"), "{created}");
    let id = created["id"].as_str().unwrap().to_string();

    // The list and the single read, as a viewer.
    let (status, list) = call(&app, &viewer, "GET", "/api/v1/integrations", None).await;
    assert_eq!(status, StatusCode::OK, "{list}");
    let mine = list["integrations"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["id"] == id.as_str())
        .expect("created integration is listed")
        .clone();
    let (status, one) = call(
        &app,
        &viewer,
        "GET",
        &format!("/api/v1/integrations/{id}"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{one}");
    for row in [&mine, &one] {
        assert_eq!(row["config"]["botToken"], "[REDACTED]");
        assert_eq!(row["config"]["provider"]["clientSecret"], "[REDACTED]");
        // Non-credential settings stay readable.
        assert_eq!(row["config"]["chatId"], "42");
        assert_eq!(
            row["config"]["provider"]["redirectUri"],
            "https://example.com/cb"
        );
    }
    assert!(!list.to_string().contains("SECRET"));

    // The database keeps the real credential for the integration to use.
    let stored: String = sqlx::query_scalar(
        "SELECT config->>'botToken' FROM integration.integrations WHERE id = $1",
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(stored, "123456:SECRET-bot-token");

    let (status, _) = call(
        &app,
        &admin,
        "DELETE",
        &format!("/api/v1/integrations/{id}"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
}
