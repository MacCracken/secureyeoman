//! Personality mood — the valence/arousal/dominance circumplex model kept in
//! `simulation.mood_states` (one row per personality) and
//! `simulation.mood_events` (the event log), as the TS `MoodEngine` and
//! `SimulationStore` kept it.

use serde::Serialize;
use sqlx::{PgPool, Postgres, Transaction};

/// Valence beyond ±this leaves the neutral band (TS `MOOD_THRESHOLD`).
const MOOD_THRESHOLD: f64 = 0.15;

/// Russell's circumplex label for a valence/arousal point (TS `getMoodLabel`).
pub fn mood_label(valence: f64, arousal: f64) -> &'static str {
    if valence > 0.6 && arousal > 0.6 {
        "ecstatic"
    } else if valence > MOOD_THRESHOLD && arousal > 0.5 {
        "excited"
    } else if valence > 0.3 && arousal <= 0.5 {
        "happy"
    } else if valence > MOOD_THRESHOLD && arousal <= 0.3 {
        "content"
    } else if valence >= -MOOD_THRESHOLD && arousal <= 0.25 {
        "calm"
    } else if valence < -MOOD_THRESHOLD && arousal > 0.5 {
        "angry"
    } else if valence < -0.3 && arousal > 0.3 {
        "anxious"
    } else if valence < -0.3 && arousal <= 0.3 {
        "sad"
    } else if valence < -MOOD_THRESHOLD && arousal <= 0.3 {
        "melancholy"
    } else {
        "neutral"
    }
}

/// A personality's current mood, serialized as the TS `MoodState`.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MoodStateRow {
    pub id: String,
    pub personality_id: String,
    pub valence: f64,
    pub arousal: f64,
    pub dominance: f64,
    pub label: String,
    pub decay_rate: f64,
    pub baseline_valence: f64,
    pub baseline_arousal: f64,
    pub updated_at: i64,
}

/// One logged mood event, serialized as the TS `MoodEvent`.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MoodEventRow {
    pub id: String,
    pub personality_id: String,
    pub event_type: String,
    pub valence_delta: f64,
    pub arousal_delta: f64,
    pub source: String,
    pub metadata: serde_json::Value,
    pub created_at: i64,
}

/// A validated mood event to apply (TS `MoodEventCreate`).
#[derive(Debug, Clone)]
pub struct NewMoodEvent {
    pub event_type: String,
    pub valence_delta: f64,
    pub arousal_delta: f64,
    pub source: String,
    pub metadata: serde_json::Value,
}

pub async fn get_mood(
    pool: &PgPool,
    personality_id: &str,
) -> Result<Option<MoodStateRow>, sqlx::Error> {
    sqlx::query_as::<_, MoodStateRow>(
        "SELECT id, personality_id, valence, arousal, dominance, label, decay_rate,
                baseline_valence, baseline_arousal, updated_at
         FROM simulation.mood_states WHERE personality_id = $1",
    )
    .bind(personality_id)
    .fetch_optional(pool)
    .await
}

async fn lock_state(
    tx: &mut Transaction<'_, Postgres>,
    personality_id: &str,
) -> Result<Option<MoodStateRow>, sqlx::Error> {
    sqlx::query_as::<_, MoodStateRow>(
        "SELECT id, personality_id, valence, arousal, dominance, label, decay_rate,
                baseline_valence, baseline_arousal, updated_at
         FROM simulation.mood_states WHERE personality_id = $1 FOR UPDATE",
    )
    .bind(personality_id)
    .fetch_optional(&mut **tx)
    .await
}

/// Log `event` and move the locked `state` by its deltas, clamped to the
/// circumplex (valence −1..1, arousal 0..1), relabelling the result.
async fn apply_locked(
    tx: &mut Transaction<'_, Postgres>,
    state: &MoodStateRow,
    event: &NewMoodEvent,
) -> Result<MoodStateRow, sqlx::Error> {
    let now = now_ms();
    sqlx::query(
        "INSERT INTO simulation.mood_events
           (id, personality_id, event_type, valence_delta, arousal_delta, source, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(uuid::Uuid::now_v7().to_string())
    .bind(&state.personality_id)
    .bind(&event.event_type)
    .bind(event.valence_delta)
    .bind(event.arousal_delta)
    .bind(&event.source)
    .bind(&event.metadata)
    .bind(now)
    .execute(&mut **tx)
    .await?;

    let valence = (state.valence + event.valence_delta).clamp(-1.0, 1.0);
    let arousal = (state.arousal + event.arousal_delta).clamp(0.0, 1.0);
    sqlx::query_as::<_, MoodStateRow>(
        "UPDATE simulation.mood_states SET valence = $1, arousal = $2, label = $3, updated_at = $4
         WHERE personality_id = $5
         RETURNING id, personality_id, valence, arousal, dominance, label, decay_rate,
                baseline_valence, baseline_arousal, updated_at",
    )
    .bind(valence)
    .bind(arousal)
    .bind(mood_label(valence, arousal))
    .bind(now)
    .bind(&state.personality_id)
    .fetch_one(&mut **tx)
    .await
}

/// Apply a mood event, first initialising the personality's mood at the
/// neutral baseline (valence 0, arousal 0, dominance 0.5, decay 0.05) if it
/// has none — the TS `applyEvent` without traits. The state row is locked
/// for the read-modify-write, so concurrent events never lose an update.
pub async fn apply_event(
    pool: &PgPool,
    personality_id: &str,
    event: &NewMoodEvent,
) -> Result<MoodStateRow, sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO simulation.mood_states (id, personality_id, label, updated_at)
         VALUES ($1, $2, $3, $4) ON CONFLICT (personality_id) DO NOTHING",
    )
    .bind(uuid::Uuid::now_v7().to_string())
    .bind(personality_id)
    .bind(mood_label(0.0, 0.0))
    .bind(now_ms())
    .execute(&mut *tx)
    .await?;
    let state = lock_state(&mut tx, personality_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;
    let updated = apply_locked(&mut tx, &state, event).await?;
    tx.commit().await?;
    Ok(updated)
}

/// Return the mood to its baseline, logged as a `reset` event carrying the
/// deltas that got it there. `None` when the personality has no mood yet.
pub async fn reset_mood(
    pool: &PgPool,
    personality_id: &str,
) -> Result<Option<MoodStateRow>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let Some(state) = lock_state(&mut tx, personality_id).await? else {
        return Ok(None);
    };
    let event = NewMoodEvent {
        event_type: "reset".into(),
        valence_delta: state.baseline_valence - state.valence,
        arousal_delta: state.baseline_arousal - state.arousal,
        source: "system".into(),
        metadata: serde_json::json!({ "reason": "manual reset" }),
    };
    let updated = apply_locked(&mut tx, &state, &event).await?;
    tx.commit().await?;
    Ok(Some(updated))
}

/// Newest-first event log, optionally only events at or after `since` (ms).
pub async fn list_mood_events(
    pool: &PgPool,
    personality_id: &str,
    since: Option<i64>,
    limit: i64,
) -> Result<Vec<MoodEventRow>, sqlx::Error> {
    sqlx::query_as::<_, MoodEventRow>(
        "SELECT id, personality_id, event_type, valence_delta, arousal_delta, source, metadata, created_at
         FROM simulation.mood_events
         WHERE personality_id = $1 AND ($2::bigint IS NULL OR created_at >= $2)
         ORDER BY created_at DESC, id DESC LIMIT $3",
    )
    .bind(personality_id)
    .bind(since)
    .bind(limit)
    .fetch_all(pool)
    .await
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::mood_label;

    #[test]
    fn labels_follow_the_ts_circumplex() {
        for (v, a, label) in [
            (0.7, 0.7, "ecstatic"),
            (0.2, 0.6, "excited"),
            (0.4, 0.4, "happy"),
            (0.2, 0.2, "content"),
            (0.0, 0.0, "calm"),
            (-0.15, 0.25, "calm"),
            (-0.2, 0.6, "angry"),
            (-0.4, 0.4, "anxious"),
            (-0.4, 0.2, "sad"),
            (-0.2, 0.2, "melancholy"),
            (0.0, 0.4, "neutral"),
            (-0.2, 0.4, "neutral"),
        ] {
            assert_eq!(mood_label(v, a), label, "v={v} a={a}");
        }
    }
}
