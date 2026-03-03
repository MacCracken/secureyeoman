# ADR 187: Workflow & Personality Versioning (Phase 114)

**Status**: Accepted
**Date**: 2026-03-03
**Phase**: 114

---

## Context

Personality configurations and workflow definitions are mutable records updated in place.
This creates several operational problems:

1. **No audit trail** -- When a personality system prompt or workflow step is modified,
   the previous state is lost. There is no way to determine what changed, when, or by
   whom.
2. **Destructive updates** -- A bad edit to a production personality or workflow cannot
   be rolled back without a database backup or manual reconstruction.
3. **Drift detection gap** -- In team environments, there is no mechanism to detect
   whether a personality or workflow has been modified since its last known-good state
   (analogous to uncommitted changes in a VCS).
4. **No diffing** -- Comparing two states of a configuration requires external tooling
   or manual side-by-side inspection.

---

## Decision

### 1. Immutable Snapshots

Every save operation creates a new immutable version record rather than updating in
place. Version records store:

- `version_number` (monotonically increasing integer per entity)
- `snapshot` (full JSON serialization of the entity at that point in time)
- `created_by` (user or system identifier)
- `created_at` timestamp
- `message` (optional human-readable change description)

The current/active state remains in the original table for query performance. The
version history table serves as an append-only audit log.

### 2. Date-Based Tags

Users can tag a version with a date-based label following the `YYYY.M.D` convention
(matching the project's existing CHANGELOG format). Tags mark known-good states and
serve as named rollback targets. A version may have zero or one tag.

### 3. Unified Diff via LCS Algorithm

A dependency-free diff implementation using the Longest Common Subsequence (LCS)
algorithm in `diff-utils.ts`. Produces unified-diff-style output comparing any two
version snapshots. The same utility is reused by personality distillation (ADR 189)
and other features needing text comparison.

### 4. Drift Detection

Drift detection compares the current live state of an entity against its last tagged
version. If differences exist, the entity is flagged as "drifted". The dashboard
surfaces drift as a badge on personality and workflow cards, prompting users to either
tag the current state or roll back.

### 5. Rollback

Rolling back to a previous version:

1. Reads the snapshot from the target version record
2. Writes it as the current state of the entity
3. Creates a new version record documenting the rollback (with a message like
   "Rolled back to version N")

This preserves the full history -- rollbacks are visible in the version timeline.

### 6. Storage Separation

Personality versioning and workflow versioning use separate storage and manager classes
to maintain domain boundaries:

- `personality-version-storage.ts` / `personality-version-manager.ts`
- `workflow-version-storage.ts` / `workflow-version-manager.ts`

Both follow the same patterns but operate on their respective tables and entity types.

---

## Consequences

### Positive

- Full audit trail for every configuration change, supporting compliance and debugging.
- Drift badges surface uncommitted or unreviewed changes before they cause incidents.
- Rollback provides a safety net for bad edits without requiring database-level recovery.
- Unified diff enables meaningful comparison between any two points in history.
- Date-based tags align with the project's existing versioning conventions.

### Negative / Trade-offs

- Storage cost increases over time as snapshots accumulate. A future retention policy
  or compaction strategy may be needed for long-lived high-churn entities.
- The LCS diff algorithm operates on serialized text, not structured JSON. Semantically
  equivalent but differently ordered JSON objects will show as changed.
- No automatic tagging -- users must explicitly tag versions as known-good states.

---

## Key Files

| File | Purpose |
|------|---------|
| `personality-version-storage.ts` | DB access for personality version history |
| `personality-version-manager.ts` | Business logic: create version, tag, rollback, drift check |
| `workflow-version-storage.ts` | DB access for workflow version history |
| `workflow-version-manager.ts` | Business logic: create version, tag, rollback, drift check |
| `diff-utils.ts` | LCS-based unified diff (shared utility, no dependencies) |
| `versioning.ts` (shared) | Zod schemas and TypeScript types for versioning |
