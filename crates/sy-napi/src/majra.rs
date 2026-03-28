//! Majra — NAPI bindings for Node.js.
//!
//! Three pub/sub channel tiers:
//! - `DirectChannel<T>` — 73M msg/s, raw broadcast, no routing
//! - `HashedChannel<T>` — 16M msg/s, hashed topic + coarse timestamp
//! - `PubSub` / `TypedPubSub<T>` — 1.1M msg/s, MQTT wildcards, filters, replay
//!
//! Plus: rate limiter, heartbeat tracker, barrier, managed queue.

use std::sync::OnceLock;

use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;
use tokio::runtime::Runtime;

use std::collections::HashMap;
use std::sync::Mutex;

use majra::barrier;
use majra::heartbeat;
use majra::pubsub::{self, DirectChannel, HashedChannel, PubSub, TopicHash};
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
// DirectChannel — raw broadcast, ~73M msg/s
// ════════════════════════════════════════════════════════════════════════════

fn direct_channel() -> &'static DirectChannel<serde_json::Value> {
    static DC: OnceLock<DirectChannel<serde_json::Value>> = OnceLock::new();
    DC.get_or_init(|| DirectChannel::new(4096))
}

/// Publish a JSON value to the direct broadcast channel.
/// Returns the number of active receivers.
#[napi]
pub fn majra_direct_publish(payload_json: String) -> u32 {
    let payload: serde_json::Value =
        serde_json::from_str(&payload_json).unwrap_or(serde_json::Value::Null);
    direct_channel().publish(payload) as u32
}

/// Subscribe to the direct broadcast channel.
/// Callback receives every published message as JSON.
#[napi]
pub fn majra_direct_subscribe(
    #[napi(ts_arg_type = "(message: string) => void")] callback: ThreadsafeFunction<
        String,
        ErrorStrategy::Fatal,
    >,
) {
    let mut rx = direct_channel().subscribe();

    runtime().spawn(async move {
        while let Ok(msg) = rx.recv().await {
            let json = serde_json::to_string(&msg).unwrap_or_default();
            callback.call(json, ThreadsafeFunctionCallMode::NonBlocking);
        }
    });
}

/// Number of active direct channel subscribers.
#[napi]
pub fn majra_direct_subscriber_count() -> u32 {
    direct_channel().subscriber_count() as u32
}

/// Total messages published on the direct channel.
#[napi]
pub fn majra_direct_messages_published() -> u32 {
    direct_channel().messages_published() as u32
}

// ════════════════════════════════════════════════════════════════════════════
// HashedChannel — hashed topic routing, ~16M msg/s
// ════════════════════════════════════════════════════════════════════════════

fn hashed_channel() -> &'static HashedChannel<serde_json::Value> {
    static HC: OnceLock<HashedChannel<serde_json::Value>> = OnceLock::new();
    HC.get_or_init(|| HashedChannel::new(1024))
}

/// Publish a JSON value to a hashed topic. O(1) — no string allocation on publish.
/// Returns the number of receivers.
#[napi]
pub fn majra_hashed_publish(topic: String, payload_json: String) -> u32 {
    let payload: serde_json::Value =
        serde_json::from_str(&payload_json).unwrap_or(serde_json::Value::Null);
    let hash = TopicHash::new(&topic);
    hashed_channel().publish(hash, payload) as u32
}

/// Subscribe to a hashed topic. Callback receives messages as JSON.
#[napi]
pub fn majra_hashed_subscribe(
    topic: String,
    #[napi(ts_arg_type = "(message: string) => void")] callback: ThreadsafeFunction<
        String,
        ErrorStrategy::Fatal,
    >,
) {
    let hash = TopicHash::new(&topic);
    let mut rx = hashed_channel().subscribe(hash);

    runtime().spawn(async move {
        while let Ok(msg) = rx.recv().await {
            let json = serde_json::json!({
                "topicHash": msg.topic_hash.value(),
                "timestampNs": msg.timestamp_ns,
                "payload": msg.payload,
            })
            .to_string();
            callback.call(json, ThreadsafeFunctionCallMode::NonBlocking);
        }
    });
}

/// Number of active hashed topic subscriptions.
#[napi]
pub fn majra_hashed_topic_count() -> u32 {
    hashed_channel().topic_count() as u32
}

/// Total messages published on the hashed channel.
#[napi]
pub fn majra_hashed_messages_published() -> u32 {
    hashed_channel().messages_published() as u32
}

/// Unsubscribe from a hashed topic.
#[napi]
pub fn majra_hashed_unsubscribe(topic: String) {
    let hash = TopicHash::new(&topic);
    hashed_channel().unsubscribe(hash);
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
    let participants: Vec<String> = serde_json::from_str(&participants_json).unwrap_or_default();
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

// ════════════════════════════════════════════════════════════════════════════
// Managed Queue
// ════════════════════════════════════════════════════════════════════════════

use majra::queue::{ManagedQueue, ManagedQueueConfig, Priority};

fn job_queue() -> &'static ManagedQueue<serde_json::Value> {
    static QUEUE: OnceLock<ManagedQueue<serde_json::Value>> = OnceLock::new();
    QUEUE.get_or_init(|| {
        ManagedQueue::new(ManagedQueueConfig {
            max_concurrency: 4,
            finished_ttl: std::time::Duration::from_secs(3600),
        })
    })
}

fn parse_priority(s: &str) -> Priority {
    match s {
        "critical" => Priority::Critical,
        "high" => Priority::High,
        "normal" => Priority::Normal,
        "low" => Priority::Low,
        "background" => Priority::Background,
        _ => Priority::Normal,
    }
}

/// Enqueue a job. Returns the job ID (UUID string).
/// `priority`: "critical"|"high"|"normal"|"low"|"background"
/// `payload_json`: arbitrary JSON payload (job config).
#[napi]
pub fn majra_queue_enqueue(priority: String, payload_json: String) -> String {
    let payload: serde_json::Value =
        serde_json::from_str(&payload_json).unwrap_or(serde_json::Value::Null);
    let pri = parse_priority(&priority);
    let id = runtime().block_on(async { job_queue().enqueue(pri, payload, None).await });
    id.to_string()
}

/// Dequeue the next eligible job (no resource constraints).
/// Returns JSON job or null if queue is empty / concurrency maxed.
#[napi]
pub fn majra_queue_dequeue() -> Option<String> {
    runtime().block_on(async {
        job_queue().dequeue_any().await.map(|item| {
            serde_json::json!({
                "id": item.id.to_string(),
                "priority": format!("{}", item.priority),
                "state": format!("{}", item.state),
                "payload": item.payload,
            })
            .to_string()
        })
    })
}

/// Mark a job as completed.
#[napi]
pub fn majra_queue_complete(job_id: String) -> bool {
    let id = match uuid::Uuid::parse_str(&job_id) {
        Ok(id) => id,
        Err(_) => return false,
    };
    job_queue().complete(id).is_ok()
}

/// Mark a job as failed.
#[napi]
pub fn majra_queue_fail(job_id: String) -> bool {
    let id = match uuid::Uuid::parse_str(&job_id) {
        Ok(id) => id,
        Err(_) => return false,
    };
    job_queue().fail(id).is_ok()
}

/// Cancel a job (from Queued or Running state).
#[napi]
pub fn majra_queue_cancel(job_id: String) -> bool {
    let id = match uuid::Uuid::parse_str(&job_id) {
        Ok(id) => id,
        Err(_) => return false,
    };
    runtime().block_on(async { job_queue().cancel(id).await.is_ok() })
}

/// Get the current state of a job. Returns JSON or null.
#[napi]
pub fn majra_queue_get(job_id: String) -> Option<String> {
    let id = match uuid::Uuid::parse_str(&job_id) {
        Ok(id) => id,
        Err(_) => return None,
    };
    job_queue().get(&id).map(|item| {
        serde_json::json!({
            "id": item.id.to_string(),
            "priority": format!("{}", item.priority),
            "state": format!("{}", item.state),
            "payload": item.payload,
        })
        .to_string()
    })
}

/// Number of jobs currently running.
#[napi]
pub fn majra_queue_running_count() -> u32 {
    job_queue().running_count() as u32
}

/// Total number of tracked jobs (all states).
#[napi]
pub fn majra_queue_job_count() -> u32 {
    job_queue().job_count() as u32
}
