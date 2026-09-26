//! Shared test helpers for sy-core integration tests.

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use tower::ServiceExt;

use sy_core::auth::jwt::{JwtConfig, issue_access_token, issue_refresh_token};
use sy_core::server::build_router;
use sy_core::state::AppState;

/// Strong JWT secret used in tests (>= 32 bytes, not the dev placeholder). Both
/// the AppState under test and the tokens we issue use this exact value.
const TEST_JWT_SECRET: &str = "test-secret-do-not-use-in-prod-0123456789abcdef";

/// Build a test AppState with no database, remote access allowed, and a known
/// strong JWT secret so issued tokens validate against the state under test.
pub fn test_state() -> AppState {
    AppState::new(sy_core::types::CoreConfig::default())
        .with_allow_remote_access(true)
        .with_jwt_secret(TEST_JWT_SECRET)
}

/// Build the full router for integration testing (no database, remote access allowed).
pub fn test_app() -> Router {
    build_router(test_state())
}

/// Build a JwtConfig matching the default AppState secret.
fn test_jwt_config() -> JwtConfig {
    JwtConfig {
        secret: TEST_JWT_SECRET.to_string(),
        ..Default::default()
    }
}

/// Issue a JWT access token for the given role.
pub fn test_token(role: &str) -> String {
    issue_access_token(&test_jwt_config(), "test-user-1", role, &[]).unwrap()
}

/// Issue a JWT access token for a specific user and role.
pub fn test_token_for(user_id: &str, role: &str) -> String {
    issue_access_token(&test_jwt_config(), user_id, role, &[]).unwrap()
}

/// Issue a JWT refresh token for a specific user and role.
pub fn test_refresh_token_for(user_id: &str, role: &str) -> String {
    issue_refresh_token(&test_jwt_config(), user_id, role).unwrap()
}

/// Issue a token for a role with an explicit least-privilege permission scope
/// (e.g. `["brain:read"]`) — used to test per-principal RBAC enforcement.
pub fn test_token_scoped(role: &str, permissions: &[&str]) -> String {
    let perms: Vec<String> = permissions.iter().map(|s| s.to_string()).collect();
    issue_access_token(&test_jwt_config(), "test-user-1", role, &perms).unwrap()
}

/// Send a request through the app and return (status, body_bytes).
pub async fn send(app: Router, req: Request<Body>) -> (StatusCode, bytes::Bytes) {
    let resp = app.oneshot(req).await.unwrap();
    let status = resp.status();
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    (status, body)
}

/// An AppState backed by the database in `SY_TEST_DATABASE_URL` (PostgreSQL
/// with the shipped migrations applied), or `None` when it is unset — callers
/// then skip, so the suite still runs without a database.
pub async fn db_state() -> Option<AppState> {
    let Ok(url) = std::env::var("SY_TEST_DATABASE_URL") else {
        eprintln!("skipped: set SY_TEST_DATABASE_URL to run database-backed tests");
        return None;
    };
    let pool = sqlx::PgPool::connect(&url)
        .await
        .expect("SY_TEST_DATABASE_URL is set but unreachable");
    Some(test_state().with_db(pool))
}

/// Build a request with Bearer auth and an optional JSON body.
pub fn authed_request(method: &str, path: &str, token: &str, body: Option<&str>) -> Request<Body> {
    let builder = Request::builder()
        .method(method)
        .uri(path)
        .header("authorization", format!("Bearer {token}"));
    match body {
        Some(json) => builder
            .header("content-type", "application/json")
            .body(Body::from(json.to_string())),
        None => builder.body(Body::empty()),
    }
    .unwrap()
}

/// Parse a response body as JSON.
pub fn json(body: &[u8]) -> serde_json::Value {
    serde_json::from_slice(body)
        .unwrap_or_else(|e| panic!("not JSON ({e}): {}", String::from_utf8_lossy(body)))
}

/// Build a GET request with Bearer auth.
pub fn authed_get(path: &str, token: &str) -> Request<Body> {
    Request::get(path)
        .header("authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap()
}

/// Build a POST request with Bearer auth and JSON body.
pub fn authed_post(path: &str, token: &str, body: &str) -> Request<Body> {
    Request::post(path)
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}
