//! Database-backed voice profile tests: CRUD on the shipped `voice.profiles`
//! in the TS wire shapes; preview and cloning answer 501 until ported.
//! Skipped unless `SY_TEST_DATABASE_URL` is set (see `common::db_state`).

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
async fn profiles_crud_matches_the_ts_contract() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let app = build_router(state);
    let admin = common::test_token("admin");
    let provider = format!("prov-{}", uuid::Uuid::now_v7());

    let body = format!(
        r#"{{"name":"Narrator","provider":"{provider}","voiceId":"v-1","settings":{{"stability":0.5}},"sampleAudioBase64":"AAAA"}}"#
    );
    let (status, created) = call(&app, &admin, "POST", "/api/v1/voice/profiles", Some(&body)).await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    assert_eq!(created["voiceId"], "v-1");
    assert_eq!(created["settings"]["stability"], 0.5);
    assert_eq!(created["sampleAudioBase64"], "AAAA");
    assert_eq!(created["createdBy"], "test-user-1");
    let id = created["id"].as_str().unwrap().to_string();
    let path = format!("/api/v1/voice/profiles/{id}");

    for bad in [
        r#"{"name":"x","provider":"p"}"#.to_string(),
        format!(
            r#"{{"name":"{}","provider":"p","voiceId":"v"}}"#,
            "n".repeat(201)
        ),
    ] {
        let (status, _) = call(&app, &admin, "POST", "/api/v1/voice/profiles", Some(&bad)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{bad}");
    }

    // List by provider: `{ profiles, total }`.
    let (status, list) = call(
        &app,
        &admin,
        "GET",
        &format!("/api/v1/voice/profiles?provider={provider}"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(list["total"], 1);
    assert_eq!(list["profiles"][0]["id"], id.as_str());

    // Update: partial; an explicit null clears the sample; `{}` changes nothing.
    let (status, updated) = call(
        &app,
        &admin,
        "PUT",
        &path,
        Some(r#"{"name":"Storyteller","settings":{"stability":0.9},"sampleAudioBase64":null}"#),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{updated}");
    assert_eq!(updated["name"], "Storyteller");
    assert_eq!(updated["voiceId"], "v-1");
    assert_eq!(updated["settings"]["stability"], 0.9);
    assert!(updated.get("sampleAudioBase64").is_none(), "{updated}");
    let (_, same) = call(&app, &admin, "PUT", &path, Some("{}")).await;
    assert_eq!(same, updated);
    let (status, _) = call(&app, &admin, "PUT", &path, Some(r#"{"name":"  "}"#)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, got) = call(&app, &admin, "GET", &path, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(got, updated);

    // Preview and cloning validate, then answer 501 until ported.
    let (status, _) = call(
        &app,
        &admin,
        "POST",
        &format!("{path}/preview"),
        Some(r#"{"text":"hi"}"#),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_IMPLEMENTED);
    let (status, _) = call(
        &app,
        &admin,
        "POST",
        "/api/v1/voice/profiles/nope/preview",
        Some("{}"),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = call(
        &app,
        &admin,
        "POST",
        "/api/v1/voice/profiles/clone",
        Some(r#"{"name":"x"}"#),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, _) = call(
        &app,
        &admin,
        "POST",
        "/api/v1/voice/profiles/clone",
        Some(r#"{"name":"x","audioBase64":"AAAA"}"#),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_IMPLEMENTED);

    // Delete: 204, then 404 everywhere.
    let (status, _) = call(&app, &admin, "DELETE", &path, None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    for method in ["GET", "DELETE"] {
        let (status, _) = call(&app, &admin, method, &path, None).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{method}");
    }
    let (status, _) = call(&app, &admin, "PUT", &path, Some(r#"{"name":"x"}"#)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}
