/**
 * PipelineLineageStorage unit tests
 *
 * Tests lineage record creation and update operations with mocked pg.Pool.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineLineageStorage } from './pipeline-lineage.js';
import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';

function makeLogger(): SecureLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as SecureLogger;
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lin-1',
    workflow_run_id: 'run-1',
    workflow_id: 'wf-1',
    dataset_id: null,
    dataset_path: null,
    dataset_sample_count: null,
    dataset_filters: null,
    dataset_snapshotted_at: null,
    training_job_id: null,
    training_job_type: null,
    training_job_status: null,
    eval_id: null,
    eval_metrics: null,
    eval_completed_at: null,
    deployed_model_version: null,
    deployed_personality_id: null,
    deployed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makePool(row = makeRow()): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [row], rowCount: 1 }),
  } as unknown as Pool;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PipelineLineageStorage.ensureRecord', () => {
  it('inserts and returns the lineage record', async () => {
    const pool = makePool();
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const record = await storage.ensureRecord('run-1', 'wf-1');

    expect(record.workflowRunId).toBe('run-1');
    expect(record.workflowId).toBe('wf-1');
    expect(vi.mocked(pool.query)).toHaveBeenCalled();
  });
});

describe('PipelineLineageStorage.getByRunId', () => {
  it('returns the lineage record when found', async () => {
    const pool = makePool();
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const record = await storage.getByRunId('run-1');

    expect(record).not.toBeNull();
    expect(record!.workflowRunId).toBe('run-1');
  });

  it('returns null when not found', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    } as unknown as Pool;
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const record = await storage.getByRunId('nonexistent');

    expect(record).toBeNull();
  });
});

describe('PipelineLineageStorage.recordDataset', () => {
  it('issues UPDATE with dataset fields', async () => {
    const pool = makePool();
    const storage = new PipelineLineageStorage(pool, makeLogger());

    await storage.recordDataset('run-1', 'wf-1', {
      datasetId: 'ds-123',
      path: '/tmp/dataset_ds-123.jsonl',
      sampleCount: 500,
      snapshotAt: Date.now(),
    });

    const calls = vi.mocked(pool.query).mock.calls;
    const updateCall = calls.find((c) => (c[0] as string).includes('dataset_id'));
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain('ds-123');
  });
});

describe('PipelineLineageStorage.recordTrainingJob', () => {
  it('issues UPDATE with training job fields', async () => {
    const pool = makePool();
    const storage = new PipelineLineageStorage(pool, makeLogger());

    await storage.recordTrainingJob('run-1', 'wf-1', {
      jobId: 'job-456',
      jobType: 'finetune',
      jobStatus: 'complete',
    });

    const calls = vi.mocked(pool.query).mock.calls;
    const updateCall = calls.find((c) => (c[0] as string).includes('training_job_id'));
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain('job-456');
    expect(updateCall![1]).toContain('finetune');
    expect(updateCall![1]).toContain('complete');
  });
});

describe('PipelineLineageStorage.recordEvaluation', () => {
  it('issues UPDATE with eval fields', async () => {
    const pool = makePool();
    const storage = new PipelineLineageStorage(pool, makeLogger());

    await storage.recordEvaluation('run-1', 'wf-1', {
      evalId: 'eval-789',
      metrics: { exact_match: 0.8, char_similarity: 0.75, sample_count: 100 },
      completedAt: Date.now(),
    });

    const calls = vi.mocked(pool.query).mock.calls;
    const updateCall = calls.find((c) => (c[0] as string).includes('eval_id'));
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain('eval-789');
  });
});

describe('PipelineLineageStorage.recordDeployment', () => {
  it('issues UPDATE with deployment fields', async () => {
    const pool = makePool();
    const storage = new PipelineLineageStorage(pool, makeLogger());

    await storage.recordDeployment('run-1', 'wf-1', {
      modelVersion: 'my-adapter-v1',
      personalityId: 'p1',
      deployedAt: Date.now(),
    });

    const calls = vi.mocked(pool.query).mock.calls;
    const updateCall = calls.find((c) => (c[0] as string).includes('deployed_model_version'));
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain('my-adapter-v1');
    expect(updateCall![1]).toContain('p1');
  });
});

describe('PipelineLineageStorage.getByTrainingJobId', () => {
  it('returns null when no record found', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    } as unknown as Pool;
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const result = await storage.getByTrainingJobId('nonexistent');

    expect(result).toBeNull();
  });

  it('queries by training_job_id', async () => {
    const pool = makePool(makeRow({ training_job_id: 'job-1' }));
    const storage = new PipelineLineageStorage(pool, makeLogger());

    await storage.getByTrainingJobId('job-1');

    expect(vi.mocked(pool.query)).toHaveBeenCalledWith(expect.stringContaining('training_job_id'), [
      'job-1',
    ]);
  });
});

describe('PipelineLineageStorage.list', () => {
  it('returns array of lineage records', async () => {
    const pool = makePool();
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const records = await storage.list(10);

    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBe(1);
  });

  it('passes limit to query', async () => {
    const pool = makePool();
    const storage = new PipelineLineageStorage(pool, makeLogger());

    await storage.list(25);

    expect(vi.mocked(pool.query)).toHaveBeenCalledWith(expect.stringContaining('LIMIT'), [25]);
  });
});
