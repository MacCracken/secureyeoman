//! The secrets routes put names into the process environment. A name with `=`
//! or a NUL made `set_var`/`remove_var` panic, which aborts the server (and a
//! stored one crash-looped every boot); such names, and reserved variables,
//! are refused before they reach the database or the environment.

#[allow(dead_code)]
mod common;

use axum::http::StatusCode;

#[tokio::test]
async fn malformed_and_reserved_secret_names_are_refused() {
    let admin = common::test_token("admin");
    for name in [
        "A%3DB",
        "A%00B",
        "lower",
        "LD_PRELOAD",
        "SECUREYEOMAN_ADMIN_PASSWORD_HASH",
    ] {
        for method in ["GET", "PUT", "DELETE"] {
            let body = (method == "PUT").then_some(r#"{"value":"x"}"#);
            let (status, bytes) = common::send(
                common::test_app(),
                common::authed_request(method, &format!("/api/v1/secrets/{name}"), &admin, body),
            )
            .await;
            assert_eq!(
                status,
                StatusCode::BAD_REQUEST,
                "{method} {name}: {}",
                String::from_utf8_lossy(&bytes)
            );
        }
    }
}

#[tokio::test]
async fn a_well_formed_name_reaches_storage() {
    // The test app has no database, so a valid request gets as far as 503.
    let admin = common::test_token("admin");
    let (status, _) = common::send(
        common::test_app(),
        common::authed_request(
            "PUT",
            "/api/v1/secrets/OPENAI_API_KEY",
            &admin,
            Some(r#"{"value":"sk-test"}"#),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
}
