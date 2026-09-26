//! Event subscriptions and webhook deliveries — `events.subscriptions` and
//! `events.deliveries`, read the way the TS `EventSubscriptionStore` read them.

use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct EventSubscriptionRow {
    pub id: Uuid,
    pub name: String,
    pub event_types: Vec<String>,
    pub webhook_url: String,
    pub secret: Option<String>,
    pub enabled: Option<bool>,
    pub headers: Option<Value>,
    pub retry_policy: Option<Value>,
    pub created_at: i64,
    pub updated_at: Option<i64>,
    pub tenant_id: String,
}

impl EventSubscriptionRow {
    /// The TS `EventSubscription` shape, except that the HMAC signing secret
    /// is never echoed back: `hasSecret` says whether one is set. A NULL
    /// `enabled` reads as disabled, as the dispatcher treats it.
    pub fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "name": self.name,
            "eventTypes": self.event_types,
            "webhookUrl": self.webhook_url,
            "hasSecret": self.secret.is_some(),
            "enabled": self.enabled == Some(true),
            "headers": self.headers.clone().unwrap_or_else(|| json!({})),
            "retryPolicy": self
                .retry_policy
                .clone()
                .unwrap_or_else(|| json!({ "maxRetries": 3, "backoffMs": 1000 })),
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "tenantId": self.tenant_id,
        })
    }
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct EventDeliveryRow {
    pub id: Uuid,
    pub subscription_id: Uuid,
    pub event_type: String,
    pub payload: Value,
    pub status: String,
    pub attempts: Option<i32>,
    pub max_attempts: Option<i32>,
    pub last_attempt_at: Option<i64>,
    pub next_retry_at: Option<i64>,
    pub response_status: Option<i32>,
    pub response_body: Option<String>,
    pub error: Option<String>,
    pub created_at: i64,
    pub tenant_id: String,
}

impl EventDeliveryRow {
    /// The TS `EventDelivery` shape.
    pub fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "subscriptionId": self.subscription_id,
            "eventType": self.event_type,
            "payload": self.payload,
            "status": self.status,
            "attempts": self.attempts.unwrap_or(0),
            "maxAttempts": self.max_attempts.unwrap_or(0),
            "lastAttemptAt": self.last_attempt_at,
            "nextRetryAt": self.next_retry_at,
            "responseStatus": self.response_status,
            "responseBody": self.response_body,
            "error": self.error,
            "createdAt": self.created_at,
            "tenantId": self.tenant_id,
        })
    }
}

/// Newest-first subscriptions, optionally of one tenant, and the total.
pub async fn list_subscriptions(
    pool: &PgPool,
    tenant_id: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<(Vec<EventSubscriptionRow>, i64), sqlx::Error> {
    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM events.subscriptions WHERE ($1::text IS NULL OR tenant_id = $1)",
    )
    .bind(tenant_id)
    .fetch_one(pool)
    .await?;
    let rows = sqlx::query_as::<_, EventSubscriptionRow>(
        "SELECT * FROM events.subscriptions WHERE ($1::text IS NULL OR tenant_id = $1)
         ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3",
    )
    .bind(tenant_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;
    Ok((rows, total))
}

pub async fn get_subscription(
    pool: &PgPool,
    id: Uuid,
) -> Result<Option<EventSubscriptionRow>, sqlx::Error> {
    sqlx::query_as::<_, EventSubscriptionRow>("SELECT * FROM events.subscriptions WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

/// Newest-first deliveries of one subscription, and the total.
pub async fn list_deliveries(
    pool: &PgPool,
    subscription_id: Uuid,
    limit: i64,
    offset: i64,
) -> Result<(Vec<EventDeliveryRow>, i64), sqlx::Error> {
    let total: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM events.deliveries WHERE subscription_id = $1")
            .bind(subscription_id)
            .fetch_one(pool)
            .await?;
    let rows = sqlx::query_as::<_, EventDeliveryRow>(
        "SELECT * FROM events.deliveries WHERE subscription_id = $1
         ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3",
    )
    .bind(subscription_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;
    Ok((rows, total))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subscriptions_never_echo_their_secret() {
        let row = EventSubscriptionRow {
            id: Uuid::nil(),
            name: "hook".into(),
            event_types: vec!["tool.failed".into()],
            webhook_url: "https://example.com/hook".into(),
            secret: Some("s3cret".into()),
            enabled: None,
            headers: None,
            retry_policy: None,
            created_at: 1,
            updated_at: None,
            tenant_id: "default".into(),
        };
        let v = row.to_json();
        assert!(!v.to_string().contains("s3cret"));
        assert_eq!(v["hasSecret"], true);
        assert_eq!(v["enabled"], false);
        assert_eq!(v["headers"], json!({}));
        assert_eq!(v["retryPolicy"]["maxRetries"], 3);
    }
}
