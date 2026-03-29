//! Audit routes — log entries query.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;

use crate::db::audit;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/audit/entries", get(list_entries))
        .route("/api/v1/audit/entries/{id}", get(get_entry))
        .route("/api/v1/audit/stats", get(get_stats))
}

#[derive(Deserialize)]
struct AuditQuery {
    event: Option<String>,
    level: Option<String>,
    #[serde(default = "default_limit")]
    limit: i64,
    #[serde(default)]
    offset: i64,
}

fn default_limit() -> i64 { 50 }

async fn list_entries(State(state): State<AppState>, Query(q): Query<AuditQuery>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "Database not available"}))).into_response();
    };
    match audit::list_entries(pool, "default", q.event.as_deref(), q.level.as_deref(), q.limit.min(1000), q.offset).await {
        Ok(rows) => Json(serde_json::json!({"entries": rows, "total": rows.len()})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

async fn get_entry(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "Database not available"}))).into_response();
    };
    match audit::get_entry(pool, &id, "default").await {
        Ok(Some(row)) => Json(serde_json::to_value(row).unwrap()).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "Entry not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

async fn get_stats(State(state): State<AppState>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "Database not available"}))).into_response();
    };
    match audit::count_entries(pool, "default").await {
        Ok(count) => Json(serde_json::json!({"totalEntries": count})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}
