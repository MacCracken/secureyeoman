//! Integration tests for the session lifecycle (refresh, logout, self-service
//! routes) and for which auth routes are public.

#[allow(dead_code)]
mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use sy_core::server::build_router;

fn post_json(path: &str, body: &str) -> Request<Body> {
    Request::post(path)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

fn json(body: &[u8]) -> serde_json::Value {
    serde_json::from_slice(body).unwrap()
}

// ── Public vs. protected auth routes ─────────────────────────────────────

#[tokio::test]
async fn oauth_token_management_requires_authentication() {
    // `/api/v1/auth/oauth/` used to be a public *prefix*, which also exposed
    // the token-management routes that live under it.
    for req in [
        Request::get("/api/v1/auth/oauth/tokens").body(Body::empty()),
        Request::get("/api/v1/auth/oauth/tokens/abc").body(Body::empty()),
        Request::delete("/api/v1/auth/oauth/tokens/abc").body(Body::empty()),
        Request::post("/api/v1/auth/oauth/tokens/abc/refresh").body(Body::empty()),
        Request::post("/api/v1/auth/oauth/reload").body(Body::empty()),
    ] {
        let req = req.unwrap();
        let what = format!("{} {}", req.method(), req.uri());
        let (status, _) = common::send(common::test_app(), req).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED, "{what}");
    }
    let (status, _) = common::send(
        common::test_app(),
        post_json("/api/v1/auth/oauth/disconnect", r#"{"provider":"github"}"#),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn oauth_sign_in_flow_stays_public() {
    for path in [
        "/api/v1/auth/oauth/config",
        "/api/v1/auth/oauth/google",
        "/api/v1/auth/oauth/google/callback",
    ] {
        let req = Request::get(path).body(Body::empty()).unwrap();
        let (status, _) = common::send(common::test_app(), req).await;
        assert_ne!(status, StatusCode::UNAUTHORIZED, "{path}");
    }
}

#[tokio::test]
async fn saml_metadata_refuses_markup_in_the_provider_id() {
    let req = Request::get("/api/v1/auth/sso/saml/x%22%3E%3Cmd%3AEvil%2F%3E/metadata")
        .body(Body::empty())
        .unwrap();
    let (status, _) = common::send(common::test_app(), req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let req = Request::get("/api/v1/auth/sso/saml/okta-1/metadata")
        .body(Body::empty())
        .unwrap();
    let (status, body) = common::send(common::test_app(), req).await;
    assert_eq!(status, StatusCode::OK);
    assert!(String::from_utf8_lossy(&body).contains(r#"entityID="urn:secureyeoman:sp:okta-1""#));
}

// ── Self-service routes ──────────────────────────────────────────────────

#[tokio::test]
async fn every_role_can_read_its_own_identity_and_log_out() {
    for role in ["viewer", "operator", "auditor", "service", "admin"] {
        let token = common::test_token_for("u-1", role);
        let (status, body) = common::send(
            common::test_app(),
            common::authed_get("/api/v1/auth/me", &token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{role} GET /me");
        assert_eq!(json(&body)["role"], role);

        let (status, _) = common::send(
            common::test_app(),
            common::authed_post("/api/v1/auth/logout", &token, "{}"),
        )
        .await;
        assert_eq!(status, StatusCode::NO_CONTENT, "{role} POST /logout");
    }
}

#[tokio::test]
async fn self_service_exemption_does_not_open_other_auth_routes() {
    let token = common::test_token("viewer");
    for path in [
        "/api/v1/auth/api-keys",
        "/api/v1/auth/users",
        "/api/v1/auth/oauth/tokens",
    ] {
        let (status, _) = common::send(common::test_app(), common::authed_get(path, &token)).await;
        assert_eq!(status, StatusCode::FORBIDDEN, "{path}");
    }
}

// ── Refresh ──────────────────────────────────────────────────────────────

#[tokio::test]
async fn refresh_works_without_an_access_token_and_rotates() {
    let app = build_router(common::test_state());
    let refresh = common::test_refresh_token_for("u-1", "operator");

    // The dashboard sends camelCase and no Authorization header (its access
    // token has usually expired by now).
    let body = format!(r#"{{"refreshToken":"{refresh}"}}"#);
    let (status, resp) = common::send(app.clone(), post_json("/api/v1/auth/refresh", &body)).await;
    assert_eq!(status, StatusCode::OK);
    let resp = json(&resp);
    let access = resp["accessToken"].as_str().unwrap().to_string();
    let rotated = resp["refreshToken"].as_str().unwrap().to_string();
    assert_ne!(rotated, refresh);
    assert_eq!(resp["expiresIn"], 900);

    // The new access token works, and the rotated refresh token is redeemable.
    let (status, me) =
        common::send(app.clone(), common::authed_get("/api/v1/auth/me", &access)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json(&me)["userId"], "u-1");
    let body = format!(r#"{{"refresh_token":"{rotated}"}}"#); // snake_case alias
    let (status, _) = common::send(app, post_json("/api/v1/auth/refresh", &body)).await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn a_refresh_token_is_single_use() {
    let app = build_router(common::test_state());
    let body = format!(
        r#"{{"refreshToken":"{}"}}"#,
        common::test_refresh_token_for("u-1", "operator")
    );
    let (first, _) = common::send(app.clone(), post_json("/api/v1/auth/refresh", &body)).await;
    assert_eq!(first, StatusCode::OK);
    let (replay, _) = common::send(app, post_json("/api/v1/auth/refresh", &body)).await;
    assert_eq!(replay, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn an_access_token_cannot_be_used_to_refresh() {
    let body = format!(r#"{{"refreshToken":"{}"}}"#, common::test_token("admin"));
    let (status, _) =
        common::send(common::test_app(), post_json("/api/v1/auth/refresh", &body)).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// ── Logout ───────────────────────────────────────────────────────────────

#[tokio::test]
async fn logout_revokes_the_access_token_and_the_handed_over_refresh_token() {
    let app = build_router(common::test_state());
    let access = common::test_token_for("u-1", "viewer");
    let refresh = common::test_refresh_token_for("u-1", "viewer");

    let body = format!(r#"{{"refreshToken":"{refresh}"}}"#);
    let (status, _) = common::send(
        app.clone(),
        common::authed_post("/api/v1/auth/logout", &access, &body),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (status, _) =
        common::send(app.clone(), common::authed_get("/api/v1/auth/me", &access)).await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "access token still valid after logout"
    );
    let (status, _) = common::send(app, post_json("/api/v1/auth/refresh", &body)).await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "refresh token still valid after logout"
    );
}

#[tokio::test]
async fn logout_cannot_revoke_someone_elses_refresh_token() {
    let app = build_router(common::test_state());
    let mallory = common::test_token_for("mallory", "viewer");
    let alices_refresh = common::test_refresh_token_for("alice", "operator");

    let body = format!(r#"{{"refreshToken":"{alices_refresh}"}}"#);
    let (status, _) = common::send(
        app.clone(),
        common::authed_post("/api/v1/auth/logout", &mallory, &body),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = common::send(app, post_json("/api/v1/auth/refresh", &body)).await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn logout_tolerates_a_missing_or_malformed_body() {
    let token = common::test_token("viewer");
    let req = Request::post("/api/v1/auth/logout")
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json")
        .body(Body::empty())
        .unwrap();
    let (status, _) = common::send(common::test_app(), req).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
}

// ── API keys ─────────────────────────────────────────────────────────────

#[tokio::test]
async fn api_key_creation_validates_before_touching_storage() {
    let admin = common::test_token("admin");
    let cases = [
        (r#"{"name":"ci","role":"superuser"}"#, StatusCode::FORBIDDEN),
        (r#"{"name":"  ","role":"viewer"}"#, StatusCode::BAD_REQUEST),
        (
            r#"{"name":"ci","role":"viewer","expiresInDays":-1}"#,
            StatusCode::BAD_REQUEST,
        ),
        // Valid request: reaches storage, which this test app does not have.
        (
            r#"{"name":"ci","role":"viewer","expiresInDays":30}"#,
            StatusCode::SERVICE_UNAVAILABLE,
        ),
    ];
    for (body, want) in cases {
        let (status, _) = common::send(
            common::test_app(),
            common::authed_post("/api/v1/auth/api-keys", &admin, body),
        )
        .await;
        assert_eq!(status, want, "{body}");
    }
}
