import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/index.ts', 'src/cli.ts'],
      thresholds: {
        lines: 87,
        functions: 87,
        branches: 77,
        statements: 87,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
