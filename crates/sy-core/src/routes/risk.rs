//! Risk routes — assessments and departments, at the TS gateway's paths and
//! in its wire shapes (`{ items, total }` lists, `{ assessment }`). Feeds,
//! findings, the register, heatmap and summary are not ported yet and answer
//! empty, so the dashboard's risk page still renders.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;

use crate::db::risk::{self, ParentFilter};
use crate::routes::Page;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/v1/risk/assessments",
            get(list_assessments).post(run_assessment),
        )
        .route(
            "/api/v1/risk/assessments/{id}",
            get(get_assessment).delete(delete_assessment),
        )
        .route("/api/v1/risk/departments", get(list_departments))
        .route("/api/v1/risk/config", get(risk_config))
        .route("/api/v1/risk/feeds", get(risk_feeds))
        .route("/api/v1/risk/findings", get(risk_findings))
        .route("/api/v1/risk/heatmap", get(risk_heatmap))
        .route("/api/v1/risk/register", get(risk_register))
        .route("/api/v1/risk/summary", get(risk_summary))
}

fn error(status: StatusCode, message: &str) -> Response {
    (status, Json(serde_json::json!({ "error": message }))).into_response()
}

fn db_unavailable() -> Response {
    error(StatusCode::SERVICE_UNAVAILABLE, "Database not available")
}

fn internal_error(e: sqlx::Error) -> Response {
    tracing::error!(error = %e, "risk query failed");
    error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListQuery {
    status: Option<String>,
    parent_id: Option<String>,
}

/// GET /api/v1/risk/assessments — newest first, `?status=` filters;
/// `{ items, total }`.
async fn list_assessments(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
    Query(page): Query<Page>,
) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    let status = q.status.as_deref().filter(|s| !s.is_empty());
    match risk::list_assessments(pool, status, page.limit(50), page.offset()).await {
        Ok((items, total)) => {
            Json(serde_json::json!({ "items": items, "total": total })).into_response()
        }
        Err(e) => internal_error(e),
    }
}

/// GET /api/v1/risk/assessments/{id} — `{ assessment }`.
async fn get_assessment(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match risk::get_assessment(pool, &id).await {
        Ok(Some(assessment)) => {
            Json(serde_json::json!({ "assessment": assessment })).into_response()
        }
        Ok(None) => error(StatusCode::NOT_FOUND, "Assessment not found"),
        Err(e) => internal_error(e),
    }
}

/// POST /api/v1/risk/assessments — running an assessment needs the TS
/// `RiskAssessmentManager` analysis, which is not ported yet.
async fn run_assessment() -> Response {
    error(
        StatusCode::NOT_IMPLEMENTED,
        "Running risk assessments is not yet supported in Rust",
    )
}

/// DELETE /api/v1/risk/assessments/{id} — 204, or 404.
async fn delete_assessment(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match risk::delete_assessment(pool, &id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => error(StatusCode::NOT_FOUND, "Assessment not found"),
        Err(e) => internal_error(e),
    }
}

/// GET /api/v1/risk/departments — by name; `?parentId=` narrows to one
/// parent's children (`null` for top-level departments); `{ items, total }`.
async fn list_departments(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
    Query(page): Query<Page>,
) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    let parent = match q.parent_id.as_deref() {
        None => ParentFilter::Any,
        Some("null") => ParentFilter::Root,
        Some(id) => ParentFilter::Of(id),
    };
    match risk::list_departments(pool, parent, page.limit(20), page.offset()).await {
        Ok((rows, total)) => {
            let items: Vec<_> = rows.iter().map(risk::DepartmentRow::to_json).collect();
            Json(serde_json::json!({ "items": items, "total": total })).into_response()
        }
        Err(e) => internal_error(e),
    }
}

async fn risk_config() -> Response {
    Json(serde_json::json!({
        "severityLevels": ["critical", "high", "medium", "low"],
        "categories": ["security", "compliance", "operational", "financial"],
        "autoScoreEnabled": false
    }))
    .into_response()
}

// ── Not yet ported: empty answers in the dashboard's shapes ────────────

async fn risk_feeds() -> Response {
    Json(serde_json::json!({"feeds": [], "total": 0})).into_response()
}

async fn risk_findings() -> Response {
    Json(serde_json::json!({"findings": [], "total": 0})).into_response()
}

async fn risk_heatmap() -> Response {
    Json(serde_json::json!({"cells": [], "dimensions": {"rows": 0, "cols": 0}})).into_response()
}

async fn risk_register() -> Response {
    Json(serde_json::json!({"items": [], "total": 0})).into_response()
}

async fn risk_summary() -> Response {
    Json(serde_json::json!({
        "totalRisks": 0,
        "criticalCount": 0,
        "highCount": 0,
        "mediumCount": 0,
        "lowCount": 0,
        "mitigatedCount": 0,
        "overallScore": 0.0,
        "trend": "stable",
    }))
    .into_response()
}
