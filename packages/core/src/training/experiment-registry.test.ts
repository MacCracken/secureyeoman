import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import { ExperimentRegistryManager } from './experiment-registry.js';

const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockPool = { query: mockQuery } as unknown as Pool;
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
} as unknown as SecureLogger;

function makeExpRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'exp-1',
    name: 'Experiment A',
    finetune_job_id: null,
    dataset_hash: 'abc',
    hyperparameters: { lr: 0.001, epochs: 3 },
    environment: { gpu: 'A100' },
    loss_curve: [],
    eval_run_id: null,
    eval_metrics: {},
    status: 'draft',
    notes: null,
    created_at: new Date('2026-03-01'),
    updated_at: new Date('2026-03-01'),
    ...overrides,
  };
}

describe('ExperimentRegistryManager', () => {
  let manager: ExperimentRegistryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ExperimentRegistryManager({ pool: mockPool, logger: mockLogger });
  });

  describe('createExperiment', () => {
    it('inserts experiment with all fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeExpRow()] });

      const exp = await manager.createExperiment({
        name: 'Experiment A',
        hyperparameters: { lr: 0.001 },
        environment: { gpu: 'A100' },
      });

      expect(exp.id).toBe('exp-1');
      expect(exp.name).toBe('Experiment A');
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO training.experiments');
    });

    it('uses default status draft when not specified', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeExpRow()] });

      await manager.createExperiment({ name: 'Test' });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[5]).toBe('draft');
    });
  });

  describe('updateExperiment', () => {
    it('updates status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeExpRow({ status: 'running' })] });

      const exp = await manager.updateExperiment('exp-1', { status: 'running' });
      expect(exp?.status).toBe('running');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('status =');
    });

    it('returns null when experiment not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const exp = await manager.updateExperiment('nope', { status: 'running' });
      expect(exp).toBeNull();
    });

    it('updates notes and hyperparameters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeExpRow({ notes: 'updated' })] });

      await manager.updateExperiment('exp-1', {
        notes: 'updated',
        hyperparameters: { lr: 0.01 },
      });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('notes =');
      expect(sql).toContain('hyperparameters =');
    });
  });

  describe('appendLossCurve', () => {
    it('appends point to loss curve via JSONB concat', async () => {
      const point = { step: 100, loss: 0.5 };
      mockQuery.mockResolvedValueOnce({
        rows: [makeExpRow({ loss_curve: [point] })],
      });

      const exp = await manager.appendLossCurve('exp-1', point);
      expect(exp?.lossCurve).toHaveLength(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('loss_curve || $1::jsonb');
    });
  });

  describe('getExperiment', () => {
    it('returns experiment when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeExpRow()] });
      const exp = await manager.getExperiment('exp-1');
      expect(exp?.name).toBe('Experiment A');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      expect(await manager.getExperiment('nope')).toBeNull();
    });
  });

  describe('listExperiments', () => {
    it('lists all experiments', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeExpRow(), makeExpRow({ id: 'exp-2' })] });
      const exps = await manager.listExperiments();
      expect(exps).toHaveLength(2);
    });

    it('filters by status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await manager.listExperiments({ status: 'completed' });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('completed');
    });
  });

  describe('deleteExperiment', () => {
    it('returns true on deletion', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      expect(await manager.deleteExperiment('exp-1')).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      expect(await manager.deleteExperiment('nope')).toBe(false);
    });
  });

  describe('diffExperiments', () => {
    it('computes hyperparameter and metric diffs', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            makeExpRow({
              hyperparameters: { lr: 0.001, epochs: 3 },
              eval_metrics: { accuracy: 0.9 },
              loss_curve: [{ step: 1, loss: 1.0 }],
            }),
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            makeExpRow({
              id: 'exp-2',
              hyperparameters: { lr: 0.01, batch_size: 32 },
              eval_metrics: { accuracy: 0.95 },
              loss_curve: [{ step: 1, loss: 0.8 }],
            }),
          ],
        });

      const diff = await manager.diffExperiments('exp-1', 'exp-2');
      expect(diff).not.toBeNull();
      expect(diff!.hyperparamDiffs.lr).toEqual({ a: 0.001, b: 0.01 });
      expect(diff!.hyperparamDiffs.epochs).toEqual({ a: 3, b: null });
      expect(diff!.hyperparamDiffs.batch_size).toEqual({ a: null, b: 32 });
      expect(diff!.metricDiffs.accuracy).toEqual({ a: 0.9, b: 0.95 });
      expect(diff!.lossCurveA).toHaveLength(1);
      expect(diff!.lossCurveB).toHaveLength(1);
    });

    it('returns null when either experiment not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      expect(await manager.diffExperiments('nope', 'nope2')).toBeNull();
    });
  });

  describe('linkEvalRun', () => {
    it('updates eval_run_id and eval_metrics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeExpRow({ eval_run_id: 'run-1', eval_metrics: { accuracy: 0.95 } })],
      });

      const exp = await manager.linkEvalRun('exp-1', 'run-1', { accuracy: 0.95 });
      expect(exp?.evalRunId).toBe('run-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('eval_run_id = $1');
    });
  });
});
