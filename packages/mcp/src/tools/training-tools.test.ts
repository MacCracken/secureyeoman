/**
 * Training Tools — unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTrainingTools } from './training-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ items: [] }),
    post: vi.fn().mockResolvedValue({ id: 'job-1' }),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as CoreApiClient;
}

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: {
      validate: () => ({ valid: true, blocked: false, warnings: [], injectionScore: 0 }),
    },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

describe('training-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all 14 training tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerTrainingTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers expected tool names in globalToolRegistry', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTrainingTools(server, mockClient(), noopMiddleware());

    const { globalToolRegistry } = await import('./tool-utils.js');
    const expectedTools = [
      'training_start_dpo',
      'training_start_rlhf',
      'training_hyperparam_search',
      'training_list_checkpoints',
      'training_resume_from_checkpoint',
      'ai_batch_inference',
      'ai_batch_status',
      'ai_cache_stats',
      'ai_warmup_model',
      'training_dataset_refresh',
      'training_drift_check',
      'training_drift_baseline',
      'training_online_update',
    ];

    for (const name of expectedTools) {
      expect(globalToolRegistry.has(name), `${name} should be registered`).toBe(true);
    }
  });

  describe('training_start_dpo', () => {
    it('calls POST /api/v1/training/finetune/jobs with dpo method', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTrainingTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('training_start_dpo')!;
      await handler({
        name: 'dpo-job',
        baseModel: 'llama3',
        adapterName: 'adapter-1',
        datasetPath: '/data/prefs.jsonl',
      });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/training/finetune/jobs',
        expect.objectContaining({ trainingMethod: 'dpo', name: 'dpo-job' })
      );
    });
  });

  describe('training_start_rlhf', () => {
    it('calls POST /api/v1/training/finetune/jobs with rlhf method', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTrainingTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('training_start_rlhf')!;
      await handler({
        name: 'rlhf-job',
        baseModel: 'llama3',
        adapterName: 'adapter-2',
        datasetPath: '/data/train.jsonl',
        rewardModelPath: '/models/reward',
      });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/training/finetune/jobs',
        expect.objectContaining({ trainingMethod: 'rlhf' })
      );
    });
  });

  describe('training_list_checkpoints', () => {
    it('calls GET /api/v1/training/finetune/jobs/:jobId/checkpoints', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTrainingTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('training_list_checkpoints')!;
      await handler({ jobId: 'job-123' });

      expect(client.get).toHaveBeenCalledWith(
        '/api/v1/training/finetune/jobs/job-123/checkpoints',
        undefined
      );
    });
  });

  describe('training_resume_from_checkpoint', () => {
    it('calls POST with checkpoint path', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTrainingTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('training_resume_from_checkpoint')!;
      await handler({ jobId: 'job-1', checkpointPath: '/ckpt/step-100' });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/training/finetune/jobs/job-1/resume',
        { checkpointPath: '/ckpt/step-100' }
      );
    });
  });

  describe('ai_cache_stats', () => {
    it('calls GET /api/v1/ai/cache/stats', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTrainingTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('ai_cache_stats')!;
      await handler({});

      expect(client.get).toHaveBeenCalledWith('/api/v1/ai/cache/stats', undefined);
    });
  });

  describe('ai_warmup_model', () => {
    it('calls POST /api/v1/ai/warmup', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTrainingTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('ai_warmup_model')!;
      await handler({ model: 'llama3:8b', systemPrompt: 'You are helpful.' });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/ai/warmup',
        expect.objectContaining({ model: 'llama3:8b' })
      );
    });
  });

  describe('training_dataset_refresh', () => {
    it('calls POST with curationRules appended', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTrainingTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('training_dataset_refresh')!;
      await handler({ name: 'refresh-1' });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/training/dataset-refresh/jobs',
        expect.objectContaining({ name: 'refresh-1', curationRules: {} })
      );
    });
  });

  describe('training_drift_check', () => {
    it('calls POST /api/v1/training/drift/check', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTrainingTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('training_drift_check')!;
      await handler({});

      expect(client.post).toHaveBeenCalledWith('/api/v1/training/drift/check', {});
    });
  });

  describe('training_drift_baseline', () => {
    it('calls POST /api/v1/training/drift/baselines', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTrainingTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('training_drift_baseline')!;
      await handler({ personalityId: 'p-1', threshold: 0.2 });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/training/drift/baselines',
        expect.objectContaining({ personalityId: 'p-1' })
      );
    });
  });

  describe('training_online_update', () => {
    it('calls POST /api/v1/training/online-updates', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTrainingTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('training_online_update')!;
      await handler({ personalityId: 'p-1', adapterName: 'online-adapter' });

      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/training/online-updates',
        expect.objectContaining({ personalityId: 'p-1', adapterName: 'online-adapter' })
      );
    });
  });
});
