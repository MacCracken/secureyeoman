//! Soul storage — personalities CRUD via PostgreSQL.

use serde::{Deserialize, Serialize};
use sqlx::PgPool;

/// Personality row from soul.personalities table.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PersonalityRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub traits: serde_json::Value,
    pub sex: String,
    pub voice: String,
    pub preferred_language: String,
    pub default_model: Option<serde_json::Value>,
    pub include_archetypes: bool,
    pub is_active: bool,
    pub body: serde_json::Value,
    pub created_at: i64,
    pub updated_at: i64,
    pub model_fallbacks: serde_json::Value,
    pub is_default: bool,
    pub inject_date_time: bool,
    pub empathy_resonance: bool,
    pub avatar_url: Option<String>,
    pub tenant_id: String,
    /// Dashboard expects voiceProfileId — not in DB, always null for now.
    #[sqlx(default)]
    pub voice_profile_id: Option<String>,
    /// Dashboard expects brainConfig — not in DB, always null for now.
    #[sqlx(default)]
    pub brain_config: Option<serde_json::Value>,
}

/// List all personalities.
pub async fn list_personalities(
    pool: &PgPool,
    tenant_id: &str,
) -> Result<Vec<PersonalityRow>, sqlx::Error> {
    sqlx::query_as::<_, PersonalityRow>(
        "SELECT * FROM soul.personalities WHERE tenant_id = $1 ORDER BY is_default DESC, name ASC",
    )
    .bind(tenant_id)
    .fetch_all(pool)
    .await
}

/// Get a personality by ID.
pub async fn get_personality(
    pool: &PgPool,
    id: &str,
    tenant_id: &str,
) -> Result<Option<PersonalityRow>, sqlx::Error> {
    sqlx::query_as::<_, PersonalityRow>(
        "SELECT * FROM soul.personalities WHERE id = $1 AND tenant_id = $2",
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(pool)
    .await
}

/// Get the active personality.
pub async fn get_active_personality(
    pool: &PgPool,
    tenant_id: &str,
) -> Result<Option<PersonalityRow>, sqlx::Error> {
    // The active personality is the default one (`is_active` means "enabled";
    // several can be), as in the TS gateway.
    sqlx::query_as::<_, PersonalityRow>(
        "SELECT * FROM soul.personalities WHERE is_default = true AND tenant_id = $1 LIMIT 1",
    )
    .bind(tenant_id)
    .fetch_optional(pool)
    .await
}

/// Create a new personality.
#[allow(clippy::too_many_arguments)]
pub async fn create_personality(
    pool: &PgPool,
    id: &str,
    name: &str,
    description: &str,
    system_prompt: &str,
    traits: &serde_json::Value,
    sex: &str,
    tenant_id: &str,
) -> Result<PersonalityRow, sqlx::Error> {
    let now = now_ms();
    sqlx::query_as::<_, PersonalityRow>(
        "INSERT INTO soul.personalities (id, name, description, system_prompt, traits, sex, created_at, updated_at, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8)
         RETURNING *",
    )
    .bind(id)
    .bind(name)
    .bind(description)
    .bind(system_prompt)
    .bind(traits)
    .bind(sex)
    .bind(now)
    .bind(tenant_id)
    .fetch_one(pool)
    .await
}

/// Update an existing personality.
#[allow(clippy::too_many_arguments)]
pub async fn update_personality(
    pool: &PgPool,
    id: &str,
    name: &str,
    description: &str,
    system_prompt: &str,
    traits: &serde_json::Value,
    body: Option<&serde_json::Value>,
    voice: Option<&str>,
    sex: Option<&str>,
    include_archetypes: Option<bool>,
    default_model: Option<&serde_json::Value>,
    tenant_id: &str,
) -> Result<Option<PersonalityRow>, sqlx::Error> {
    sqlx::query_as::<_, PersonalityRow>(
        "UPDATE soul.personalities SET
            name = $1, description = $2, system_prompt = $3, traits = $4,
            body = COALESCE($5, body),
            voice = COALESCE($6, voice),
            sex = COALESCE($7, sex),
            include_archetypes = COALESCE($8, include_archetypes),
            default_model = COALESCE($9, default_model),
            updated_at = $10
         WHERE id = $11 AND tenant_id = $12
         RETURNING *",
    )
    .bind(name)
    .bind(description)
    .bind(system_prompt)
    .bind(traits)
    .bind(body)
    .bind(voice)
    .bind(sex)
    .bind(include_archetypes)
    .bind(default_model)
    .bind(now_ms())
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(pool)
    .await
}

/// Enable or disable one personality (`is_active`). `false` if it does not exist.
pub async fn set_personality_enabled(
    pool: &PgPool,
    id: &str,
    tenant_id: &str,
    enabled: bool,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE soul.personalities SET is_active = $1, updated_at = $2 WHERE id = $3 AND tenant_id = $4",
    )
    .bind(enabled)
    .bind(now_ms())
    .bind(id)
    .bind(tenant_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

/// Make `id` the active personality: the default and the only enabled one
/// (the TS `setActivePersonality`). `false`, changing nothing, if it does not
/// exist.
pub async fn activate_personality(
    pool: &PgPool,
    id: &str,
    tenant_id: &str,
) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let found = sqlx::query(
        "UPDATE soul.personalities SET is_active = true, is_default = true, updated_at = $1
         WHERE id = $2 AND tenant_id = $3",
    )
    .bind(now_ms())
    .bind(id)
    .bind(tenant_id)
    .execute(&mut *tx)
    .await?
    .rows_affected()
        > 0;
    if !found {
        // Dropping the transaction rolls it back.
        return Ok(false);
    }
    sqlx::query(
        "UPDATE soul.personalities SET is_active = false, is_default = false
         WHERE tenant_id = $1 AND id <> $2 AND (is_active OR is_default)",
    )
    .bind(tenant_id)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(true)
}

/// Make `id` the default (active) personality without changing which ones are
/// enabled. `false`, changing nothing, if it does not exist.
pub async fn set_default_personality(
    pool: &PgPool,
    id: &str,
    tenant_id: &str,
) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let found = sqlx::query(
        "UPDATE soul.personalities SET is_default = true, updated_at = $1 WHERE id = $2 AND tenant_id = $3",
    )
    .bind(now_ms())
    .bind(id)
    .bind(tenant_id)
    .execute(&mut *tx)
    .await?
    .rows_affected()
        > 0;
    if !found {
        return Ok(false);
    }
    sqlx::query(
        "UPDATE soul.personalities SET is_default = false
         WHERE tenant_id = $1 AND id <> $2 AND is_default",
    )
    .bind(tenant_id)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(true)
}

/// Leave no personality as the default.
pub async fn clear_default_personality(pool: &PgPool, tenant_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE soul.personalities SET is_default = false WHERE tenant_id = $1 AND is_default",
    )
    .bind(tenant_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// Delete a personality by ID.
pub async fn delete_personality(
    pool: &PgPool,
    id: &str,
    tenant_id: &str,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        "DELETE FROM soul.personalities WHERE id = $1 AND tenant_id = $2 AND is_default = false",
    )
    .bind(id)
    .bind(tenant_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

/// A `soul.meta` value (agent name, soul config overrides, …) by key.
pub async fn get_meta(pool: &PgPool, key: &str) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar("SELECT value FROM soul.meta WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await
}

/// Insert or replace a `soul.meta` value.
pub async fn set_meta(pool: &PgPool, key: &str, value: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO soul.meta (key, value, updated_at) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at",
    )
    .bind(key)
    .bind(value)
    .bind(now_ms())
    .execute(pool)
    .await?;
    Ok(())
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
