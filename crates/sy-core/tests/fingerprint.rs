//! Fingerprinting is opt-in (`SECUREYEOMAN_FINGERPRINT_ENABLED`): by default a
//! header-less programmatic client — an API-key script, MCP, sy-edge — must not
//! be scored as a bot and locked out by IP reputation.

#[allow(dead_code)]
mod common;

use axum::http::StatusCode;
use sy_core::server::build_router;

#[tokio::test]
async fn header_less_clients_are_not_blocked_by_default() {
    let app = build_router(common::test_state());
    let token = common::test_token("admin");
    for i in 0..20 {
        let (status, _) =
            common::send(app.clone(), common::authed_get("/api/v1/auth/me", &token)).await;
        assert_eq!(status, StatusCode::OK, "request {i}");
    }
}

#[tokio::test]
async fn opting_in_scores_and_eventually_blocks_bot_like_clients() {
    let app = build_router(common::test_state().with_fingerprint_enabled(true));
    let token = common::test_token("admin");
    let mut blocked = false;
    for _ in 0..20 {
        let (status, _) =
            common::send(app.clone(), common::authed_get("/api/v1/auth/me", &token)).await;
        if status == StatusCode::FORBIDDEN {
            blocked = true;
            break;
        }
    }
    assert!(
        blocked,
        "fingerprinting was enabled but never blocked a header-less client"
    );
}
