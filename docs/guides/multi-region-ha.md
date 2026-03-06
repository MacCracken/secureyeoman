# Multi-Region & High Availability Guide

SecureYeoman supports multi-region deployments with read replicas, cross-cluster federation, backup replication, and enhanced health checks.

## Read Replica Routing

Route read-only queries to PostgreSQL read replicas for horizontal scaling.

### Configuration

```yaml
# config.yaml
core:
  database:
    host: primary-db.example.com
    port: 5432
    readReplicas:
      - host: replica-1.example.com
      - host: replica-2.example.com
        port: 5433
    replicaPoolSize: 5
    maxReplicationLagMs: 10000
```

### How It Works

- Write operations always go to the primary.
- Read-only queries (brain search, audit reads, dashboard stats) can use `getReadPool()` which round-robins across configured replicas.
- Falls back to primary automatically when no replicas are configured.
- Health checks monitor replication lag and alert when it exceeds `maxReplicationLagMs`.

## Active-Passive Failover

SecureYeoman supports PostgreSQL streaming replication with automatic promotion.

### Patroni Setup

```yaml
# Helm values for standby cluster
postgresql:
  replication:
    enabled: true
    mode: streaming
    patroni:
      enabled: true
      failoverTimeout: 30
```

### pg_auto_failover

```bash
# Primary
pg_autoctl create monitor --pgdata /var/lib/postgresql/monitor
pg_autoctl create postgres --pgdata /var/lib/postgresql/primary --monitor postgres://monitor/pg_auto_failover

# Standby
pg_autoctl create postgres --pgdata /var/lib/postgresql/standby --monitor postgres://monitor/pg_auto_failover
```

When the primary fails, pg_auto_failover automatically promotes the standby. Update `DATABASE_HOST` to point to the virtual IP or use a connection pooler like PgBouncer.

## Cross-Cluster A2A Federation

Enable agents in one cluster to discover and delegate to agents in another cluster.

### Configuration

```yaml
a2a:
  enabled: true
  federation:
    enabled: true
    clusterId: us-east-1-prod
    region: us-east-1
    remoteClusters:
      - clusterId: eu-west-1-prod
        region: eu-west-1
        url: https://sy-eu.example.com
        secretEnv: FEDERATION_EU_SECRET
    allowContentReplication: false  # metadata only (default)
```

### Data Residency

By default, only task metadata (agent ID, task summary, status) crosses cluster boundaries. Conversation content stays local. Set `allowContentReplication: true` only if your compliance requirements allow it.

### Federation API

```bash
# List known peer clusters
GET /api/v1/federation/peers

# Probe all remote clusters
POST /api/v1/federation/peers/probe

# Discover remote agents
GET /api/v1/federation/agents

# Delegate to remote agent
POST /api/v1/federation/delegate
{
  "targetClusterId": "eu-west-1-prod",
  "agentId": "agent-uuid",
  "taskSummary": "Analyze GDPR compliance"
}
```

## Backup Replication

Ship PostgreSQL backups to remote storage for disaster recovery.

### Configuration

```yaml
backupReplication:
  enabled: true
  provider: s3          # s3, azure, gcs, or local
  bucket: my-backups
  prefix: secureyeoman-backups/
  accessKeyEnv: BACKUP_ACCESS_KEY
  secretKeyEnv: BACKUP_SECRET_KEY
  region: us-east-1
  schedule: "0 2 * * *"  # Daily at 2 AM
  retentionCount: 30
```

### Supported Providers

| Provider | Tool Required | Auth |
|----------|--------------|------|
| `s3` | `aws` CLI | `BACKUP_ACCESS_KEY` / `BACKUP_SECRET_KEY` env vars |
| `azure` | `az` CLI | `BACKUP_ACCESS_KEY` env var (account key) |
| `gcs` | `gsutil` | Application Default Credentials |
| `local` | None | Copies to `bucket` path on filesystem |

### Manual Backup Trigger

```bash
# Via existing backup API
POST /api/v1/admin/backups
{ "label": "pre-migration-backup" }
```

## Enhanced Health Checks

The `/health/deep` endpoint now includes HA-specific checks.

### Response Example

```json
{
  "status": "ok",
  "version": "2026.3.6",
  "uptime": 86400000,
  "components": {
    "database": { "ok": true, "detail": "3ms" },
    "auditChain": { "ok": true, "detail": "initialized" },
    "auth": { "ok": true, "detail": "active" },
    "websocket": { "ok": true, "detail": "12 client(s) connected" },
    "intent": { "ok": true, "detail": "active" },
    "replicationLag": { "ok": true, "detail": "250ms lag, 1024 bytes behind" },
    "vectorStore": { "ok": true, "detail": "pgvector operational" },
    "certExpiry": { "ok": true, "detail": "Certificate valid for 89 day(s)" },
    "readReplicas": { "ok": true, "detail": "2 read replica pool(s) active" },
    "integrations": { "ok": true, "detail": "5 active adapter(s)" }
  }
}
```

### Kubernetes Readiness Probe

```yaml
readinessProbe:
  httpGet:
    path: /health/ready
    port: 18789
  initialDelaySeconds: 10
  periodSeconds: 15

livenessProbe:
  httpGet:
    path: /health/live
    port: 18789
  initialDelaySeconds: 5
  periodSeconds: 10
```

For detailed diagnostics, use `/health/deep` with an ops monitoring tool.

## Helm Values for Standby Cluster

```yaml
# deploy/helm/secureyeoman/values-standby.yaml
replicaCount: 2

postgresql:
  primary:
    host: primary-db.region-a.example.com
  readReplicas:
    - host: replica-1.region-a.example.com
    - host: replica-2.region-b.example.com

federation:
  enabled: true
  clusterId: region-b-standby
  region: region-b

backupReplication:
  enabled: true
  provider: s3
  bucket: secureyeoman-backups-region-b
  region: region-b
```
