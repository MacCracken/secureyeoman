import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

const sqlRaw: Plugin = {
  name: 'sql-raw',
  transform(code, id) {
    if (id.endsWith('.sql')) {
      return { code: `export default ${JSON.stringify(code)}`, map: null };
    }
  },
};

export default defineConfig({
  plugins: [sqlRaw],
  resolve: {
    conditions: ['source'],
  },
  test: {
    name: 'core:e2e',
    globals: true,
    environment: 'node',
    include: ['src/__e2e__/**/*.e2e.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    // E2E tests share a real server + DB — run serially
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
  },
});
