//! Integration routes call upstream APIs with stored credentials, so a path
//! parameter must not be able to change the upstream path: `..`, `/`, `?`
//! and `#` — percent-encoded, which axum decodes — are refused before any
//! handler runs.

#[allow(dead_code)]
mod common;

use axum::http::StatusCode;
use common::{authed_get, json, send, test_app, test_token};

#[tokio::test]
async fn path_parameters_cannot_redirect_upstream_calls() {
    let token = test_token("admin");
    for path in [
        "/api/v1/integrations/jira/issues/..%2F..%2Fmyself",
        "/api/v1/integrations/jira/issues/PROJ-1%3Fexpand%3Dall",
        "/api/v1/integrations/googlecalendar/events/..",
        "/api/v1/integrations/googlecalendar/events/x%23frag",
        "/api/v1/github/repos/octo/..%2F..%2Fuser",
        "/api/v1/integrations/notion/pages/a%2Fb",
    ] {
        let (status, body) = send(test_app(), authed_get(path, &token)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{path}");
        assert!(
            json(&body)["error"]
                .as_str()
                .unwrap()
                .starts_with("Invalid "),
            "{path}"
        );
    }
    // A plain identifier reaches the handler (which has no integration
    // configured here, so it answers something other than this 400).
    let (status, body) = send(
        test_app(),
        authed_get("/api/v1/integrations/jira/issues/PROJ-1", &token),
    )
    .await;
    assert!(
        status != StatusCode::BAD_REQUEST
            || !String::from_utf8_lossy(&body).contains("Invalid key"),
        "{status}"
    );
}
