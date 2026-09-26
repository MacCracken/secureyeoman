//! User routes — the user list and the authenticated user's notification
//! preferences (TS `workspace-routes.ts` / `user-notification-prefs-routes.ts`).
//! Preferences always belong to the caller: `me` is the authenticated
//! principal, never a client-supplied id.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, put};
use axum::{Extension, Json, Router};
use serde::Deserialize;

use crate::auth::middleware::AuthContext;
use crate::db::users::{self, NewPref, PrefPatch};
use crate::routes::Page;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/users", get(list_users))
        .route("/api/v1/users/{id}", get(get_user))
        .route(
            "/api/v1/users/me/notification-prefs",
            get(list_prefs).post(create_pref),
        )
        .route(
            "/api/v1/users/me/notification-prefs/{id}",
            put(update_pref).delete(delete_pref),
        )
}

const CHANNELS: &[&str] = &["slack", "telegram", "discord", "email"];
const LEVELS: &[&str] = &["info", "warn", "error", "critical"];
/// Longest chat or integration id accepted.
const MAX_ID_CHARS: usize = 200;

fn error(status: StatusCode, message: &str) -> Response {
    (status, Json(serde_json::json!({ "error": message }))).into_response()
}

fn db_unavailable() -> Response {
    error(StatusCode::SERVICE_UNAVAILABLE, "Database not available")
}

fn internal_error(e: sqlx::Error) -> Response {
    tracing::error!(error = %e, "user query failed");
    error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
}

/// Constraint failures on a preference write are the caller's to fix.
fn pref_write_error(e: sqlx::Error) -> Response {
    match &e {
        sqlx::Error::Database(db) if db.is_foreign_key_violation() => error(
            StatusCode::CONFLICT,
            "No user account exists for this principal",
        ),
        sqlx::Error::Database(db) if db.is_unique_violation() => error(
            StatusCode::CONFLICT,
            "A preference for this channel and chat already exists",
        ),
        _ => internal_error(e),
    }
}

fn pref_not_found() -> Response {
    error(StatusCode::NOT_FOUND, "Notification preference not found")
}

/// GET /api/v1/users — oldest first; `{ users, total }`.
async fn list_users(State(state): State<AppState>, Query(page): Query<Page>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match users::list_users(pool, page.limit(100), page.offset()).await {
        Ok((users, total)) => {
            Json(serde_json::json!({ "users": users, "total": total })).into_response()
        }
        Err(e) => internal_error(e),
    }
}

/// GET /api/v1/users/{id} — `{ user }`.
async fn get_user(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match users::get_user(pool, &id).await {
        Ok(Some(user)) => Json(serde_json::json!({ "user": user })).into_response(),
        Ok(None) => error(StatusCode::NOT_FOUND, "User not found"),
        Err(e) => internal_error(e),
    }
}

/// The caller's user id, or the 401 to send.
fn caller(auth: Option<Extension<AuthContext>>) -> Result<String, &'static str> {
    auth.map(|Extension(a)| a.user_id)
        .ok_or("Authentication required")
}

fn check_channel(channel: &str) -> Result<(), String> {
    if CHANNELS.contains(&channel) {
        Ok(())
    } else {
        Err(format!(
            "Invalid channel. Must be one of: {}",
            CHANNELS.join(", ")
        ))
    }
}

fn check_level(level: &str) -> Result<(), String> {
    if LEVELS.contains(&level) {
        Ok(())
    } else {
        Err(format!(
            "Invalid minLevel. Must be one of: {}",
            LEVELS.join(", ")
        ))
    }
}

fn check_hour(name: &str, hour: Option<i32>) -> Result<(), String> {
    match hour {
        Some(h) if !(0..=23).contains(&h) => Err(format!("{name} must be an hour from 0 to 23")),
        _ => Ok(()),
    }
}

/// An integration id is optional; only its length is bounded.
fn check_integration(value: Option<&str>) -> Result<(), String> {
    match value {
        Some(v) if v.chars().count() > MAX_ID_CHARS => Err(format!(
            "integrationId must be at most {MAX_ID_CHARS} characters"
        )),
        _ => Ok(()),
    }
}

/// A blank integration id means none.
fn integration_or_none(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|v| !v.is_empty())
}

fn check_id(name: &str, value: Option<&str>, required: bool) -> Result<(), String> {
    match value.map(str::trim) {
        None if required => Err(format!("{name} is required")),
        Some("") => Err(format!("{name} is required")),
        Some(v) if v.chars().count() > MAX_ID_CHARS => {
            Err(format!("{name} must be at most {MAX_ID_CHARS} characters"))
        }
        _ => Ok(()),
    }
}

/// GET /api/v1/users/me/notification-prefs — `{ prefs }`.
async fn list_prefs(
    State(state): State<AppState>,
    auth: Option<Extension<AuthContext>>,
) -> Response {
    let user_id = match caller(auth) {
        Ok(id) => id,
        Err(message) => return error(StatusCode::UNAUTHORIZED, message),
    };
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match users::list_prefs(pool, &user_id).await {
        Ok(prefs) => Json(serde_json::json!({ "prefs": prefs })).into_response(),
        Err(e) => internal_error(e),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatePrefRequest {
    #[serde(default)]
    channel: String,
    chat_id: Option<String>,
    integration_id: Option<String>,
    enabled: Option<bool>,
    quiet_hours_start: Option<i32>,
    quiet_hours_end: Option<i32>,
    min_level: Option<String>,
}

impl CreatePrefRequest {
    fn validate(&self) -> Result<(), String> {
        check_channel(&self.channel)?;
        check_id("chatId", self.chat_id.as_deref(), true)?;
        check_integration(self.integration_id.as_deref())?;
        check_hour("quietHoursStart", self.quiet_hours_start)?;
        check_hour("quietHoursEnd", self.quiet_hours_end)?;
        check_level(self.min_level.as_deref().unwrap_or("info"))
    }
}

/// POST /api/v1/users/me/notification-prefs — create, or replace the
/// preference for the same channel and chat; 201 `{ pref }`.
async fn create_pref(
    State(state): State<AppState>,
    auth: Option<Extension<AuthContext>>,
    Json(body): Json<CreatePrefRequest>,
) -> Response {
    let user_id = match caller(auth) {
        Ok(id) => id,
        Err(message) => return error(StatusCode::UNAUTHORIZED, message),
    };
    if let Err(message) = body.validate() {
        return error(StatusCode::BAD_REQUEST, &message);
    }
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    let pref = NewPref {
        channel: &body.channel,
        integration_id: integration_or_none(body.integration_id.as_deref()),
        chat_id: body.chat_id.as_deref().unwrap_or_default().trim(),
        enabled: body.enabled.unwrap_or(true),
        quiet_hours_start: body.quiet_hours_start,
        quiet_hours_end: body.quiet_hours_end,
        min_level: body.min_level.as_deref().unwrap_or("info"),
    };
    match users::upsert_pref(pool, &user_id, &pref).await {
        Ok(pref) => (
            StatusCode::CREATED,
            Json(serde_json::json!({ "pref": pref })),
        )
            .into_response(),
        Err(e) => pref_write_error(e),
    }
}

fn validate_patch(patch: &PrefPatch) -> Result<(), String> {
    if let Some(channel) = patch.channel.as_deref() {
        check_channel(channel)?;
    }
    check_id("chatId", patch.chat_id.as_deref(), false)?;
    check_integration(patch.integration_id.as_ref().and_then(|v| v.as_deref()))?;
    check_hour("quietHoursStart", patch.quiet_hours_start.flatten())?;
    check_hour("quietHoursEnd", patch.quiet_hours_end.flatten())?;
    match patch.min_level.as_deref() {
        Some(level) => check_level(level),
        None => Ok(()),
    }
}

/// PUT /api/v1/users/me/notification-prefs/{id} — partial update; `{ pref }`.
async fn update_pref(
    State(state): State<AppState>,
    auth: Option<Extension<AuthContext>>,
    Path(id): Path<String>,
    Json(mut patch): Json<PrefPatch>,
) -> Response {
    let user_id = match caller(auth) {
        Ok(id) => id,
        Err(message) => return error(StatusCode::UNAUTHORIZED, message),
    };
    if let Err(message) = validate_patch(&patch) {
        return error(StatusCode::BAD_REQUEST, &message);
    }
    if let Some(integration) = &patch.integration_id {
        patch.integration_id =
            Some(integration_or_none(integration.as_deref()).map(str::to_string));
    }
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match users::update_pref(pool, &user_id, &id, &patch).await {
        Ok(Some(pref)) => Json(serde_json::json!({ "pref": pref })).into_response(),
        Ok(None) => pref_not_found(),
        Err(e) => pref_write_error(e),
    }
}

/// DELETE /api/v1/users/me/notification-prefs/{id} — `{ ok: true }`.
async fn delete_pref(
    State(state): State<AppState>,
    auth: Option<Extension<AuthContext>>,
    Path(id): Path<String>,
) -> Response {
    let user_id = match caller(auth) {
        Ok(id) => id,
        Err(message) => return error(StatusCode::UNAUTHORIZED, message),
    };
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match users::delete_pref(pool, &user_id, &id).await {
        Ok(true) => Json(serde_json::json!({ "ok": true })).into_response(),
        Ok(false) => pref_not_found(),
        Err(e) => internal_error(e),
    }
}
