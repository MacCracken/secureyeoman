//! Workspace routes — workspace listing and member management.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{delete, get};
use axum::{Json, Router};

use crate::db::workspace;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/workspaces", get(list_workspaces))
        .route("/api/v1/workspaces/{id}", get(get_workspace))
        .route("/api/v1/workspaces/{id}/members", get(list_members))
        .route(
            "/api/v1/workspaces/{id}/members/{userId}",
            delete(remove_member),
        )
}

async fn list_workspaces(State(state): State<AppState>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match workspace::list_workspaces(pool, "default").await {
        Ok(rows) => Json(serde_json::to_value(rows).unwrap()).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn get_workspace(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match workspace::get_workspace(pool, &id, "default").await {
        Ok(Some(row)) => Json(serde_json::to_value(row).unwrap()).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Workspace not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn list_members(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match workspace::list_members(pool, &id).await {
        Ok(rows) => Json(serde_json::to_value(rows).unwrap()).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// DELETE /api/v1/workspaces/{id}/members/{userId} — for global admins and
/// the workspace's own owners/admins; never the last owner/admin (TS
/// `requireWorkspaceAdmin` and its last-admin check).
async fn remove_member(
    State(state): State<AppState>,
    auth: Option<axum::Extension<crate::auth::middleware::AuthContext>>,
    Path((id, user_id)): Path<(String, String)>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let error = |status: StatusCode, message: &str| {
        (status, Json(serde_json::json!({ "error": message }))).into_response()
    };
    let Some(axum::Extension(caller)) = auth else {
        return error(StatusCode::UNAUTHORIZED, "Not authenticated");
    };
    if caller.role != "admin" {
        match workspace::member_role(pool, &id, &caller.user_id).await {
            Ok(Some(role)) if workspace::is_workspace_admin(&role) => {}
            Ok(_) => {
                return error(
                    StatusCode::FORBIDDEN,
                    "Only workspace admins can perform this action",
                );
            }
            Err(e) => return error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
        }
    }
    match workspace::remove_member(pool, &id, &user_id).await {
        Ok(workspace::MemberRemoval::Removed) => StatusCode::NO_CONTENT.into_response(),
        Ok(workspace::MemberRemoval::NotFound) => {
            error(StatusCode::NOT_FOUND, "Member not found in workspace")
        }
        Ok(workspace::MemberRemoval::LastAdmin) => error(
            StatusCode::BAD_REQUEST,
            "Cannot remove the last admin/owner from a workspace",
        ),
        Err(e) => error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    }
}
