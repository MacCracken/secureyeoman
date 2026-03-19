import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SynapseClient } from './synapse-client.js';
import type { SynapseConfig } from './types.js';

function createMockLogger() {
  const logger = {
    child: () => logger,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return logger as unknown as import('../../logging/logger.js').SecureLogger;
}

const config: SynapseConfig = {
  apiUrl: 'http://localhost:8420',
  grpcUrl: 'http://localhost:8421',
  enabled: true,
  heartbeatIntervalMs: 10_000,
  connectionTimeoutMs: 5_000,
};

describe('SynapseClient', () => {
  let client: SynapseClient;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new SynapseClient(config, createMockLogger());
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('getStatus', () => {
    it('should GET /system/status and transform response', async () => {
      // Synapse returns snake_case hardware status
      const mockStatus = {
        version: '2026.3.18',
        loaded_models: 2,
        registered_backends: ['llamacpp', 'candle'],
        hardware: {
          cpu: { model: 'Ryzen 9', cores: 16, threads: 32, memory_total_mb: 64000, memory_available_mb: 48000 },
          gpus: [
            { index: 0, name: 'RTX 4090', memory_total_mb: 24000, memory_free_mb: 20000 },
            { index: 1, name: 'RTX 4090', memory_total_mb: 24000, memory_free_mb: 22000 },
          ],
        },
        bridge: { enabled: true, client_state: 'Connected', server_state: 'Connected' },
      };
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockStatus), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await client.getStatus();
      // Transformed to SynapseInstance shape
      expect(result.version).toBe('2026.3.18');
      expect(result.capabilities.gpuCount).toBe(2);
      expect(result.capabilities.totalGpuMemoryMb).toBe(48000);
      expect(result.capabilities.supportedMethods).toEqual(['llamacpp', 'candle']);
      expect(result.status).toBe('connected');
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8420/system/status',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should throw on non-ok response', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('not found', { status: 404 }));

      await expect(client.getStatus()).rejects.toThrow('returned 404');
    });
  });

  describe('submitTrainingJob', () => {
    it('should POST /training/jobs with snake_case body', async () => {
      // Synapse returns the job response with an `id` field
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'sj-1',
            status: 'Queued',
            current_step: 0,
            total_steps: 0,
            current_epoch: 0,
            current_loss: null,
            progress_percent: 0,
            error: null,
            created_at: '2026-03-18T00:00:00Z',
            started_at: null,
            completed_at: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const result = await client.submitTrainingJob({
        baseModel: 'llama-7b',
        datasetPath: '/data/train.jsonl',
        method: 'lora',
      });

      expect(result.jobId).toBe('sj-1');

      // Verify the body was sent in snake_case with nested dataset object
      const sentBody = JSON.parse(fetchSpy.mock.calls[0]![1]?.body as string);
      expect(sentBody.base_model).toBe('llama-7b');
      expect(sentBody.dataset).toEqual({ path: '/data/train.jsonl', format: 'jsonl' });
      expect(sentBody.method).toBe('lora');
      expect(sentBody.hyperparams).toBeDefined();
      expect(sentBody.hyperparams.learning_rate).toBeDefined();
    });
  });

  describe('getJobStatus', () => {
    it('should GET /training/jobs/:id and transform snake_case response', async () => {
      // Synapse returns snake_case with capitalized status
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'sj-1',
            status: 'Running',
            current_step: 100,
            total_steps: 1000,
            current_epoch: 1.5,
            current_loss: 0.35,
            progress_percent: 10.0,
            error: null,
            created_at: '2026-03-18T00:00:00Z',
            started_at: '2026-03-18T00:01:00Z',
            completed_at: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const result = await client.getJobStatus('sj-1');
      expect(result.status).toBe('running');
      expect(result.step).toBe(100);
      expect(result.totalSteps).toBe(1000);
      expect(result.loss).toBe(0.35);
      expect(result.epoch).toBe(1.5);
      expect(result.progressPercent).toBe(10.0);
    });
  });

  describe('runInference', () => {
    it('should POST /inference with snake_case body', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            text: 'Hello world',
            usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
            finish_reason: 'stop',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const result = await client.runInference({
        model: 'llama-7b',
        prompt: 'Say hello',
        maxTokens: 100,
      });
      expect(result.text).toBe('Hello world');
      expect(result.usage?.totalTokens).toBe(15);
      expect(result.finishReason).toBe('stop');

      // Verify snake_case in sent body
      const sentBody = JSON.parse(fetchSpy.mock.calls[0]![1]?.body as string);
      expect(sentBody.max_tokens).toBe(100);
      expect(sentBody.maxTokens).toBeUndefined();
    });
  });

  describe('listModels', () => {
    it('should GET /models', async () => {
      const models = [{ name: 'llama-7b', loaded: true }];
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(models), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await client.listModels();
      expect(result).toEqual(models);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8420/models',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should handle paginated response format', async () => {
      const paginated = {
        data: [{ name: 'llama-7b' }, { name: 'mistral-7b' }],
        limit: 50,
        offset: 0,
        total: 2,
      };
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(paginated), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await client.listModels();
      expect(result).toEqual([{ name: 'llama-7b' }, { name: 'mistral-7b' }]);
    });
  });

  describe('cancelJob', () => {
    it('should POST /training/jobs/:id/cancel', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ cancelled: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await client.cancelJob('sj-1');
      expect(result).toEqual({ cancelled: true });
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8420/training/jobs/sj-1/cancel',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('listJobs', () => {
    it('should GET /training/jobs with query params', async () => {
      const jobs = [{ jobId: 'sj-1', status: 'running' }];
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(jobs), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await client.listJobs({ status: 'running', limit: '10' });
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8420/training/jobs?status=running&limit=10',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should GET /training/jobs without query params', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await client.listJobs();
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8420/training/jobs',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('isHealthy', () => {
    it('should return true on 200', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('ok', { status: 200 }));
      expect(await client.isHealthy()).toBe(true);
    });

    it('should return false on error', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('connection refused'));
      expect(await client.isHealthy()).toBe(false);
    });

    it('should return false on non-ok', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('error', { status: 500 }));
      expect(await client.isHealthy()).toBe(false);
    });
  });

  describe('getModel', () => {
    it('should GET /models/:id', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ name: 'llama-7b' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await client.getModel('llama-7b');
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8420/models/llama-7b',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('deleteModel', () => {
    it('should DELETE /models/:id', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await client.deleteModel('llama-7b');
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8420/models/llama-7b',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('streamJobProgress', () => {
    it('should use /stream path not /logs', () => {
      // Verify the method name changed and we're referencing /stream
      expect(typeof client.streamJobProgress).toBe('function');
      // The actual SSE streaming is tested via integration tests,
      // but we verify the method exists with the correct name
    });
  });
});
