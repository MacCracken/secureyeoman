# ADR 079: Heartbeat Execution Log

**Date**: 2026-02-20
**Status**: Accepted

---

## Context

The `HeartbeatManager` performs periodic self-checks (system health, memory status, log
anomalies, integration health, reflective tasks) and emits results only to the pino logger
and the audit chain. There was no persistent record of:

- What status a check returned on any given run
- How long a check took to execute
- Whether a check has been repeatedly failing or degrading
- The last-result status to surface in the dashboard

Agent personalities reported the inability to audit past heartbeat runs as a recurring pain
point when diagnosing health issues.

---

## Decision

### 1. Migration 028 — `proactive.heartbeat_log`

A new table in the `proactive` schema stores one row per check execution:

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | uuidv7 |
| `check_name` | TEXT NOT NULL | matches the heartbeat check name |
| `personality_id` | TEXT | nullable; reserved for future personality-scoped checks |
| `ran_at` | BIGINT NOT NULL | epoch ms when the check started |
| `status` | TEXT NOT NULL | `ok` / `warning` / `error` |
| `message` | TEXT NOT NULL | human-readable result message |
| `duration_ms` | INTEGER NOT NULL | wall-clock time for this check |
| `error_detail` | TEXT | error stack on thrown errors; null otherwise |

Indexes on `check_name`, `ran_at DESC`, and `status` for efficient filtered queries.

### 2. `HeartbeatLogStorage`

New class at `packages/core/src/body/heartbeat-log-storage.ts` extending `PgBaseStorage`:

- `persist(entry)` — inserts one row; returns the entry with generated id
- `list(filter)` — returns `{ entries, total }` with optional `checkName`, `status`,
  `limit` (max 200, default 20), and `offset` filters; ordered by `ran_at DESC`

### 3. `HeartbeatManager` persistence

`HeartbeatManager` gains an optional `logStorage?: HeartbeatLogStorage` sixth constructor
parameter (backward-compatible; existing callers unchanged). In `beat()`, each check is timed
individually with a `checkStart` timestamp. After `runCheck()` resolves or throws, a row is
persisted via `logStorage.persist()`. Thrown errors set `status: 'error'` and capture the
stack in `errorDetail`. Log persistence failures are caught, warned, and never propagate.

`SecureYeoman` creates a `HeartbeatLogStorage` instance when heartbeat is enabled, threads it
into `HeartbeatManager`, and exposes it via `getHeartbeatLogStorage()` for use by routes.

### 4. `GET /api/v1/proactive/heartbeat/log`

New route added to `proactive-routes.ts`. Query params: `checkName`, `status`, `limit`,
`offset`. Backed by `HeartbeatLogStorage.list()`. Returns 503 when log storage is unavailable
(heartbeat disabled). Mapped to `{ resource: 'proactive', action: 'read' }` in
`ROUTE_PERMISSIONS` — accessible to operators, viewers, auditors, and admins.

### 5. Dashboard: `HeartbeatTaskRow` status badge and history panel

`HeartbeatTaskRow` in `TaskHistory.tsx` is updated:

- The status cell now shows a clickable button that toggles an expandable history panel.
- When log data has loaded, the button displays the last-result status badge
  (`ok` → green, `warning` → amber/yellow, `error` → red) instead of the Active/Disabled
  indicator.
- Clicking expands an inline `<table>` of the 10 most recent log entries for that check,
  showing status, "ran at" time, duration, and message.
- Data is lazy-fetched via `useQuery` with `enabled: expanded` — no network call until the
  user expands the row.
- Falls back to Active/Disabled display when no log data exists yet (first boot, newly
  enabled check).

---

## Consequences

- **Positive**: Every check execution is now auditable. Operators can see exactly what a check
  returned and how long it took on each cycle.
- **Positive**: The dashboard surfaces health trends per check — a run of `warning` badges is
  immediately visible without digging through pino logs.
- **Positive**: Fully backward-compatible — existing `HeartbeatManager` callers pass no
  `logStorage` argument and continue to work without changes.
- **Neutral**: `personality_id` is stored as `null` for all current checks. The column is
  reserved for a future phase when checks may be personality-scoped.
- **Neutral**: Log rows accumulate indefinitely — no automatic pruning. A future migration
  may add a TTL-based cleanup job if the table grows large.
- **Risk mitigated**: Log persistence failures are non-fatal (warn + continue), so a database
  outage cannot bring down the heartbeat system itself.
