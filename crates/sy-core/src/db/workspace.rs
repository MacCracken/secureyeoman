//! Workspace storage — workspaces via PostgreSQL.

use serde::{Deserialize, Serialize};
use sqlx::PgPool;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub settings: serde_json::Value,
    pub created_at: i64,
    pub updated_at: i64,
    pub identity_provider_id: Option<String>,
    pub sso_domain: Option<String>,
    pub tenant_id: String,
}

pub async fn list_workspaces(
    pool: &PgPool,
    tenant_id: &str,
) -> Result<Vec<WorkspaceRow>, sqlx::Error> {
    sqlx::query_as::<_, WorkspaceRow>(
        "SELECT * FROM workspace.workspaces WHERE tenant_id = $1 ORDER BY name ASC",
    )
    .bind(tenant_id)
    .fetch_all(pool)
    .await
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMemberRow {
    pub workspace_id: String,
    pub user_id: String,
    pub role: String,
    pub joined_at: i64,
}

pub async fn list_members(
    pool: &PgPool,
    workspace_id: &str,
) -> Result<Vec<WorkspaceMemberRow>, sqlx::Error> {
    sqlx::query_as::<_, WorkspaceMemberRow>(
        "SELECT workspace_id, user_id, role, joined_at FROM workspace.members WHERE workspace_id = $1 ORDER BY joined_at ASC",
    )
    .bind(workspace_id)
    .fetch_all(pool)
    .await
}

/// A member's role in a workspace, if they are one.
pub async fn member_role(
    pool: &PgPool,
    workspace_id: &str,
    user_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let row: Option<(Option<String>,)> = sqlx::query_as(
        "SELECT role FROM workspace.members WHERE workspace_id = $1 AND user_id = $2",
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|(role,)| role.unwrap_or_else(|| "member".to_string())))
}

/// Whether a workspace role administers the workspace.
pub fn is_workspace_admin(role: &str) -> bool {
    matches!(role, "owner" | "admin")
}

/// The outcome of [`remove_member`].
#[derive(Debug, PartialEq, Eq)]
pub enum MemberRemoval {
    Removed,
    NotFound,
    /// The member is the workspace's last owner/admin (TS refuses this).
    LastAdmin,
}

/// Remove a member, unless they are the workspace's last owner or admin.
/// The workspace's member rows are locked for the check, so two admins
/// cannot remove each other at once and leave nobody in charge.
pub async fn remove_member(
    pool: &PgPool,
    workspace_id: &str,
    user_id: &str,
) -> Result<MemberRemoval, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let members: Vec<(String, Option<String>)> = sqlx::query_as(
        "SELECT user_id, role FROM workspace.members WHERE workspace_id = $1 FOR UPDATE",
    )
    .bind(workspace_id)
    .fetch_all(&mut *tx)
    .await?;
    let admin = |role: &Option<String>| role.as_deref().is_some_and(is_workspace_admin);
    let Some((_, role)) = members.iter().find(|(id, _)| id == user_id) else {
        return Ok(MemberRemoval::NotFound);
    };
    if admin(role) && members.iter().filter(|(_, r)| admin(r)).count() <= 1 {
        return Ok(MemberRemoval::LastAdmin);
    }
    sqlx::query("DELETE FROM workspace.members WHERE workspace_id = $1 AND user_id = $2")
        .bind(workspace_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(MemberRemoval::Removed)
}

pub async fn get_workspace(
    pool: &PgPool,
    id: &str,
    tenant_id: &str,
) -> Result<Option<WorkspaceRow>, sqlx::Error> {
    sqlx::query_as::<_, WorkspaceRow>(
        "SELECT * FROM workspace.workspaces WHERE id = $1 AND tenant_id = $2",
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(pool)
    .await
}
