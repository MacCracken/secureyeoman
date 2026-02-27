import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

const sqlRaw: Plugin = {
  name: 'sql-raw',
  transform(code: string, id: string) {
    if (id.endsWith('.sql')) {
      return { code: `export default ${JSON.stringify(code)}`, map: null };
    }
  },
};

const testFiles: string[] = [
  'src/a2a/a2a-routes.test.ts',
  'src/a2a/discovery.test.ts',
  'src/a2a/manager.test.ts',
  'src/a2a/storage.test.ts',
  'src/a2a/transport.test.ts',
  'src/agents/agent-routes.test.ts',
  'src/agents/execution.test.ts',
  'src/agents/manager.test.ts',
  'src/agents/profiles.test.ts',
  'src/agents/storage.test.ts',
  'src/agents/swarm-manager.test.ts',
  'src/agents/swarm-routes.test.ts',
  'src/agents/swarm-storage.test.ts',
  'src/agents/tools.test.ts',
  'src/ai/chat-routes.test.ts',
  'src/ai/client.test.ts',
  'src/ai/context-compactor.test.ts',
  'src/ai/cost-calculator.test.ts',
  'src/ai/cost-optimizer.test.ts',
  'src/ai/embeddings/api-embedding.test.ts',
  'src/ai/embeddings/embeddings.test.ts',
  'src/ai/errors.test.ts',
  'src/ai/model-router.test.ts',
  'src/ai/model-routes.test.ts',
  'src/ai/providers/anthropic.test.ts',
  'src/ai/providers/base.test.ts',
  'src/ai/providers/deepseek.test.ts',
  'src/ai/providers/gemini.test.ts',
  'src/ai/providers/grok.test.ts',
  'src/ai/providers/letta.test.ts',
  'src/ai/providers/lmstudio.test.ts',
  'src/ai/providers/localai.test.ts',
  'src/ai/providers/mistral.test.ts',
  'src/ai/providers/ollama.test.ts',
  'src/ai/providers/openai.test.ts',
  'src/ai/providers/opencode.test.ts',
  'src/ai/response-cache.test.ts',
  'src/ai/retry-manager.test.ts',
  'src/ai/switch-model.test.ts',
  'src/ai/task-loop.test.ts',
  'src/ai/usage-storage.test.ts',
  'src/ai/usage-tracker.test.ts',
  'src/body/actuator/clipboard.test.ts',
  'src/body/actuator/sequence.test.ts',
  'src/body/capture-audit-logger.test.ts',
  'src/body/capture-audit.test.ts',
  'src/body/capture-ipc.test.ts',
  'src/body/capture-permissions.test.ts',
  'src/body/capture-process.test.ts',
  'src/body/capture/windows.test.ts',
];

export default defineConfig({
  plugins: [sqlRaw],
  test: {
    globals: true,
    environment: 'node',
    include: testFiles,
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/index.ts',
        'src/**/index.ts',
        'src/**/types.ts',
      ],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
