//! Audit storage — the tamper-evident audit chain in `audit.entries`.
//!
//! The chain format is the TS `AuditChain` 1.0.0, so entries written before
//! the Rust port keep verifying:
//! - an entry's hash is SHA-256 over its canonical JSON — `id`,
//!   `correlationId`, `event`, `level`, `message`, `userId`, `taskId`,
//!   `metadata` and `timestamp`, absent fields omitted, object keys sorted at
//!   every depth and numbers printed as JavaScript prints them;
//! - its signature is HMAC-SHA256(`<hash>:<previous hash>`) under the signing
//!   key, and `integrity_previous_hash` links it to the entry before it (64
//!   zeros for the first).
//!
//! Appends hold a transaction-scoped advisory lock, so concurrent writers —
//! on any instance — cannot both link to the same predecessor. Retention
//! deletes the oldest entries and appends a signed record of where the chain
//! now starts; verification accepts that start and nothing else.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;

/// `integrity_previous_hash` of the first entry.
pub const GENESIS_HASH: &str = "0000000000000000000000000000000000000000000000000000000000000000";
/// The chain format written (the TS `AuditChain` format).
pub const CHAIN_VERSION: &str = "1.0.0";
/// The event appended when retention moves the start of the chain.
pub const RETENTION_EVENT: &str = "audit_retention_applied";
/// Advisory-lock key that serialises appends ("SY-AUDIT").
const APPEND_LOCK: i64 = 0x5359_2d41_5544_4954;

const COLUMNS: &str = "id, correlation_id, event, level, message, user_id, task_id, metadata, \
                       \"timestamp\", integrity_version, integrity_signature, \
                       integrity_previous_hash, tenant_id, seq";

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
    pub metadata: Option<Value>,
    pub timestamp: i64,
    pub integrity_version: String,
    pub integrity_signature: String,
    pub integrity_previous_hash: String,
    pub tenant_id: String,
    pub seq: i64,
}

impl AuditEntryRow {
    /// The wire shape: the dashboard's flat `sequence`/`signature`/
    /// `previousHash` and the TS `integrity` object.
    pub fn to_wire(&self) -> Value {
        serde_json::json!({
            "id": self.id,
            "sequence": self.seq,
            "correlationId": self.correlation_id,
            "event": self.event,
            "level": self.level,
            "message": self.message,
            "userId": self.user_id,
            "taskId": self.task_id,
            "metadata": self.metadata,
            "timestamp": self.timestamp,
            "tenantId": self.tenant_id,
            "signature": self.integrity_signature,
            "previousHash": self.integrity_previous_hash,
            "integrity": {
                "version": self.integrity_version,
                "signature": self.integrity_signature,
                "previousEntryHash": self.integrity_previous_hash,
            },
        })
    }
}

// ── Canonical form ────────────────────────────────────────────────────────

/// A number as JavaScript prints it: integers without a fraction, exponents
/// signed (`1e+21`), and plain notation in between.
fn js_number(n: &serde_json::Number) -> String {
    if n.is_i64() || n.is_u64() {
        return n.to_string();
    }
    let f = n.as_f64().unwrap_or(0.0);
    if f == 0.0 {
        return "0".to_string(); // also -0
    }
    if f.fract() == 0.0 && f.abs() < 1e21 {
        return format!("{f:.0}");
    }
    if f.abs() >= 1e21 || f.abs() < 1e-6 {
        let s = format!("{f:e}");
        return match s.split_once('e') {
            Some((mantissa, exp)) if !exp.starts_with('-') => format!("{mantissa}e+{exp}"),
            _ => s,
        };
    }
    format!("{f}")
}

/// A string as `JSON.stringify` writes it.
fn js_string(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

fn write_canonical(value: &Value, out: &mut String) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&js_number(n)),
        Value::String(s) => js_string(s, out),
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_canonical(item, out);
            }
            out.push(']');
        }
        Value::Object(map) => {
            // JS sorts keys by UTF-16 code units, whatever order they came in
            // (JSONB reorders them).
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            out.push('{');
            for (i, key) in keys.into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                js_string(key, out);
                out.push(':');
                write_canonical(&map[key], out);
            }
            out.push('}');
        }
    }
}

/// `JSON.stringify` with every object's keys sorted — the TS chain's
/// `sortedKeysReplacer` form.
pub fn canonical_json(value: &Value) -> String {
    let mut out = String::new();
    write_canonical(value, &mut out);
    out
}

/// Whether a stored `metadata` value counts as present: the TS chain read a
/// falsy value back as `undefined`, which leaves it out of the hash.
fn metadata_present(metadata: &Value) -> bool {
    match metadata {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|f| f != 0.0),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}

/// The entry's hash, over the fields the chain covers.
pub fn entry_hash(row: &AuditEntryRow) -> String {
    let mut data = serde_json::Map::new();
    data.insert("id".into(), Value::String(row.id.clone()));
    if let Some(c) = &row.correlation_id {
        data.insert("correlationId".into(), Value::String(c.clone()));
    }
    data.insert("event".into(), Value::String(row.event.clone()));
    data.insert("level".into(), Value::String(row.level.clone()));
    data.insert("message".into(), Value::String(row.message.clone()));
    if let Some(u) = &row.user_id {
        data.insert("userId".into(), Value::String(u.clone()));
    }
    if let Some(t) = &row.task_id {
        data.insert("taskId".into(), Value::String(t.clone()));
    }
    if let Some(m) = row.metadata.as_ref().filter(|m| metadata_present(m)) {
        data.insert("metadata".into(), m.clone());
    }
    data.insert("timestamp".into(), Value::from(row.timestamp));
    crate::crypto::sha256(canonical_json(&Value::Object(data)).as_bytes())
}

/// The signature linking an entry (by hash) to its predecessor.
pub fn sign(entry_hash: &str, previous_hash: &str, signing_key: &str) -> String {
    crate::crypto::hmac_sha256(
        format!("{entry_hash}:{previous_hash}").as_bytes(),
        signing_key.as_bytes(),
    )
}

// ── Appending ─────────────────────────────────────────────────────────────

/// An event to record.
#[derive(Debug, Clone, Default)]
pub struct NewAuditEntry {
    pub event: String,
    pub level: String,
    pub message: String,
    pub user_id: Option<String>,
    pub task_id: Option<String>,
    pub correlation_id: Option<String>,
    /// An object, or nothing.
    pub metadata: Option<Value>,
}

impl NewAuditEntry {
    pub fn new(event: &str, level: &str, message: &str) -> Self {
        Self {
            event: event.to_string(),
            level: level.to_string(),
            message: message.to_string(),
            ..Self::default()
        }
    }

    pub fn user(mut self, user_id: &str) -> Self {
        self.user_id = Some(user_id.to_string());
        self
    }

    pub fn metadata(mut self, metadata: Value) -> Self {
        self.metadata = Some(metadata);
        self
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// Text Postgres can store: `text` and `jsonb` refuse NUL characters, and
/// one refused entry would fail its whole batch.
fn storable(s: &str) -> String {
    s.replace('\0', "\u{fffd}")
}

fn storable_json(value: &Value) -> Value {
    match value {
        Value::String(s) => Value::String(storable(s)),
        Value::Array(items) => Value::Array(items.iter().map(storable_json).collect()),
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| (storable(k), storable_json(v)))
                .collect(),
        ),
        other => other.clone(),
    }
}

/// Append an entry, linked to and signed after the current last one.
pub async fn append(
    pool: &PgPool,
    signing_key: &str,
    entry: &NewAuditEntry,
) -> Result<AuditEntryRow, sqlx::Error> {
    let mut rows = append_batch(pool, signing_key, std::slice::from_ref(entry)).await?;
    rows.pop().ok_or(sqlx::Error::RowNotFound)
}

/// Append entries in order, in one transaction under the chain lock.
pub async fn append_batch(
    pool: &PgPool,
    signing_key: &str,
    entries: &[NewAuditEntry],
) -> Result<Vec<AuditEntryRow>, sqlx::Error> {
    if entries.is_empty() {
        return Ok(Vec::new());
    }
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(APPEND_LOCK)
        .execute(&mut *tx)
        .await?;
    let last: Option<AuditEntryRow> = sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM audit.entries ORDER BY seq DESC LIMIT 1"
    ))
    .fetch_optional(&mut *tx)
    .await?;
    let mut previous_hash = last
        .as_ref()
        .map_or_else(|| GENESIS_HASH.to_string(), entry_hash);

    let mut written = Vec::with_capacity(entries.len());
    for entry in entries {
        let mut row = AuditEntryRow {
            id: uuid::Uuid::now_v7().to_string(),
            correlation_id: entry.correlation_id.as_deref().map(storable),
            event: storable(&entry.event),
            level: storable(&entry.level),
            message: storable(&entry.message),
            user_id: entry.user_id.as_deref().map(storable),
            task_id: entry.task_id.as_deref().map(storable),
            metadata: entry
                .metadata
                .as_ref()
                .filter(|m| metadata_present(m))
                .map(storable_json),
            timestamp: now_ms(),
            integrity_version: CHAIN_VERSION.to_string(),
            integrity_signature: String::new(),
            integrity_previous_hash: previous_hash,
            tenant_id: "default".to_string(),
            seq: 0,
        };
        let hash = entry_hash(&row);
        row.integrity_signature = sign(&hash, &row.integrity_previous_hash, signing_key);

        let seq: i64 = sqlx::query_scalar(
            "INSERT INTO audit.entries (id, correlation_id, event, level, message, user_id,
                 task_id, metadata, \"timestamp\", integrity_version, integrity_signature,
                 integrity_previous_hash, tenant_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING seq",
        )
        .bind(&row.id)
        .bind(&row.correlation_id)
        .bind(&row.event)
        .bind(&row.level)
        .bind(&row.message)
        .bind(&row.user_id)
        .bind(&row.task_id)
        .bind(&row.metadata)
        .bind(row.timestamp)
        .bind(&row.integrity_version)
        .bind(&row.integrity_signature)
        .bind(&row.integrity_previous_hash)
        .bind(&row.tenant_id)
        .fetch_one(&mut *tx)
        .await?;
        row.seq = seq;
        previous_hash = hash;
        written.push(row);
    }
    tx.commit().await?;
    Ok(written)
}

// ── Verification ──────────────────────────────────────────────────────────

/// The outcome of walking the chain.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Verification {
    pub valid: bool,
    pub entries_checked: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub broken_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// When the walk finished (Unix ms).
    pub verified_at: i64,
}

/// Where retention says the chain now starts: the first retained entry and
/// the hash it links to. Taken from the latest signed retention record.
async fn retention_anchor(pool: &PgPool) -> Result<Option<(String, String)>, sqlx::Error> {
    let meta: Option<(Option<Value>,)> = sqlx::query_as(
        "SELECT metadata FROM audit.entries WHERE event = $1 ORDER BY seq DESC LIMIT 1",
    )
    .bind(RETENTION_EVENT)
    .fetch_optional(pool)
    .await?;
    Ok(meta.and_then(|(m,)| {
        let m = m?;
        Some((
            m.get("firstRetainedId")?.as_str()?.to_string(),
            m.get("firstRetainedPreviousHash")?.as_str()?.to_string(),
        ))
    }))
}

/// Walk the whole chain in order, recomputing every link and signature.
pub async fn verify_chain(pool: &PgPool, signing_key: &str) -> Result<Verification, sqlx::Error> {
    const PAGE: i64 = 1000;
    let anchor = retention_anchor(pool).await?;
    let fail = |checked: i64, at: &str, error: &str| Verification {
        valid: false,
        entries_checked: checked,
        broken_at: Some(at.to_string()),
        error: Some(error.to_string()),
        verified_at: now_ms(),
    };

    let mut checked = 0i64;
    let mut expected_previous: Option<String> = None;
    let mut after_seq = i64::MIN;
    loop {
        let rows: Vec<AuditEntryRow> = sqlx::query_as(&format!(
            "SELECT {COLUMNS} FROM audit.entries WHERE seq > $1 ORDER BY seq ASC LIMIT $2"
        ))
        .bind(after_seq)
        .bind(PAGE)
        .fetch_all(pool)
        .await?;
        let Some(last) = rows.last() else { break };
        after_seq = last.seq;
        for row in &rows {
            checked += 1;
            let linked = match &expected_previous {
                Some(expected) => &row.integrity_previous_hash == expected,
                // The first entry starts the chain, or is where a signed
                // retention record says it now starts.
                None => {
                    row.integrity_previous_hash == GENESIS_HASH
                        || anchor.as_ref().is_some_and(|(id, prev)| {
                            id == &row.id && prev == &row.integrity_previous_hash
                        })
                }
            };
            if !linked {
                return Ok(fail(
                    checked,
                    &row.id,
                    "Chain link broken: previous hash mismatch",
                ));
            }
            let hash = entry_hash(row);
            let expected_sig = sign(&hash, &row.integrity_previous_hash, signing_key);
            if !crate::crypto::secure_compare(
                row.integrity_signature.as_bytes(),
                expected_sig.as_bytes(),
            ) {
                return Ok(fail(checked, &row.id, "Signature verification failed"));
            }
            expected_previous = Some(hash);
        }
        if (rows.len() as i64) < PAGE {
            break;
        }
    }
    Ok(Verification {
        valid: true,
        entries_checked: checked,
        broken_at: None,
        error: None,
        verified_at: now_ms(),
    })
}

// ── Queries ───────────────────────────────────────────────────────────────

/// Filters for listing entries (all optional, combined with AND).
#[derive(Debug, Default)]
pub struct EntryFilter<'a> {
    pub from: Option<i64>,
    pub to: Option<i64>,
    pub levels: Vec<&'a str>,
    pub events: Vec<&'a str>,
    pub user_id: Option<&'a str>,
    pub task_id: Option<&'a str>,
}

/// Matching entries, newest first, and how many match in all.
pub async fn list_entries(
    pool: &PgPool,
    filter: &EntryFilter<'_>,
    limit: i64,
    offset: i64,
) -> Result<(Vec<AuditEntryRow>, i64), sqlx::Error> {
    const WHERE: &str = "WHERE ($1::bigint IS NULL OR \"timestamp\" >= $1)
          AND ($2::bigint IS NULL OR \"timestamp\" <= $2)
          AND (cardinality($3::text[]) = 0 OR level = ANY($3))
          AND (cardinality($4::text[]) = 0 OR event = ANY($4))
          AND ($5::text IS NULL OR user_id = $5)
          AND ($6::text IS NULL OR task_id = $6)";
    let levels: Vec<String> = filter.levels.iter().map(|s| s.to_string()).collect();
    let events: Vec<String> = filter.events.iter().map(|s| s.to_string()).collect();
    let (total,): (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM audit.entries {WHERE}"))
        .bind(filter.from)
        .bind(filter.to)
        .bind(&levels)
        .bind(&events)
        .bind(filter.user_id)
        .bind(filter.task_id)
        .fetch_one(pool)
        .await?;
    let rows = sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM audit.entries {WHERE}
         ORDER BY \"timestamp\" DESC, seq DESC LIMIT $7 OFFSET $8"
    ))
    .bind(filter.from)
    .bind(filter.to)
    .bind(&levels)
    .bind(&events)
    .bind(filter.user_id)
    .bind(filter.task_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;
    Ok((rows, total))
}

pub async fn get_entry(pool: &PgPool, id: &str) -> Result<Option<AuditEntryRow>, sqlx::Error> {
    sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM audit.entries WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn count_entries(pool: &PgPool) -> Result<i64, sqlx::Error> {
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM audit.entries")
        .fetch_one(pool)
        .await?;
    Ok(count)
}

/// The oldest entry's timestamp, if any.
pub async fn oldest_timestamp(pool: &PgPool) -> Result<Option<i64>, sqlx::Error> {
    let row: Option<(i64,)> =
        sqlx::query_as("SELECT \"timestamp\" FROM audit.entries ORDER BY seq ASC LIMIT 1")
            .fetch_optional(pool)
            .await?;
    Ok(row.map(|(t,)| t))
}

/// Rows for export, oldest first, capped at `limit`.
pub async fn export_entries(
    pool: &PgPool,
    from: Option<i64>,
    to: Option<i64>,
    user_id: Option<&str>,
    limit: i64,
) -> Result<Vec<AuditEntryRow>, sqlx::Error> {
    sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM audit.entries
         WHERE ($1::bigint IS NULL OR \"timestamp\" >= $1)
           AND ($2::bigint IS NULL OR \"timestamp\" <= $2)
           AND ($3::text IS NULL OR user_id = $3)
         ORDER BY seq ASC
         LIMIT $4"
    ))
    .bind(from)
    .bind(to)
    .bind(user_id)
    .bind(limit.clamp(1, 1_000_000))
    .fetch_all(pool)
    .await
}

// ── Retention ─────────────────────────────────────────────────────────────

/// Delete entries older than `max_age_days` and, past that, the oldest beyond
/// `max_entries`; then append a signed record of where the chain now starts,
/// so verification can tell retention from someone deleting history. Returns
/// (deleted, remaining).
pub async fn enforce_retention(
    pool: &PgPool,
    signing_key: &str,
    max_age_days: i64,
    max_entries: i64,
    applied_by: Option<&str>,
) -> Result<(i64, i64), sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(APPEND_LOCK)
        .execute(&mut *tx)
        .await?;
    let cutoff = now_ms().saturating_sub(max_age_days.saturating_mul(86_400_000));
    let by_age = sqlx::query("DELETE FROM audit.entries WHERE \"timestamp\" < $1")
        .bind(cutoff)
        .execute(&mut *tx)
        .await?
        .rows_affected() as i64;
    // Keep max_entries - 1, leaving room for the retention record itself.
    let by_count = sqlx::query(
        "DELETE FROM audit.entries WHERE seq IN (
             SELECT seq FROM audit.entries ORDER BY seq DESC OFFSET $1)",
    )
    .bind(max_entries.saturating_sub(1).max(0))
    .execute(&mut *tx)
    .await?
    .rows_affected() as i64;
    let first: Option<(String, String)> = sqlx::query_as(
        "SELECT id, integrity_previous_hash FROM audit.entries ORDER BY seq ASC LIMIT 1",
    )
    .fetch_optional(&mut *tx)
    .await?;
    tx.commit().await?;

    let deleted = by_age + by_count;
    if deleted > 0 {
        let mut record = NewAuditEntry::new(
            RETENTION_EVENT,
            "info",
            &format!("Audit retention removed {deleted} entries"),
        )
        .metadata(serde_json::json!({
            "deleted": deleted,
            "maxAgeDays": max_age_days,
            "maxEntries": max_entries,
            "firstRetainedId": first.as_ref().map(|(id, _)| id),
            "firstRetainedPreviousHash": first.as_ref().map(|(_, prev)| prev),
        }));
        record.user_id = applied_by.map(str::to_string);
        append(pool, signing_key, &record).await?;
    }
    Ok((deleted, count_entries(pool).await?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn canonical_json_matches_js_sorted_stringify() {
        // JSON.stringify(obj, sortedKeysReplacer) for the same object.
        let v = json!({
            "b": 1, "a": {"z": [1, 2.5, "x"], "y": null}, "c": "q\"\n\u{1}é",
            "big": 1e21, "small": 1e-7, "plain": 0.000001, "neg": -0.0,
        });
        assert_eq!(
            canonical_json(&v),
            r#"{"a":{"y":null,"z":[1,2.5,"x"]},"b":1,"big":1e+21,"c":"q\"\n\u0001é","neg":0,"plain":0.000001,"small":1e-7}"#
        );
    }

    #[test]
    fn the_hash_and_signature_match_the_ts_chain() {
        let row = AuditEntryRow {
            id: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b".into(),
            correlation_id: None,
            event: "auth.login".into(),
            level: "info".into(),
            message: "User logged in".into(),
            user_id: Some("admin".into()),
            task_id: None,
            metadata: Some(json!({"ip": "127.0.0.1", "method": "password"})),
            timestamp: 1_760_000_000_000,
            integrity_version: CHAIN_VERSION.into(),
            integrity_signature: String::new(),
            integrity_previous_hash: GENESIS_HASH.into(),
            tenant_id: "default".into(),
            seq: 1,
        };
        // Reference values from the TS implementation (computeEntryHash and
        // computeSignature in packages/core/src/logging/audit-chain.ts), run
        // under Node for this entry.
        let hash = entry_hash(&row);
        assert_eq!(
            hash,
            "316a6c395c6d9dd0bc740dd9a4d1da11000679aac0361f807e24e6688a2ef409"
        );
        assert_eq!(
            sign(
                &hash,
                GENESIS_HASH,
                "a-signing-key-that-is-at-least-32-chars"
            ),
            "443a5bc3ec86508aca59f04ee684d7d1630847f84efd916efe37d239d38257a3"
        );
        // Falsy metadata is left out, as the TS chain read it back.
        let mut empty = row.clone();
        empty.metadata = Some(Value::Null);
        let mut absent = row.clone();
        absent.metadata = None;
        assert_eq!(entry_hash(&empty), entry_hash(&absent));
    }
}
