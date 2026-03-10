# ADR 031: License-Gated Database Schema

**Status**: Accepted
**Date**: 2026-03-07

## Context

The current `001_baseline.sql` creates all tables for all tiers (community, pro, enterprise) on every install. A community user gets DLP tables, chaos engineering schemas, federated learning tables, and dozens of other enterprise-only structures they will never use. This wastes resources, exposes unnecessary attack surface, and conflates the product tiers at the data layer.

The `is_archetype` column incident (a field added to `soul.personalities` that served no real purpose and blocked legitimate user actions) highlighted the need for tighter schema discipline. Dead columns and unused tables accumulate when everything ships in a single monolithic migration.

## Decision

Split the migration baseline into three tier-aligned files and make the migration runner license-aware.

### Schema Tiers

**001_community.sql** — Core platform. Ships to every install.
- `public.conversations`, `public.messages`, `public.settings`
- `soul.*` (personalities, agent config)
- `brain.*` (basic memory, embeddings, stats)
- `marketplace.*` (skills catalog, installs)

**002_pro.sql** — Applied when a Pro or Enterprise license is detected.
- `workflow.*` (engine, definitions, executions)
- `analytics.*` (usage, cost tracking)
- `brain.cognitive_*` (advanced memory, learning)
- `rbac.*` (roles, permissions, conditions)
- `prompt_versioning.*`
- `agent_eval.*`
- `guardrails.*`

**003_enterprise.sql** — Applied when an Enterprise license is detected.
- `dlp.*` (classification, scanning, retention)
- `tee.*` (confidential compute attestation)
- `federated.*` (federated learning sessions)
- `chaos.*` (experiments, results)
- `supply_chain.*` (SBOM, compliance)
- `otel.*` (telemetry, SIEM integration)
- `policy_as_code.*`
- `iac.*` (infrastructure-as-code)
- `agent_replay.*`
- `training.pretrain_jobs`

### Migration Runner Behaviour

1. On startup, `MigrationManager` reads the current license tier from `LicenseManager`.
2. It applies all baselines up to and including the active tier (community always, pro if pro+, enterprise if enterprise).
3. Incremental migrations (011+) carry a `-- tier: community|pro|enterprise` header. The runner skips any migration above the active tier.
4. On license upgrade (detected at startup or runtime), unapplied tier baselines and incremental migrations are applied automatically.
5. On license downgrade or expiry, **no tables are dropped**. Data is preserved. Feature routes return 402 via the existing `requiresLicense()` guard. Tables become dormant until the license is restored.

### Incremental Migration Convention

```sql
-- tier: pro
-- description: Add workflow execution metrics table
ALTER TABLE workflow.executions ADD COLUMN metrics jsonb DEFAULT '{}';
```

## Consequences

- Community installs are leaner and faster to bootstrap.
- Schema matches what the user is licensed for — no phantom tables.
- License upgrades are seamless (auto-migration on detection).
- Downgrades are safe (data preserved, features gated at the API layer).
- Developers must classify new migrations by tier at creation time.
- Existing single-baseline installs need a one-time migration to the split format (handled by a compatibility shim in the runner).
