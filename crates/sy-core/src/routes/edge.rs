//! Edge routes — fleet node management.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;
use crate::db::edge;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/edge/nodes", get(list_nodes))
        .route("/api/v1/edge/nodes/{id}", get(get_node))
}

#[derive(Deserialize)]
struct PQ { #[serde(default = "dl")] limit: i64, #[serde(default)] offset: i64 }
fn dl() -> i64 { 20 }

async fn list_nodes(State(s): State<AppState>, Query(q): Query<PQ>) -> impl IntoResponse {
    let Some(pool) = s.db() else { return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error":"No DB"}))).into_response(); };
    match edge::list_nodes(pool, q.limit.min(100), q.offset).await {
        Ok(r) => Json(serde_json::to_value(r).unwrap()).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

async fn get_node(State(s): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let Some(pool) = s.db() else { return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error":"No DB"}))).into_response(); };
    match edge::get_node(pool, &id).await {
        Ok(Some(r)) => Json(serde_json::to_value(r).unwrap()).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Node not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}
