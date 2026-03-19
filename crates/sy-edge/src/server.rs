//! HTTP server — Axum router with all edge API endpoints.

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    middleware,
    response::IntoResponse,
    routing::{delete, get, post, put},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::{a2a, capabilities, llm, memory, messaging, metrics, ratelimit, sandbox, scheduler};

pub struct AppState {
    pub capabilities: capabilities::EdgeCapabilities,
    pub metrics: metrics::MetricsCollector,
    pub memory: memory::MemoryStore,
    pub sandbox: sandbox::SandboxManager,
    pub llm: llm::LlmClient,
    pub messenger: messaging::Messenger,
    pub scheduler: scheduler::Scheduler,
    pub a2a: a2a::A2AManager,
    pub rate_limiter: ratelimit::RateLimiter,
}

type SharedState = Arc<AppState>;

pub fn build_router(state: AppState) -> Router {
    let shared = Arc::new(state);

    let public_routes = Router::new()
        .route("/health", get(health))
        .route("/api/v1/metrics/prometheus", get(metrics_prometheus));

    let auth_routes = Router::new()
        // A2A
        .route("/api/v1/a2a/capabilities", get(a2a_capabilities))
        .route("/api/v1/a2a/receive", post(a2a_receive))
        .route("/api/v1/a2a/peers", get(a2a_peers))
        // Metrics
        .route("/api/v1/metrics", get(metrics_current))
        .route("/api/v1/metrics/history", get(metrics_history))
        // Memory
        .route("/api/v1/memory", get(memory_namespaces))
        .route("/api/v1/memory/{namespace}", get(memory_list))
        .route("/api/v1/memory/{namespace}/{key}", get(memory_get))
        .route("/api/v1/memory/{namespace}/{key}", put(memory_put))
        .route("/api/v1/memory/{namespace}/{key}", delete(memory_delete))
        // Exec
        .route("/api/v1/exec", post(exec_command))
        .route("/api/v1/exec/allowed", get(exec_allowed))
        // LLM
        .route("/api/v1/llm/complete", post(llm_complete))
        .route("/api/v1/llm/providers", get(llm_providers))
        // Messaging
        .route("/api/v1/messaging/send", post(messaging_send))
        .route("/api/v1/messaging/broadcast", post(messaging_broadcast))
        .route("/api/v1/messaging/targets", get(messaging_targets))
        // Scheduler
        .route("/api/v1/scheduler/tasks", get(scheduler_list))
        .route("/api/v1/scheduler/tasks", post(scheduler_add))
        .route("/api/v1/scheduler/tasks/{id}", delete(scheduler_remove))
        // Update
        .route("/api/v1/update/check", get(update_check))
        .layer(middleware::from_fn_with_state(shared.clone(), auth_middleware));

    Router::new()
        .merge(public_routes)
        .merge(auth_routes)
        .with_state(shared)
}

// ── Auth middleware ──────────────────────────────────────────────────────────

async fn auth_middleware(
    State(state): State<SharedState>,
    req: axum::http::Request<axum::body::Body>,
    next: middleware::Next,
) -> impl IntoResponse {
    // Check rate limit
    let peer_ip = req
        .headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string();

    if !state.rate_limiter.check(&peer_ip) {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    }

    let expected_token = std::env::var("SECUREYEOMAN_EDGE_API_TOKEN").unwrap_or_default();
    if expected_token.is_empty() {
        // No token configured — allow (dev mode)
        return next.run(req).await.into_response();
    }

    let auth = req
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if auth == format!("Bearer {expected_token}") {
        next.run(req).await.into_response()
    } else {
        StatusCode::UNAUTHORIZED.into_response()
    }
}

// ── Health ──────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    mode: &'static str,
    version: &'static str,
    uptime_ms: u64,
    capabilities: capabilities::EdgeCapabilities,
}

async fn health(State(state): State<SharedState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        mode: "edge",
        version: crate::VERSION,
        uptime_ms: 0, // TODO: track start time
        capabilities: state.capabilities.clone(),
    })
}

// ── A2A ─────────────────────────────────────────────────────────────────────

async fn a2a_capabilities(State(state): State<SharedState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "capabilities": state.capabilities }))
}

async fn a2a_receive(
    State(state): State<SharedState>,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    let msg_type = body.get("type").and_then(|v| v.as_str()).unwrap_or("unknown");
    let from = body
        .get("fromPeerId")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    tracing::debug!(msg_type, from, "A2A message received");
    state.a2a.handle_message(&body);

    Json(serde_json::json!({ "ok": true, "received": msg_type }))
}

async fn a2a_peers(State(state): State<SharedState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "peers": state.a2a.list_peers() }))
}

// ── Metrics ─────────────────────────────────────────────────────────────────

async fn metrics_current(State(state): State<SharedState>) -> Json<serde_json::Value> {
    Json(state.metrics.current())
}

async fn metrics_prometheus(State(state): State<SharedState>) -> impl IntoResponse {
    (
        [(axum::http::header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        state.metrics.prometheus(),
    )
}

#[derive(Deserialize)]
struct HistoryQuery {
    minutes: Option<u32>,
}

async fn metrics_history(
    State(state): State<SharedState>,
    Query(q): Query<HistoryQuery>,
) -> Json<serde_json::Value> {
    let minutes = q.minutes.unwrap_or(10);
    Json(state.metrics.history(minutes))
}

// ── Memory ──────────────────────────────────────────────────────────────────

async fn memory_namespaces(State(state): State<SharedState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "namespaces": state.memory.list_namespaces() }))
}

async fn memory_list(
    State(state): State<SharedState>,
    Path(namespace): Path<String>,
) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "entries": state.memory.list(&namespace) }))
}

async fn memory_get(
    State(state): State<SharedState>,
    Path((namespace, key)): Path<(String, String)>,
) -> impl IntoResponse {
    match state.memory.get(&namespace, &key) {
        Some(val) => Json(serde_json::json!({ "value": val })).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

#[derive(Deserialize)]
struct MemoryPutBody {
    value: serde_json::Value,
    ttl_seconds: Option<u64>,
}

async fn memory_put(
    State(state): State<SharedState>,
    Path((namespace, key)): Path<(String, String)>,
    Json(body): Json<MemoryPutBody>,
) -> impl IntoResponse {
    match state.memory.put(&namespace, &key, body.value, body.ttl_seconds) {
        Ok(()) => StatusCode::OK.into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e }))).into_response(),
    }
}

async fn memory_delete(
    State(state): State<SharedState>,
    Path((namespace, key)): Path<(String, String)>,
) -> StatusCode {
    state.memory.delete(&namespace, &key);
    StatusCode::NO_CONTENT
}

// ── Exec ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ExecRequest {
    command: String,
    args: Option<Vec<String>>,
    workspace: Option<String>,
    timeout_seconds: Option<u64>,
}

async fn exec_command(
    State(state): State<SharedState>,
    Json(body): Json<ExecRequest>,
) -> impl IntoResponse {
    match state.sandbox.execute(
        &body.command,
        body.args.as_deref().unwrap_or(&[]),
        body.workspace.as_deref(),
        body.timeout_seconds.unwrap_or(30),
    ) {
        Ok(output) => Json(serde_json::json!({
            "stdout": output.stdout,
            "stderr": output.stderr,
            "exit_code": output.exit_code,
        }))
        .into_response(),
        Err(e) => (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({ "error": e })),
        )
            .into_response(),
    }
}

async fn exec_allowed(State(state): State<SharedState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "allowed": state.sandbox.allowed_commands() }))
}

// ── LLM ─────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct LlmRequest {
    prompt: String,
    provider: Option<String>,
    model: Option<String>,
    max_tokens: Option<u32>,
}

async fn llm_complete(
    State(state): State<SharedState>,
    Json(body): Json<LlmRequest>,
) -> impl IntoResponse {
    match state
        .llm
        .complete(
            &body.prompt,
            body.provider.as_deref(),
            body.model.as_deref(),
            body.max_tokens.unwrap_or(1024),
        )
        .await
    {
        Ok(response) => Json(serde_json::json!({ "response": response })).into_response(),
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": e })),
        )
            .into_response(),
    }
}

async fn llm_providers(State(state): State<SharedState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "providers": state.llm.list_providers() }))
}

// ── Messaging ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct MessageRequest {
    target: String,
    text: String,
}

async fn messaging_send(
    State(state): State<SharedState>,
    Json(body): Json<MessageRequest>,
) -> impl IntoResponse {
    match state.messenger.send(&body.target, &body.text).await {
        Ok(()) => StatusCode::OK.into_response(),
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": e })),
        )
            .into_response(),
    }
}

async fn messaging_broadcast(
    State(state): State<SharedState>,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    let text = body
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    match state.messenger.broadcast(text).await {
        Ok(count) => Json(serde_json::json!({ "sent": count })).into_response(),
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": e })),
        )
            .into_response(),
    }
}

async fn messaging_targets(State(state): State<SharedState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "targets": state.messenger.list_targets() }))
}

// ── Scheduler ───────────────────────────────────────────────────────────────

async fn scheduler_list(State(state): State<SharedState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "tasks": state.scheduler.list_tasks() }))
}

async fn scheduler_add(
    State(state): State<SharedState>,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    match state.scheduler.add_task(body) {
        Ok(id) => Json(serde_json::json!({ "id": id })).into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": e })),
        )
            .into_response(),
    }
}

async fn scheduler_remove(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> StatusCode {
    state.scheduler.remove_task(&id);
    StatusCode::NO_CONTENT
}

// ── Update ──────────────────────────────────────────────────────────────────

async fn update_check(State(_state): State<SharedState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "current_version": crate::VERSION,
        "update_available": false,
    }))
}
