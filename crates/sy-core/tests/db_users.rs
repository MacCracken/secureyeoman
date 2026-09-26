//! Database-backed user tests: the user list from `auth.users` (never with a
//! password hash) and per-user notification preferences in
//! `auth.user_notification_prefs`, always scoped to the authenticated caller.
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

const PREFS: &str = "/api/v1/users/me/notification-prefs";

#[tokio::test]
async fn users_and_their_notification_prefs() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let pool = state.db().unwrap().clone();
    let app = build_router(state);

    let tag = uuid::Uuid::now_v7();
    let (alice, bob) = (format!("alice-{tag}"), format!("bob-{tag}"));
    for id in [&alice, &bob] {
        sqlx::query(
            "INSERT INTO auth.users (id, email, display_name, hashed_password, created_at, updated_at)
             VALUES ($1, $1 || '@example.com', 'Test User', 'hash-must-not-leak', 1, 1)",
        )
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();
    }
    let alice_token = common::test_token_for(&alice, "admin");
    let bob_token = common::test_token_for(&bob, "admin");

    // Users: `{ users, total }` and `{ user }`, never the password hash.
    let (status, list) = call(&app, &alice_token, "GET", "/api/v1/users", None).await;
    assert_eq!(status, StatusCode::OK, "{list}");
    assert!(
        list["users"]
            .as_array()
            .unwrap()
            .iter()
            .any(|u| u["id"] == alice.as_str())
    );
    assert!(!list.to_string().contains("hash-must-not-leak"));
    let (status, one) = call(
        &app,
        &alice_token,
        "GET",
        &format!("/api/v1/users/{alice}"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(one["user"]["email"], format!("{alice}@example.com"));
    assert_eq!(one["user"]["isAdmin"], false);
    assert!(one["user"].get("hashedPassword").is_none());
    let (status, _) = call(&app, &alice_token, "GET", "/api/v1/users/nobody-here", None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // Create with the TS defaults; the same channel and chat upserts.
    let (status, empty) = call(&app, &alice_token, "GET", PREFS, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(empty["prefs"], serde_json::json!([]));
    let (status, created) = call(
        &app,
        &alice_token,
        "POST",
        PREFS,
        Some(r#"{"channel":"slack","chatId":" C123 "}"#),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    let pref = &created["pref"];
    assert_eq!(pref["chatId"], "C123");
    assert_eq!(pref["enabled"], true);
    assert_eq!(pref["minLevel"], "info");
    assert_eq!(pref["userId"], alice.as_str());
    let id = pref["id"].as_str().unwrap().to_string();
    let (_, again) = call(
        &app,
        &alice_token,
        "POST",
        PREFS,
        Some(r#"{"channel":"slack","chatId":"C123","minLevel":"warn"}"#),
    )
    .await;
    assert_eq!(again["pref"]["id"], id.as_str());
    assert_eq!(again["pref"]["minLevel"], "warn");

    for bad in [
        r#"{"channel":"fax","chatId":"C1"}"#,
        r#"{"channel":"slack"}"#,
        r#"{"channel":"slack","chatId":"  "}"#,
        r#"{"channel":"slack","chatId":"C1","quietHoursStart":24}"#,
        r#"{"channel":"slack","chatId":"C1","minLevel":"loud"}"#,
    ] {
        let (status, _) = call(&app, &alice_token, "POST", PREFS, Some(bad)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{bad}");
    }

    // Update: partial, and an explicit null clears.
    let path = format!("{PREFS}/{id}");
    let (status, updated) = call(
        &app,
        &alice_token,
        "PUT",
        &path,
        Some(r#"{"quietHoursStart":22,"quietHoursEnd":7,"integrationId":"int-1"}"#),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{updated}");
    assert_eq!(updated["pref"]["quietHoursStart"], 22);
    assert_eq!(updated["pref"]["integrationId"], "int-1");
    assert_eq!(updated["pref"]["minLevel"], "warn");
    let (_, cleared) = call(
        &app,
        &alice_token,
        "PUT",
        &path,
        Some(r#"{"integrationId":null,"quietHoursEnd":null}"#),
    )
    .await;
    assert_eq!(cleared["pref"]["integrationId"], Value::Null);
    assert_eq!(cleared["pref"]["quietHoursEnd"], Value::Null);
    assert_eq!(cleared["pref"]["quietHoursStart"], 22);
    let (status, _) = call(
        &app,
        &alice_token,
        "PUT",
        &path,
        Some(r#"{"channel":"pager"}"#),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Moving onto another preference's channel and chat conflicts.
    call(
        &app,
        &alice_token,
        "POST",
        PREFS,
        Some(r#"{"channel":"email","chatId":"a@example.com"}"#),
    )
    .await;
    let (status, _) = call(
        &app,
        &alice_token,
        "PUT",
        &path,
        Some(r#"{"channel":"email","chatId":"a@example.com"}"#),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);

    // Another user neither sees nor touches them.
    let (_, bobs) = call(&app, &bob_token, "GET", PREFS, None).await;
    assert_eq!(bobs["prefs"], serde_json::json!([]));
    let (status, _) = call(&app, &bob_token, "PUT", &path, Some(r#"{"enabled":false}"#)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = call(&app, &bob_token, "DELETE", &path, None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // A principal without a user account cannot store preferences.
    let ghost = common::test_token_for(&format!("ghost-{tag}"), "admin");
    let (status, _) = call(
        &app,
        &ghost,
        "POST",
        PREFS,
        Some(r#"{"channel":"slack","chatId":"C9"}"#),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);

    // Delete: `{ ok: true }`, then 404.
    let (status, deleted) = call(&app, &alice_token, "DELETE", &path, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(deleted["ok"], true);
    let (status, _) = call(&app, &alice_token, "DELETE", &path, None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    sqlx::query("DELETE FROM auth.users WHERE id = ANY($1)")
        .bind(vec![alice, bob])
        .execute(&pool)
        .await
        .unwrap();
}
