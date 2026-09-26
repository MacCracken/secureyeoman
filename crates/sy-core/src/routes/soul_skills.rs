//! Skill routes — `/api/v1/soul/skills`, mirroring the TS `soul-routes.ts`
//! skill endpoints and response shapes. Storage: `brain.skills` (see
//! [`crate::db::skills`]).

use std::collections::HashMap;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use serde::Deserialize;

use crate::db::skills::{self, SkillFilter, SkillInput};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/soul/skills", get(list_skills).post(create_skill))
        .route(
            "/api/v1/soul/skills/{id}",
            put(update_skill).delete(delete_skill),
        )
        .route("/api/v1/soul/skills/{id}/enable", post(enable_skill))
        .route("/api/v1/soul/skills/{id}/disable", post(disable_skill))
        .route("/api/v1/soul/skills/{id}/approve", post(approve_skill))
        .route("/api/v1/soul/skills/{id}/reject", post(reject_skill))
}

fn error(status: StatusCode, message: impl Into<String>) -> Response {
    (status, Json(serde_json::json!({ "error": message.into() }))).into_response()
}

fn db_unavailable() -> Response {
    error(StatusCode::SERVICE_UNAVAILABLE, "Database not available")
}

fn internal(e: sqlx::Error) -> Response {
    error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}

fn not_found(id: &str) -> Response {
    error(StatusCode::NOT_FOUND, format!("Skill not found: {id}"))
}

/// Largest page (the TS brain store returned at most 1000 skills).
const MAX_PAGE: i64 = 1000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListQuery {
    status: Option<String>,
    source: Option<String>,
    /// That personality's skills plus the global ones.
    personality_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

/// GET /api/v1/soul/skills — `{ skills, total }`, most used first.
async fn list_skills(State(state): State<AppState>, Query(q): Query<ListQuery>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    let filter = SkillFilter {
        status: q.status.as_deref(),
        source: q.source.as_deref(),
        for_personality_id: q.personality_id.as_deref(),
    };
    let limit = q.limit.unwrap_or(MAX_PAGE).clamp(1, MAX_PAGE);
    let offset = q.offset.unwrap_or(0).max(0);
    let (rows, total) = match skills::list_skills(pool, &filter, limit, offset).await {
        Ok(page) => page,
        Err(e) => return internal(e),
    };

    // Skills owned by a personality carry its name, as in the TS gateway.
    let mut ids: Vec<String> = rows
        .iter()
        .filter_map(|r| r.personality_id.clone())
        .collect();
    ids.sort();
    ids.dedup();
    let names: HashMap<String, String> = if ids.is_empty() {
        HashMap::new()
    } else {
        match skills::personality_names(pool, &ids).await {
            Ok(pairs) => pairs.into_iter().collect(),
            Err(e) => return internal(e),
        }
    };
    let skills: Vec<_> = rows
        .iter()
        .map(|r| {
            let name = r.personality_id.as_ref().and_then(|id| names.get(id));
            r.to_json(name.map(String::as_str))
        })
        .collect();
    Json(serde_json::json!({ "skills": skills, "total": total })).into_response()
}

/// POST /api/v1/soul/skills — `201 { skill }`.
async fn create_skill(State(state): State<AppState>, Json(input): Json<SkillInput>) -> Response {
    if let Err(message) = input.validate(true) {
        return error(StatusCode::BAD_REQUEST, message);
    }
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    let id = uuid::Uuid::now_v7().to_string();
    match skills::create_skill(pool, &id, &input).await {
        Ok(row) => (
            StatusCode::CREATED,
            Json(serde_json::json!({ "skill": row.to_json(None) })),
        )
            .into_response(),
        Err(e) => internal(e),
    }
}

/// PUT /api/v1/soul/skills/{id} — partial update; `{ skill }`.
async fn update_skill(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<SkillInput>,
) -> Response {
    if let Err(message) = input.validate(false) {
        return error(StatusCode::BAD_REQUEST, message);
    }
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match skills::update_skill(pool, &id, &input).await {
        Ok(Some(row)) => Json(serde_json::json!({ "skill": row.to_json(None) })).into_response(),
        Ok(None) => not_found(&id),
        Err(e) => internal(e),
    }
}

/// DELETE /api/v1/soul/skills/{id} — 204.
async fn delete_skill(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match skills::delete_skill(pool, &id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => not_found(&id),
        Err(e) => internal(e),
    }
}

async fn set_enabled(state: &AppState, id: &str, enabled: bool) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match skills::set_enabled(pool, id, enabled).await {
        Ok(Some(_)) => Json(serde_json::json!({ "success": true })).into_response(),
        Ok(None) => not_found(id),
        Err(e) => internal(e),
    }
}

/// POST /api/v1/soul/skills/{id}/enable — `{ success: true }`.
async fn enable_skill(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    set_enabled(&state, &id, true).await
}

/// POST /api/v1/soul/skills/{id}/disable — `{ success: true }`.
async fn disable_skill(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    set_enabled(&state, &id, false).await
}

/// Why a skill could not be approved or rejected: it is missing, or it is not
/// pending approval (the TS error message).
async fn not_pending(pool: &sqlx::PgPool, id: &str) -> Response {
    match skills::get_skill(pool, id).await {
        Ok(Some(skill)) => error(
            StatusCode::BAD_REQUEST,
            format!("Skill is not pending approval (status: {})", skill.status),
        ),
        Ok(None) => not_found(id),
        Err(e) => internal(e),
    }
}

/// POST /api/v1/soul/skills/{id}/approve — pending → active; `{ skill }`.
async fn approve_skill(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match skills::approve_skill(pool, &id).await {
        Ok(Some(row)) => Json(serde_json::json!({ "skill": row.to_json(None) })).into_response(),
        Ok(None) => not_pending(pool, &id).await,
        Err(e) => internal(e),
    }
}

/// POST /api/v1/soul/skills/{id}/reject — deletes a pending skill.
async fn reject_skill(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match skills::reject_skill(pool, &id).await {
        Ok(true) => Json(serde_json::json!({ "message": "Skill rejected" })).into_response(),
        Ok(false) => not_pending(pool, &id).await,
        Err(e) => internal(e),
    }
}
