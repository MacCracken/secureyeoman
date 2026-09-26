//! Voice profile routes — the TS `voice-profile-routes.ts` contract. Profiles
//! are stored here; previews (text-to-speech) and ElevenLabs cloning are not
//! ported yet and answer 501 once the request is otherwise valid.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use serde::Deserialize;

use crate::auth::middleware::AuthContext;
use crate::db::voice::{self, NewVoiceProfile, VoiceProfileUpdate};
use crate::routes::Page;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/v1/voice/profiles",
            get(list_profiles).post(create_profile),
        )
        .route("/api/v1/voice/profiles/clone", post(clone_voice))
        .route(
            "/api/v1/voice/profiles/{id}",
            get(get_profile).put(update_profile).delete(delete_profile),
        )
        .route("/api/v1/voice/profiles/{id}/preview", post(preview_profile))
}

/// Longest profile name, provider or provider voice id accepted.
const MAX_FIELD_CHARS: usize = 200;

fn error(status: StatusCode, message: &str) -> Response {
    (status, Json(serde_json::json!({ "error": message }))).into_response()
}

fn db_unavailable() -> Response {
    error(StatusCode::SERVICE_UNAVAILABLE, "Database not available")
}

fn internal_error(e: sqlx::Error) -> Response {
    tracing::error!(error = %e, "voice profile query failed");
    error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
}

fn profile_not_found() -> Response {
    error(StatusCode::NOT_FOUND, "Voice profile not found")
}

/// A present field must be non-blank and at most `MAX_FIELD_CHARS`.
fn check_field(name: &str, value: Option<&str>) -> Result<(), String> {
    match value {
        Some(v) if v.trim().is_empty() || v.chars().count() > MAX_FIELD_CHARS => {
            Err(format!("{name} must be 1-{MAX_FIELD_CHARS} characters"))
        }
        _ => Ok(()),
    }
}

#[derive(Deserialize)]
struct ListQuery {
    provider: Option<String>,
}

/// GET /api/v1/voice/profiles — newest first, `?provider=` filters;
/// `{ profiles, total }` (limit default 20, max 100).
async fn list_profiles(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
    Query(page): Query<Page>,
) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    let provider = q.provider.as_deref().filter(|p| !p.is_empty());
    match voice::list_profiles(pool, provider, page.limit(20), page.offset()).await {
        Ok((profiles, total)) => {
            Json(serde_json::json!({ "profiles": profiles, "total": total })).into_response()
        }
        Err(e) => internal_error(e),
    }
}

/// GET /api/v1/voice/profiles/{id} — the `VoiceProfile`.
async fn get_profile(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match voice::get_profile(pool, &id).await {
        Ok(Some(profile)) => Json(profile).into_response(),
        Ok(None) => profile_not_found(),
        Err(e) => internal_error(e),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateProfileRequest {
    #[serde(default)]
    name: String,
    #[serde(default)]
    provider: String,
    #[serde(default)]
    voice_id: String,
    settings: Option<serde_json::Map<String, serde_json::Value>>,
    sample_audio_base64: Option<String>,
}

/// POST /api/v1/voice/profiles — 201 with the new `VoiceProfile`.
async fn create_profile(
    State(state): State<AppState>,
    auth: Option<Extension<AuthContext>>,
    Json(body): Json<CreateProfileRequest>,
) -> Response {
    if body.name.is_empty() || body.provider.is_empty() || body.voice_id.is_empty() {
        return error(
            StatusCode::BAD_REQUEST,
            "name, provider, and voiceId are required",
        );
    }
    for (field, value) in [
        ("name", &body.name),
        ("provider", &body.provider),
        ("voiceId", &body.voice_id),
    ] {
        if let Err(message) = check_field(field, Some(value)) {
            return error(StatusCode::BAD_REQUEST, &message);
        }
    }
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    let settings = serde_json::Value::Object(body.settings.unwrap_or_default());
    let created_by = auth
        .as_ref()
        .map_or("admin", |Extension(a)| a.user_id.as_str());
    let new = NewVoiceProfile {
        name: &body.name,
        provider: &body.provider,
        voice_id: &body.voice_id,
        settings: &settings,
        sample_audio_base64: body.sample_audio_base64.as_deref(),
        created_by,
    };
    match voice::create_profile(pool, &new).await {
        Ok(profile) => (StatusCode::CREATED, Json(profile)).into_response(),
        Err(e) => internal_error(e),
    }
}

/// PUT /api/v1/voice/profiles/{id} — partial update; the `VoiceProfile`.
async fn update_profile(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(update): Json<VoiceProfileUpdate>,
) -> Response {
    for (field, value) in [
        ("name", update.name.as_deref()),
        ("provider", update.provider.as_deref()),
        ("voiceId", update.voice_id.as_deref()),
    ] {
        if let Err(message) = check_field(field, value) {
            return error(StatusCode::BAD_REQUEST, &message);
        }
    }
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match voice::update_profile(pool, &id, &update).await {
        Ok(Some(profile)) => Json(profile).into_response(),
        Ok(None) => profile_not_found(),
        Err(e) => internal_error(e),
    }
}

/// DELETE /api/v1/voice/profiles/{id} — 204, or 404.
async fn delete_profile(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match voice::delete_profile(pool, &id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => profile_not_found(),
        Err(e) => internal_error(e),
    }
}

/// POST /api/v1/voice/profiles/{id}/preview — synthesizing a test phrase
/// needs text-to-speech, which is not ported yet: 404 for an unknown profile,
/// otherwise 501.
async fn preview_profile(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match voice::get_profile(pool, &id).await {
        Ok(Some(_)) => error(
            StatusCode::NOT_IMPLEMENTED,
            "Voice preview needs text-to-speech, which is not yet supported in Rust",
        ),
        Ok(None) => profile_not_found(),
        Err(e) => internal_error(e),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloneVoiceRequest {
    #[serde(default)]
    name: String,
    #[serde(default)]
    audio_base64: String,
}

/// POST /api/v1/voice/profiles/clone — cloning a voice from a sample goes
/// through ElevenLabs, which is not ported yet: 400 for an incomplete
/// request, otherwise 501.
async fn clone_voice(Json(body): Json<CloneVoiceRequest>) -> Response {
    if body.name.is_empty() || body.audio_base64.is_empty() {
        return error(StatusCode::BAD_REQUEST, "name and audioBase64 are required");
    }
    error(
        StatusCode::NOT_IMPLEMENTED,
        "Voice cloning (ElevenLabs) is not yet supported in Rust",
    )
}
