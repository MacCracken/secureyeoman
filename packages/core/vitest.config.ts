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
 * Standalone serial config — runs ALL core tests in a single pass.
 * Used for:
 *   - Coverage reports: `npx vitest run --coverage` (accurate cross-DB+unit coverage)
 *   - CI safety: guaranteed serial ordering avoids DB race conditions
 *
 * For faster parallel runs use the root workspace: `npx vitest run` from repo root.
 * That splits tests into core:unit (parallel) and core:db (serial) projects.
 */
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
        // Application entry points — require system/integration testing, not unit testing
        'src/secureyeoman.ts',
        'src/cli.ts',
      ],
      thresholds: {
        lines: 88,
        functions: 88,
        branches: 77,
        statements: 88,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
