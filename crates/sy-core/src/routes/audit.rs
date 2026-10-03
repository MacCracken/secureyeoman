//! Audit routes — log entries query and streaming export.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures::stream;
use serde::Deserialize;
use std::convert::Infallible;

use crate::db::audit;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/audit", get(list_entries))
        .route("/api/v1/audit/entries", get(list_entries))
        .route("/api/v1/audit/entries/{id}", get(get_entry))
        .route("/api/v1/audit/stats", get(get_stats))
        .route("/api/v1/audit/verify", post(verify_chain))
        .route("/api/v1/audit/repair", post(repair_chain))
        .route(
            "/api/v1/audit/export",
            get(export_backup).post(export_entries),
        )
        .route("/api/v1/audit/chain/status", get(chain_status))
        .route("/api/v1/audit/retention", post(set_retention))
}

fn error(status: StatusCode, message: &str) -> axum::response::Response {
    (status, Json(serde_json::json!({ "error": message }))).into_response()
}

fn db_unavailable() -> axum::response::Response {
    error(StatusCode::SERVICE_UNAVAILABLE, "Database not available")
}

fn internal_error(e: sqlx::Error) -> axum::response::Response {
    tracing::error!(error = %e, "audit query failed");
    error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
}

/// The last verification, running one now if none has.
async fn current_verification(
    state: &AppState,
) -> Result<Option<audit::Verification>, sqlx::Error> {
    let (Some(pool), Some(trail)) = (state.db(), state.audit()) else {
        return Ok(None);
    };
    trail.last_or_verify(pool).await.map(Some)
}

async fn chain_status(State(state): State<AppState>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return Json(serde_json::json!({
            "status": "unavailable",
            "chainIntegrity": "unknown",
            "totalEntries": 0,
        }))
        .into_response();
    };
    let total = match audit::count_entries(pool).await {
        Ok(n) => n,
        Err(e) => return internal_error(e),
    };
    match current_verification(&state).await {
        Ok(v) => Json(serde_json::json!({
            "status": "healthy",
            "chainIntegrity": match &v {
                Some(v) if v.valid => "valid",
                Some(_) => "broken",
                None => "unknown",
            },
            "totalEntries": total,
            "lastVerifiedAt": v.as_ref().and_then(|v| chrono::DateTime::from_timestamp_millis(v.verified_at)).map(|t| t.to_rfc3339()),
            "brokenAt": v.as_ref().and_then(|v| v.broken_at.clone()),
        }))
        .into_response(),
        Err(e) => internal_error(e),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuditQuery {
    from: Option<i64>,
    to: Option<i64>,
    /// Comma-separated.
    level: Option<String>,
    /// Comma-separated.
    event: Option<String>,
    user_id: Option<String>,
    task_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

fn split_list(v: &Option<String>) -> Vec<&str> {
    v.as_deref()
        .map(|s| {
            s.split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

/// GET /api/v1/audit — newest first, `{ entries, total, limit, offset }`
/// (TS `queryAuditLog`): `total` counts every match, not the page.
async fn list_entries(
    State(state): State<AppState>,
    Query(q): Query<AuditQuery>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    let limit = q.limit.filter(|l| *l >= 1).unwrap_or(50).min(1000);
    let offset = q.offset.unwrap_or(0).max(0);
    let filter = audit::EntryFilter {
        from: q.from,
        to: q.to,
        levels: split_list(&q.level),
        events: split_list(&q.event),
        user_id: q.user_id.as_deref(),
        task_id: q.task_id.as_deref(),
    };
    match audit::list_entries(pool, &filter, limit, offset).await {
        Ok((rows, total)) => Json(serde_json::json!({
            "entries": rows.iter().map(audit::AuditEntryRow::to_wire).collect::<Vec<_>>(),
            "total": total,
            "limit": limit,
            "offset": offset,
        }))
        .into_response(),
        Err(e) => internal_error(e),
    }
}

async fn get_entry(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match audit::get_entry(pool, &id).await {
        Ok(Some(row)) => Json(row.to_wire()).into_response(),
        Ok(None) => error(StatusCode::NOT_FOUND, "Entry not found"),
        Err(e) => internal_error(e),
    }
}

/// GET /api/v1/audit/stats — the chain's size and its last verification.
async fn get_stats(State(state): State<AppState>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    let total = match audit::count_entries(pool).await {
        Ok(n) => n,
        Err(e) => return internal_error(e),
    };
    let oldest = audit::oldest_timestamp(pool).await.ok().flatten();
    let size: Option<i64> = sqlx::query_scalar("SELECT pg_database_size(current_database())")
        .fetch_one(pool)
        .await
        .ok();
    match current_verification(&state).await {
        Ok(v) => Json(serde_json::json!({
            "totalEntries": total,
            "oldestEntry": oldest,
            "chainValid": v.as_ref().map(|v| v.valid),
            "lastVerification": v.as_ref().map(|v| v.verified_at),
            "chainError": v.as_ref().and_then(|v| v.error.clone()),
            "chainBrokenAt": v.as_ref().and_then(|v| v.broken_at.clone()),
            "dbSizeEstimateMb": size.map(|b| b as f64 / (1024.0 * 1024.0)),
        }))
        .into_response(),
        Err(e) => internal_error(e),
    }
}

/// POST /api/v1/audit/verify — walk the whole chain now.
async fn verify_chain(State(state): State<AppState>) -> impl IntoResponse {
    let (Some(pool), Some(trail)) = (state.db(), state.audit()) else {
        return db_unavailable();
    };
    match trail.verify(pool).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => internal_error(e),
    }
}

/// POST /api/v1/audit/repair — not offered: re-signing the chain with the
/// current key would make tampered entries verify.
async fn repair_chain() -> impl IntoResponse {
    error(
        StatusCode::NOT_IMPLEMENTED,
        "Audit chain repair is not supported: re-signing entries would hide tampering",
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RetentionRequest {
    max_age_days: Option<i64>,
    max_entries: Option<i64>,
}

/// POST /api/v1/audit/retention — delete old entries (TS bounds), and record
/// where the chain now starts so it still verifies.
async fn set_retention(
    State(state): State<AppState>,
    auth: Option<axum::Extension<crate::auth::middleware::AuthContext>>,
    Json(body): Json<RetentionRequest>,
) -> impl IntoResponse {
    let max_age_days = body.max_age_days.unwrap_or(90);
    let max_entries = body.max_entries.unwrap_or(1_000_000);
    if !(1..=3650).contains(&max_age_days) {
        return error(
            StatusCode::BAD_REQUEST,
            "maxAgeDays must be between 1 and 3650",
        );
    }
    if !(100..=10_000_000).contains(&max_entries) {
        return error(
            StatusCode::BAD_REQUEST,
            "maxEntries must be between 100 and 10,000,000",
        );
    }
    let (Some(pool), Some(trail)) = (state.db(), state.audit()) else {
        return db_unavailable();
    };
    let caller = auth.map(|axum::Extension(a)| a.user_id);
    match audit::enforce_retention(
        pool,
        trail.signing_key(),
        max_age_days,
        max_entries,
        caller.as_deref(),
    )
    .await
    {
        Ok((deleted, remaining)) => Json(serde_json::json!({
            "deletedCount": deleted,
            "remainingCount": remaining,
            "deleted": deleted,
            "totalEntries": remaining,
        }))
        .into_response(),
        Err(e) => internal_error(e),
    }
}

// ── Audit Export (streaming) ─────────────────────────────────────────────

#[derive(Deserialize)]
struct ExportBody {
    format: Option<String>,
    from: Option<i64>,
    to: Option<i64>,
    level: Option<Vec<String>>,
    event: Option<Vec<String>>,
    #[serde(rename = "userId")]
    user_id: Option<String>,
    limit: Option<i64>,
}

const CSV_HEADER: &str = "id,event,level,message,userId,taskId,correlationId,timestamp,metadata\n";

/// Format an audit entry as JSONL (one JSON object per line).
fn format_jsonl(row: &audit::AuditEntryRow) -> String {
    row.to_wire().to_string() + "\n"
}

/// An entry's timestamp (Unix ms) as RFC 3339.
fn rfc3339_ms(ms: i64) -> String {
    chrono::DateTime::from_timestamp_millis(ms)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_default()
}

/// Format an audit entry as a CSV row.
fn format_csv(row: &audit::AuditEntryRow) -> String {
    let ts = rfc3339_ms(row.timestamp);
    let meta = row
        .metadata
        .as_ref()
        .map(|m| m.to_string())
        .unwrap_or_else(|| "{}".to_string());
    let fields = [
        &row.id,
        &row.event,
        &row.level,
        &row.message,
        row.user_id.as_deref().unwrap_or(""),
        row.task_id.as_deref().unwrap_or(""),
        row.correlation_id.as_deref().unwrap_or(""),
        &ts,
        &meta,
    ];
    fields
        .iter()
        .map(|f| format!("\"{}\"", csv_safe(f)))
        .collect::<Vec<_>>()
        .join(",")
        + "\n"
}

/// Make a value safe for CSV export. Escapes embedded quotes, and neutralizes
/// spreadsheet formula injection: a cell that begins with `=`, `+`, `-`, `@`, or
/// a leading tab/CR is executed as a formula by Excel/Sheets even when quoted, so
/// such values are prefixed with a single quote to force text interpretation.
fn csv_safe(value: &str) -> String {
    let guarded = if value
        .chars()
        .next()
        .is_some_and(|c| matches!(c, '=' | '+' | '-' | '@' | '\t' | '\r'))
    {
        format!("'{value}")
    } else {
        value.to_string()
    };
    guarded.replace('"', "\"\"")
}

/// Format an audit entry as syslog RFC 5424.
fn format_syslog(row: &audit::AuditEntryRow, hostname: &str) -> String {
    let sev = match row.level.as_str() {
        "trace" | "debug" => 7,
        "info" => 6,
        "warn" => 4,
        "error" => 3,
        "security" => 2,
        _ => 6,
    };
    let pri = 8 + sev; // facility=1 (user-level)
    let ts = rfc3339_ms(row.timestamp);
    // RFC 5424 MSGID: 1-32 printable US-ASCII characters. Built per char, as a
    // byte slice of a non-ASCII event name would panic (fatal under panic=abort).
    let msgid: String = row
        .event
        .chars()
        .map(|c| if c == ' ' { '_' } else { c })
        .filter(char::is_ascii_graphic)
        .take(32)
        .collect();
    let msgid = if msgid.is_empty() {
        "-".to_string()
    } else {
        msgid
    };
    let uid = sd_param_value(row.user_id.as_deref().unwrap_or("-"));
    let tid = sd_param_value(row.task_id.as_deref().unwrap_or("-"));
    // One entry per line: a newline in the message would forge a second record.
    let message = row.message.replace(['\r', '\n'], " ");
    format!(
        "<{pri}>1 {ts} {hostname} secureyeoman - {msgid} [secureyeoman@31337 user=\"{uid}\" taskId=\"{tid}\"] {message}\n"
    )
}

/// Escape an RFC 5424 SD-PARAM value (`"`, `\` and `]` must be backslashed).
fn sd_param_value(v: &str) -> String {
    let mut out = String::with_capacity(v.len());
    for c in v.chars() {
        if matches!(c, '"' | '\\' | ']') {
            out.push('\\');
        }
        if c != '\r' && c != '\n' {
            out.push(c);
        }
    }
    out
}

/// POST /api/v1/audit/export — stream audit entries as JSONL, CSV, or syslog.
///
/// Uses SSE for streaming: each entry is sent as a `data` event, allowing the
/// client to process rows incrementally without buffering the entire export.
async fn export_entries(
    State(state): State<AppState>,
    Json(body): Json<ExportBody>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };

    let fmt = body.format.as_deref().unwrap_or("jsonl");
    if !["jsonl", "csv", "syslog"].contains(&fmt) {
        return (
            StatusCode::BAD_REQUEST,
            Json(
                serde_json::json!({"error": "Invalid format. Must be one of: jsonl, csv, syslog"}),
            ),
        )
            .into_response();
    }

    let limit = body.limit.unwrap_or(100_000);
    let hostname = state.config().host.clone();
    let fmt_owned = fmt.to_string();

    // Fetch entries (capped at limit)
    let rows = match audit::export_entries(pool, body.from, body.to, body.user_id.as_deref(), limit)
        .await
    {
        Ok(rows) => rows,
        Err(e) => return internal_error(e),
    };

    // Build SSE event list: optional CSV header + one event per row
    let mut events: Vec<Result<Event, Infallible>> = Vec::with_capacity(rows.len() + 1);

    if fmt_owned == "csv" {
        events.push(Ok(Event::default().data(CSV_HEADER.trim_end())));
    }

    for row in &rows {
        let line = match fmt_owned.as_str() {
            "csv" => format_csv(row),
            "syslog" => format_syslog(row, &hostname),
            _ => format_jsonl(row),
        };
        events.push(Ok(Event::default().data(line.trim_end())));
    }

    let event_stream = stream::iter(events);

    Sse::new(event_stream)
        .keep_alive(KeepAlive::default())
        .into_response()
}

#[derive(Deserialize)]
struct BackupQuery {
    from: Option<i64>,
    to: Option<i64>,
    limit: Option<i64>,
}

/// GET /api/v1/audit/export — the whole log as a JSON download (TS format:
/// `{ exportedAt, count, entries }`), oldest first, up to 100,000 entries.
async fn export_backup(
    State(state): State<AppState>,
    Query(q): Query<BackupQuery>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    let limit = q.limit.filter(|l| *l >= 1).unwrap_or(100_000).min(100_000);
    let rows = match audit::export_entries(pool, q.from, q.to, None, limit).await {
        Ok(rows) => rows,
        Err(e) => return internal_error(e),
    };
    let now = chrono::Utc::now();
    let body = serde_json::json!({
        "exportedAt": now.to_rfc3339(),
        "count": rows.len(),
        "entries": rows.iter().map(audit::AuditEntryRow::to_wire).collect::<Vec<_>>(),
    });
    let filename = format!("secureyeoman-audit-{}.json", now.format("%Y-%m-%d"));
    (
        [
            (
                axum::http::header::CONTENT_TYPE,
                "application/json".to_string(),
            ),
            (
                axum::http::header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        body.to_string(),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(event: &str, message: &str, user: &str) -> audit::AuditEntryRow {
        audit::AuditEntryRow {
            id: "1".into(),
            correlation_id: None,
            event: event.into(),
            level: "info".into(),
            message: message.into(),
            user_id: Some(user.into()),
            task_id: None,
            metadata: None,
            timestamp: 0,
            integrity_version: String::new(),
            integrity_signature: String::new(),
            integrity_previous_hash: String::new(),
            tenant_id: "default".into(),
            seq: 1,
        }
    }

    #[test]
    fn exports_render_millisecond_timestamps() {
        // 2026-10-01T00:00:00Z in ms; read as seconds it landed in year ~58000.
        let mut r = row("auth.login", "m", "u");
        r.timestamp = 1_790_812_800_000;
        assert!(
            format_csv(&r).contains("2026-10-01T00:00:00"),
            "{}",
            format_csv(&r)
        );
        assert!(format_syslog(&r, "h").contains(" 2026-10-01T00:00:00"));
    }

    #[test]
    fn syslog_msgid_is_ascii_and_capped_even_for_multibyte_events() {
        // 31 ASCII bytes then a multi-byte char straddling byte 32: a byte
        // slice at 32 used to panic here.
        let event = format!("{}é suffix", "a".repeat(31));
        let line = format_syslog(&row(&event, "m", "u"), "h");
        let msgid = line.split(' ').nth(5).unwrap();
        assert_eq!(msgid, format!("{}_", "a".repeat(31)));
    }

    #[test]
    fn syslog_escapes_structured_data_and_keeps_one_line_per_entry() {
        let line = format_syslog(&row("auth.login", "a\nforged", "x\"] y"), "h");
        assert_eq!(line.matches('\n').count(), 1);
        assert!(line.ends_with("a forged\n"));
        assert!(line.contains(r#"user="x\"\] y""#), "{line}");
    }
}
