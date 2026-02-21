# ADR 042: Kubernetes Deployment

## Status

Accepted

## Date

2026-02-17

## Context

SecureYeoman has a mature Docker foundation (multi-stage Dockerfile, docker-compose with 4 services, Prometheus/Grafana/Loki observability stack). The roadmap lists "Distributed deployment (Kubernetes)" as a future enhancement. As the project moves toward production multi-instance deployments, we need a standardized way to deploy to Kubernetes clusters across cloud providers.

### Requirements

- Production-grade deployment with health checks, autoscaling, and disruption budgets
- Cloud-agnostic: must work on EKS, GKE, and AKS without modification
- Managed database support (external PostgreSQL — RDS, Cloud SQL, Azure Database)
- Secure by default: non-root containers, network policies, secrets management
- CI/CD integration: automated image builds and chart validation

## Decision

### Helm Chart (over Kustomize or raw manifests)

We chose Helm for packaging because:
- **Templating**: Values files per environment (dev/staging/production) with a single chart
- **Lifecycle management**: `helm install/upgrade/rollback` with atomic upgrades
- **Ecosystem**: Broad adoption, extensive documentation, `helm test` for validation
- **Repository support**: Can be published to OCI registries alongside container images

### GHCR Image Registry

GitHub Container Registry (GHCR) because:
- Already using GitHub for source and CI/CD
- Free for public packages, integrated with GitHub Actions
- OCI-compliant, supports multi-arch images

### Three Separate Deployments

Instead of a single deployment with sidecars:
- `secureyeoman-core`: The gateway + agent engine (port 18789)
- `secureyeoman-mcp`: MCP server (port 3001), optional
- `secureyeoman-dashboard`: Nginx serving the static SPA with API proxy

This allows independent scaling (core is CPU-intensive, dashboard is lightweight) and independent deployment (dashboard can be updated without restarting core).

### Managed External Database

PostgreSQL runs outside Kubernetes (RDS, Cloud SQL, Azure Database) because:
- Stateful workloads on K8s add operational complexity
- Managed databases provide automated backups, failover, and patching
- Connection pooling (PgBouncer) can be added as a sidecar if needed

## Alternatives Considered

| Alternative | Reason for Rejection |
|------------|---------------------|
| Kustomize | Less powerful templating; harder to manage 3 environments |
| Raw manifests | No templating, no lifecycle management |
| Helm + Operator | Overkill for current scale; can add later |
| StatefulSet for PostgreSQL | Operational complexity; managed DB is simpler |
| Single deployment with sidecars | Can't scale components independently |

## Consequences

### Positive
- Standardized deployment across all major cloud providers
- Environment-specific configuration via values files
- Automated scaling and self-healing via HPA and PDB
- Security hardening built into templates
- CI validates chart on every push

### Negative
- Helm is an additional tool to learn and maintain
- Chart must be kept in sync with application changes
- Network policies may need tuning for specific cloud providers

## Phase 25 Corrections (2026-02-20)

### Migration Race Condition — `replicaCount: 3`, No Init Container (FIXED)

Discovered during the Phase 24/25 cold-start audit: `values-production.yaml` sets
`core.replicaCount: 3` (and HPA `minReplicas: 3`), but the original Helm chart had no
migration init container or Postgres advisory lock. On a first deploy — or any deploy that
introduces new migrations — all three core pods start simultaneously and each calls
`runMigrations()`.

The runner's fast-path returns immediately if the latest manifest ID is already in
`schema_migrations`. But on first boot all three pods race through the per-entry loop in
parallel. Each migration is `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`, so
the DDL itself is safe, but the `INSERT INTO schema_migrations` record step is not — two pods
can both pass the `SELECT id ... WHERE id = $1` check before either inserts, then both attempt
the `INSERT`, and the second one fails with a unique-constraint violation on the primary key.

**Status**: Fixed. Two complementary safeguards implemented:

1. **Pre-install/pre-upgrade Job hook** (`templates/migrate-job.yaml`, weight -5) — A Helm
   hook Job that runs `secureyeoman migrate` before the Deployment rolls out. The Job runs on
   a single pod, applies all migrations, exits 0, and the Deployment only starts after it
   completes. This is the primary migration serialisation mechanism.

2. **Postgres advisory lock** (`runner.ts`) — `pg_advisory_lock(hashtext('secureyeoman_migrations'))`
   wraps the per-entry migration loop so that, even if multiple pods call `runMigrations()`
   simultaneously (e.g., when the hook is disabled), only one runs at a time. The others wait,
   then perform a double-check fast-path and return immediately. The lock is released via
   `pg_advisory_unlock` in the `finally` block.

Both fixes were verified in a kind cluster: all 30 migrations applied cleanly, core pod
reached `Running` + `/health` returned `{"status":"ok","checks":{"database":true,"auditChain":true}}`,
and a rolling restart confirmed the fast-path (no migration SQL executed on second boot).

### Additional Chart Bugs Fixed

- **`migrate.ts` wrong config path** — `initPoolFromConfig(config.database)` should be
  `initPoolFromConfig(config.core.database)`. The database config is nested under `core` in
  the `ConfigSchema`. This caused `TypeError: undefined is not an object (evaluating 'dbConfig.passwordEnv')`
  on every migrate Job attempt.

- **Missing required secrets in `secret.yaml`** — `SECUREYEOMAN_SIGNING_KEY`, `SECUREYEOMAN_TOKEN_SECRET`,
  `SECUREYEOMAN_ENCRYPTION_KEY`, `SECUREYEOMAN_ADMIN_PASSWORD` were absent. Core pods failed
  to start with `Missing required secrets`. Added to `secret.yaml` and `values.yaml`.

- **Missing `SECUREYEOMAN_LOG_FORMAT` in `configmap.yaml`** — Without this, the core pod used
  the default `pretty` format which uses pino transport worker threads that fail in the lean
  binary Docker image. Fixed by adding `SECUREYEOMAN_LOG_FORMAT: "json"` to the ConfigMap.

- **`migrate-secret.yaml` hook-only secret** — A new pre-install hook Secret (weight -10,
  before the migrate Job at weight -5) provides `POSTGRES_PASSWORD` and other required secrets
  to the migration Job. This is needed because the main `secret.yaml` resource is a regular
  chart resource (not a hook) and does not exist when pre-install hooks run.

- **`migrate-job.yaml` ServiceAccount** — The app ServiceAccount is a regular chart resource
  not yet created at pre-install hook time. Changed `serviceAccountName` to `default`.

- **`migrate-job.yaml` ConfigMap ref** — The ConfigMap is also a regular resource not yet
  created at pre-install time. Replaced `configMapRef` with inline `env` for DB host/port/name/user.

## References

- Helm chart: `deploy/helm/secureyeoman/`
- CI jobs: `.github/workflows/ci.yml` (docker-push, helm-lint)
- Deployment guide: `docs/guides/kubernetes-deployment.md`
