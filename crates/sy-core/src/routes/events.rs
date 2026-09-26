//! Event subscription routes — reading subscriptions and their webhook
//! deliveries in the TS `event-routes.ts` shapes. Delivering events is not
//! ported yet, so the test-send endpoint answers 501.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use uuid::Uuid;

use crate::db::events;
use crate::routes::Page;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/events/subscriptions", get(list_subscriptions))
        .route("/api/v1/events/subscriptions/{id}", get(get_subscription))
        .route(
            "/api/v1/events/subscriptions/{id}/deliveries",
            get(list_deliveries),
        )
        .route(
            "/api/v1/events/subscriptions/{id}/test",
            post(test_subscription),
        )
}

fn error(status: StatusCode, message: &str) -> Response {
    (status, Json(serde_json::json!({ "error": message }))).into_response()
}

fn db_unavailable() -> Response {
    error(StatusCode::SERVICE_UNAVAILABLE, "Database not available")
}

fn internal_error(e: sqlx::Error) -> Response {
    tracing::error!(error = %e, "event subscription query failed");
    error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
}

fn subscription_not_found() -> Response {
    error(StatusCode::NOT_FOUND, "Subscription not found")
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListQuery {
    tenant_id: Option<String>,
}

/// GET /api/v1/events/subscriptions — newest first, `?tenantId=` filters;
/// `{ subscriptions, total }`.
async fn list_subscriptions(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
    Query(page): Query<Page>,
) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    let tenant = q.tenant_id.as_deref().filter(|t| !t.is_empty());
    match events::list_subscriptions(pool, tenant, page.limit(20), page.offset()).await {
        Ok((rows, total)) => {
            let subscriptions: Vec<_> = rows
                .iter()
                .map(events::EventSubscriptionRow::to_json)
                .collect();
            Json(serde_json::json!({ "subscriptions": subscriptions, "total": total }))
                .into_response()
        }
        Err(e) => internal_error(e),
    }
}

/// The subscription `id` names. Ids are UUIDs, so anything else names none.
async fn find_subscription(
    pool: &sqlx::PgPool,
    id: &str,
) -> Result<Option<events::EventSubscriptionRow>, sqlx::Error> {
    match Uuid::parse_str(id) {
        Ok(id) => events::get_subscription(pool, id).await,
        Err(_) => Ok(None),
    }
}

/// GET /api/v1/events/subscriptions/{id} — `{ subscription }`.
async fn get_subscription(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match find_subscription(pool, &id).await {
        Ok(Some(row)) => Json(serde_json::json!({ "subscription": row.to_json() })).into_response(),
        Ok(None) => subscription_not_found(),
        Err(e) => internal_error(e),
    }
}

/// GET /api/v1/events/subscriptions/{id}/deliveries — newest first;
/// `{ deliveries, total }`.
async fn list_deliveries(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(page): Query<Page>,
) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    let subscription = match find_subscription(pool, &id).await {
        Ok(Some(row)) => row,
        Ok(None) => return subscription_not_found(),
        Err(e) => return internal_error(e),
    };
    match events::list_deliveries(pool, subscription.id, page.limit(20), page.offset()).await {
        Ok((rows, total)) => {
            let deliveries: Vec<_> = rows.iter().map(events::EventDeliveryRow::to_json).collect();
            Json(serde_json::json!({ "deliveries": deliveries, "total": total })).into_response()
        }
        Err(e) => internal_error(e),
    }
}

/// POST /api/v1/events/subscriptions/{id}/test — sending a test event needs
/// the webhook dispatcher, which is not ported yet: 404 for an unknown
/// subscription, otherwise 501.
async fn test_subscription(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match find_subscription(pool, &id).await {
        Ok(Some(_)) => error(
            StatusCode::NOT_IMPLEMENTED,
            "Event delivery is not yet supported in Rust",
        ),
        Ok(None) => subscription_not_found(),
        Err(e) => internal_error(e),
    }
}
