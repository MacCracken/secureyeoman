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
