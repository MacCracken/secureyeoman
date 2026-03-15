/**
 * Chaos Manager Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChaosManager } from './chaos-manager.js';
import type {
  ChaosEngineeringConfig,
  ChaosExperiment,
  ChaosExperimentCreate,
} from '@secureyeoman/shared';

const defaultConfig: ChaosEngineeringConfig = {
  enabled: true,
  maxConcurrentExperiments: 3,
  maxExperimentDurationMs: 600_000,
  retainResults: 200,
  safeMode: true,
  allowedTargetTypes: ['workflow_step', 'ai_provider', 'integration', 'circuit_breaker'],
};

const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as any;

function makeExperiment(overrides: Partial<ChaosExperiment> = {}): ChaosExperiment {
  return {
    id: 'exp-1',
    name: 'Test Experiment',
    description: 'Testing',
    status: 'draft',
    rules: [
      {
        id: 'rule-1',
        name: 'Latency Rule',
        targetType: 'workflow_step',
        targetId: 'step-1',
        fault: { type: 'latency', minMs: 1, maxMs: 5, distribution: 'uniform' },
        probability: 1,
        enabled: true,
      },
    ],
    durationMs: 60000,
    steadyStateHypothesis: 'System remains responsive',
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

describe('ChaosManager', () => {
  let manager: ChaosManager;
  let mockStore: any;

  beforeEach(() => {
    mockStore = {
      saveExperiment: vi.fn().mockResolvedValue(undefined),
      getExperiment: vi.fn().mockResolvedValue(null),
      listExperiments: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      updateExperimentStatus: vi.fn().mockResolvedValue(true),
      deleteExperiment: vi.fn().mockResolvedValue(true),
      deleteExperimentIfNotRunning: vi.fn().mockResolvedValue(true),
      saveResult: vi.fn().mockResolvedValue(undefined),
      getResults: vi.fn().mockResolvedValue([]),
      deleteResults: vi.fn().mockResolvedValue(0),
    };

    manager = new ChaosManager({
      store: mockStore,
      config: defaultConfig,
      log: mockLog,
    });
  });

  afterEach(() => {
    manager.stop();
    vi.clearAllMocks();
  });

  it('creates an experiment', async () => {
    const input: ChaosExperimentCreate = {
      name: 'New Experiment',
      description: 'Test chaos',
      rules: [
        {
          id: 'r-1',
          name: 'Latency',
          targetType: 'workflow_step',
          targetId: 'step-1',
          fault: { type: 'latency', minMs: 10, maxMs: 100, distribution: 'uniform' },
          probability: 1,
          enabled: true,
        },
      ],
      durationMs: 30000,
      steadyStateHypothesis: 'System ok',
      rollbackOnFailure: true,
      scheduledAt: 0,
      tenantId: 'default',
      createdBy: 'test',
    };

    const result = await manager.createExperiment(input);

    expect(result.id).toMatch(/^chaos-/);
    expect(result.name).toBe('New Experiment');
    expect(result.status).toBe('draft');
    expect(mockStore.saveExperiment).toHaveBeenCalledOnce();
  });

  it('rejects experiment with no rules', async () => {
    await expect(
      manager.createExperiment({
        name: 'Empty',
        rules: [],
        durationMs: 1000,
      } as any)
    ).rejects.toThrow('at least one fault rule');
  });

  it('rejects experiment exceeding max duration', async () => {
    await expect(
      manager.createExperiment({
        name: 'Too long',
        rules: [
          {
            id: 'r',
            name: 'r',
            targetType: 'workflow_step',
            targetId: 's',
            fault: { type: 'latency', minMs: 1, maxMs: 2, distribution: 'uniform' },
            probability: 1,
            enabled: true,
          },
        ],
        durationMs: 999_999_999,
      } as any)
    ).rejects.toThrow('exceeds max');
  });

  it('rejects duplicate rule IDs', async () => {
    const rule = {
      id: 'dup',
      name: 'Dup',
      targetType: 'workflow_step' as const,
      targetId: 's',
      fault: { type: 'latency' as const, minMs: 1, maxMs: 2, distribution: 'uniform' as const },
      probability: 1,
      enabled: true,
    };
    await expect(
      manager.createExperiment({
        name: 'Dups',
        rules: [rule, rule],
        durationMs: 1000,
      } as any)
    ).rejects.toThrow('Duplicate rule ID');
  });

  it('runs an experiment', async () => {
    const exp = makeExperiment();
    mockStore.getExperiment.mockResolvedValue(exp);

    const result = await manager.runExperiment('exp-1');

    expect(result.experimentId).toBe('exp-1');
    expect(result.status).toBe('passed');
    expect(result.metrics.totalFaultsInjected).toBe(1);
    expect(mockStore.updateExperimentStatus).toHaveBeenCalledTimes(2);
    expect(mockStore.saveResult).toHaveBeenCalledOnce();
  });

  it('rejects running nonexistent experiment', async () => {
    await expect(manager.runExperiment('nope')).rejects.toThrow('not found');
  });

  it('rejects running already-running experiment', async () => {
    const exp = makeExperiment({ status: 'running' });
    mockStore.getExperiment.mockResolvedValue(exp);

    await expect(manager.runExperiment('exp-1')).rejects.toThrow('already running');
  });

  it('rejects disallowed target types', async () => {
    const exp = makeExperiment({
      rules: [
        {
          id: 'r-1',
          name: 'Bad target',
          targetType: 'brain_storage',
          targetId: 'store-1',
          fault: { type: 'latency', minMs: 1, maxMs: 2, distribution: 'uniform' },
          probability: 1,
          enabled: true,
        },
      ],
    });
    mockStore.getExperiment.mockResolvedValue(exp);

    await expect(manager.runExperiment('exp-1')).rejects.toThrow('not allowed');
  });

  it('delegates list/get to store', async () => {
    await manager.listExperiments({ status: 'draft' });
    expect(mockStore.listExperiments).toHaveBeenCalledWith({ status: 'draft' });

    await manager.getExperiment('exp-1');
    expect(mockStore.getExperiment).toHaveBeenCalledWith('exp-1');
  });

  it('deletes experiment and its results', async () => {
    const deleted = await manager.deleteExperiment('exp-1');

    expect(deleted).toBe(true);
    expect(mockStore.deleteExperimentIfNotRunning).toHaveBeenCalledWith('exp-1');
    expect(mockStore.deleteResults).toHaveBeenCalledWith('exp-1');
  });

  it('schedules an experiment', async () => {
    const exp = makeExperiment();
    mockStore.getExperiment.mockResolvedValue(exp);

    const future = Date.now() + 60000;
    const result = await manager.scheduleExperiment('exp-1', future);

    expect(result.status).toBe('scheduled');
    expect(result.scheduledAt).toBe(future);
  });

  it('abort returns false for non-running experiment', async () => {
    const result = await manager.abortExperiment('nonexistent');
    expect(result).toBe(false);
  });

  it('reports running count', () => {
    expect(manager.runningCount).toBe(0);
  });

  it('gets results from store', async () => {
    await manager.getResults('exp-1');
    expect(mockStore.getResults).toHaveBeenCalledWith('exp-1');
  });

  it('starts and stops scheduler', () => {
    manager.start();
    manager.stop();
    // No error = success
  });
});
