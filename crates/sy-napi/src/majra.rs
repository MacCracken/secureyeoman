//! Majra — NAPI bindings for Node.js.
//!
//! Exposes majra's `PubSub` as a global in-process event bus and
//! `RateLimiter` as a per-key token bucket rate limiter.
//! TypeScript subscribers receive messages via `ThreadsafeFunction` callbacks.

use std::sync::OnceLock;

use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;
use tokio::runtime::Runtime;

use std::collections::HashMap;
use std::sync::Mutex;

use majra::barrier;
use majra::heartbeat;
use majra::pubsub::{self, PubSub};
use majra::ratelimit;

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

// ════════════════════════════════════════════════════════════════════════════
// Rate Limiter
// ════════════════════════════════════════════════════════════════════════════

fn limiters() -> &'static Mutex<HashMap<String, ratelimit::RateLimiter>> {
    static LIMITERS: OnceLock<Mutex<HashMap<String, ratelimit::RateLimiter>>> = OnceLock::new();
    LIMITERS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Register a rate limit rule. Converts SY's `windowMs`/`maxRequests` to
/// majra's `rate` (tokens/sec) and `burst` (max tokens).
///
/// rate  = maxRequests / (windowMs / 1000)
/// burst = maxRequests
#[napi]
pub fn majra_ratelimit_register(rule_name: String, window_ms: u32, max_requests: u32) {
    let window_secs = window_ms as f64 / 1000.0;
    let rate = max_requests as f64 / window_secs;
    let burst = max_requests as usize;
    let limiter = ratelimit::RateLimiter::new(rate, burst);

    let mut map = limiters().lock().unwrap_or_else(|e| e.into_inner());
    map.insert(rule_name, limiter);
}

/// Check if a request is allowed for a given rule and key.
/// Returns JSON: `{ "allowed": bool, "remaining": u32, "totalAllowed": u64, "totalRejected": u64 }`.
///
/// If the rule is not registered, returns allowed=true (fail-open).
#[napi]
pub fn majra_ratelimit_check(rule_name: String, key: String) -> String {
    let map = limiters().lock().unwrap_or_else(|e| e.into_inner());

    if let Some(limiter) = map.get(&rule_name) {
        let compound_key = format!("{rule_name}:{key}");
        let allowed = limiter.check(&compound_key);
        let stats = limiter.stats();

        serde_json::json!({
            "allowed": allowed,
            "activeKeys": stats.active_keys,
            "totalAllowed": stats.total_allowed,
            "totalRejected": stats.total_rejected,
        })
        .to_string()
    } else {
        // Fail-open for unregistered rules
        serde_json::json!({
            "allowed": true,
            "activeKeys": 0,
            "totalAllowed": 0,
            "totalRejected": 0,
        })
        .to_string()
    }
}

/// Evict stale keys from a limiter. Returns the number of keys evicted.
#[napi]
pub fn majra_ratelimit_evict(rule_name: String, max_idle_ms: u32) -> u32 {
    let map = limiters().lock().unwrap_or_else(|e| e.into_inner());

    if let Some(limiter) = map.get(&rule_name) {
        limiter.evict_stale(std::time::Duration::from_millis(max_idle_ms as u64)) as u32
    } else {
        0
    }
}

/// Get stats for a limiter. Returns JSON or null if not found.
#[napi]
pub fn majra_ratelimit_stats(rule_name: String) -> Option<String> {
    let map = limiters().lock().unwrap_or_else(|e| e.into_inner());

    map.get(&rule_name).map(|limiter| {
        let stats = limiter.stats();
        serde_json::json!({
            "activeKeys": stats.active_keys,
            "totalAllowed": stats.total_allowed,
            "totalRejected": stats.total_rejected,
            "totalEvicted": stats.total_evicted,
        })
        .to_string()
    })
}

/// Remove a registered rule.
#[napi]
pub fn majra_ratelimit_remove(rule_name: String) -> bool {
    let mut map = limiters().lock().unwrap_or_else(|e| e.into_inner());
    map.remove(&rule_name).is_some()
}

// ════════════════════════════════════════════════════════════════════════════
// Heartbeat Tracker
// ════════════════════════════════════════════════════════════════════════════

fn tracker() -> &'static heartbeat::ConcurrentHeartbeatTracker {
    static TRACKER: OnceLock<heartbeat::ConcurrentHeartbeatTracker> = OnceLock::new();
    TRACKER.get_or_init(|| {
        heartbeat::ConcurrentHeartbeatTracker::new(heartbeat::HeartbeatConfig {
            suspect_after: std::time::Duration::from_secs(30),
            offline_after: std::time::Duration::from_secs(90),
            eviction_policy: None,
        })
    })
}

/// Register a peer node for heartbeat tracking.
#[napi]
pub fn majra_heartbeat_register(id: String, metadata_json: String) {
    let metadata: serde_json::Value =
        serde_json::from_str(&metadata_json).unwrap_or(serde_json::Value::Null);
    tracker().register(id, metadata);
}

/// Record a heartbeat from a node. Returns true if the node was known.
#[napi]
pub fn majra_heartbeat(id: String) -> bool {
    tracker().heartbeat(&id)
}

/// Remove a node from tracking.
#[napi]
pub fn majra_heartbeat_deregister(id: String) -> bool {
    tracker().deregister(&id)
}

/// Sweep all nodes, transitioning statuses based on elapsed time.
/// Returns JSON array of transitions: `[{ "id": string, "status": string }]`.
#[napi]
pub fn majra_heartbeat_update() -> String {
    let transitions = tracker().update_statuses();
    let result: Vec<serde_json::Value> = transitions
        .into_iter()
        .map(|(id, status)| {
            serde_json::json!({
                "id": id,
                "status": format!("{status}"),
            })
        })
        .collect();
    serde_json::to_string(&result).unwrap_or_else(|_| "[]".to_string())
}

/// Get a node's current status. Returns JSON or null.
#[napi]
pub fn majra_heartbeat_get(id: String) -> Option<String> {
    tracker().get(&id).map(|state| {
        serde_json::json!({
            "status": format!("{}", state.status),
            "metadata": state.metadata,
        })
        .to_string()
    })
}

/// List nodes by status. Returns JSON array.
#[napi]
pub fn majra_heartbeat_list(status: String) -> String {
    let s = match status.as_str() {
        "online" => heartbeat::Status::Online,
        "suspect" => heartbeat::Status::Suspect,
        _ => heartbeat::Status::Offline,
    };
    let nodes = tracker().list_by_status(s);
    let result: Vec<serde_json::Value> = nodes
        .into_iter()
        .map(|(id, state)| {
            serde_json::json!({
                "id": id,
                "status": format!("{}", state.status),
                "metadata": state.metadata,
            })
        })
        .collect();
    serde_json::to_string(&result).unwrap_or_else(|_| "[]".to_string())
}

/// Total tracked nodes.
#[napi]
pub fn majra_heartbeat_count() -> u32 {
    tracker().len() as u32
}

// ════════════════════════════════════════════════════════════════════════════
// Barrier
// ════════════════════════════════════════════════════════════════════════════

fn barriers() -> &'static barrier::AsyncBarrierSet {
    static BARRIERS: OnceLock<barrier::AsyncBarrierSet> = OnceLock::new();
    BARRIERS.get_or_init(barrier::AsyncBarrierSet::new)
}

/// Create a new barrier expecting a set of participants.
/// `participants_json`: JSON array of participant IDs.
#[napi]
pub fn majra_barrier_create(name: String, participants_json: String) {
    let participants: Vec<String> =
        serde_json::from_str(&participants_json).unwrap_or_default();
    let set: std::collections::HashSet<String> = participants.into_iter().collect();
    barriers().create(&name, set);
}

/// Record a participant's arrival at a barrier.
/// Returns JSON: `{ "status": "waiting"|"released"|"unknown", "arrived"?: n, "expected"?: n }`.
#[napi]
pub fn majra_barrier_arrive(name: String, participant: String) -> String {
    let result = barriers().arrive(&name, &participant);
    match result {
        barrier::BarrierResult::Waiting { arrived, expected } => {
            serde_json::json!({ "status": "waiting", "arrived": arrived, "expected": expected })
        }
        barrier::BarrierResult::Released => serde_json::json!({ "status": "released" }),
        barrier::BarrierResult::Unknown | _ => serde_json::json!({ "status": "unknown" }),
    }
    .to_string()
}

/// Force a barrier to release by removing a dead participant.
#[napi]
pub fn majra_barrier_force(name: String, dead_participant: String) -> String {
    let result = barriers().force(&name, &dead_participant);
    match result {
        barrier::BarrierResult::Waiting { arrived, expected } => {
            serde_json::json!({ "status": "waiting", "arrived": arrived, "expected": expected })
        }
        barrier::BarrierResult::Released => serde_json::json!({ "status": "released" }),
        barrier::BarrierResult::Unknown | _ => serde_json::json!({ "status": "unknown" }),
    }
    .to_string()
}

/// Remove a completed barrier and return a record.
#[napi]
pub fn majra_barrier_complete(name: String) -> Option<String> {
    barriers().complete(&name).map(|record| {
        serde_json::json!({
            "name": record.name,
            "participants": record.participants,
            "forced": record.forced,
        })
        .to_string()
    })
}

/// Number of active barriers.
#[napi]
pub fn majra_barrier_count() -> u32 {
    barriers().len() as u32
}
