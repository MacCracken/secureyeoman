import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IfranClient } from './ifran-client.js';
import type { IfranConfig } from './types.js';

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

const config: IfranConfig = {
  apiUrl: 'http://localhost:8420',
  grpcUrl: 'http://localhost:8421',
  enabled: true,
  heartbeatIntervalMs: 10_000,
  connectionTimeoutMs: 5_000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getSentBody(fetchSpy: ReturnType<typeof vi.spyOn>, callIdx = 0): Record<string, unknown> {
  return JSON.parse(fetchSpy.mock.calls[callIdx]![1]?.body as string);
}

describe('IfranClient', () => {
  let client: IfranClient;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new IfranClient(config, createMockLogger());
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ── getStatus ───────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('should transform Ifran hardware status to IfranInstance shape', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          version: '2026.3.18',
          loaded_models: 2,
          registered_backends: ['llamacpp', 'candle'],
          hardware: {
            cpu: {
              model: 'Ryzen 9',
              cores: 16,
              threads: 32,
              memory_total_mb: 64000,
              memory_available_mb: 48000,
            },
            gpus: [
              { index: 0, name: 'RTX 4090', memory_total_mb: 24000, memory_free_mb: 20000 },
              { index: 1, name: 'RTX 4090', memory_total_mb: 24000, memory_free_mb: 22000 },
            ],
          },
          bridge: { enabled: true, client_state: 'Connected', server_state: 'Connected' },
        })
      );

      const result = await client.getStatus();
      expect(result.version).toBe('2026.3.18');
      expect(result.capabilities.gpuCount).toBe(2);
      expect(result.capabilities.totalGpuMemoryMb).toBe(48000);
      expect(result.capabilities.supportedMethods).toEqual(['llamacpp', 'candle']);
      expect(result.status).toBe('connected');
      expect(result.id).toBe('http://localhost:8420');
      expect(result.endpoint).toBe('http://localhost:8420');
      expect(result.lastHeartbeat).toBeGreaterThan(0);
    });

    it('should handle zero GPUs gracefully', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          version: '2026.3.18',
          loaded_models: 0,
          registered_backends: [],
          hardware: { gpus: [] },
          bridge: { enabled: false, client_state: 'disabled', server_state: 'disabled' },
        })
      );

      const result = await client.getStatus();
      expect(result.capabilities.gpuCount).toBe(0);
      expect(result.capabilities.totalGpuMemoryMb).toBe(0);
    });

    it('should handle missing hardware field', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ version: '1.0', loaded_models: 0, registered_backends: [] })
      );

      const result = await client.getStatus();
      expect(result.capabilities.gpuCount).toBe(0);
      expect(result.capabilities.totalGpuMemoryMb).toBe(0);
    });

    it('should throw on non-ok response', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('not found', { status: 404 }));
      await expect(client.getStatus()).rejects.toThrow('returned 404');
    });
  });

  // ── submitTrainingJob ───────────────────────────────────────────────────

  describe('submitTrainingJob', () => {
    it('should send snake_case body with nested dataset and extract job id', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
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
        })
      );

      const result = await client.submitTrainingJob({
        baseModel: 'llama-7b',
        datasetPath: '/data/train.jsonl',
        method: 'lora',
      });

      expect(result.jobId).toBe('sj-1');
      const sent = getSentBody(fetchSpy);
      expect(sent.base_model).toBe('llama-7b');
      expect(sent.dataset).toEqual({ path: '/data/train.jsonl', format: 'jsonl' });
      expect(sent.method).toBe('lora');
      expect(sent.hyperparams).toEqual(
        expect.objectContaining({ learning_rate: 2e-4, epochs: 3, batch_size: 4 })
      );
    });

    it('should map "full" method to "full_fine_tune"', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          id: 'sj-2',
          status: 'Queued',
          current_step: 0,
          total_steps: 0,
          current_epoch: 0,
          current_loss: null,
          progress_percent: 0,
          error: null,
          created_at: null,
          started_at: null,
          completed_at: null,
        })
      );

      await client.submitTrainingJob({
        baseModel: 'model',
        datasetPath: '/data',
        method: 'full',
      });

      expect(getSentBody(fetchSpy).method).toBe('full_fine_tune');
    });

    it('should map "sft" method to "lora"', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          id: 'sj-3',
          status: 'Queued',
          current_step: 0,
          total_steps: 0,
          current_epoch: 0,
          current_loss: null,
          progress_percent: 0,
          error: null,
          created_at: null,
          started_at: null,
          completed_at: null,
        })
      );

      await client.submitTrainingJob({
        baseModel: 'model',
        datasetPath: '/data',
        method: 'sft',
      });

      expect(getSentBody(fetchSpy).method).toBe('lora');
    });

    it('should pass through unknown methods unchanged', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          id: 'sj-4',
          status: 'Queued',
          current_step: 0,
          total_steps: 0,
          current_epoch: 0,
          current_loss: null,
          progress_percent: 0,
          error: null,
          created_at: null,
          started_at: null,
          completed_at: null,
        })
      );

      await client.submitTrainingJob({
        baseModel: 'model',
        datasetPath: '/data',
        method: 'custom_method',
      });

      expect(getSentBody(fetchSpy).method).toBe('custom_method');
    });

    it('should parse configJson with camelCase hyperparams', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          id: 'sj-5',
          status: 'Queued',
          current_step: 0,
          total_steps: 0,
          current_epoch: 0,
          current_loss: null,
          progress_percent: 0,
          error: null,
          created_at: null,
          started_at: null,
          completed_at: null,
        })
      );

      await client.submitTrainingJob({
        baseModel: 'llama',
        datasetPath: '/data',
        method: 'lora',
        configJson: JSON.stringify({
          learningRate: 1e-3,
          batchSize: 8,
          maxSeqLength: 2048,
          outputName: 'my-model',
          maxSteps: 5000,
        }),
      });

      const sent = getSentBody(fetchSpy);
      expect(sent.hyperparams).toEqual(
        expect.objectContaining({
          learning_rate: 1e-3,
          batch_size: 8,
          max_seq_length: 2048,
        })
      );
      expect(sent.output_name).toBe('my-model');
      expect(sent.max_steps).toBe(5000);
    });

    it('should parse configJson with snake_case hyperparams', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          id: 'sj-6',
          status: 'Queued',
          current_step: 0,
          total_steps: 0,
          current_epoch: 0,
          current_loss: null,
          progress_percent: 0,
          error: null,
          created_at: null,
          started_at: null,
          completed_at: null,
        })
      );

      await client.submitTrainingJob({
        baseModel: 'llama',
        datasetPath: '/data',
        method: 'lora',
        configJson: JSON.stringify({
          learning_rate: 5e-4,
          weight_decay: 0.05,
          dataset_format: 'parquet',
          dataset_split: 'train',
          max_samples: 500,
        }),
      });

      const sent = getSentBody(fetchSpy);
      expect(sent.hyperparams).toEqual(
        expect.objectContaining({ learning_rate: 5e-4, weight_decay: 0.05 })
      );
      expect(sent.dataset).toEqual({
        path: '/data',
        format: 'parquet',
        split: 'train',
        max_samples: 500,
      });
    });

    it('should use defaults when configJson is invalid JSON', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          id: 'sj-7',
          status: 'Queued',
          current_step: 0,
          total_steps: 0,
          current_epoch: 0,
          current_loss: null,
          progress_percent: 0,
          error: null,
          created_at: null,
          started_at: null,
          completed_at: null,
        })
      );

      await client.submitTrainingJob({
        baseModel: 'llama',
        datasetPath: '/data',
        method: 'lora',
        configJson: '{not valid json',
      });

      const sent = getSentBody(fetchSpy);
      expect(sent.hyperparams).toEqual(expect.objectContaining({ learning_rate: 2e-4, epochs: 3 }));
    });

    it('should include lora and time_budget_secs from configJson', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          id: 'sj-8',
          status: 'Queued',
          current_step: 0,
          total_steps: 0,
          current_epoch: 0,
          current_loss: null,
          progress_percent: 0,
          error: null,
          created_at: null,
          started_at: null,
          completed_at: null,
        })
      );

      await client.submitTrainingJob({
        baseModel: 'llama',
        datasetPath: '/data',
        method: 'lora',
        configJson: JSON.stringify({
          lora: { rank: 16, alpha: 32 },
          timeBudgetSecs: 3600,
        }),
      });

      const sent = getSentBody(fetchSpy);
      expect(sent.lora).toEqual({ rank: 16, alpha: 32 });
      expect(sent.time_budget_secs).toBe(3600);
    });
  });

  // ── getJobStatus ────────────────────────────────────────────────────────

  describe('getJobStatus', () => {
    it('should transform snake_case response and lowercase status', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
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
        })
      );

      const result = await client.getJobStatus('sj-1');
      expect(result.status).toBe('running');
      expect(result.step).toBe(100);
      expect(result.totalSteps).toBe(1000);
      expect(result.loss).toBe(0.35);
      expect(result.epoch).toBe(1.5);
      expect(result.progressPercent).toBe(10.0);
      expect(result.error).toBeNull();
      expect(result.startedAt).toBe('2026-03-18T00:01:00Z');
      expect(result.completedAt).toBeNull();
    });

    it('should handle completed job with error', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          id: 'sj-fail',
          status: 'Failed',
          current_step: 50,
          total_steps: 1000,
          current_epoch: 0.5,
          current_loss: null,
          progress_percent: 5.0,
          error: 'CUDA out of memory',
          created_at: '2026-03-18T00:00:00Z',
          started_at: '2026-03-18T00:01:00Z',
          completed_at: '2026-03-18T00:02:00Z',
        })
      );

      const result = await client.getJobStatus('sj-fail');
      expect(result.status).toBe('failed');
      expect(result.error).toBe('CUDA out of memory');
      expect(result.loss).toBeNull();
      expect(result.completedAt).toBe('2026-03-18T00:02:00Z');
    });

    it('should handle "Preparing" and "Paused" statuses', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          id: 'sj-prep',
          status: 'Preparing',
          current_step: 0,
          total_steps: 0,
          current_epoch: 0,
          current_loss: null,
          progress_percent: 0,
          error: null,
          created_at: '2026-03-18T00:00:00Z',
          started_at: null,
          completed_at: null,
        })
      );

      const result = await client.getJobStatus('sj-prep');
      expect(result.status).toBe('preparing');
    });

    it('should URL-encode job IDs with special characters', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          id: 'job/with spaces',
          status: 'Queued',
          current_step: 0,
          total_steps: 0,
          current_epoch: 0,
          current_loss: null,
          progress_percent: 0,
          error: null,
          created_at: null,
          started_at: null,
          completed_at: null,
        })
      );

      await client.getJobStatus('job/with spaces');
      expect(fetchSpy.mock.calls[0]![0]).toBe(
        'http://localhost:8420/training/jobs/job%2Fwith%20spaces'
      );
    });
  });

  // ── runInference ────────────────────────────────────────────────────────

  describe('runInference', () => {
    it('should send snake_case and parse usage/finish_reason', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          text: 'Hello world',
          usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
          finish_reason: 'stop',
        })
      );

      const result = await client.runInference({
        model: 'llama-7b',
        prompt: 'Say hello',
        maxTokens: 100,
      });

      expect(result.text).toBe('Hello world');
      expect(result.usage?.promptTokens).toBe(5);
      expect(result.usage?.completionTokens).toBe(10);
      expect(result.usage?.totalTokens).toBe(15);
      expect(result.finishReason).toBe('stop');

      const sent = getSentBody(fetchSpy);
      expect(sent.max_tokens).toBe(100);
      expect(sent.maxTokens).toBeUndefined();
    });

    it('should handle response without usage or finish_reason', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ text: 'Just text' }));

      const result = await client.runInference({
        model: 'test',
        prompt: 'hi',
        maxTokens: 50,
      });

      expect(result.text).toBe('Just text');
      expect(result.usage).toBeUndefined();
      expect(result.finishReason).toBeUndefined();
    });

    it('should send optional params as snake_case', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ text: 'ok' }));

      await client.runInference({
        model: 'llama',
        prompt: 'test',
        maxTokens: 256,
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        systemPrompt: 'Be helpful',
      });

      const sent = getSentBody(fetchSpy);
      expect(sent.temperature).toBe(0.7);
      expect(sent.top_p).toBe(0.9);
      expect(sent.top_k).toBe(40);
      expect(sent.system_prompt).toBe('Be helpful');
      // Verify camelCase variants are NOT sent
      expect(sent.topP).toBeUndefined();
      expect(sent.topK).toBeUndefined();
      expect(sent.systemPrompt).toBeUndefined();
    });

    it('should omit optional params when not provided', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ text: 'ok' }));

      await client.runInference({ model: 'llama', prompt: 'test', maxTokens: 100 });

      const sent = getSentBody(fetchSpy);
      expect(sent).toEqual({ model: 'llama', prompt: 'test', max_tokens: 100 });
    });
  });

  // ── listModels ──────────────────────────────────────────────────────────

  describe('listModels', () => {
    it('should return array directly when response is an array', async () => {
      const models = [{ name: 'llama-7b', loaded: true }];
      fetchSpy.mockResolvedValueOnce(jsonResponse(models));

      const result = await client.listModels();
      expect(result).toEqual(models);
    });

    it('should extract data array from paginated response', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          data: [{ name: 'llama-7b' }, { name: 'mistral-7b' }],
          limit: 50,
          offset: 0,
          total: 2,
        })
      );

      const result = await client.listModels();
      expect(result).toEqual([{ name: 'llama-7b' }, { name: 'mistral-7b' }]);
    });

    it('should handle empty paginated response', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ data: [], limit: 50, offset: 0, total: 0 }));

      const result = await client.listModels();
      expect(result).toEqual([]);
    });
  });

  // ── getModel / deleteModel ──────────────────────────────────────────────

  describe('getModel', () => {
    it('should GET /models/:id', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ name: 'llama-7b', size_bytes: 4e9 }));

      const result = await client.getModel('llama-7b');
      expect(result).toEqual({ name: 'llama-7b', size_bytes: 4e9 });
    });

    it('should URL-encode model IDs with slashes', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ name: 'org/model' }));

      await client.getModel('org/model');
      expect(fetchSpy.mock.calls[0]![0]).toBe('http://localhost:8420/models/org%2Fmodel');
    });
  });

  describe('deleteModel', () => {
    it('should DELETE /models/:id', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({}));

      await client.deleteModel('llama-7b');
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8420/models/llama-7b',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  // ── getJobCheckpoints / getJobMetrics / getGpuTelemetry ─────────────────

  describe('getJobCheckpoints', () => {
    it('should GET /training/jobs/:id/checkpoints', async () => {
      const checkpoints = [
        { step: 100, path: '/ckpt/100' },
        { step: 200, path: '/ckpt/200' },
      ];
      fetchSpy.mockResolvedValueOnce(jsonResponse(checkpoints));

      const result = await client.getJobCheckpoints('sj-1');
      expect(result).toEqual(checkpoints);
      expect(fetchSpy.mock.calls[0]![0]).toBe(
        'http://localhost:8420/training/jobs/sj-1/checkpoints'
      );
    });
  });

  describe('getJobMetrics', () => {
    it('should GET /training/jobs/:id/metrics', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ avg_loss: 0.3, total_steps: 1000 }));

      const result = await client.getJobMetrics('sj-1');
      expect(result).toEqual({ avg_loss: 0.3, total_steps: 1000 });
      expect(fetchSpy.mock.calls[0]![0]).toBe('http://localhost:8420/training/jobs/sj-1/metrics');
    });
  });

  describe('getGpuTelemetry', () => {
    it('should GET /system/gpu/telemetry', async () => {
      const telemetry = { readings: [{ gpu: 0, temp: 65, util: 80 }] };
      fetchSpy.mockResolvedValueOnce(jsonResponse(telemetry));

      const result = await client.getGpuTelemetry();
      expect(result).toEqual(telemetry);
    });
  });

  // ── cancelJob ───────────────────────────────────────────────────────────

  describe('cancelJob', () => {
    it('should POST /training/jobs/:id/cancel', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ cancelled: true }));

      const result = await client.cancelJob('sj-1');
      expect(result).toEqual({ cancelled: true });
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8420/training/jobs/sj-1/cancel',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // ── listJobs ────────────────────────────────────────────────────────────

  describe('listJobs', () => {
    it('should append query params when provided', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse([]));

      await client.listJobs({ status: 'running', limit: '10', offset: '20' });
      expect(fetchSpy.mock.calls[0]![0]).toBe(
        'http://localhost:8420/training/jobs?status=running&limit=10&offset=20'
      );
    });

    it('should omit empty query params', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse([]));

      await client.listJobs({ status: 'completed' });
      expect(fetchSpy.mock.calls[0]![0]).toBe(
        'http://localhost:8420/training/jobs?status=completed'
      );
    });

    it('should work with no params', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse([]));

      await client.listJobs();
      expect(fetchSpy.mock.calls[0]![0]).toBe('http://localhost:8420/training/jobs');
    });
  });

  // ── isHealthy ───────────────────────────────────────────────────────────

  describe('isHealthy', () => {
    it('should return true on 200', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('ok', { status: 200 }));
      expect(await client.isHealthy()).toBe(true);
    });

    it('should return false on connection error', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('connection refused'));
      expect(await client.isHealthy()).toBe(false);
    });

    it('should return false on 500', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('error', { status: 500 }));
      expect(await client.isHealthy()).toBe(false);
    });
  });

  // ── streamJobProgress ───────────────────────────────────────────────────

  describe('streamJobProgress', () => {
    it('should exist as a method (renamed from streamJobLogs)', () => {
      expect(typeof client.streamJobProgress).toBe('function');
      // Verifies old streamJobLogs method no longer exists
      expect((client as Record<string, unknown>).streamJobLogs).toBeUndefined();
    });
  });

  // ── error propagation ───────────────────────────────────────────────────

  describe('error handling', () => {
    it('should include status code and body in error message', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('{"error":"model not found"}', { status: 404 }));

      await expect(client.getModel('nonexistent')).rejects.toThrow(
        'returned 404: {"error":"model not found"}'
      );
    });

    it('should handle response.text() failure gracefully', async () => {
      const badResponse = new Response(null, { status: 500 });
      // Override text() to throw
      vi.spyOn(badResponse, 'text').mockRejectedValueOnce(new Error('body consumed'));
      fetchSpy.mockResolvedValueOnce(badResponse);

      await expect(client.getJobStatus('sj-1')).rejects.toThrow('returned 500');
    });
  });

  // ── trailing slash stripping ────────────────────────────────────────────

  describe('URL construction', () => {
    it('should strip trailing slashes from apiUrl', async () => {
      const trailingSlashClient = new IfranClient(
        { ...config, apiUrl: 'http://localhost:8420///' },
        createMockLogger()
      );
      fetchSpy.mockResolvedValueOnce(jsonResponse({ readings: [] }));

      await trailingSlashClient.getGpuTelemetry();
      expect(fetchSpy.mock.calls[0]![0]).toBe('http://localhost:8420/system/gpu/telemetry');
    });
  });

  // ── SSE streaming ───────────────────────────────────────────────────────

  function sseResponse(lines: string[], status = 200): Response {
    const encoder = new TextEncoder();
    const chunks = lines.map((l) => encoder.encode(l + '\n'));
    let idx = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (idx < chunks.length) {
          controller.enqueue(chunks[idx]!);
          idx++;
        } else {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      status,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  describe('streamJobProgress', () => {
    it('should exist as a method (renamed from streamJobLogs)', () => {
      expect(typeof client.streamJobProgress).toBe('function');
      expect((client as Record<string, unknown>).streamJobLogs).toBeUndefined();
    });

    it('should yield SSE data lines from /stream endpoint', async () => {
      fetchSpy.mockResolvedValueOnce(
        sseResponse([
          'data: {"step":10,"loss":0.5}',
          'data: {"step":20,"loss":0.3}',
          'data: [DONE]',
        ])
      );

      const events: string[] = [];
      for await (const event of client.streamJobProgress('sj-1')) {
        events.push(event);
      }

      expect(events).toEqual(['{"step":10,"loss":0.5}', '{"step":20,"loss":0.3}']);
      expect(fetchSpy.mock.calls[0]![0]).toBe('http://localhost:8420/training/jobs/sj-1/stream');
    });

    it('should handle empty SSE stream', async () => {
      fetchSpy.mockResolvedValueOnce(sseResponse([]));

      const events: string[] = [];
      for await (const event of client.streamJobProgress('sj-1')) {
        events.push(event);
      }
      expect(events).toEqual([]);
    });

    it('should throw on non-ok SSE response', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('bad request', { status: 400 }));

      const gen = client.streamJobProgress('bad-id');
      await expect(gen.next()).rejects.toThrow('returned 400');
    });
  });

  describe('streamInference', () => {
    it('should yield parsed chunks and send snake_case body', async () => {
      fetchSpy.mockResolvedValueOnce(
        sseResponse(['data: {"text":"Hello","done":false}', 'data: {"text":" world","done":true}'])
      );

      const chunks: { text: string; done: boolean }[] = [];
      for await (const chunk of client.streamInference({
        model: 'llama',
        prompt: 'hi',
        maxTokens: 100,
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { text: 'Hello', done: false },
        { text: ' world', done: true },
      ]);

      const sent = getSentBody(fetchSpy);
      expect(sent.max_tokens).toBe(100);
      expect(sent.maxTokens).toBeUndefined();
    });

    it('should skip malformed SSE events without crashing', async () => {
      fetchSpy.mockResolvedValueOnce(
        sseResponse([
          'data: {"text":"ok","done":false}',
          'data: not-valid-json',
          'data: {"text":"after","done":true}',
        ])
      );

      const chunks: { text: string; done: boolean }[] = [];
      for await (const chunk of client.streamInference({
        model: 'llama',
        prompt: 'hi',
        maxTokens: 50,
      })) {
        chunks.push(chunk);
      }

      // Malformed event skipped, other events yielded
      expect(chunks).toEqual([
        { text: 'ok', done: false },
        { text: 'after', done: true },
      ]);
    });
  });

  describe('pullModel', () => {
    it('should yield parsed progress events with snake_case body', async () => {
      fetchSpy.mockResolvedValueOnce(
        sseResponse([
          'data: {"downloaded_bytes":500,"total_bytes":1000,"state":"downloading"}',
          'data: {"downloaded_bytes":1000,"total_bytes":1000,"state":"complete"}',
        ])
      );

      const progress: { downloadedBytes: number; totalBytes: number; state: string }[] = [];
      for await (const p of client.pullModel({
        modelName: 'test-model',
        sourceUrl: 'http://peer:8420/marketplace/download/test-model',
      })) {
        progress.push(p);
      }

      expect(progress).toEqual([
        { downloadedBytes: 500, totalBytes: 1000, state: 'downloading' },
        { downloadedBytes: 1000, totalBytes: 1000, state: 'complete' },
      ]);

      const sent = getSentBody(fetchSpy);
      expect(sent.model_name).toBe('test-model');
      expect(sent.source_url).toBe('http://peer:8420/marketplace/download/test-model');
    });

    it('should skip malformed SSE events', async () => {
      fetchSpy.mockResolvedValueOnce(
        sseResponse([
          'data: bad-json',
          'data: {"downloaded_bytes":100,"total_bytes":100,"state":"complete"}',
        ])
      );

      const progress: { downloadedBytes: number; totalBytes: number; state: string }[] = [];
      for await (const p of client.pullModel({
        modelName: 'test',
        sourceUrl: 'http://peer/dl/test',
      })) {
        progress.push(p);
      }

      expect(progress).toEqual([{ downloadedBytes: 100, totalBytes: 100, state: 'complete' }]);
    });

    it('should include expectedSha256 when provided', async () => {
      fetchSpy.mockResolvedValueOnce(sseResponse([]));

      for await (const _ of client.pullModel({
        modelName: 'model',
        sourceUrl: 'http://peer/dl/model',
        expectedSha256: 'abc123',
      })) {
        // consume
      }

      const sent = getSentBody(fetchSpy);
      expect(sent.expected_sha256).toBe('abc123');
    });
  });

  // ── SSE edge cases ──────────────────────────────────────────────────────

  describe('_streamSSE (via streamJobProgress)', () => {
    it('should ignore non-data SSE lines (comments, events, ids)', async () => {
      fetchSpy.mockResolvedValueOnce(
        sseResponse([': this is a comment', 'event: progress', 'id: 42', 'data: actual-data', ''])
      );

      const events: string[] = [];
      for await (const event of client.streamJobProgress('sj-1')) {
        events.push(event);
      }
      expect(events).toEqual(['actual-data']);
    });

    it('should handle SSE response with no body', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(null, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      );

      const gen = client.streamJobProgress('sj-1');
      await expect(gen.next()).rejects.toThrow('returned no body');
    });

    it('should throw on connection error', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const gen = client.streamJobProgress('sj-1');
      await expect(gen.next()).rejects.toThrow('ECONNREFUSED');
    });
  });
});
