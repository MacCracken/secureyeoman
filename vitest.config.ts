import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ['source', 'development'],
  },
  test: {
    globals: true,
    projects: [
      // shared — type-level unit tests, parallel
      'packages/shared/vitest.config.ts',
      // core:unit — ~370 pure unit tests, run in parallel across all CPU cores
      'packages/core/vitest.unit.config.ts',
      // core:db — ~38 DB integration tests, serial (shared PostgreSQL test DB)
      'packages/core/vitest.db.config.ts',
      // dashboard — jsdom tests, parallel (each project runs concurrently)
      'packages/dashboard/vitest.config.ts',
      // mcp — node tests, parallel
      'packages/mcp/vitest.config.ts',
      // core:e2e — real HTTP + real DB, serial
      'packages/core/vitest.e2e.config.ts',
    ],
  },
});
