import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'shared',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
  },
});
