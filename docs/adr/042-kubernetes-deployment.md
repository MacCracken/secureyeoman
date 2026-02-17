# ADR 042: Kubernetes Deployment

## Status

Accepted

## Date

2026-02-17

## Context

F.R.I.D.A.Y. has a mature Docker foundation (multi-stage Dockerfile, docker-compose with 4 services, Prometheus/Grafana/Loki observability stack). The roadmap lists "Distributed deployment (Kubernetes)" as a future enhancement. As the project moves toward production multi-instance deployments, we need a standardized way to deploy to Kubernetes clusters across cloud providers.

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
- `friday-core`: The gateway + agent engine (port 18789)
- `friday-mcp`: MCP server (port 3001), optional
- `friday-dashboard`: Nginx serving the static SPA with API proxy

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

## References

- Helm chart: `deploy/helm/friday/`
- CI jobs: `.github/workflows/ci.yml` (docker-push, helm-lint)
- Deployment guide: `docs/guides/kubernetes-deployment.md`
