//! Soul routes — personality CRUD.
//!
//! Mirrors the TS `soul/soul-routes.ts` personality endpoints.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use serde::Deserialize;

use crate::db::soul;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/soul/personalities", get(list_personalities))
        .route("/api/v1/soul/personalities", post(create_personality))
        .route("/api/v1/soul/personalities/active", get(get_active))
        .route("/api/v1/soul/personalities/{id}", get(get_personality))
        .route("/api/v1/soul/personalities/{id}", put(update_personality))
        .route(
            "/api/v1/soul/personalities/{id}",
            delete(delete_personality),
        )
        // POST is the dashboard's (and the TS gateway's) verb; PUT is kept for
        // clients written against the earlier Rust route.
        .route(
            "/api/v1/soul/personalities/{id}/activate",
            post(activate_personality).put(activate_personality),
        )
        .route(
            "/api/v1/soul/personalities/{id}/enable",
            post(enable_personality),
        )
        .route(
            "/api/v1/soul/personalities/{id}/disable",
            post(disable_personality),
        )
        .route(
            "/api/v1/soul/personalities/{id}/set-default",
            post(set_default_personality),
        )
        .route(
            "/api/v1/soul/config",
            get(get_soul_config).patch(patch_soul_config),
        )
        .route("/api/v1/soul/onboarding/status", get(get_onboarding_status))
        .route(
            "/api/v1/soul/onboarding/complete",
            post(complete_onboarding),
        )
        // Dashboard expects these additional soul endpoints
        .route("/api/v1/soul/agent-name", get(get_agent_name))
        .route("/api/v1/soul/agent-name", put(set_agent_name))
        .route("/api/v1/soul/personality", get(get_active_personality))
        .route("/api/v1/soul/strategies", get(list_strategies))
        .route(
            "/api/v1/soul/personalities/clear-default",
            post(clear_default_personality),
        )
}

async fn list_personalities(State(state): State<AppState>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match soul::list_personalities(pool, "default").await {
        Ok(rows) => Json(serde_json::json!({"personalities": rows})).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatePersonalityRequest {
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    system_prompt: String,
    #[serde(default = "default_traits")]
    traits: serde_json::Value,
}

fn default_traits() -> serde_json::Value {
    serde_json::json!({})
}

async fn create_personality(
    State(state): State<AppState>,
    Json(body): Json<CreatePersonalityRequest>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    let id = uuid::Uuid::now_v7().to_string();
    match soul::create_personality(
        pool,
        &id,
        &body.name,
        &body.description,
        &body.system_prompt,
        &body.traits,
        "unspecified",
        "default",
    )
    .await
    {
        Ok(row) => (
            StatusCode::CREATED,
            Json(serde_json::json!({ "personality": row })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdatePersonalityRequest {
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    system_prompt: String,
    #[serde(default = "default_traits")]
    traits: serde_json::Value,
    // Accept the full body blob — includes mcpFeatures, activeHours, capabilities, etc.
    #[serde(default)]
    body: Option<serde_json::Value>,
    #[serde(default)]
    voice: Option<String>,
    #[serde(default)]
    sex: Option<String>,
    #[serde(default)]
    preferred_language: Option<String>,
    #[serde(default)]
    include_archetypes: Option<bool>,
    #[serde(default)]
    inject_date_time: Option<bool>,
    #[serde(default)]
    empathy_resonance: Option<bool>,
    #[serde(default)]
    brain_config: Option<serde_json::Value>,
    #[serde(default)]
    default_model: Option<serde_json::Value>,
}

async fn update_personality(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdatePersonalityRequest>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match soul::update_personality(
        pool,
        &id,
        &body.name,
        &body.description,
        &body.system_prompt,
        &body.traits,
        body.body.as_ref(),
        body.voice.as_deref(),
        body.sex.as_deref(),
        body.include_archetypes,
        body.default_model.as_ref(),
        "default",
    )
    .await
    {
        Ok(Some(row)) => Json(serde_json::json!({"personality": row})).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Personality not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn get_personality(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match soul::get_personality(pool, &id, "default").await {
        Ok(Some(row)) => Json(serde_json::to_value(row).unwrap()).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Personality not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn get_active(State(state): State<AppState>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match soul::get_active_personality(pool, "default").await {
        Ok(Some(row)) => Json(serde_json::to_value(row).unwrap()).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "No active personality"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

fn personality_not_found() -> axum::response::Response {
    (
        StatusCode::NOT_FOUND,
        Json(serde_json::json!({"error": "Personality not found"})),
    )
        .into_response()
}

fn internal_error(e: sqlx::Error) -> axum::response::Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({"error": e.to_string()})),
    )
        .into_response()
}

/// `{ personality }` — the active (default) personality after a change.
async fn active_personality_body(pool: &sqlx::PgPool) -> axum::response::Response {
    match soul::get_active_personality(pool, "default").await {
        Ok(active) => Json(serde_json::json!({ "personality": active })).into_response(),
        Err(e) => internal_error(e),
    }
}

/// POST /api/v1/soul/personalities/{id}/activate — make it the default and
/// only enabled personality; `{ personality }`.
async fn activate_personality(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    match soul::activate_personality(pool, &id, "default").await {
        Ok(true) => active_personality_body(pool).await,
        Ok(false) => personality_not_found(),
        Err(e) => internal_error(e),
    }
}

/// POST /api/v1/soul/personalities/{id}/set-default — `{ personality }`.
async fn set_default_personality(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    match soul::set_default_personality(pool, &id, "default").await {
        Ok(true) => active_personality_body(pool).await,
        Ok(false) => personality_not_found(),
        Err(e) => internal_error(e),
    }
}

async fn set_personality_enabled(
    state: &AppState,
    id: &str,
    enabled: bool,
) -> axum::response::Response {
    let Some(pool) = state.db() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    match soul::set_personality_enabled(pool, id, "default", enabled).await {
        Ok(true) => Json(serde_json::json!({ "success": true })).into_response(),
        Ok(false) => personality_not_found(),
        Err(e) => internal_error(e),
    }
}

/// POST /api/v1/soul/personalities/{id}/enable — `{ success: true }`.
async fn enable_personality(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    set_personality_enabled(&state, &id, true).await
}

/// POST /api/v1/soul/personalities/{id}/disable — `{ success: true }`.
async fn disable_personality(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    set_personality_enabled(&state, &id, false).await
}

async fn delete_personality(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    match soul::delete_personality(pool, &id, "default").await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Personality not found or is default"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// The TS `SoulConfigSchema` defaults. Stored overrides (`soul.meta` key
/// `soul_config`, the whole config as a JSON object) are merged over them.
fn soul_config_defaults() -> serde_json::Map<String, serde_json::Value> {
    let serde_json::Value::Object(defaults) = serde_json::json!({
        "enabled": true,
        "learningMode": ["user_authored"],
        "maxSkills": 100,
        "maxPromptTokens": 64000,
    }) else {
        unreachable!("object literal")
    };
    defaults
}

/// Merge the known keys of `overrides` into `config` (unknown keys are
/// dropped, as zod strips them in the TS gateway).
fn merge_soul_config(
    config: &mut serde_json::Map<String, serde_json::Value>,
    overrides: serde_json::Map<String, serde_json::Value>,
) {
    for (key, value) in overrides {
        if config.contains_key(&key) {
            config.insert(key, value);
        }
    }
}

/// Validate a merged soul config against the TS `SoulConfigSchema`.
fn validate_soul_config(config: &serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    const MODES: &[&str] = &["user_authored", "ai_proposed", "autonomous"];
    if !config["enabled"].is_boolean() {
        return Err("enabled must be a boolean".into());
    }
    let modes_ok = config["learningMode"].as_array().is_some_and(|m| {
        m.iter()
            .all(|v| v.as_str().is_some_and(|s| MODES.contains(&s)))
    });
    if !modes_ok {
        return Err(format!(
            "learningMode must be a list of: {}",
            MODES.join(", ")
        ));
    }
    let in_range =
        |key: &str, max: u64| config[key].as_u64().is_some_and(|n| (1..=max).contains(&n));
    if !in_range("maxSkills", 200) {
        return Err("maxSkills must be an integer from 1 to 200".into());
    }
    if !in_range("maxPromptTokens", 100_000) {
        return Err("maxPromptTokens must be an integer from 1 to 100000".into());
    }
    Ok(())
}

async fn load_soul_config(
    pool: &sqlx::PgPool,
) -> Result<serde_json::Map<String, serde_json::Value>, sqlx::Error> {
    let mut config = soul_config_defaults();
    if let Some(raw) = soul::get_meta(pool, "soul_config").await?
        && let Ok(serde_json::Value::Object(overrides)) = serde_json::from_str(&raw)
    {
        merge_soul_config(&mut config, overrides);
    }
    Ok(config)
}

/// GET /api/v1/soul/config — `{ config }`.
async fn get_soul_config(State(state): State<AppState>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return Json(serde_json::json!({ "config": soul_config_defaults() })).into_response();
    };
    match load_soul_config(pool).await {
        Ok(config) => Json(serde_json::json!({ "config": config })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// PATCH /api/v1/soul/config — merge, validate and persist; `{ config }`.
async fn patch_soul_config(
    State(state): State<AppState>,
    Json(patch): Json<serde_json::Value>,
) -> impl IntoResponse {
    let bad_request = |message: String| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response()
    };
    let serde_json::Value::Object(patch) = patch else {
        return bad_request("body must be a JSON object".into());
    };
    let Some(pool) = state.db() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let internal = |e: sqlx::Error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response()
    };
    let mut config = match load_soul_config(pool).await {
        Ok(c) => c,
        Err(e) => return internal(e),
    };
    merge_soul_config(&mut config, patch);
    if let Err(message) = validate_soul_config(&config) {
        return bad_request(message);
    }
    let stored = serde_json::Value::Object(config.clone()).to_string();
    match soul::set_meta(pool, "soul_config", &stored).await {
        Ok(()) => Json(serde_json::json!({ "config": config })).into_response(),
        Err(e) => internal(e),
    }
}

async fn get_onboarding_status(State(state): State<AppState>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    // Onboarding is considered complete if at least one non-default personality exists
    match soul::list_personalities(pool, "default").await {
        Ok(rows) => {
            let completed = rows.iter().any(|r| !r.is_default);
            Json(serde_json::json!({"completed": completed})).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn complete_onboarding(State(state): State<AppState>) -> impl IntoResponse {
    let Some(_pool) = state.db() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    // Mark onboarding as complete — currently a no-op acknowledgement
    StatusCode::NO_CONTENT.into_response()
}

// ── Agent Name ─────────────────────────────────────────────────────────

/// The name the TS gateway seeded at onboarding, used until one is set.
const DEFAULT_AGENT_NAME: &str = "FRIDAY";

/// GET /api/v1/soul/agent-name — `{ agentName }` (stored in `soul.meta`).
async fn get_agent_name(State(state): State<AppState>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return Json(serde_json::json!({ "agentName": DEFAULT_AGENT_NAME })).into_response();
    };
    match soul::get_meta(pool, "agent_name").await {
        Ok(name) => Json(serde_json::json!({
            "agentName": name.unwrap_or_else(|| DEFAULT_AGENT_NAME.to_string()),
        }))
        .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentNameRequest {
    #[serde(alias = "name")]
    agent_name: String,
}

/// PUT /api/v1/soul/agent-name — body `{ agentName }`; `{ agentName }`.
async fn set_agent_name(
    State(state): State<AppState>,
    Json(body): Json<AgentNameRequest>,
) -> impl IntoResponse {
    let name = body.agent_name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Agent name must be 1-100 characters"})),
        )
            .into_response();
    }
    let Some(pool) = state.db() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    match soul::set_meta(pool, "agent_name", name).await {
        Ok(()) => Json(serde_json::json!({ "agentName": name })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ── Active Personality Shortcut ────────────────────────────────────────

async fn get_active_personality(State(state): State<AppState>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match soul::get_active_personality(pool, "default").await {
        Ok(Some(p)) => Json(serde_json::json!({"personality": p})).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "No active personality"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ── Strategies ─────────────────────────────────────────────────────────

async fn list_strategies() -> impl IntoResponse {
    Json(serde_json::json!({
        "strategies": [
            {"id": "balanced", "name": "Balanced", "description": "Default balanced reasoning", "isDefault": true},
            {"id": "analytical", "name": "Analytical", "description": "Step-by-step logical analysis", "isDefault": false},
            {"id": "creative", "name": "Creative", "description": "Open-ended creative exploration", "isDefault": false},
            {"id": "concise", "name": "Concise", "description": "Brief, direct responses", "isDefault": false},
        ]
    }))
}

// ── Clear Default Personality ──────────────────────────────────────────

/// POST /api/v1/soul/personalities/clear-default — `{ success: true }`.
async fn clear_default_personality(State(state): State<AppState>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    match soul::clear_default_personality(pool, "default").await {
        Ok(()) => Json(serde_json::json!({ "success": true })).into_response(),
        Err(e) => internal_error(e),
    }
}
