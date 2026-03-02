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
 * Globs matching tests that require a real PostgreSQL database.
 * These are excluded from this config and live in vitest.db.config.ts.
 *
 * Keep in sync with vitest.db.config.ts include list.
 */
const DB_TEST_EXCLUDE = [
  // Explicit integration test directory
  'src/__integration__/**',
  // Storage layer — always DB-backed
  'src/**/*-storage.test.ts',
  // Brain module — tests that use real DB (setupTestDb/initPool)
  'src/brain/brain.test.ts',
  'src/brain/debug2.test.ts',
  'src/brain/document-manager.test.ts',
  'src/brain/notebook-context.test.ts',
  // Domain manager tests with real DB
  'src/soul/soul.test.ts',
  'src/spirit/spirit.test.ts',
  'src/workspace/workspace.test.ts',
  'src/mcp/mcp.test.ts',
  'src/dashboard/dashboard.test.ts',
  'src/experiment/experiment.test.ts',
  'src/comms/comms.test.ts',
  'src/marketplace/marketplace.test.ts',
  'src/config/system-preferences.test.ts',
  // Gateway DB tests
  'src/gateway/auth-middleware.test.ts',
  'src/gateway/oauth-token.test.ts',
  // AI module with DB usage
  'src/ai/usage-history.test.ts',
  // Integration module DB tests
  'src/integrations/webhook-transform.test.ts',
  'src/integrations/outbound-webhook.test.ts',
  'src/integrations/integrations.test.ts',
  // Security DB tests not covered by *-storage pattern
  'src/security/auth.test.ts',
  'src/security/rotation/rotation.test.ts',
  // Storage / migration tests that use initPool directly
  'src/storage/migrations/runner.test.ts',
  // Process-level integration tests (spawn full server, require running Postgres)
  'src/startup-time.test.ts',
  'src/memory-baseline.test.ts',
];

export default defineConfig({
  plugins: [sqlRaw],
  test: {
    name: 'core:unit',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: DB_TEST_EXCLUDE,
    testTimeout: 30000,
    hookTimeout: 30000,
    // Unit tests have no shared state — run files in parallel
    fileParallelism: true,
    pool: 'forks',
    // Leave maxForks unset — Vitest defaults to available CPU count
  },
});
