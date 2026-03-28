/**
 * Migration Runner — Applies numbered SQL migrations in order.
 *
 * All migrations (001_community, 002_pro, 003_enterprise) are always
 * applied regardless of tier. The full schema must be present because
 * application code references tables across all tiers during startup
 * (RBAC, risk, telemetry, etc.). Feature gating is handled at the
 * route/API level by `requiresLicense()`, not at the schema level.
 *
 * Tracks applied migrations in a `schema_migrations` table.
 *
 * Existing databases that have legacy migration IDs (from before the
 * tier-split consolidation) are handled by a compatibility shim that
 * marks the current IDs as applied without re-running DDL.
 */

import { getPool } from '../pg-pool.js';
import type { LicenseTier } from '../../licensing/license-manager.js';
import { MIGRATION_MANIFEST } from './manifest.js';

/**
 * Legacy migration IDs that have been superseded by the consolidated
 * tier-split baselines. If any of these are present in schema_migrations,
 * the DB was created with an older schema version. We mark the current
 * IDs as applied so they don't re-run (the old migrations already
 * created all DDL).
 */
const LEGACY_MIGRATION_IDS = [
  // Phase 1 — original monolithic baseline + incrementals
  '001_baseline',
  '002_agent_replay',
  '003_policy_as_code',
  '004_iac',
  '005_chaos_engineering',
  '006_federated_learning',
  '007_pretrain_jobs',
  // Phase 2 — pre-consolidation tier-split incrementals (now folded into baselines)
  '008_ifran',
  '009_security_hardening',
  '010_encrypt_idp_secrets',
  '011_sso_auth_codes',
  '012_voice_profiles',
  '013_break_glass',
  '014_access_review',
  '015_scim',
  '016_tenant_quotas',
  '017_webauthn',
  '018_simulation',
  '019_spatial',
  '020_relationships',
  '021_auto_secrets',
  '022_ifran_bridge',
  '023_edge_fleet',
  // Phase 3 — incrementals now folded into consolidated baselines
  '004_optimistic_locking',
  '005_delegation_self_ref',
];

/** Current consolidated migration IDs. */
const CURRENT_IDS = ['001_community', '002_pro', '003_enterprise'];

export async function runMigrations(_tier: LicenseTier = 'enterprise'): Promise<void> {
  const pool = getPool();

  // Ensure the migrations tracking table exists. CREATE TABLE IF NOT EXISTS is
  // safe under concurrent execution — PostgreSQL serialises it internally.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at BIGINT NOT NULL
    )
  `);

  const migrations = MIGRATION_MANIFEST;
  if (migrations.length === 0) return;

  // Fast-path (no lock needed): if every migration is already recorded,
  // nothing to do.
  const migrationIds = migrations.map((m) => m.id);
  const applied = await pool.query<{ id: string }>(
    'SELECT id FROM schema_migrations WHERE id = ANY($1)',
    [migrationIds]
  );
  if (applied.rows.length === migrationIds.length) {
    return;
  }

  // Acquire a session-level Postgres advisory lock so that only one process
  // runs the per-entry migration loop at a time. This prevents the unique-
  // constraint race condition when multiple pods (e.g. replicaCount: 3) start
  // simultaneously and all pass the fast-path check above before any INSERT
  // has been committed. pg_advisory_lock blocks until the lock is available;
  // it is released automatically when the client is returned to the pool.
  const client = await pool.connect();
  try {
    await client.query(`SELECT pg_advisory_lock(hashtext('secureyeoman_migrations'))`);
    try {
      // Re-check fast-path after acquiring the lock — another pod may have
      // completed migrations while we were waiting.
      const recheck = await client.query<{ id: string }>(
        'SELECT id FROM schema_migrations WHERE id = ANY($1)',
        [migrationIds]
      );
      if (recheck.rows.length === migrationIds.length) {
        return;
      }

      // Legacy compatibility: if old migration IDs exist, mark the current
      // consolidated IDs as applied (the old DDL already covers everything).
      const legacyCheck = await client.query<{ id: string }>(
        `SELECT id FROM schema_migrations WHERE id = ANY($1)`,
        [LEGACY_MIGRATION_IDS]
      );
      if (legacyCheck.rows.length > 0) {
        const now = Date.now();
        for (const currentId of CURRENT_IDS) {
          await client.query(
            `INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
            [currentId, now]
          );
        }
        return;
      }

      for (const { id, sql } of migrations) {
        const existing = await client.query('SELECT id FROM schema_migrations WHERE id = $1', [id]);
        if (existing.rows.length > 0) {
          continue;
        }

        // 5-minute timeout per migration to prevent stuck migrations from blocking other pods
        await client.query('SET statement_timeout = 300000');
        try {
          await client.query(sql);
        } finally {
          await client.query('SET statement_timeout = 0');
        }

        await client.query('INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)', [
          id,
          Date.now(),
        ]);
      }
    } finally {
      await client.query(`SELECT pg_advisory_unlock(hashtext('secureyeoman_migrations'))`);
    }
  } finally {
    client.release();
  }
}
