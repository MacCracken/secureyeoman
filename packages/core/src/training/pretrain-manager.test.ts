import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PretrainManager } from './pretrain-manager.js';
import type { PretrainingConfig } from '@secureyeoman/shared';

const mockQuery = vi.fn();
const mockPool = { query: mockQuery } as any;

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
}

function makeConfig(overrides: Partial<PretrainingConfig> = {}): PretrainingConfig {
  return {
    enabled: true,
    maxConcurrentJobs: 2,
    maxModelParams: '3B',
    defaultImage: 'ghcr.io/secureyeoman/pretrain-runner:latest',
    corpusDir: '/data/corpus',
    outputDir: '/data/models',
    maxCorpusSizeGb: 50,
    checkpointRetentionDays: 30,
    ...overrides,
  };
}

function makeJobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pt-abc', name: 'Test Job', status: 'pending', architecture: 'llama',
    parameter_count: '125M', vocab_size: 32000, context_length: 2048,
    hidden_size: 768, num_layers: 12, num_heads: 12, intermediate_size: 3072,
    corpus_source_ids: [], total_tokens: 1000000, tokens_processed: 0,
    batch_size: 32, gradient_accumulation_steps: 4, learning_rate: 0.0003,
    lr_schedule: 'cosine', warmup_steps: 1000, weight_decay: 0.01,
    max_steps: 100000, current_step: 0, checkpoint_steps: 5000, eval_steps: 1000,
    image: 'ghcr.io/secureyeoman/pretrain-runner:latest', container_id: null,
    output_path: null, error_message: null, num_gpus: 1,
    created_at: Date.now(), started_at: 0, completed_at: 0, tenant_id: 'default',
    ...overrides,
  };
}

describe('PretrainManager', () => {
  let manager: PretrainManager;

  beforeEach(() => {
    mockQuery.mockReset();
    manager = new PretrainManager(mockPool, makeLogger(), makeConfig());
  });

  // ── Create ───────────────────────────────────────────────────────

  it('creates a job', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // listJobs (check concurrent)
      .mockResolvedValueOnce({ rows: [makeJobRow()], rowCount: 1 }); // INSERT
    const job = await manager.createJob({
      name: 'Test', architecture: 'llama', parameterCount: '125M',
      corpusSourceIds: [], totalTokens: 1000000,
    } as any);
    expect(job.name).toBe('Test Job');
    expect(job.status).toBe('pending');
  });

  it('rejects job exceeding max model size', async () => {
    await expect(manager.createJob({
      name: 'Too Big', parameterCount: '7B', corpusSourceIds: [],
    } as any)).rejects.toThrow('exceeds maximum');
  });

  it('rejects when max concurrent jobs reached', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeJobRow(), makeJobRow()], rowCount: 2 });
    await expect(manager.createJob({
      name: 'Blocked', parameterCount: '125M', corpusSourceIds: [],
    } as any)).rejects.toThrow('Max concurrent');
  });

  // ── Get / List ───────────────────────────────────────────────────

  it('gets a job by id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeJobRow()], rowCount: 1 });
    const job = await manager.getJob('pt-abc');
    expect(job).toBeTruthy();
    expect(job!.id).toBe('pt-abc');
  });

  it('returns null for missing job', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await manager.getJob('nope')).toBeNull();
  });

  it('lists all jobs', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeJobRow(), makeJobRow({ id: 'pt-def' })], rowCount: 2 });
    const jobs = await manager.listJobs();
    expect(jobs).toHaveLength(2);
  });

  it('lists jobs filtered by status', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeJobRow({ status: 'training' })], rowCount: 1 });
    const jobs = await manager.listJobs('training');
    expect(jobs).toHaveLength(1);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('status = $1');
  });

  // ── Progress ─────────────────────────────────────────────────────

  it('updates progress', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeJobRow({ current_step: 500, training_loss: 3.2 })],
      rowCount: 1,
    });
    const job = await manager.updateProgress('pt-abc', { currentStep: 500, trainingLoss: 3.2 });
    expect(job!.currentStep).toBe(500);
    expect(job!.trainingLoss).toBe(3.2);
  });

  it('returns existing job when no updates provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeJobRow()], rowCount: 1 });
    const job = await manager.updateProgress('pt-abc', {});
    expect(job).toBeTruthy();
  });

  // ── Cancel / Delete ──────────────────────────────────────────────

  it('cancels a job', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    expect(await manager.cancelJob('pt-abc')).toBe(true);
  });

  it('returns false when cancelling non-cancellable job', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    expect(await manager.cancelJob('pt-done')).toBe(false);
  });

  it('deletes a job', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 0 }) // cancel attempt
      .mockResolvedValueOnce({ rowCount: 1 }); // delete
    expect(await manager.deleteJob('pt-abc')).toBe(true);
  });

  // ── Param Estimation ─────────────────────────────────────────────

  it('estimates parameter count', () => {
    const estimate = manager.estimateParams({
      vocabSize: 32000, hiddenSize: 768, numLayers: 12, intermediateSize: 3072,
    });
    // Should be roughly 125M range
    expect(estimate).toBeGreaterThan(50_000_000);
    expect(estimate).toBeLessThan(200_000_000);
  });
});
