//! Database-backed auth tests. They need a PostgreSQL database with the
//! shipped migrations applied (`packages/core/src/storage/migrations/*.sql`)
//! and are skipped unless `SY_TEST_DATABASE_URL` points at one, e.g.
//! `postgres:///sy?host=/var/run/postgresql&user=postgres`.

#[allow(dead_code)]
mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use sy_core::server::build_router;
use sy_core::state::AppState;

async fn db_state() -> Option<AppState> {
    let Ok(url) = std::env::var("SY_TEST_DATABASE_URL") else {
        eprintln!("skipped: set SY_TEST_DATABASE_URL to run database-backed tests");
        return None;
    };
    let pool = sqlx::PgPool::connect(&url)
        .await
        .expect("SY_TEST_DATABASE_URL is set but unreachable");
    Some(common::test_state().with_db(pool))
}

fn with_api_key(path: &str, key: &str) -> Request<Body> {
    Request::get(path)
        .header("x-api-key", key)
        .body(Body::empty())
        .unwrap()
}

fn json(body: &[u8]) -> serde_json::Value {
    serde_json::from_slice(body).unwrap()
}

#[tokio::test]
async fn api_key_lifecycle_against_the_shipped_schema() {
    let Some(state) = db_state().await else {
        return;
    };
    let app = build_router(state);
    let admin = common::test_token_for("admin-1", "admin");

    // Create: the raw key comes back exactly once; the hash never does.
    let (status, body) = common::send(
        app.clone(),
        common::authed_post(
            "/api/v1/auth/api-keys",
            &admin,
            r#"{"name":"lifecycle","role":"viewer","expiresInDays":1}"#,
        ),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&body)
    );
    let created = json(&body);
    let raw = created["rawKey"].as_str().unwrap().to_string();
    let id = created["id"].as_str().unwrap().to_string();
    assert!(raw.starts_with("sck_"));
    assert_eq!(created["prefix"], raw[..8]);
    assert_eq!(created["role"], "viewer");
    assert!(created.get("keyHash").is_none());
    assert!(created["expiresAt"].as_str().unwrap().ends_with('Z'));

    // Authenticate with it: the key acts as its creator, with the key's role.
    let (status, body) = common::send(app.clone(), with_api_key("/api/v1/auth/me", &raw)).await;
    assert_eq!(status, StatusCode::OK);
    let me = json(&body);
    assert_eq!(me["userId"], "admin-1");
    assert_eq!(me["role"], "viewer");
    // ...and the role binds: a viewer key cannot manage keys.
    let (status, _) = common::send(app.clone(), with_api_key("/api/v1/auth/api-keys", &raw)).await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // List (dashboard shape) and usage endpoints.
    let (status, body) = common::send(
        app.clone(),
        common::authed_get("/api/v1/auth/api-keys", &admin),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let keys = json(&body)["keys"].as_array().unwrap().clone();
    let listed = keys.iter().find(|k| k["id"] == id.as_str()).unwrap();
    assert_eq!(listed["prefix"], raw[..8]);
    assert!(listed.get("keyHash").is_none());
    let (status, body) = common::send(
        app.clone(),
        common::authed_get(&format!("/api/v1/auth/api-keys/{id}/usage?from=0"), &admin),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(json(&body)["usage"].is_array());
    let (status, body) = common::send(
        app.clone(),
        common::authed_get("/api/v1/auth/api-keys/usage/summary", &admin),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(json(&body)["summary"].is_array());

    // Revoke: immediately unusable, and a second revoke is a 404.
    let revoke = || {
        Request::delete(format!("/api/v1/auth/api-keys/{id}"))
            .header("authorization", format!("Bearer {admin}"))
            .body(Body::empty())
            .unwrap()
    };
    let (status, body) = common::send(app.clone(), revoke()).await;
    assert_eq!(
        status,
        StatusCode::NO_CONTENT,
        "{}",
        String::from_utf8_lossy(&body)
    );
    let (status, body) = common::send(app.clone(), revoke()).await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "{}",
        String::from_utf8_lossy(&body)
    );
    let (status, _) = common::send(app, with_api_key("/api/v1/auth/me", &raw)).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn refresh_tokens_are_single_use_across_instances() {
    // Two app instances share only the database (fresh in-memory caches), as
    // behind a load balancer: a token redeemed on one is refused by the other.
    let (Some(a), Some(b)) = (db_state().await, db_state().await) else {
        return;
    };
    let body = format!(
        r#"{{"refreshToken":"{}"}}"#,
        common::test_refresh_token_for("u-db", "operator")
    );
    let post = |b: &str| {
        Request::post("/api/v1/auth/refresh")
            .header("content-type", "application/json")
            .body(Body::from(b.to_string()))
            .unwrap()
    };
    let (status, _) = common::send(build_router(a), post(&body)).await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = common::send(build_router(b), post(&body)).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn logout_survives_a_restart() {
    let Some(a) = db_state().await else { return };
    let token = common::test_token_for("u-restart", "viewer");
    let (status, _) = common::send(
        build_router(a),
        common::authed_post("/api/v1/auth/logout", &token, "{}"),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    // A fresh instance (empty cache) still refuses it, from the DB record.
    let b = db_state().await.unwrap();
    let (status, _) = common::send(
        build_router(b),
        common::authed_get("/api/v1/auth/me", &token),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
