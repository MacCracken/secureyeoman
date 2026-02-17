# ADR 013: Per-Task Heartbeat Scheduling & Knowledge CRUD

## Status

Accepted

## Context

The heartbeat system ran all checks on a single global interval (`intervalMs`). This meant every check — from lightweight system health pings to expensive memory maintenance — ran at the same frequency. As we added a new `reflective_task` type (where SecureYeoman periodically records self-improvement prompts as episodic memories), the need for per-task scheduling became clear: reflection should run every 30 minutes, not every 60 seconds.

Separately, the Brain's knowledge base only supported "teach" (create) operations from the dashboard. Users had no way to edit content, adjust confidence, or delete entries. The 4 base knowledge entries (self-identity, hierarchy, purpose, interaction) needed special protection as "PRIMARY" entries.

## Decision

### 1. Per-Task Heartbeat Scheduling

Each `HeartbeatCheck` now supports an optional `intervalMs` field. The scheduler (tick interval) checks which tasks are due based on their individual `lastRunAt` timestamps, falling back to the top-level `intervalMs` for checks without a per-task interval.

Default task intervals:
- `system_health`: 5 minutes (300,000ms)
- `memory_status`: 10 minutes (600,000ms)
- `log_anomalies`: 5 minutes (300,000ms)
- `self_reflection`: 30 minutes (1,800,000ms) — new `reflective_task` type

The tick interval (how often the scheduler runs) defaults to 30 seconds.

### 2. Reflective Task Type

New `reflective_task` check type added to `HeartbeatCheckTypeSchema`. The handler extracts a `prompt` from the check's `config` and records it as an episodic memory. This enables SecureYeoman's self-improvement loop.

### 3. Task Management API

- `updateTask(name, data)` mutates a check's `intervalMs`, `enabled`, or `config` in place
- `getStatus()` now includes a `tasks` array with `lastRunAt` per task
- New routes: `GET /api/v1/brain/heartbeat/tasks` and `PUT /api/v1/brain/heartbeat/tasks/:name`

### 4. Knowledge CRUD

- `PUT /api/v1/brain/knowledge/:id` — update content and/or confidence
- `DELETE /api/v1/brain/knowledge/:id` — delete an entry
- Dashboard shows PRIMARY badge for base knowledge topics with extra delete warnings

### 5. External Brain Sync UI

The existing `ExternalBrainSync` infrastructure (already in `brain-routes.ts`) is now surfaced in the PersonalityEditor's Brain section, showing sync status and a "Sync Now" button when configured.

### 6. Dashboard Heartbeat Visibility

The dashboard Overview page displays heartbeat status as a stat card showing:
- **Beat count** as the primary value
- **Enabled/total tasks** as a subtitle
- **Running/Stopped** status indicator (color-coded green/red)
- Clicking the card navigates to Security > Tasks with the Heartbeat Tasks section auto-expanded (`/security?tab=tasks&heartbeat=1`)

A `HeartbeatStatus` type was added to the dashboard types (`packages/dashboard/src/types.ts`) and a `fetchHeartbeatStatus` API client function fetches `GET /api/v1/brain/heartbeat/status`.

## Consequences

- Heartbeat checks run at appropriate frequencies instead of a one-size-fits-all interval
- Beats with no due tasks are no-ops (no memory/audit recording)
- The Heart prompt now includes a "Task schedule" section showing frequency and last run per task
- Heartbeat status is visible at a glance from the dashboard overview
- Knowledge entries are fully editable from the dashboard with appropriate safeguards for primary entries
- External brain sync is visible in the UI without any backend changes
- The PersonalityEditor personality list uses a responsive 2-column grid when not in edit mode
