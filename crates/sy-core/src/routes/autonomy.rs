//! Autonomy routes — audit management and emergency stop.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post, put};
use axum::{Json, Router};
use serde::Deserialize;

use crate::db::autonomy;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/autonomy/overview", get(overview))
        .route("/api/v1/autonomy/audits", get(list_audits))
        .route("/api/v1/autonomy/audits", post(create_audit))
        .route("/api/v1/autonomy/audits/{id}", get(get_audit))
        .route(
            "/api/v1/autonomy/audits/{id}/finalize",
            post(finalize_audit),
        )
        .route(
            "/api/v1/autonomy/audits/{id}/items/{itemId}",
            put(update_audit_item),
        )
        // Unmapped in RBAC, so admin only (as TS required).
        .route(
            "/api/v1/autonomy/emergency-stop/{type}/{id}",
            post(emergency_stop),
        )
}

#[derive(Deserialize)]
struct PaginationQuery {
    #[serde(default = "default_limit")]
    limit: i64,
    #[serde(default)]
    offset: i64,
}

fn default_limit() -> i64 {
    20
}

/// GET /api/v1/autonomy/overview — autonomy module overview.
async fn overview(State(state): State<AppState>) -> impl IntoResponse {
    let db_available = state.db().is_some();
    Json(serde_json::json!({
        "enabled": true,
        "dbConnected": db_available,
        "pendingAudits": 0,
    }))
    .into_response()
}

async fn list_audits(
    State(state): State<AppState>,
    Query(q): Query<PaginationQuery>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match autonomy::list_audits(pool, q.limit.min(100), q.offset).await {
        Ok(rows) => Json(serde_json::to_value(rows).unwrap()).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn get_audit(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match autonomy::get_audit(pool, &id).await {
        Ok(Some(row)) => Json(serde_json::to_value(row).unwrap()).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Audit not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// POST /api/v1/autonomy/audits/{id}/finalize — finalize an audit.
async fn finalize_audit(
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
    match autonomy::finalize_audit(pool, &id).await {
        Ok(Some(row)) => Json(serde_json::to_value(row).unwrap()).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Audit not found"})),
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
struct CreateAuditRequest {
    agent_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateAuditItemRequest {
    status: String,
    notes: Option<String>,
}

/// PUT /api/v1/autonomy/audits/{id}/items/{itemId} — update an audit item.
async fn update_audit_item(
    State(state): State<AppState>,
    Path((id, item_id)): Path<(String, String)>,
    Json(body): Json<UpdateAuditItemRequest>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match autonomy::update_audit_item(pool, &id, &item_id, &body.status, body.notes.as_deref())
        .await
    {
        Ok(true) => Json(serde_json::json!({
            "auditId": id,
            "itemId": item_id,
            "status": body.status,
            "updated": true,
        }))
        .into_response(),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Audit item not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// POST /api/v1/autonomy/audits — create a new audit run.
async fn create_audit(
    State(state): State<AppState>,
    Json(body): Json<CreateAuditRequest>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    let id = uuid::Uuid::now_v7().to_string();
    match autonomy::create_audit(pool, &id, &body.agent_id).await {
        Ok(row) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(row).unwrap()),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// POST /api/v1/autonomy/emergency-stop/{type}/{id} — stop a skill or a
/// workflow now (TS `emergencyStop`): the skill is disabled; the workflow is
/// disabled and its pending and running runs are cancelled. It used to read
/// the type and id as an agent and a reason, and answer "stopped" without
/// stopping anything.
async fn emergency_stop(
    State(state): State<AppState>,
    auth: Option<axum::Extension<crate::auth::middleware::AuthContext>>,
    Path((kind, id)): Path<(String, String)>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    let stopped = match kind.as_str() {
        "skill" => sqlx::query("UPDATE soul.skills SET enabled = false WHERE id = $1")
            .bind(&id)
            .execute(pool)
            .await
            .map(|r| r.rows_affected() > 0),
        "workflow" => match uuid::Uuid::parse_str(&id) {
            Ok(workflow_id) => {
                crate::routes::workflow::emergency_stop_workflow(pool, workflow_id).await
            }
            Err(_) => Ok(false),
        },
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "type must be skill or workflow"})),
            )
                .into_response();
        }
    };
    match stopped {
        Ok(true) => {
            let mut entry = crate::db::audit::NewAuditEntry::new(
                "autonomy_emergency_stop",
                "warn",
                &format!("Emergency stop activated for {kind} {id}"),
            );
            let actor = auth.map(|axum::Extension(a)| a.user_id);
            entry.metadata = Some(serde_json::json!({
                "type": kind, "targetId": id, "actorId": actor,
            }));
            entry.user_id = actor;
            state.audit_event(entry);
            Json(serde_json::json!({ "success": true, "type": kind, "id": id })).into_response()
        }
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": format!("{kind} not found")})),
        )
            .into_response(),
        Err(e) => {
            tracing::error!(error = %e, "emergency stop failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal server error"})),
            )
                .into_response()
        }
    }
}
