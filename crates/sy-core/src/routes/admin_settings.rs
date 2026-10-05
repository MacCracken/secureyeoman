//! Admin settings routes — system-wide preference CRUD.
//!
//! GET   /api/v1/admin/settings        — list all settings
//! PATCH /api/v1/admin/settings        — update settings (partial)

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{delete, get, patch, put};
use axum::{Json, Router};
use serde::Deserialize;

use crate::auth::middleware::AuthContext;
use crate::db::audit::NewAuditEntry;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/admin/settings", get(list_settings))
        .route("/api/v1/admin/settings", patch(update_settings))
        // Secrets management (API keys, tokens)
        .route("/api/v1/secrets", get(list_secrets))
        .route("/api/v1/secrets/{name}", get(check_secret))
        .route("/api/v1/secrets/{name}", put(set_secret))
        .route("/api/v1/secrets/{name}", delete(delete_secret))
}

/// GET /api/v1/admin/settings — return current system preferences.
async fn list_settings(State(state): State<AppState>) -> impl IntoResponse {
    let has_db = state.db().is_some();
    Json(serde_json::json!({
        "environment": state.config().environment,
        "version": state.version(),
        "databaseAvailable": has_db,
        "settings": {
            "telemetryEnabled": false,
            "maintenanceMode": false,
            "maxSessionsPerUser": 10,
            "defaultTenantId": "default",
        },
        "message": "Settings management not yet persisted to database",
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateSettingsRequest {
    #[serde(default)]
    telemetry_enabled: Option<bool>,
    #[serde(default)]
    maintenance_mode: Option<bool>,
    #[serde(default)]
    max_sessions_per_user: Option<u32>,
}

/// PATCH /api/v1/admin/settings — apply a partial settings update.
///
/// Persisted settings storage will be wired in a later phase.
/// For now, acknowledges the request and echoes back the requested changes.
async fn update_settings(
    State(_state): State<AppState>,
    Json(body): Json<UpdateSettingsRequest>,
) -> impl IntoResponse {
    // Validate any fields that need it
    if let Some(max) = body.max_sessions_per_user
        && max == 0
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "maxSessionsPerUser must be greater than 0"})),
        )
            .into_response();
    }

    Json(serde_json::json!({
        "updated": true,
        "changes": {
            "telemetryEnabled": body.telemetry_enabled,
            "maintenanceMode": body.maintenance_mode,
            "maxSessionsPerUser": body.max_sessions_per_user,
        },
        "message": "Settings acknowledged — persistence not yet connected",
        "stub": true,
    }))
    .into_response()
}

// ── Secrets Management ──────────────────────────────────────────────────────

/// Variables a stored secret may not set: they steer the process itself (the
/// loader, the dynamic linker, the shell), or are security switches and boot
/// settings that a stolen admin session could otherwise pin across restarts.
const RESERVED_SECRET_PREFIXES: &[&str] = &[
    "LD_",
    "DYLD_",
    "RUST_",
    "DATABASE_",
    "OIDC_",
    "SY_",
    "SECUREYEOMAN_LICENSE_",
    "SECUREYEOMAN_RP_",
    "SECUREYEOMAN_EDGE_",
];
const RESERVED_SECRET_NAMES: &[&str] = &[
    "PATH",
    "HOME",
    "SHELL",
    "TMPDIR",
    "SECUREYEOMAN_JWT_SECRET",
    "SECUREYEOMAN_JWT_SECRET_PREVIOUS",
    "SECUREYEOMAN_ADMIN_PASSWORD_HASH",
    "SECUREYEOMAN_ALLOW_REMOTE_ACCESS",
    "SECUREYEOMAN_TRUST_PROXY_HEADERS",
    "SECUREYEOMAN_TRUSTED_PROXIES",
    "SECUREYEOMAN_CORS_ORIGINS",
    "SECUREYEOMAN_FINGERPRINT_ENABLED",
    "SECUREYEOMAN_HOST",
    "SECUREYEOMAN_PORT",
];

/// Why a secret name is refused, if it is. A name is an environment variable
/// name (`^[A-Z][A-Z0-9_]{0,127}$`, as TS enforced): anything else — `=` or a
/// NUL above all, which make `set_var` panic and abort the server — is
/// refused before it reaches the database or the environment.
pub fn secret_name_error(name: &str) -> Option<&'static str> {
    let well_formed = (1..=128).contains(&name.len())
        && name.as_bytes()[0].is_ascii_uppercase()
        && name
            .bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_');
    if !well_formed {
        return Some("Secret names are 1-128 characters of A-Z, 0-9 and _, starting with a letter");
    }
    if RESERVED_SECRET_NAMES.contains(&name)
        || RESERVED_SECRET_PREFIXES.iter().any(|p| name.starts_with(p))
    {
        return Some("This variable cannot be set as a secret; configure it in the environment");
    }
    None
}

fn refuse_secret_name(name: &str) -> Option<axum::response::Response> {
    secret_name_error(name).map(|error| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": error, "name": name})),
        )
            .into_response()
    })
}

/// GET /api/v1/secrets — list secret key names (not values).
async fn list_secrets(State(state): State<AppState>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return Json(serde_json::json!({"keys": []})).into_response();
    };

    // Use security.policy as a key/value store for secrets (prefix: secret:)
    let rows: Vec<(String,)> =
        sqlx::query_as("SELECT key FROM security.policy WHERE key LIKE 'secret:%' ORDER BY key")
            .fetch_all(pool)
            .await
            .unwrap_or_default();

    let keys: Vec<String> = rows
        .into_iter()
        .map(|(k,)| k.strip_prefix("secret:").unwrap_or(&k).to_string())
        .collect();

    Json(serde_json::json!({"keys": keys})).into_response()
}

/// GET /api/v1/secrets/{name} — check if a secret exists (never returns the value).
async fn check_secret(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Some(refusal) = refuse_secret_name(&name) {
        return refusal;
    }
    let exists = if let Some(pool) = state.db() {
        let key = format!("secret:{name}");
        let row: Option<(String,)> =
            sqlx::query_as("SELECT key FROM security.policy WHERE key = $1")
                .bind(&key)
                .fetch_optional(pool)
                .await
                .unwrap_or(None);
        row.is_some()
    } else {
        // Check env var as fallback
        std::env::var(&name).map(|v| !v.is_empty()).unwrap_or(false)
    };

    Json(serde_json::json!({"name": name, "exists": exists})).into_response()
}

#[derive(Deserialize)]
struct SetSecretRequest {
    value: String,
}

/// PUT /api/v1/secrets/{name} — store a secret.
async fn set_secret(
    State(state): State<AppState>,
    auth: Option<axum::Extension<AuthContext>>,
    Path(name): Path<String>,
    Json(body): Json<SetSecretRequest>,
) -> impl IntoResponse {
    if let Some(refusal) = refuse_secret_name(&name) {
        return refusal;
    }
    if body.value.contains('\0') {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Secret values cannot contain NUL"})),
        )
            .into_response();
    }
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };

    let key = format!("secret:{name}");
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    match sqlx::query(
        "INSERT INTO security.policy (key, value, updated_at) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = $3",
    )
    .bind(&key)
    .bind(&body.value)
    .bind(now)
    .execute(pool)
    .await
    {
        Ok(_) => {
            // Also set as env var so the running process picks it up immediately.
            // SAFETY: the name and value were validated above (no `=` or NUL),
            // and std serialises its own environment reads and writes. Native
            // code reading the environment concurrently is the remaining
            // hazard; keeping secrets out of the process environment is
            // tracked in the roadmap.
            unsafe { std::env::set_var(&name, &body.value) };
            // Drop cached /model/info so sidebar sees the new provider within one poll.
            crate::routes::models::invalidate_model_info_cache().await;
            let mut entry =
                NewAuditEntry::new("secret_access", "info", &format!("Secret {name} stored"))
                    .metadata(serde_json::json!({ "secret": name, "action": "set" }));
            entry.user_id = auth.map(|axum::Extension(a)| a.user_id);
            state.audit_event(entry);
            (
                StatusCode::OK,
                Json(serde_json::json!({"saved": true, "name": name})),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// DELETE /api/v1/secrets/{name} — remove a secret.
async fn delete_secret(
    State(state): State<AppState>,
    auth: Option<axum::Extension<AuthContext>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Some(refusal) = refuse_secret_name(&name) {
        return refusal;
    }
    let Some(pool) = state.db() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };

    let key = format!("secret:{name}");
    // A failed delete must not look like success: the row would come back
    // into the environment at the next boot.
    if let Err(e) = sqlx::query("DELETE FROM security.policy WHERE key = $1")
        .bind(&key)
        .execute(pool)
        .await
    {
        tracing::error!(error = %e, "secret delete failed");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "Internal server error"})),
        )
            .into_response();
    }

    // SAFETY: as in `set_secret` — a validated name, std-serialised access.
    unsafe { std::env::remove_var(&name) };
    // Drop cached /model/info so sidebar can mute Chat within one poll.
    crate::routes::models::invalidate_model_info_cache().await;
    let mut entry = NewAuditEntry::new("secret_access", "info", &format!("Secret {name} deleted"))
        .metadata(serde_json::json!({ "secret": name, "action": "delete" }));
    entry.user_id = auth.map(|axum::Extension(a)| a.user_id);
    state.audit_event(entry);
    StatusCode::NO_CONTENT.into_response()
}

#[cfg(test)]
mod tests {
    use super::secret_name_error;

    #[test]
    fn secret_names_are_environment_variable_names() {
        for ok in ["OPENAI_API_KEY", "A", "X9_Y", "SECUREYEOMAN_ADMIN_PASSWORD"] {
            assert_eq!(secret_name_error(ok), None, "{ok}");
        }
        // `=` and NUL make set_var/remove_var panic, which aborts the server.
        for bad in [
            "",
            "A=B",
            "A\0B",
            "lower",
            "9LEADING",
            "SP ACE",
            "Ü",
            &"A".repeat(129),
        ] {
            assert!(secret_name_error(bad).is_some(), "{bad:?}");
        }
    }

    #[test]
    fn process_and_security_switches_are_reserved() {
        for reserved in [
            "PATH",
            "LD_PRELOAD",
            "SECUREYEOMAN_ADMIN_PASSWORD_HASH",
            "SECUREYEOMAN_JWT_SECRET",
            "SECUREYEOMAN_ALLOW_REMOTE_ACCESS",
            "SECUREYEOMAN_CORS_ORIGINS",
            "SY_LICENSE_TIER",
            "DATABASE_URL",
            "OIDC_DEFAULT_ROLE",
        ] {
            assert!(secret_name_error(reserved).is_some(), "{reserved}");
        }
    }
}
