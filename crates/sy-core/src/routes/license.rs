//! License routes — license status and key management.
//!
//! No database needed — reads from environment / config.

use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/license/status", get(license_status))
        .route("/api/v1/license/key", post(apply_key))
}

async fn license_status() -> impl IntoResponse {
    let tier = std::env::var("SY_LICENSE_TIER").unwrap_or_else(|_| "community".to_string());
    let expiry = std::env::var("SY_LICENSE_EXPIRY").ok();
    let key_present = std::env::var("SY_LICENSE_KEY").is_ok();

    Json(serde_json::json!({
        "tier": tier,
        "expiry": expiry,
        "keyPresent": key_present,
        "features": license_features(&tier),
    }))
}

fn license_features(tier: &str) -> serde_json::Value {
    match tier {
        "pro" => serde_json::json!([
            "unlimited_agents",
            "priority_support",
            "custom_integrations",
            "advanced_analytics",
            "sso"
        ]),
        "enterprise" => serde_json::json!([
            "unlimited_agents",
            "priority_support",
            "custom_integrations",
            "advanced_analytics",
            "sso",
            "scim",
            "audit_export",
            "dedicated_support",
            "sla"
        ]),
        _ => serde_json::json!(["basic_agents", "community_support"]),
    }
}

/// Not implemented: it answered `accepted: true` ("restart required to
/// activate") for any 16 characters while storing and verifying nothing, so
/// a purchased key looked applied and never was.
async fn apply_key() -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(serde_json::json!({
            "error": "Applying a license key is not implemented on this server yet. \
                      Set SY_LICENSE_KEY and SY_LICENSE_TIER in the server environment.",
        })),
    )
}
