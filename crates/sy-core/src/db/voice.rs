//! Voice profiles — `voice.profiles`, as the TS `VoiceProfileStore` kept them.

use serde::{Deserialize, Serialize};
use sqlx::PgPool;

/// A voice profile, serialized as the TS `VoiceProfile`.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct VoiceProfileRow {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub voice_id: String,
    pub settings: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sample_audio_base64: Option<String>,
    pub created_by: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Newest-first profiles, optionally from one provider, and the total.
pub async fn list_profiles(
    pool: &PgPool,
    provider: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<(Vec<VoiceProfileRow>, i64), sqlx::Error> {
    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM voice.profiles WHERE ($1::text IS NULL OR provider = $1)",
    )
    .bind(provider)
    .fetch_one(pool)
    .await?;
    let rows = sqlx::query_as::<_, VoiceProfileRow>(
        "SELECT * FROM voice.profiles WHERE ($1::text IS NULL OR provider = $1)
         ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3",
    )
    .bind(provider)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;
    Ok((rows, total))
}

pub async fn get_profile(pool: &PgPool, id: &str) -> Result<Option<VoiceProfileRow>, sqlx::Error> {
    sqlx::query_as::<_, VoiceProfileRow>("SELECT * FROM voice.profiles WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

/// A new profile; the route validates it first.
pub struct NewVoiceProfile<'a> {
    pub name: &'a str,
    pub provider: &'a str,
    pub voice_id: &'a str,
    pub settings: &'a serde_json::Value,
    pub sample_audio_base64: Option<&'a str>,
    pub created_by: &'a str,
}

pub async fn create_profile(
    pool: &PgPool,
    new: &NewVoiceProfile<'_>,
) -> Result<VoiceProfileRow, sqlx::Error> {
    let now = now_ms();
    sqlx::query_as::<_, VoiceProfileRow>(
        "INSERT INTO voice.profiles
           (id, name, provider, voice_id, settings, sample_audio_base64, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
         RETURNING *",
    )
    .bind(uuid::Uuid::now_v7().to_string())
    .bind(new.name)
    .bind(new.provider)
    .bind(new.voice_id)
    .bind(new.settings)
    .bind(new.sample_audio_base64)
    .bind(new.created_by)
    .bind(now)
    .fetch_one(pool)
    .await
}

/// A partial update (the TS `VoiceProfileUpdate`): absent fields keep their
/// value; `sampleAudioBase64: null` clears the sample.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceProfileUpdate {
    pub name: Option<String>,
    pub provider: Option<String>,
    pub voice_id: Option<String>,
    pub settings: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(default, deserialize_with = "super::explicit_null")]
    pub sample_audio_base64: Option<Option<String>>,
}

impl VoiceProfileUpdate {
    fn is_empty(&self) -> bool {
        self.name.is_none()
            && self.provider.is_none()
            && self.voice_id.is_none()
            && self.settings.is_none()
            && self.sample_audio_base64.is_none()
    }
}

/// Apply `update`; `None` when the profile does not exist. An empty update
/// changes nothing, not even `updated_at`.
pub async fn update_profile(
    pool: &PgPool,
    id: &str,
    update: &VoiceProfileUpdate,
) -> Result<Option<VoiceProfileRow>, sqlx::Error> {
    if update.is_empty() {
        return get_profile(pool, id).await;
    }
    sqlx::query_as::<_, VoiceProfileRow>(
        "UPDATE voice.profiles SET
           name = COALESCE($2, name),
           provider = COALESCE($3, provider),
           voice_id = COALESCE($4, voice_id),
           settings = COALESCE($5, settings),
           sample_audio_base64 = CASE WHEN $6 THEN $7 ELSE sample_audio_base64 END,
           updated_at = $8
         WHERE id = $1
         RETURNING *",
    )
    .bind(id)
    .bind(update.name.as_deref())
    .bind(update.provider.as_deref())
    .bind(update.voice_id.as_deref())
    .bind(update.settings.clone().map(serde_json::Value::Object))
    .bind(update.sample_audio_base64.is_some())
    .bind(update.sample_audio_base64.clone().flatten())
    .bind(now_ms())
    .fetch_optional(pool)
    .await
}

pub async fn delete_profile(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM voice.profiles WHERE id = $1")
        .bind(id)
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
