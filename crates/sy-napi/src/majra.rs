//! Majra pub/sub — NAPI bindings for Node.js.
//!
//! Exposes majra's `PubSub` as a global in-process event bus.
//! TypeScript subscribers receive messages via `ThreadsafeFunction` callbacks.

use std::sync::OnceLock;

use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;
use tokio::runtime::Runtime;

use majra::pubsub::{self, PubSub};

// ── Tokio Runtime ──────────────────────────────────────────────────────────

fn runtime() -> &'static Runtime {
    static RT: OnceLock<Runtime> = OnceLock::new();
    RT.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .enable_all()
            .build()
            .expect("majra tokio runtime")
    })
}

// ── Global PubSub Instance ─────────────────────────────────────────────────

fn pubsub() -> &'static PubSub {
    static PS: OnceLock<PubSub> = OnceLock::new();
    PS.get_or_init(PubSub::new)
}

// ── Pattern Matching ───────────────────────────────────────────────────────

/// Test whether a wildcard pattern matches a concrete topic.
/// Patterns: `*` matches one segment, `#` matches zero or more trailing segments.
#[napi]
pub fn majra_matches_pattern(pattern: String, topic: String) -> bool {
    pubsub::matches_pattern(&pattern, &topic)
}

// ── Publish ────────────────────────────────────────────────────────────────

/// Publish a JSON payload to a concrete topic.
/// Returns the number of subscriptions the message was delivered to.
#[napi]
pub fn majra_publish(topic: String, payload_json: String) -> u32 {
    let payload: serde_json::Value =
        serde_json::from_str(&payload_json).unwrap_or(serde_json::Value::Null);
    pubsub().publish(&topic, payload) as u32
}

// ── Subscribe ──────────────────────────────────────────────────────────────

/// Subscribe to a wildcard pattern. The callback receives JSON strings
/// for each matching message: `{ topic, payload, timestamp }`.
///
/// Messages are delivered asynchronously on a background tokio task.
/// The subscription lives until `majra_unsubscribe_all` is called for
/// the same pattern or all receivers are dropped.
#[napi]
pub fn majra_subscribe(
    pattern: String,
    #[napi(ts_arg_type = "(message: string) => void")] callback: ThreadsafeFunction<
        String,
        ErrorStrategy::Fatal,
    >,
) {
    let mut rx = pubsub().subscribe(&pattern);

    runtime().spawn(async move {
        while let Ok(msg) = rx.recv().await {
            let json = serde_json::to_string(&msg).unwrap_or_default();
            callback.call(json, ThreadsafeFunctionCallMode::NonBlocking);
        }
    });
}

// ── Unsubscribe ────────────────────────────────────────────────────────────

/// Remove all subscriptions for a pattern.
#[napi]
pub fn majra_unsubscribe_all(pattern: String) {
    pubsub().unsubscribe_all(&pattern);
}

// ── Stats ──────────────────────────────────────────────────────────────────

/// Number of active subscription patterns.
#[napi]
pub fn majra_pattern_count() -> u32 {
    pubsub().pattern_count() as u32
}

/// Total messages published since process start.
#[napi]
pub fn majra_messages_published() -> u32 {
    pubsub().messages_published() as u32
}

/// Remove subscription patterns whose receivers have all been dropped.
/// Returns the number of dead patterns removed.
#[napi]
pub fn majra_cleanup_dead() -> u32 {
    pubsub().cleanup_dead_subscribers() as u32
}
