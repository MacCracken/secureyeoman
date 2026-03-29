//! Integration storage — connected services via PostgreSQL.

use serde::{Deserialize, Serialize};
use sqlx::PgPool;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationRow {
    pub id: String,
    pub platform: String,
    pub display_name: String,
    pub enabled: bool,
    pub status: String,
    pub config: serde_json::Value,
    pub connected_at: Option<i64>,
    pub last_message_at: Option<i64>,
    pub message_count: i32,
    pub error_message: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn list_integrations(pool: &PgPool) -> Result<Vec<IntegrationRow>, sqlx::Error> {
    sqlx::query_as::<_, IntegrationRow>("SELECT * FROM integration.integrations ORDER BY display_name ASC")
        .fetch_all(pool).await
}

pub async fn get_integration(pool: &PgPool, id: &str) -> Result<Option<IntegrationRow>, sqlx::Error> {
    sqlx::query_as::<_, IntegrationRow>("SELECT * FROM integration.integrations WHERE id = $1")
        .bind(id).fetch_optional(pool).await
}

pub async fn update_integration_status(pool: &PgPool, id: &str, enabled: bool, status: &str) -> Result<bool, sqlx::Error> {
    let now = now_ms();
    let result = sqlx::query("UPDATE integration.integrations SET enabled = $1, status = $2, updated_at = $3 WHERE id = $4")
        .bind(enabled).bind(status).bind(now).bind(id)
        .execute(pool).await?;
    Ok(result.rows_affected() > 0)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}
