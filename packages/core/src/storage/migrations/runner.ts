/**
 * Migration Runner — Applies numbered SQL migrations in order.
 *
 * All baseline migrations (001_community, 002_pro, 003_enterprise) are
 * always applied regardless of tier. The full schema must be present
 * because application code references tables across all tiers during
 * startup (RBAC, risk, telemetry, etc.). Feature gating is handled at
 * the route/API level by `requiresLicense()`, not at the schema level.
 *
 * Incremental migrations (011+) are tier-filtered: they only run if the
 * active license tier permits them.
 *
 * Tracks applied migrations in a `schema_migrations` table.
 *
 * Existing databases that have the old monolithic migration IDs
 * (001_baseline, 002_agent_replay, etc.) are handled by a compatibility
 * shim that marks the new tier-split IDs as applied.
 */

import { getPool } from '../pg-pool.js';
import type { LicenseTier } from '../../licensing/license-manager.js';
import { MIGRATION_MANIFEST, type MigrationEntry } from './manifest.js';

/** Tier hierarchy: community < pro < enterprise */
const TIER_RANK: Record<LicenseTier, number> = {
  community: 0,
  pro: 1,
  enterprise: 2,
};

/**
 * Old monolithic migration IDs that have been superseded by the tier split.
 * If any of these are present in schema_migrations, the DB was created
 * with the old schema. We mark the new tier-split IDs as applied so they
 * don't re-run (the old baseline already contains all DDL).
 */
const LEGACY_MIGRATION_IDS = [
  '001_baseline',
  '002_agent_replay',
  '003_policy_as_code',
  '004_iac',
  '005_chaos_engineering',
  '006_federated_learning',
  '007_pretrain_jobs',
];

/** New tier-split IDs that replace the legacy ones. */
const TIER_SPLIT_IDS = ['001_community', '002_pro', '003_enterprise'];

/**
 * IDs of baseline migrations that must always run regardless of tier.
 * The full schema must be present for the application to start — tier
 * gating is handled at the feature/route level via requiresLicense().
 */
const ALWAYS_RUN_IDS = new Set(TIER_SPLIT_IDS);

/**
 * Filter manifest entries to those that should run for the given tier.
 *
 * Baseline migrations (001_community, 002_pro, 003_enterprise) always
 * run. Incremental migrations (011+) are tier-filtered.
 */
function filterByTier(migrations: MigrationEntry[], tier: LicenseTier): MigrationEntry[] {
  const maxRank = TIER_RANK[tier];
  return migrations.filter((m) => ALWAYS_RUN_IDS.has(m.id) || TIER_RANK[m.tier] <= maxRank);
}

export async function runMigrations(tier: LicenseTier = 'enterprise'): Promise<void> {
  const pool = getPool();

  // Ensure the migrations tracking table exists. CREATE TABLE IF NOT EXISTS is
  // safe under concurrent execution — PostgreSQL serialises it internally.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at BIGINT NOT NULL
    )
  `);

  const migrations = filterByTier(MIGRATION_MANIFEST, tier);
  if (migrations.length === 0) return;

  // Fast-path (no lock needed): if the latest filtered entry is already the
  // latest recorded migration in our filtered set, all applicable migrations
  // have been applied.
  const latestId = migrations[migrations.length - 1]!.id;
  const latest = await pool.query<{ id: string }>(
    'SELECT id FROM schema_migrations WHERE id = $1',
    [latestId]
  );
  if (latest.rows.length > 0) {
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
        'SELECT id FROM schema_migrations WHERE id = $1',
        [latestId]
      );
      if (recheck.rows.length > 0) {
        return;
      }

      // Legacy compatibility: if old monolithic migrations exist, mark
      // the new tier-split IDs as applied (the old baseline already contains
      // all DDL from all tiers).
      const legacyCheck = await client.query<{ id: string }>(
        `SELECT id FROM schema_migrations WHERE id = ANY($1)`,
        [LEGACY_MIGRATION_IDS]
      );
      if (legacyCheck.rows.length > 0) {
        const now = Date.now();
        for (const splitId of TIER_SPLIT_IDS) {
          await client.query(
            `INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
            [splitId, now]
          );
        }
        // Also apply any incremental migrations (011+) that aren't yet applied
        const incrementals = migrations.filter((m) => !TIER_SPLIT_IDS.includes(m.id));
        for (const { id, sql } of incrementals) {
          const existing = await client.query('SELECT id FROM schema_migrations WHERE id = $1', [
            id,
          ]);
          if (existing.rows.length > 0) continue;

          await client.query('SET statement_timeout = 300000');
          try {
            await client.query(sql);
          } finally {
            await client.query('SET statement_timeout = 0');
          }
          await client.query('INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)', [
            id,
            now,
          ]);
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
