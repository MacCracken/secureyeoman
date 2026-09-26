//! Users and their notification preferences — `auth.users` and
//! `auth.user_notification_prefs`, as the TS `AuthStorage` and
//! `UserNotificationPrefsStorage` kept them.

use serde::{Deserialize, Serialize};
use sqlx::PgPool;

/// A user without credentials (the password hash is never selected),
/// serialized as the TS `User`.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserRow {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub is_admin: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Users, oldest first, and the total.
pub async fn list_users(
    pool: &PgPool,
    limit: i64,
    offset: i64,
) -> Result<(Vec<UserRow>, i64), sqlx::Error> {
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM auth.users")
        .fetch_one(pool)
        .await?;
    let rows = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, display_name, is_admin, created_at, updated_at
         FROM auth.users ORDER BY created_at ASC, id ASC LIMIT $1 OFFSET $2",
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;
    Ok((rows, total))
}

pub async fn get_user(pool: &PgPool, id: &str) -> Result<Option<UserRow>, sqlx::Error> {
    sqlx::query_as::<_, UserRow>(
        "SELECT id, email, display_name, is_admin, created_at, updated_at
         FROM auth.users WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

/// One delivery channel for a user's notifications, serialized as the TS
/// `UserNotificationPref`.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPrefRow {
    pub id: String,
    pub user_id: String,
    pub channel: String,
    pub integration_id: Option<String>,
    pub chat_id: String,
    pub enabled: bool,
    pub quiet_hours_start: Option<i32>,
    pub quiet_hours_end: Option<i32>,
    pub min_level: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// The authenticated user's preferences, oldest first.
pub async fn list_prefs(
    pool: &PgPool,
    user_id: &str,
) -> Result<Vec<NotificationPrefRow>, sqlx::Error> {
    sqlx::query_as::<_, NotificationPrefRow>(
        "SELECT * FROM auth.user_notification_prefs WHERE user_id = $1
         ORDER BY created_at ASC, id ASC",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
}

/// A validated preference to create, or to replace the one for the same
/// channel and chat.
pub struct NewPref<'a> {
    pub channel: &'a str,
    pub integration_id: Option<&'a str>,
    pub chat_id: &'a str,
    pub enabled: bool,
    pub quiet_hours_start: Option<i32>,
    pub quiet_hours_end: Option<i32>,
    pub min_level: &'a str,
}

pub async fn upsert_pref(
    pool: &PgPool,
    user_id: &str,
    pref: &NewPref<'_>,
) -> Result<NotificationPrefRow, sqlx::Error> {
    let now = now_ms();
    sqlx::query_as::<_, NotificationPrefRow>(
        "INSERT INTO auth.user_notification_prefs
           (id, user_id, channel, integration_id, chat_id, enabled,
            quiet_hours_start, quiet_hours_end, min_level, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
         ON CONFLICT (user_id, channel, chat_id) DO UPDATE SET
           integration_id = EXCLUDED.integration_id,
           enabled = EXCLUDED.enabled,
           quiet_hours_start = EXCLUDED.quiet_hours_start,
           quiet_hours_end = EXCLUDED.quiet_hours_end,
           min_level = EXCLUDED.min_level,
           updated_at = EXCLUDED.updated_at
         RETURNING *",
    )
    .bind(uuid::Uuid::now_v7().to_string())
    .bind(user_id)
    .bind(pref.channel)
    .bind(pref.integration_id)
    .bind(pref.chat_id)
    .bind(pref.enabled)
    .bind(pref.quiet_hours_start)
    .bind(pref.quiet_hours_end)
    .bind(pref.min_level)
    .bind(now)
    .fetch_one(pool)
    .await
}

/// A partial update (the TS route's patch): absent fields keep their value;
/// an explicit `null` clears `integrationId` or a quiet-hours bound.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrefPatch {
    pub channel: Option<String>,
    #[serde(default, deserialize_with = "super::explicit_null")]
    pub integration_id: Option<Option<String>>,
    pub chat_id: Option<String>,
    pub enabled: Option<bool>,
    #[serde(default, deserialize_with = "super::explicit_null")]
    pub quiet_hours_start: Option<Option<i32>>,
    #[serde(default, deserialize_with = "super::explicit_null")]
    pub quiet_hours_end: Option<Option<i32>>,
    pub min_level: Option<String>,
}

/// Apply `patch` to one of `user_id`'s preferences; `None` when that user
/// has no preference `id`.
pub async fn update_pref(
    pool: &PgPool,
    user_id: &str,
    id: &str,
    patch: &PrefPatch,
) -> Result<Option<NotificationPrefRow>, sqlx::Error> {
    sqlx::query_as::<_, NotificationPrefRow>(
        "UPDATE auth.user_notification_prefs SET
           channel = COALESCE($3, channel),
           integration_id = CASE WHEN $4 THEN $5 ELSE integration_id END,
           chat_id = COALESCE($6, chat_id),
           enabled = COALESCE($7, enabled),
           quiet_hours_start = CASE WHEN $8 THEN $9 ELSE quiet_hours_start END,
           quiet_hours_end = CASE WHEN $10 THEN $11 ELSE quiet_hours_end END,
           min_level = COALESCE($12, min_level),
           updated_at = $13
         WHERE id = $1 AND user_id = $2
         RETURNING *",
    )
    .bind(id)
    .bind(user_id)
    .bind(patch.channel.as_deref())
    .bind(patch.integration_id.is_some())
    .bind(patch.integration_id.clone().flatten())
    .bind(patch.chat_id.as_deref().map(str::trim))
    .bind(patch.enabled)
    .bind(patch.quiet_hours_start.is_some())
    .bind(patch.quiet_hours_start.flatten())
    .bind(patch.quiet_hours_end.is_some())
    .bind(patch.quiet_hours_end.flatten())
    .bind(patch.min_level.as_deref())
    .bind(now_ms())
    .fetch_optional(pool)
    .await
}

pub async fn delete_pref(pool: &PgPool, user_id: &str, id: &str) -> Result<bool, sqlx::Error> {
    let result =
        sqlx::query("DELETE FROM auth.user_notification_prefs WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(user_id)
            .execute(pool)
            .await?;
    Ok(result.rows_affected() > 0)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
