# ADR 091 — Per-Personality Active Hours

**Status:** Accepted
**Date:** 2026-02-21

---

## Context

The HeartbeatManager runs checks on a configurable interval (default 30 s) around the clock, regardless of which personality is active or what schedule that personality's operator wants to enforce. There is no way to say "this personality should be at rest outside business hours" — it keeps firing system-health checks, log-anomaly scans, and proactive triggers at 3 AM just as it does at noon.

Personalities already have a `body` JSONB field that carries per-personality configuration. The existing `HeartbeatCheck.schedule` structure allows per-check day-of-week and active-hours gating, but it operates at the check level and is defined globally in system config — not editable per personality in the UI.

Phase 33 requires a personality-level schedule gate that:

1. Is stored per-personality (zero migration cost — JSONB field).
2. Is configurable by the operator through the PersonalityEditor UI.
3. Suppresses the entire heartbeat for the active personality when outside the window.

---

## Decision

### Schema

Add `PersonalityActiveHoursSchema` to `packages/shared/src/types/soul.ts` and include it as `activeHours` in `BodyConfigSchema`. Fields: `enabled` (default false), `start`/`end` (HH:mm UTC), `daysOfWeek` (mon–sun array, default Mon–Fri), `timezone` (informational string, enforcement is UTC).

The `enabled: false` default means existing personalities are unaffected; the gate is opt-in.

### Enforcement point

The gate lives in `HeartbeatManager.beat()` as the very first check, before per-check scheduling. When `isWithinPersonalityActiveHours()` returns false, `beat()` returns immediately with `{ checks: [] }` — no checks run, no memory is recorded, no audit entry is written.

This is the correct enforcement level: it mirrors the intent ("the body is at rest"), avoids per-check changes, and keeps the hot path synchronous (no async calls in the gate).

### Push pattern

HeartbeatManager is a single instance with no knowledge of personalities. Rather than polling the database on each beat, the active personality's schedule is **pushed** into HeartbeatManager via `setPersonalitySchedule()`:

- At startup: `secureyeoman.ts` seeds the active personality's schedule immediately after `heartbeatManager.start()` (non-blocking async).
- On activate: the `POST /api/v1/soul/personalities/:id/activate` handler pushes the new active personality's schedule.
- On update: the `PUT /api/v1/soul/personalities/:id` handler checks whether the updated personality is currently active and, if so, pushes the updated schedule.

`SoulRoutesOptions` gains an optional `heartbeatManager` field so the routes can remain tested independently without a heartbeat instance.

### UI

A new "Active Hours — Brain Schedule" CollapsibleSection is added inside `BodySection` in `PersonalityEditor.tsx`. It includes an enable toggle, time-picker inputs (type="time") for start/end, day-of-week toggle buttons, and a timezone select with 8 common options. The section is collapsed by default.

---

## Consequences

### Positive

- **Zero-config default** — `enabled: false` means no behaviour change for existing deployments.
- **Simple push model** — `setPersonalitySchedule()` is a synchronous setter; no async work in `beat()`.
- **No per-check changes** — All existing check logic is untouched.
- **Testable in isolation** — The gate method and the route wiring each have independent unit tests.

### Negative

- **Up to one beat may fire late into a rest window** — The heartbeat polls every 30 s (configurable). A schedule change takes effect on the next call to `beat()`, so up to one beat can fire after the rest window begins.
- **UTC-only enforcement** — The `timezone` field is stored and displayed but enforcement currently uses UTC arithmetic (matching the existing `shouldRunAccordingToSchedule` implementation). A future ADR can add proper tz conversion via `Temporal` or `date-fns-tz`.
- **Single active personality** — The push model assumes one active personality at a time, which matches the current architecture. Swarm or multi-active scenarios would require a different approach.

---

## Alternatives Considered

### Pull callback on each beat

HeartbeatManager could accept a `getSchedule: () => Promise<PersonalityActiveHours>` callback and call it inside `beat()`. Rejected: introduces an async call in the hot path every 30 s and requires the beat loop to handle callback errors.

### Per-check schedule override

Extend each `HeartbeatCheck.schedule` with a personality-level override. Rejected: requires UI per check, is complex to reason about, and doesn't match the "body is at rest" semantic — the intent is to suppress all checks, not to tweak individual schedules.

### Cron string

Accept a cron expression (e.g. `"0 9-17 * * 1-5"`) instead of start/end/daysOfWeek. Rejected: requires a cron parser dependency, harder to expose in a simple UI, and overkill for the use case. The existing `HeartbeatCheck.schedule` pattern (start/end HH:mm + daysOfWeek) is already established.
