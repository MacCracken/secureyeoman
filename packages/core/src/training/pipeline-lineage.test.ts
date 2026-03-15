/**
 * PipelineLineageStorage unit tests
 *
 * Tests lineage record creation and update operations with mocked pg.Pool.
 */
import { describe, it, expect, vi } from 'vitest';
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

  it('uses default limit of 50 when not specified', async () => {
    const pool = makePool();
    const storage = new PipelineLineageStorage(pool, makeLogger());

    await storage.list();

    expect(vi.mocked(pool.query)).toHaveBeenCalledWith(expect.stringContaining('LIMIT'), [50]);
  });
});

// ── Additional branch coverage tests ─────────────────────────────────────────

describe('PipelineLineageStorage.ensureRecord — fallback SELECT', () => {
  it('falls back to getByRunId when INSERT returns no rows', async () => {
    const row = makeRow();
    const pool = {
      query: vi
        .fn()
        // First call: INSERT returns no rows (ON CONFLICT path)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        // Second call: SELECT fallback returns the row
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 }),
    } as unknown as Pool;
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const record = await storage.ensureRecord('run-1', 'wf-1');

    expect(record.workflowRunId).toBe('run-1');
    // Two queries: INSERT (empty) + SELECT fallback
    expect(vi.mocked(pool.query)).toHaveBeenCalledTimes(2);
  });
});

describe('rowToLineage — all nullable field branches', () => {
  it('maps dataset fields when dataset_id is present', async () => {
    const snapshotDate = new Date('2025-06-01T00:00:00Z');
    const row = makeRow({
      dataset_id: 'ds-1',
      dataset_path: '/data/file.jsonl',
      dataset_sample_count: 100,
      dataset_filters: { split: 'train' },
      dataset_snapshotted_at: snapshotDate,
    });
    const pool = makePool(row);
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const record = await storage.getByRunId('run-1');

    expect(record!.dataset).not.toBeNull();
    expect(record!.dataset!.datasetId).toBe('ds-1');
    expect(record!.dataset!.path).toBe('/data/file.jsonl');
    expect(record!.dataset!.sampleCount).toBe(100);
    expect(record!.dataset!.filters).toEqual({ split: 'train' });
    expect(record!.dataset!.snapshotAt).toBe(snapshotDate.getTime());
  });

  it('defaults dataset path to empty string when null', async () => {
    const row = makeRow({
      dataset_id: 'ds-2',
      dataset_path: null,
      dataset_sample_count: null,
      dataset_filters: null,
      dataset_snapshotted_at: 'not-a-date',
    });
    const pool = makePool(row);
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const record = await storage.getByRunId('run-1');

    expect(record!.dataset!.path).toBe('');
    expect(record!.dataset!.sampleCount).toBe(0);
    expect(record!.dataset!.filters).toBeUndefined();
    // Non-Date snapshotted_at should yield 0
    expect(record!.dataset!.snapshotAt).toBe(0);
  });

  it('maps trainingJob fields with fallback defaults', async () => {
    const row = makeRow({
      training_job_id: 'job-1',
      training_job_type: null,
      training_job_status: null,
    });
    const pool = makePool(row);
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const record = await storage.getByRunId('run-1');

    expect(record!.trainingJob).not.toBeNull();
    expect(record!.trainingJob!.jobId).toBe('job-1');
    expect(record!.trainingJob!.jobType).toBe('distillation');
    expect(record!.trainingJob!.jobStatus).toBe('unknown');
  });

  it('maps evaluation fields when eval_id is present', async () => {
    const completedDate = new Date('2025-07-01T12:00:00Z');
    const row = makeRow({
      eval_id: 'eval-1',
      eval_metrics: { accuracy: 0.95 },
      eval_completed_at: completedDate,
    });
    const pool = makePool(row);
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const record = await storage.getByRunId('run-1');

    expect(record!.evaluation).not.toBeNull();
    expect(record!.evaluation!.evalId).toBe('eval-1');
    expect(record!.evaluation!.metrics).toEqual({ accuracy: 0.95 });
    expect(record!.evaluation!.completedAt).toBe(completedDate.getTime());
  });

  it('defaults evaluation metrics to empty object and completedAt to 0 for non-Date', async () => {
    const row = makeRow({
      eval_id: 'eval-2',
      eval_metrics: null,
      eval_completed_at: 'not-a-date',
    });
    const pool = makePool(row);
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const record = await storage.getByRunId('run-1');

    expect(record!.evaluation!.metrics).toEqual({});
    expect(record!.evaluation!.completedAt).toBe(0);
  });

  it('maps deployment fields when deployed_model_version is present', async () => {
    const deployedDate = new Date('2025-08-01T00:00:00Z');
    const row = makeRow({
      deployed_model_version: 'v1.0',
      deployed_personality_id: 'pers-1',
      deployed_at: deployedDate,
    });
    const pool = makePool(row);
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const record = await storage.getByRunId('run-1');

    expect(record!.deployment).not.toBeNull();
    expect(record!.deployment!.modelVersion).toBe('v1.0');
    expect(record!.deployment!.personalityId).toBe('pers-1');
    expect(record!.deployment!.deployedAt).toBe(deployedDate.getTime());
  });

  it('defaults deployment personalityId to empty string and deployedAt to 0', async () => {
    const row = makeRow({
      deployed_model_version: 'v2.0',
      deployed_personality_id: null,
      deployed_at: 'not-a-date',
    });
    const pool = makePool(row);
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const record = await storage.getByRunId('run-1');

    expect(record!.deployment!.personalityId).toBe('');
    expect(record!.deployment!.deployedAt).toBe(0);
  });

  it('uses Date.now() for created_at and updated_at when they are not Date objects', async () => {
    const now = Date.now();
    const row = makeRow({
      created_at: 'not-a-date',
      updated_at: 'not-a-date',
    });
    const pool = makePool(row);
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const record = await storage.getByRunId('run-1');

    // Should fall back to Date.now() which will be >= now
    expect(record!.createdAt).toBeGreaterThanOrEqual(now);
    expect(record!.updatedAt).toBeGreaterThanOrEqual(now);
  });

  it('returns null for all optional sections when IDs are not set', async () => {
    const row = makeRow();
    const pool = makePool(row);
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const record = await storage.getByRunId('run-1');

    expect(record!.dataset).toBeNull();
    expect(record!.trainingJob).toBeNull();
    expect(record!.evaluation).toBeNull();
    expect(record!.deployment).toBeNull();
  });
});

describe('PipelineLineageStorage.recordDataset — with filters', () => {
  it('passes null for filters when not provided', async () => {
    const pool = makePool();
    const storage = new PipelineLineageStorage(pool, makeLogger());

    await storage.recordDataset('run-1', 'wf-1', {
      datasetId: 'ds-1',
      path: '/tmp/ds.jsonl',
      sampleCount: 100,
      snapshotAt: Date.now(),
    });

    const calls = vi.mocked(pool.query).mock.calls;
    const updateCall = calls.find((c) => (c[0] as string).includes('dataset_filters'));
    expect(updateCall).toBeDefined();
    // The 5th param (index 4) is filters — should be null when not provided
    expect(updateCall![1]![4]).toBeNull();
  });

  it('passes JSON stringified filters when provided', async () => {
    const pool = makePool();
    const storage = new PipelineLineageStorage(pool, makeLogger());

    await storage.recordDataset('run-1', 'wf-1', {
      datasetId: 'ds-1',
      path: '/tmp/ds.jsonl',
      sampleCount: 100,
      filters: { split: 'train', quality: 'high' },
      snapshotAt: Date.now(),
    });

    const calls = vi.mocked(pool.query).mock.calls;
    const updateCall = calls.find((c) => (c[0] as string).includes('dataset_filters'));
    expect(updateCall).toBeDefined();
    expect(updateCall![1]![4]).toBe(JSON.stringify({ split: 'train', quality: 'high' }));
  });
});

describe('PipelineLineageStorage.getByTrainingJobId — found', () => {
  it('returns the lineage record when found', async () => {
    const row = makeRow({
      training_job_id: 'job-42',
      training_job_type: 'finetune',
      training_job_status: 'complete',
    });
    const pool = makePool(row);
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const record = await storage.getByTrainingJobId('job-42');

    expect(record).not.toBeNull();
    expect(record!.trainingJob!.jobId).toBe('job-42');
    expect(record!.trainingJob!.jobType).toBe('finetune');
  });
});

// ── Additional branch coverage: list returns empty ────────────────────────────

describe('PipelineLineageStorage.list — empty result', () => {
  it('returns empty array when no records exist', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    } as unknown as Pool;
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const records = await storage.list(10);

    expect(records).toEqual([]);
    expect(records.length).toBe(0);
  });
});

// ── Branch coverage: dataset fields with non-null but non-Date snapshotted_at ─

describe('rowToLineage — dataset_snapshotted_at edge cases', () => {
  it('handles dataset_snapshotted_at as a numeric value (not Date)', async () => {
    const row = makeRow({
      dataset_id: 'ds-edge',
      dataset_path: '/edge/path',
      dataset_sample_count: 42,
      dataset_filters: null,
      dataset_snapshotted_at: 1700000000000, // number, not a Date
    });
    const pool = makePool(row);
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const record = await storage.getByRunId('run-1');

    // Not a Date instance, so should default to 0
    expect(record!.dataset!.snapshotAt).toBe(0);
  });

  it('handles dataset_snapshotted_at as null', async () => {
    const row = makeRow({
      dataset_id: 'ds-null-snap',
      dataset_path: '/data/path',
      dataset_sample_count: 10,
      dataset_filters: null,
      dataset_snapshotted_at: null,
    });
    const pool = makePool(row);
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const record = await storage.getByRunId('run-1');

    expect(record!.dataset!.snapshotAt).toBe(0);
  });
});

// ── Branch coverage: multiple records from list ────────────────────────────────

describe('PipelineLineageStorage.list — multiple records', () => {
  it('maps all returned rows', async () => {
    const row1 = makeRow({ id: 'lin-1', workflow_run_id: 'run-1', workflow_id: 'wf-1' });
    const row2 = makeRow({ id: 'lin-2', workflow_run_id: 'run-2', workflow_id: 'wf-2' });
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [row1, row2], rowCount: 2 }),
    } as unknown as Pool;
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const records = await storage.list(50);

    expect(records.length).toBe(2);
    expect(records[0].id).toBe('lin-1');
    expect(records[1].id).toBe('lin-2');
  });
});

// ── Branch coverage: eval_completed_at as null ─────────────────────────────────

describe('rowToLineage — eval with null completed_at', () => {
  it('handles eval_completed_at being null (not Date, not string)', async () => {
    const row = makeRow({
      eval_id: 'eval-null',
      eval_metrics: { f1: 0.9 },
      eval_completed_at: null,
    });
    const pool = makePool(row);
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const record = await storage.getByRunId('run-1');

    expect(record!.evaluation!.evalId).toBe('eval-null');
    expect(record!.evaluation!.completedAt).toBe(0);
  });
});

// ── Branch coverage: deployed_at as null ───────────────────────────────────────

describe('rowToLineage — deployment with null deployed_at', () => {
  it('handles deployed_at being null', async () => {
    const row = makeRow({
      deployed_model_version: 'v3.0',
      deployed_personality_id: 'p2',
      deployed_at: null,
    });
    const pool = makePool(row);
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const record = await storage.getByRunId('run-1');

    expect(record!.deployment!.modelVersion).toBe('v3.0');
    expect(record!.deployment!.deployedAt).toBe(0);
  });
});

// ── Branch coverage: all sections populated simultaneously ─────────────────────

describe('rowToLineage — fully populated row', () => {
  it('maps all sections when all IDs present', async () => {
    const now = new Date();
    const row = makeRow({
      dataset_id: 'ds-full',
      dataset_path: '/full/path',
      dataset_sample_count: 1000,
      dataset_filters: { split: 'test' },
      dataset_snapshotted_at: now,
      training_job_id: 'job-full',
      training_job_type: 'finetune',
      training_job_status: 'complete',
      eval_id: 'eval-full',
      eval_metrics: { acc: 0.99 },
      eval_completed_at: now,
      deployed_model_version: 'v-full',
      deployed_personality_id: 'p-full',
      deployed_at: now,
      created_at: now,
      updated_at: now,
    });
    const pool = makePool(row);
    const storage = new PipelineLineageStorage(pool, makeLogger());

    const record = await storage.getByRunId('run-1');

    expect(record!.dataset).not.toBeNull();
    expect(record!.trainingJob).not.toBeNull();
    expect(record!.evaluation).not.toBeNull();
    expect(record!.deployment).not.toBeNull();
    expect(record!.dataset!.filters).toEqual({ split: 'test' });
    expect(record!.trainingJob!.jobType).toBe('finetune');
    expect(record!.evaluation!.metrics).toEqual({ acc: 0.99 });
    expect(record!.deployment!.personalityId).toBe('p-full');
    expect(record!.createdAt).toBe(now.getTime());
    expect(record!.updatedAt).toBe(now.getTime());
  });
});
