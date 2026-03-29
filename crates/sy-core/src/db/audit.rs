//! Audit storage — tamper-evident log entries via PostgreSQL.

use serde::{Deserialize, Serialize};
use sqlx::PgPool;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntryRow {
    pub id: String,
    pub correlation_id: Option<String>,
    pub event: String,
    pub level: String,
    pub message: String,
    pub user_id: Option<String>,
    pub task_id: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub timestamp: i64,
    pub integrity_version: String,
    pub integrity_signature: String,
    pub integrity_previous_hash: String,
    pub tenant_id: String,
}

pub async fn list_entries(
    pool: &PgPool,
    tenant_id: &str,
    event: Option<&str>,
    level: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Vec<AuditEntryRow>, sqlx::Error> {
    if let Some(ev) = event {
        sqlx::query_as::<_, AuditEntryRow>(
            "SELECT id, correlation_id, event, level, message, user_id, task_id, metadata, \"timestamp\", integrity_version, integrity_signature, integrity_previous_hash, tenant_id FROM audit.entries WHERE tenant_id = $1 AND event = $2 ORDER BY \"timestamp\" DESC LIMIT $3 OFFSET $4",
        )
        .bind(tenant_id).bind(ev).bind(limit).bind(offset)
        .fetch_all(pool).await
    } else if let Some(lv) = level {
        sqlx::query_as::<_, AuditEntryRow>(
            "SELECT id, correlation_id, event, level, message, user_id, task_id, metadata, \"timestamp\", integrity_version, integrity_signature, integrity_previous_hash, tenant_id FROM audit.entries WHERE tenant_id = $1 AND level = $2 ORDER BY \"timestamp\" DESC LIMIT $3 OFFSET $4",
        )
        .bind(tenant_id).bind(lv).bind(limit).bind(offset)
        .fetch_all(pool).await
    } else {
        sqlx::query_as::<_, AuditEntryRow>(
            "SELECT id, correlation_id, event, level, message, user_id, task_id, metadata, \"timestamp\", integrity_version, integrity_signature, integrity_previous_hash, tenant_id FROM audit.entries WHERE tenant_id = $1 ORDER BY \"timestamp\" DESC LIMIT $2 OFFSET $3",
        )
        .bind(tenant_id).bind(limit).bind(offset)
        .fetch_all(pool).await
    }
}

pub async fn get_entry(pool: &PgPool, id: &str, tenant_id: &str) -> Result<Option<AuditEntryRow>, sqlx::Error> {
    sqlx::query_as::<_, AuditEntryRow>(
        "SELECT id, correlation_id, event, level, message, user_id, task_id, metadata, \"timestamp\", integrity_version, integrity_signature, integrity_previous_hash, tenant_id FROM audit.entries WHERE id = $1 AND tenant_id = $2",
    )
    .bind(id).bind(tenant_id)
    .fetch_optional(pool).await
}

pub async fn count_entries(pool: &PgPool, tenant_id: &str) -> Result<i64, sqlx::Error> {
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM audit.entries WHERE tenant_id = $1")
        .bind(tenant_id).fetch_one(pool).await?;
    Ok(count)
}
