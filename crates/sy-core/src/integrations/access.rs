//! Per-personality integration access modes (TS `integrationAccess`): what
//! the active personality may do with an integration's credentials.
//!
//! - `suggest` — read only (the default, as in TS and the dashboard);
//! - `draft` — prepare work a human then sends (Gmail drafts, GitHub
//!   issues); other writes answer with a preview of what would be done;
//! - `auto` — act.
//!
//! The mode comes from the active personality's `body.integrationAccess`
//! entry for the credentials in use: an integration or OAuth token id, or —
//! for credentials configured through the environment — the platform name.

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use sqlx::PgPool;

use crate::state::AppState;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccessMode {
    Suggest,
    Draft,
    Auto,
}

impl AccessMode {
    fn parse(s: &str) -> Option<Self> {
        match s {
            "suggest" => Some(Self::Suggest),
            "draft" => Some(Self::Draft),
            "auto" => Some(Self::Auto),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Suggest => "suggest",
            Self::Draft => "draft",
            Self::Auto => "auto",
        }
    }
}

/// The mode an access list grants: the first entry naming one of `ids`.
pub fn mode_in(access: &serde_json::Value, ids: &[String]) -> AccessMode {
    access
        .as_array()
        .into_iter()
        .flatten()
        .find(|entry| {
            entry
                .get("id")
                .and_then(serde_json::Value::as_str)
                .is_some_and(|id| ids.iter().any(|candidate| candidate == id))
        })
        .and_then(|entry| entry.get("mode").and_then(serde_json::Value::as_str))
        .and_then(AccessMode::parse)
        .unwrap_or(AccessMode::Suggest)
}

/// The ids that can name `platform`'s credentials in an access list.
async fn credential_ids(pool: &PgPool, platform: &str, oauth_providers: &[&str]) -> Vec<String> {
    let mut ids: Vec<String> = sqlx::query_scalar(
        "SELECT id FROM integration.integrations WHERE platform = $1 AND enabled = true",
    )
    .bind(platform)
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    let providers: Vec<String> = oauth_providers.iter().map(|p| p.to_string()).collect();
    ids.extend(
        sqlx::query_scalar::<_, String>(
            "SELECT id FROM auth.oauth_tokens WHERE provider = ANY($1)",
        )
        .bind(&providers)
        .fetch_all(pool)
        .await
        .unwrap_or_default(),
    );
    ids.push(platform.to_string());
    ids
}

/// The active personality's mode for `platform`. Anything that cannot be
/// read (no database, no active personality, no entry) is `suggest`: a
/// write is never allowed by default.
pub async fn mode_for(state: &AppState, platform: &str, oauth_providers: &[&str]) -> AccessMode {
    let Some(pool) = state.db() else {
        return AccessMode::Suggest;
    };
    let access: Option<serde_json::Value> = sqlx::query_scalar(
        "SELECT body->'integrationAccess' FROM soul.personalities
         WHERE is_active = true ORDER BY updated_at DESC LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();
    let Some(access) = access else {
        return AccessMode::Suggest;
    };
    mode_in(
        &access,
        &credential_ids(pool, platform, oauth_providers).await,
    )
}

/// A refusal naming the mode, as the TS routes worded them.
pub fn refuse(status: StatusCode, message: String) -> Response {
    (status, Json(serde_json::json!({ "error": message }))).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_first_matching_entry_decides_and_the_default_is_suggest() {
        let ids = vec!["int-1".to_string(), "gmail".to_string()];
        assert_eq!(mode_in(&json!(null), &ids), AccessMode::Suggest);
        assert_eq!(mode_in(&json!([]), &ids), AccessMode::Suggest);
        assert_eq!(
            mode_in(&json!([{"id": "other", "mode": "auto"}]), &ids),
            AccessMode::Suggest
        );
        assert_eq!(
            mode_in(&json!([{"id": "int-1", "mode": "draft"}]), &ids),
            AccessMode::Draft
        );
        assert_eq!(
            mode_in(&json!([{"id": "gmail", "mode": "auto"}]), &ids),
            AccessMode::Auto
        );
        // An unknown mode grants nothing.
        assert_eq!(
            mode_in(&json!([{"id": "int-1", "mode": "yolo"}]), &ids),
            AccessMode::Suggest
        );
    }
}
