//! Integration routes — connected services CRUD.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, put};
use axum::{Json, Router};
use serde::Deserialize;

use crate::db::integrations;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/integrations", get(list_integrations))
        .route("/api/v1/integrations/{id}", get(get_integration))
        .route("/api/v1/integrations/{id}/status", put(update_status))
}

async fn list_integrations(State(state): State<AppState>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "Database not available"}))).into_response();
    };
    match integrations::list_integrations(pool).await {
        Ok(rows) => Json(serde_json::to_value(rows).unwrap()).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

async fn get_integration(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "Database not available"}))).into_response();
    };
    match integrations::get_integration(pool, &id).await {
        Ok(Some(row)) => Json(serde_json::to_value(row).unwrap()).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "Integration not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

#[derive(Deserialize)]
struct UpdateStatusRequest {
    enabled: bool,
    #[serde(default = "default_status")]
    status: String,
}

fn default_status() -> String { "connected".to_string() }

async fn update_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateStatusRequest>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    match integrations::update_integration_status(pool, &id, body.enabled, &body.status).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "Integration not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}
