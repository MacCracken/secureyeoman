//! Personality mood routes — the simulation mood model, as the TS
//! `simulation-routes.ts` served it: current state, events, history, reset.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

use crate::db::personalities::{self, NewMoodEvent};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/personalities/{id}/mood", get(get_mood))
        .route("/api/v1/personalities/{id}/mood/event", post(mood_event))
        .route("/api/v1/personalities/{id}/mood/history", get(mood_history))
        .route("/api/v1/personalities/{id}/mood/reset", post(reset_mood))
}

/// Longest event type or source label accepted.
const MAX_LABEL_CHARS: usize = 200;
/// Default and maximum page of mood history (the TS store's bounds).
const DEFAULT_HISTORY: i64 = 50;
const MAX_HISTORY: i64 = 200;

fn error(status: StatusCode, message: &str) -> Response {
    (status, Json(serde_json::json!({ "error": message }))).into_response()
}

fn db_unavailable() -> Response {
    error(StatusCode::SERVICE_UNAVAILABLE, "Database not available")
}

fn internal_error(e: sqlx::Error) -> Response {
    tracing::error!(error = %e, "mood query failed");
    error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
}

fn mood_not_found() -> Response {
    error(StatusCode::NOT_FOUND, "Mood state not found")
}

/// GET /api/v1/personalities/{id}/mood — the current `MoodState`.
async fn get_mood(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match personalities::get_mood(pool, &id).await {
        Ok(Some(mood)) => Json(mood).into_response(),
        Ok(None) => mood_not_found(),
        Err(e) => internal_error(e),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoodEventRequest {
    #[serde(default)]
    event_type: String,
    #[serde(default)]
    valence_delta: f64,
    #[serde(default)]
    arousal_delta: f64,
    source: Option<String>,
    metadata: Option<serde_json::Map<String, serde_json::Value>>,
}

impl MoodEventRequest {
    /// The TS `MoodEventCreateSchema` bounds: valence moves at most ±2 (the
    /// full range), arousal ±1.
    fn validate(self) -> Result<NewMoodEvent, &'static str> {
        let event_type = self.event_type.trim();
        if event_type.is_empty() || event_type.chars().count() > MAX_LABEL_CHARS {
            return Err("eventType is required (at most 200 characters)");
        }
        if !(-2.0..=2.0).contains(&self.valence_delta) {
            return Err("valenceDelta must be between -2 and 2");
        }
        if !(-1.0..=1.0).contains(&self.arousal_delta) {
            return Err("arousalDelta must be between -1 and 1");
        }
        let source = self.source.as_deref().map(str::trim).unwrap_or("system");
        if source.is_empty() || source.chars().count() > MAX_LABEL_CHARS {
            return Err("source must be 1-200 characters");
        }
        Ok(NewMoodEvent {
            event_type: event_type.to_string(),
            valence_delta: self.valence_delta,
            arousal_delta: self.arousal_delta,
            source: source.to_string(),
            metadata: serde_json::Value::Object(self.metadata.unwrap_or_default()),
        })
    }
}

/// POST /api/v1/personalities/{id}/mood/event — apply a mood event,
/// initialising the mood at the neutral baseline on first use; the updated
/// `MoodState`.
async fn mood_event(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<MoodEventRequest>,
) -> Response {
    let event = match body.validate() {
        Ok(event) => event,
        Err(message) => return error(StatusCode::BAD_REQUEST, message),
    };
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match personalities::apply_event(pool, &id, &event).await {
        Ok(mood) => Json(mood).into_response(),
        Err(e) => internal_error(e),
    }
}

#[derive(Deserialize)]
struct HistoryQuery {
    limit: Option<i64>,
    since: Option<i64>,
}

/// GET /api/v1/personalities/{id}/mood/history — newest-first events as
/// `{ items }`; `?limit` (default 50, max 200) and `?since` (ms).
async fn mood_history(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<HistoryQuery>,
) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    let limit = q.limit.unwrap_or(DEFAULT_HISTORY).clamp(1, MAX_HISTORY);
    let since = q.since.filter(|&ms| ms > 0);
    match personalities::list_mood_events(pool, &id, since, limit).await {
        Ok(items) => Json(serde_json::json!({ "items": items })).into_response(),
        Err(e) => internal_error(e),
    }
}

/// POST /api/v1/personalities/{id}/mood/reset — return to the baseline; the
/// updated `MoodState`, or 404 when there is no mood to reset.
async fn reset_mood(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match personalities::reset_mood(pool, &id).await {
        Ok(Some(mood)) => Json(mood).into_response(),
        Ok(None) => mood_not_found(),
        Err(e) => internal_error(e),
    }
}

#[cfg(test)]
mod tests {
    use super::MoodEventRequest;

    fn parse(body: &str) -> Result<crate::db::personalities::NewMoodEvent, &'static str> {
        serde_json::from_str::<MoodEventRequest>(body)
            .unwrap()
            .validate()
    }

    #[test]
    fn events_are_validated_like_the_ts_schema() {
        let event = parse(r#"{"eventType":" praise ","valenceDelta":0.3}"#).unwrap();
        assert_eq!(event.event_type, "praise");
        assert_eq!(event.arousal_delta, 0.0);
        assert_eq!(event.source, "system");
        assert_eq!(event.metadata, serde_json::json!({}));

        for bad in [
            r#"{}"#,
            r#"{"eventType":"  "}"#,
            r#"{"eventType":"x","valenceDelta":2.5}"#,
            r#"{"eventType":"x","arousalDelta":-1.5}"#,
            r#"{"eventType":"x","source":""}"#,
        ] {
            assert!(parse(bad).is_err(), "{bad}");
        }
        let long = format!(r#"{{"eventType":"{}"}}"#, "e".repeat(201));
        assert!(parse(&long).is_err());
    }
}
