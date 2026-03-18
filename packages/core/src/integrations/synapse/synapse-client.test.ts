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
    it('should GET /system/status', async () => {
      const mockStatus = {
        id: 'syn-1',
        endpoint: 'http://localhost:8420',
        version: '1.0.0',
        capabilities: {
          gpuCount: 2,
          totalGpuMemoryMb: 48000,
          supportedMethods: ['sft'],
          loadedModels: [],
        },
      };
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockStatus), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await client.getStatus();
      expect(result.id).toBe('syn-1');
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
    it('should POST /training/jobs', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ jobId: 'sj-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await client.submitTrainingJob({
        baseModel: 'llama-7b',
        datasetPath: '/data/train.jsonl',
        method: 'sft',
      });

      expect(result.jobId).toBe('sj-1');
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8420/training/jobs',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('getJobStatus', () => {
    it('should GET /training/jobs/:id', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'running', step: 100, loss: 0.5, epoch: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await client.getJobStatus('sj-1');
      expect(result.status).toBe('running');
      expect(result.step).toBe(100);
    });
  });

  describe('runInference', () => {
    it('should POST /inference', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ text: 'Hello world' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await client.runInference({
        model: 'llama-7b',
        prompt: 'Say hello',
        maxTokens: 100,
      });
      expect(result.text).toBe('Hello world');
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
});
