import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    projects: [
      'packages/core/vitest.config.ts',
      'packages/dashboard/vitest.config.ts',
    ],
  },
});
