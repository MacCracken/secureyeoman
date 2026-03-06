/**
 * Chaos Store Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

import { ChaosStore } from './chaos-store.js';
import type { ChaosExperiment } from '@secureyeoman/shared';

function makeExperiment(overrides: Partial<ChaosExperiment> = {}): ChaosExperiment {
  return {
    id: 'exp-1',
    name: 'Test Experiment',
    description: '',
    status: 'draft',
    rules: [],
    durationMs: 60000,
    steadyStateHypothesis: '',
    rollbackOnFailure: true,
    scheduledAt: 0,
    startedAt: 0,
    completedAt: 0,
    tenantId: 'default',
    createdBy: 'test',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('ChaosStore', () => {
  let store: ChaosStore;

  beforeEach(() => {
    store = new ChaosStore();
    vi.clearAllMocks();
  });

  it('saves an experiment', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const exp = makeExperiment();

    await store.saveExperiment(exp);

    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO chaos.experiments');
    expect(params[0]).toBe('exp-1');
  });

  it('gets an experiment by id', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: 'exp-1',
          name: 'Found',
          description: '',
          status: 'draft',
          rules: [],
          duration_ms: 60000,
          steady_state_hypothesis: '',
          rollback_on_failure: true,
          scheduled_at: 0,
          started_at: 0,
          completed_at: 0,
          tenant_id: 'default',
          created_by: 'test',
          created_at: 1000,
        },
      ],
    });

    const result = await store.getExperiment('exp-1');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Found');
  });

  it('returns null for missing experiment', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const result = await store.getExperiment('nope');
    expect(result).toBeNull();
  });

  it('lists experiments with status filter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] }).mockResolvedValueOnce({
      rows: [
        {
          id: 'e1',
          name: 'A',
          status: 'draft',
          rules: [],
          duration_ms: 1000,
          tenant_id: 'default',
          created_by: 'sys',
          created_at: 1,
        },
        {
          id: 'e2',
          name: 'B',
          status: 'draft',
          rules: [],
          duration_ms: 2000,
          tenant_id: 'default',
          created_by: 'sys',
          created_at: 2,
        },
      ],
    });

    const result = await store.listExperiments({ status: 'draft' });
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it('updates experiment status', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const updated = await store.updateExperimentStatus('exp-1', 'running', { startedAt: 1000 });
    expect(updated).toBe(true);
    expect(mockQuery.mock.calls[0][0]).toContain('UPDATE chaos.experiments');
  });

  it('deletes an experiment', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const deleted = await store.deleteExperiment('exp-1');
    expect(deleted).toBe(true);
  });

  it('saves a result', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    await store.saveResult({
      id: 'res-1',
      experimentId: 'exp-1',
      status: 'passed',
      startedAt: 1000,
      completedAt: 2000,
      durationMs: 1000,
      faultResults: [],
      steadyStateValidated: true,
      summary: 'All good',
      metrics: {
        totalFaultsInjected: 0,
        faultsRecovered: 0,
        meanRecoveryTimeMs: 0,
        circuitBreakersTripped: 0,
      },
    });

    expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO chaos.experiment_results');
  });

  it('gets results for experiment', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          experiment_id: 'exp-1',
          status: 'passed',
          started_at: 1000,
          completed_at: 2000,
          duration_ms: 1000,
          fault_results: [],
          steady_state_validated: true,
          summary: 'ok',
          metrics: {},
        },
      ],
    });

    const results = await store.getResults('exp-1');
    expect(results).toHaveLength(1);
    expect(results[0]!.experimentId).toBe('exp-1');
  });

  it('deletes results for experiment', async () => {
    mockQuery.mockResolvedValue({ rowCount: 3 });
    const count = await store.deleteResults('exp-1');
    expect(count).toBe(3);
  });
});
