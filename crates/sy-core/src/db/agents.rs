//! Agent storage — profiles, delegations, swarms via PostgreSQL.

use serde::{Deserialize, Serialize};
use sqlx::PgPool;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AgentProfileRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub max_token_budget: i32,
    pub allowed_tools: serde_json::Value,
    pub default_model: Option<String>,
    pub is_builtin: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub r#type: String,
    pub command: Option<String>,
    pub command_args: Option<serde_json::Value>,
    pub command_env: Option<serde_json::Value>,
    pub mcp_tool: Option<String>,
    pub mcp_tool_input: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DelegationRow {
    pub id: String,
    pub parent_delegation_id: Option<String>,
    pub profile_id: String,
    pub task: String,
    pub context: Option<String>,
    pub status: String,
    pub result: Option<String>,
    pub error: Option<String>,
    pub depth: i32,
    pub max_depth: i32,
    pub token_budget: i32,
    pub tokens_used_prompt: i32,
    pub tokens_used_completion: i32,
    pub timeout_ms: i32,
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub initiated_by: Option<String>,
    pub correlation_id: Option<String>,
}

pub async fn list_profiles(pool: &PgPool) -> Result<Vec<AgentProfileRow>, sqlx::Error> {
    sqlx::query_as::<_, AgentProfileRow>(
        "SELECT * FROM agents.profiles ORDER BY is_builtin DESC, name ASC",
    )
    .fetch_all(pool)
    .await
}

pub async fn get_profile(pool: &PgPool, id: &str) -> Result<Option<AgentProfileRow>, sqlx::Error> {
    sqlx::query_as::<_, AgentProfileRow>("SELECT * FROM agents.profiles WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

#[allow(clippy::too_many_arguments)]
pub async fn create_profile(
    pool: &PgPool,
    id: &str,
    name: &str,
    description: &str,
    system_prompt: &str,
    allowed_tools: &serde_json::Value,
    default_model: Option<&str>,
    profile_type: &str,
) -> Result<AgentProfileRow, sqlx::Error> {
    sqlx::query_as::<_, AgentProfileRow>(
        "INSERT INTO agents.profiles (id, name, description, system_prompt, allowed_tools, default_model, type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *",
    )
    .bind(id)
    .bind(name)
    .bind(description)
    .bind(system_prompt)
    .bind(allowed_tools)
    .bind(default_model)
    .bind(profile_type)
    .fetch_one(pool)
    .await
}

pub async fn delete_profile(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM agents.profiles WHERE id = $1 AND is_builtin = false")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn list_delegations(
    pool: &PgPool,
    status: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Vec<DelegationRow>, sqlx::Error> {
    if let Some(s) = status {
        sqlx::query_as::<_, DelegationRow>(
            "SELECT * FROM agents.delegations WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        )
        .bind(s)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as::<_, DelegationRow>(
            "SELECT * FROM agents.delegations ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
    }
}

pub async fn get_delegation(pool: &PgPool, id: &str) -> Result<Option<DelegationRow>, sqlx::Error> {
    sqlx::query_as::<_, DelegationRow>("SELECT * FROM agents.delegations WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}
