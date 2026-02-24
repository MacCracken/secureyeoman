# ADR 125 — Multi-Active Personalities, Default Flag, and Archetype Protection

**Status:** Accepted
**Date:** 2026-02-24

---

## Context

SecureYeoman originally operated with a single exclusive `is_active` flag across all personalities in `soul.personalities`. Only one personality could be active at a time, and that personality served as both the operational agent (receiving heartbeat beats, answering chats) and the dashboard / new-chat default.

This model had three compounding problems:

1. **Single-active bottleneck** — enabling a second personality (e.g., T.Ron for security monitoring alongside FRIDAY for general chat) required deactivating the first. There was no concept of "running multiple personalities concurrently."

2. **Default conflation** — `is_active = true` meant both "this personality is running" and "use this personality for new chats." With multi-active support, these two semantics must be separated.

3. **Preset deletion** — personalities instantiated from built-in presets (FRIDAY, T.Ron) could be deleted by the user, destroying the curated configuration. There was no system-level protection.

---

## Decision

### 1. `is_active` becomes non-exclusive

`is_active` retains its semantic ("this personality's heartbeat and proactive checks run") but loses its exclusivity constraint. Multiple personalities may have `is_active = true` simultaneously. Operations:

- `POST /api/v1/soul/personalities/:id/enable` — sets `is_active = true` for the target without touching other rows.
- `POST /api/v1/soul/personalities/:id/disable` — sets `is_active = false` for the target (unless it is also `is_default`, in which case it remains running).
- `GET /api/v1/soul/personalities` — returns all personalities; `is_active` is per-row, not exclusive.
- New storage methods: `enablePersonality(id)`, `disablePersonality(id)`, `getEnabledPersonalities()`.

The default personality (`is_default = true`) is always treated as active regardless of its `is_active` flag. The dashboard shows a non-interactive power icon for it ("default is always on").

### 2. `is_default` — exclusive flag for the dashboard/new-chat default

A new column `is_default BOOLEAN NOT NULL DEFAULT false` replaces `is_active` as the single-selection flag that governs:

- Which personality is loaded for new chat sessions.
- Which personality is returned by `GET /api/v1/soul/personality` (the "active personality" endpoint).
- Which heartbeat schedule is pushed to `HeartbeatManager.setPersonalitySchedule()`.

`is_default` is exclusive: exactly one personality should have `is_default = true`. The operation that moves the flag is atomic (`UPDATE ... SET is_default = false WHERE is_default = true; UPDATE ... SET is_default = true WHERE id = $1`).

New endpoint:
```
POST /api/v1/soul/personalities/:id/set-default
```
Atomically moves the `is_default` flag and re-pushes the new personality's schedule to `HeartbeatManager`. Response includes the full personality object with the `isWithinActiveHours` computed field.

`getActivePersonality()` in storage and manager now queries `WHERE is_default = true` instead of `WHERE is_active = true`.

The existing `POST /api/v1/soul/personalities/:id/activate` endpoint is preserved for backwards compatibility and is now an alias for `set-default`.

### 3. Archetype protection (`is_archetype`)

A new column `is_archetype BOOLEAN NOT NULL DEFAULT false` flags personalities that were seeded from built-in presets and should not be deleted.

- `createPersonality(data, { isArchetype: true })` — optional second argument added to `SoulStorage.createPersonality()`.
- `SoulManager.deletePersonality()` checks `isArchetype` before any other guard and throws `"Cannot delete a system archetype personality."` if true.
- `SoulStorage.deletePersonality()` has an identical guard as defence-in-depth.
- `seedAvailablePresets()` and `createDefaultPersonality()` both pass `{ isArchetype: true }` so all preset-seeded rows are protected.
- The dashboard delete button is disabled (and tooltip updated) when `isArchetype` is true.

Operator-created personalities are never archetypes regardless of their content.

### 4. `isWithinActiveHours` computed field

A computed boolean is injected by the API route layer on all personality responses. It is **not stored** — it is evaluated at response time via the exported helper `isPersonalityWithinActiveHours(p)` in `soul/manager.ts`.

The helper checks `body.activeHours.enabled` and, if true, tests the current UTC time against the configured `start`/`end` HH:mm window and `daysOfWeek` array. Returns `false` when `activeHours.enabled` is false (i.e., the check is opt-in and defaults to `false`).

Endpoints that include `isWithinActiveHours`:
- `GET /api/v1/soul/personality`
- `GET /api/v1/soul/personalities`
- `POST /api/v1/soul/personalities/:id/activate`
- `POST /api/v1/soul/personalities/:id/set-default`

### 5. Migration

`040_personality_multi_active.sql`:

```sql
ALTER TABLE soul.personalities
  ADD COLUMN IF NOT EXISTS is_default  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archetype BOOLEAN NOT NULL DEFAULT false;

-- Migrate: copy the current active flag to is_default
UPDATE soul.personalities SET is_default = true WHERE is_active = true;
```

No data loss. Existing deployments automatically have their `is_active = true` row promoted to `is_default = true`. The `is_active` column is retained (non-exclusive multi-active use); `is_default` is the new authoritative "dashboard default" signal.

### 6. Dashboard UI

`PersonalityEditor` updated to reflect all new semantics:

- **Card badges**: `Active` (green, `is_active`), `Default` (star + primary, `is_default`), `Online` (pulsing dot, `isWithinActiveHours`), `Preset` (muted, `is_archetype`).
- **Action buttons**: `Star` button to set default (replaces the old `CheckCircle2` activate button); `Power` button to enable/disable (non-interactive when `is_default`).
- **Card highlight**: primary border + ring keyed to `is_default` (was `is_active`).
- **Editor form**: inline "Default personality" toggle replaces the old "Set as active on save" footer checkbox.
- **Delete guard**: disabled when `is_default` or `is_archetype`; tooltip distinguishes both cases.
- New API client functions: `enablePersonality(id)`, `disablePersonality(id)`, `setDefaultPersonality(id)`.
- New `Personality` type fields: `isDefault: boolean`, `isArchetype: boolean`, `isWithinActiveHours?: boolean`.

---

## Consequences

### Positive

- **Concurrent personalities** — T.Ron can monitor and respond proactively while FRIDAY handles the main chat stream. Each runs its own heartbeat on its own schedule.
- **Clear semantic separation** — "which personality is the dashboard default" is now orthogonal to "which personalities are running". Operators can add personalities to the active set without changing the default.
- **Preset safety** — built-in archetypes cannot be accidentally deleted. Users can still create their own copies and delete those freely.
- **Zero-disruption migration** — the `UPDATE ... SET is_default = true WHERE is_active = true` migration means no existing deployment requires manual intervention.

### Negative / Trade-offs

- **HeartbeatManager push model** — `setPersonalitySchedule()` pushes only the default personality's schedule. In a multi-active scenario the heartbeat still runs a single schedule (the default's). A future enhancement could fan-out beats to each enabled personality independently.
- **Backwards-compatible activate endpoint** — `POST .../activate` remaining as an alias for `set-default` prevents a clean break. It will be deprecated in a future release once API consumers migrate.
- **`is_active` column retained** — having both `is_active` (non-exclusive) and `is_default` (exclusive) in the same table is slightly surprising. A future cleanup could rename `is_active` to `is_enabled` to make the distinction clearer.

---

## Alternatives Considered

### Rename `is_active` → `is_default` and drop the separate active concept

Would have been a simpler schema but loses the ability to distinguish "is running" from "is the default". Multi-active requires a per-personality running state.

### Use a separate `active_personalities` join table

Normalised approach — avoids the non-exclusive flag on the main table. Rejected as over-engineered for the current use case; a boolean column on the personality row is simpler to query and sufficient for the expected scale.

### Require the caller to explicitly enable after set-default

`set-default` could return without enabling the personality, leaving `enable` as a separate call. Rejected — the default personality must always be active; requiring two calls creates a window of inconsistency.

---

## Files Changed

| File | Change |
|---|---|
| `packages/core/src/soul/storage.ts` | `enablePersonality()`, `disablePersonality()`, `setDefaultPersonality()`, `getEnabledPersonalities()`; `getActivePersonality()` queries `is_default`; `deletePersonality()` archetype guard; `createPersonality()` accepts `{ isArchetype }` option |
| `packages/core/src/soul/manager.ts` | `enablePersonality()`, `disablePersonality()`, `setDefaultPersonality()`; `deletePersonality()` archetype guard; exported `isPersonalityWithinActiveHours(p)` helper |
| `packages/core/src/soul/soul-routes.ts` | New `POST /:id/enable`, `POST /:id/disable`, `POST /:id/set-default` handlers; `isWithinActiveHours` injected on all personality responses |
| `packages/shared/src/types/soul.ts` | `isDefault`, `isArchetype`, `isWithinActiveHours` added to `PersonalitySchema` |
| `packages/core/src/storage/migrations/040_personality_multi_active.sql` | New migration |
| `packages/core/src/storage/migrations/manifest.ts` | `040_personality_multi_active` added |
| `packages/dashboard/src/components/PersonalityEditor.tsx` | Badge set, action buttons, card highlight, editor toggle, delete guards — all updated |
| `packages/dashboard/src/api/client.ts` | `enablePersonality()`, `disablePersonality()`, `setDefaultPersonality()` |
| `packages/dashboard/src/types.ts` | `isDefault`, `isArchetype`, `isWithinActiveHours` on `Personality` |
