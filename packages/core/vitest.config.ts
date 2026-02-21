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

export default defineConfig({
  plugins: [sqlRaw],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/example.ts',
        'src/index.ts',
        // Barrel re-export files — no logic to test
        'src/**/index.ts',
        // Pure TypeScript type definitions — no runtime code
        'src/**/types.ts',
      ],
      thresholds: {
        lines: 87,
        functions: 87,
        branches: 77,
        statements: 87,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
