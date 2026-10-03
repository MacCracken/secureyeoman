//! Integration tests for rate limiting middleware.

#[allow(dead_code)]
mod common;

use axum::body::Body;
use axum::http::Request;

#[tokio::test]
async fn auth_endpoint_rate_limited_after_5_requests() {
    let app = common::test_app();
    // Auth tier: 5 req/min
    for i in 0..5 {
        let (status, _) = common::send(
            app.clone(),
            Request::post("/api/v1/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"username":"test","password":"test"}"#))
                .unwrap(),
        )
        .await;
        assert_ne!(status, 429, "request {i} should not be rate limited");
    }
    // 6th request should be rate limited
    let (status, _) = common::send(
        app.clone(),
        Request::post("/api/v1/auth/login")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"username":"test","password":"test"}"#))
            .unwrap(),
    )
    .await;
    assert_eq!(status, 429);
}

#[tokio::test]
async fn rate_limit_returns_retry_after_header() {
    let app = common::test_app();
    // Exhaust auth tier
    for _ in 0..5 {
        common::send(
            app.clone(),
            Request::post("/api/v1/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"username":"test","password":"test"}"#))
                .unwrap(),
        )
        .await;
    }

    use tower::ServiceExt;
    let resp = app
        .clone()
        .oneshot(
            Request::post("/api/v1/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"username":"test","password":"test"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), 429);
    assert!(resp.headers().get("retry-after").is_some());
}

#[tokio::test]
async fn general_endpoint_has_higher_limit() {
    let app = common::test_app();
    let token = common::test_token("admin");
    // General tier: 120 req/min — send 10 and verify none are rate limited
    for i in 0..10 {
        let (status, _) = common::send(
            app.clone(),
            common::authed_get("/api/v1/brain/memories", &token),
        )
        .await;
        assert_ne!(
            status, 429,
            "general request {i} should not be rate limited"
        );
    }
}

#[tokio::test]
async fn successful_response_includes_remaining_header() {
    use tower::ServiceExt;

    let app = common::test_app();
    let resp = app
        .oneshot(Request::get("/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert!(resp.headers().get("x-ratelimit-remaining").is_some());
}

/// Behind the bundled TLS proxy every connection comes from 127.0.0.1. With
/// the proxy trusted, rate limits and reputation blocks apply per real
/// client: one client exhausting the login budget — even tripping a block —
/// does not lock the others out, and the proxy address itself is never
/// blocked.
#[tokio::test]
async fn behind_a_trusted_proxy_limits_apply_per_client() {
    use axum::extract::ConnectInfo;
    use std::net::SocketAddr;
    use sy_core::middleware::client_ip::TrustedProxies;

    let (proxies, _) = TrustedProxies::parse_list("127.0.0.1");
    let app = sy_core::server::build_router(common::test_state().with_trusted_proxies(proxies));
    let login_via_proxy = |client: &str| {
        let mut req = Request::post("/api/v1/auth/login")
            .header("content-type", "application/json")
            .header("x-forwarded-for", client)
            .body(Body::from(r#"{"password":"wrong-password"}"#))
            .unwrap();
        let peer: SocketAddr = "127.0.0.1:50000".parse().unwrap();
        req.extensions_mut().insert(ConnectInfo(peer));
        req
    };

    // The attacker runs well past the budget (each 429 feeds reputation).
    for _ in 0..30 {
        common::send(app.clone(), login_via_proxy("203.0.113.66")).await;
    }
    let (status, _) = common::send(app.clone(), login_via_proxy("203.0.113.66")).await;
    assert!(
        status == 429 || status == 403,
        "the attacker is limited: {status}"
    );
    // Another client behind the same proxy is unaffected.
    let (status, _) = common::send(app.clone(), login_via_proxy("198.51.100.7")).await;
    assert!(
        status != 429 && status != 403,
        "an innocent client was locked out: {status}"
    );
}
