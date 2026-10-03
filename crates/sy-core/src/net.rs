//! Shared outbound HTTP client.
//!
//! `reqwest::Client::new()` has no timeouts at all: an upstream that accepts a
//! connection and then goes silent pins the calling request task forever, and
//! enough of those exhaust the server's backpressure budget. Every client here
//! also carries its own connection pool, so sharing one reuses connections.

use std::sync::LazyLock;
use std::time::Duration;

/// Bound on establishing a connection (TCP + TLS) to any upstream.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// Bound on silence between reads. Deliberately no *total* timeout: SSE relays
/// and slow model calls legitimately run long while still making progress.
/// Calls that want a hard deadline set `.timeout(..)` per request.
const READ_TIMEOUT: Duration = Duration::from_secs(300);

static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .read_timeout(READ_TIMEOUT)
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
});

/// The shared outbound client (cheap to clone; clones share the pool).
pub fn client() -> reqwest::Client {
    CLIENT.clone()
}

/// Whether a caller-supplied path parameter can go, as it is, into the path
/// of an upstream API request: an identifier of ASCII letters, digits and
/// `-_.~@:+=,`, and not the dot segment `.` or `..`.
pub fn is_safe_path_segment(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 1024
        && s != "."
        && s != ".."
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_.~@:+=,".contains(&b))
}

/// Route layer for routers that call upstream APIs with stored credentials:
/// refuses a request whose path parameters could change the upstream path.
/// axum decodes `%2F` and `%3F` in parameters, so an event id of
/// `..%2F..%2Fusers%2Fme` or `x%3Fdelete%3Dtrue` would otherwise send the
/// integration's credentials to another endpoint of the upstream API.
pub async fn reject_unsafe_path_params(
    params: axum::extract::RawPathParams,
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    use axum::response::IntoResponse;
    if let Some((name, _)) = params.iter().find(|(_, v)| !is_safe_path_segment(v)) {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({ "error": format!("Invalid {name}") })),
        )
            .into_response();
    }
    next.run(req).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upstream_path_segments_are_plain_identifiers() {
        for ok in [
            "PROJ-123",
            "abc123_20250101T000000Z",
            "octo-org",
            "repo.js",
            "4f7e5d0c-1a2b-4c3d-9e8f-0a1b2c3d4e5f",
            "user@example.com",
            "17",
        ] {
            assert!(is_safe_path_segment(ok), "{ok}");
        }
        for bad in [
            "", ".", "..", "../users", "a/b", "a?b=1", "a#b", "a%2Fb", "a b", "a\\b", "é",
        ] {
            assert!(!is_safe_path_segment(bad), "{bad}");
        }
        assert!(!is_safe_path_segment(&"a".repeat(1025)));
    }
}
