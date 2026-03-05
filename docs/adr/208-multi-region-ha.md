# ADR 208: Multi-Region & High Availability

**Status**: Accepted
**Date**: 2026-03-05
**Phase**: 137

## Context

SecureYeoman's Kubernetes support is single-cluster. Enterprise deployments need multi-region failover, read scaling, cross-cluster agent federation, and automated backup shipping. The goal is to support active-passive database failover, distribute read load to replicas, enable agents to delegate across clusters while respecting data residency, and automate backup shipping to cloud storage.

## Decisions

### Read Replica Routing

- `pg-pool.ts` extended with `initReplicaPools()`, `getReadPool()`, `hasReadReplicas()`, `getReplicaCount()`.
- Round-robin selection across replica pools. Falls back to primary when no replicas are configured.
- Config: `DatabaseConfigSchema.readReplicas` array, `replicaPoolSize`, `maxReplicationLagMs`.
- Storage classes that perform read-only queries can use `getReadPool()` for horizontal read scaling.

### Cross-Cluster A2A Federation

- `A2AConfigSchema.federation` sub-object: `clusterId`, `region`, `remoteClusters[]`, `allowContentReplication`.
- Existing `FederationManager` (Phase 79) already handles peer discovery, health probes, knowledge search, marketplace sync, and personality bundles.
- Phase 137 adds `federation.delegations` table for cross-cluster task delegation tracking.
- Data residency enforced: `metadataOnly` flag on delegations. Conversation content stays local unless `allowContentReplication` is explicitly enabled.

### Backup Replication

- `BackupReplicationConfigSchema` in `InfraConfigSchema`: provider (s3/azure/gcs/local), bucket, prefix, schedule, retentionCount.
- `BackupReplicationManager`: Ships pg_dump output to configured provider. Local provider uses filesystem copy. Cloud providers use CLI tools (aws/az/gsutil).
- Existing `BackupManager` (Phase 61) handles local pg_dump/pg_restore. `BackupReplicationManager` adds the remote shipping layer.
- Retention enforcement: local provider prunes oldest files beyond `retentionCount`.

### Enhanced Health Checks

- `ha-health-checks.ts` module with 4 check functions:
  - `checkReplicationLag()`: Queries `pg_last_xact_replay_timestamp()` on read replicas. Alerts when lag exceeds `maxReplicationLagMs`.
  - `checkVectorStore()`: Verifies pgvector extension is installed and operational.
  - `checkCertExpiry()`: Reads TLS certificate, computes days until expiry. Warns at 30d, fails at 7d.
  - `checkReadReplicas()`: Reports active replica pool count.
- `/health/deep` endpoint dynamically imports and runs HA checks.
- Integration adapter status also added to `/health/deep`.

### Migration 007

- `federation.delegations` table for cross-cluster delegation tracking.
- `admin.backup_replications` table for remote backup shipping records.
- Conditional column additions to `federation.peers` for cross-cluster fields.

## Consequences

- Read-heavy operations (brain search, audit reads, dashboard stats) can be routed to replicas for horizontal scaling.
- Cross-cluster agent delegation enables global deployments while respecting data residency requirements.
- Automated backup shipping provides disaster recovery beyond single-cluster.
- Enhanced health checks enable Kubernetes readiness probes to consider all critical subsystems.
- Cloud provider CLIs (aws, az, gsutil) must be available in the container for cloud backup shipping.
