import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

/** Vite plugin: treat .sql files as raw text exports (mirrors Bun's `with { type: 'text' }`). */
const sqlRaw: Plugin = {
  name: 'sql-raw',
  transform(code, id) {
    if (id.endsWith('.sql')) {
      return { code: `export default ${JSON.stringify(code)}`, map: null };
    }
  },
};

/**
 * DB integration tests — ordered for balanced `--shard` distribution.
 *
 * Files are arranged in snake order by measured duration so that vitest
 * `--shard=N/8` produces roughly equal wall-clock time per shard.
 * Each shard runs serially against its own test database.
 *
 * Keep in sync with DB_TEST_EXCLUDE in vitest.unit.config.ts.
 *
 * Duration tiers (measured 2026-03-11, 4-shard parallel on tuned PG):
 *   Heavy  (>200s): soul, brain, spirit, auth-middleware, marketplace
 *   Medium (90-200s): integrations, auth, rotation, rbac-storage, sqlite-storage,
 *                     mcp, auth-storage, sso-storage, webhook-transform, workspace, comms
 *   Light  (<90s): document-manager, notebook-context, oauth-token, task-storage,
 *                  outbound-webhook, conversation-storage, gateway-api, usage-history,
 *                  alert-storage, soul.integration, audit-trail, system-preferences,
 *                  runner, auth-flow, workspace-rbac, multi-user, experiment,
 *                  dashboard, workflow-storage, strategy-storage, sandbox, backup, tenants
 *
 * Rebalance periodically by running: scripts/test-db-parallel.sh
 * and checking per-shard Duration lines.
 */
const DB_TESTS = [
  // ── Snake-ordered for 8-shard balance ──────────────────────────
  // Heavy monoliths split: soul→2, brain→2, spirit→2, marketplace→3, auth-middleware→2.
  // Durations estimated from pre-split measurements (2026-03-11).
  //
  // Row 1 (→): shards 1,2,3,4,5,6,7,8
  'src/soul/soul-db-manager.test.ts', //     ~310s → shard 1
  'src/brain/brain-db-manager.test.ts', //   ~280s → shard 2
  'src/spirit/spirit-db-manager.test.ts', // ~190s → shard 3
  'src/integrations/integrations.test.ts', // 182s → shard 4
  'src/security/auth.test.ts', //             163s → shard 5
  'src/security/rotation/rotation.test.ts', // 159s → shard 6
  'src/soul/soul-db-storage.test.ts', //     ~156s → shard 7
  'src/brain/brain-db-storage.test.ts', //   ~136s → shard 8
  // Row 2 (←): shards 8,7,6,5,4,3,2,1
  'src/gateway/auth-middleware-db-rbac.test.ts', // ~132s → shard 8
  'src/security/rbac-storage.test.ts', //     127s → shard 7
  'src/gateway/auth-middleware-db-authn.test.ts', // ~120s → shard 6
  'src/logging/sqlite-storage.test.ts', //    120s → shard 5
  'src/mcp/mcp.test.ts', //                  113s → shard 4
  'src/security/auth-storage.test.ts', //     104s → shard 3
  'src/integrations/webhook-transform.test.ts', // 98s → shard 2
  'src/spirit/spirit-db-storage.test.ts', //  ~96s → shard 1
  // Row 3 (→): shards 1,2,3,4,5,6,7,8
  'src/security/sso-storage.test.ts', //       98s → shard 1
  'src/workspace/workspace.test.ts', //        94s → shard 2
  'src/comms/comms.test.ts', //                92s → shard 3
  'src/marketplace/marketplace-db-community.test.ts', // ~88s → shard 4
  'src/brain/document-manager.test.ts', //     84s → shard 5
  'src/brain/notebook-context.test.ts', //     81s → shard 6
  'src/gateway/oauth-token.test.ts', //        77s → shard 7
  'src/task/task-storage.test.ts', //          73s → shard 8
  // Row 4 (←): shards 8,7,6,5,4,3,2,1
  'src/marketplace/marketplace-db-manager.test.ts', // ~70s → shard 8
  'src/integrations/outbound-webhook.test.ts', // 67s → shard 7
  'src/chat/conversation-storage.test.ts', //  65s → shard 6
  'src/__integration__/gateway-api.integration.test.ts', // 62s → shard 5
  'src/ai/usage-history.test.ts', //           62s → shard 4
  'src/marketplace/marketplace-db-storage.test.ts', // ~50s → shard 3
  'src/telemetry/alert-storage.test.ts', //    49s → shard 2
  'src/__integration__/soul.integration.test.ts', // 46s → shard 1
  // Row 5 (→): shards 1,2,3,4,5,6,7,8
  'src/__integration__/audit-trail.integration.test.ts', // 41s → shard 1
  'src/config/system-preferences.test.ts', //  41s → shard 2
  'src/storage/migrations/runner.test.ts', //  30s → shard 3
  'src/__integration__/auth-flow.integration.test.ts', // 30s → shard 4
  'src/__integration__/workspace-rbac.integration.test.ts', // 30s → shard 5
  'src/__integration__/multi-user.integration.test.ts', // 25s → shard 6
  'src/experiment/experiment.test.ts', //       20s → shard 7
  'src/dashboard/dashboard.test.ts', //        20s → shard 8
  // Row 6 (←): shards 8,7,6,5,4,3,2,1 (light tail)
  'src/workflow/workflow-storage.test.ts', //    5s → shard 8
  'src/soul/strategy-storage.test.ts', //     <1s → shard 7
  'src/__integration__/sandbox.integration.test.ts', // <1s → shard 6
  'src/backup/backup-storage.test.ts', //     <1s → shard 5
  'src/tenants/tenant-storage.test.ts', //    <1s → shard 4
  'src/brain/debug2.test.ts', //              <1s → shard 3
  // ── Process-level benchmarks (excluded from sharded runs) ──────
  // These spawn full server via tsx — slow, flaky under parallel load.
  // Run separately: npx vitest run src/startup-time.test.ts src/memory-baseline.test.ts
  // 'src/startup-time.test.ts',
  // 'src/memory-baseline.test.ts',
];

// Expected shard totals (snake order, post-split estimates):
// Shard 1: 310 + 96 + 98 + 46 + 41       = 591s
// Shard 2: 280 + 98 + 94 + 49 + 41       = 562s
// Shard 3: 190 + 104 + 92 + 50 + 30 + <1 = 466s
// Shard 4: 182 + 113 + 88 + 62 + 30 + <1 = 475s
// Shard 5: 163 + 120 + 84 + 62 + 30 + <1 = 459s
// Shard 6: 159 + 120 + 81 + 65 + 25 + <1 = 450s
// Shard 7: 156 + 127 + 77 + 67 + 20 + <1 = 447s
// Shard 8: 136 + 132 + 73 + 70 + 20 +  5 = 436s

export default defineConfig({
  plugins: [sqlRaw],
  resolve: {
    conditions: ['source', 'development'],
  },
  test: {
    name: 'core:db',
    globals: true,
    environment: 'node',
    include: DB_TESTS,
    env: {
      SECUREYEOMAN_TOKEN_SECRET: 'test-token-secret-for-db-tests',
    },
    testTimeout: 60000,
    hookTimeout: 60000,
    // Each shard runs its files serially against its own test database.
    // Use --shard=N/8 with separate TEST_DB_NAME per shard.
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    isolate: false,
    sequence: { groupOrder: 1 },
  },
});
