/**
 * WorkflowManager unit tests
 *
 * Tests the thin coordination layer using mocked storage and engine.
 * WorkflowEngine is mocked to avoid recursive execution side-effects.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowManager } from './workflow-manager.js';
import type { WorkflowStorage } from './workflow-storage.js';
import type { WorkflowDefinition, WorkflowRun, WorkflowStepRun } from '@secureyeoman/shared';

// ── Mock WorkflowEngine so setImmediate execution doesn't run real logic ──────

vi.mock('./workflow-engine.js', () => ({
  // Must use `function` (not arrow) so `new WorkflowEngine(...)` works as a constructor call.
  WorkflowEngine: vi.fn(function (this: Record<string, unknown>) {
    this.execute = vi.fn().mockResolvedValue(undefined);
  }),
}));

vi.mock('./workflow-templates.js', () => ({
  BUILTIN_WORKFLOW_TEMPLATES: [],
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;

function makeDefinition(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    id: 'wf-1',
    name: 'Test Workflow',
    description: 'A test workflow',
    steps: [],
    edges: [],
    triggers: [],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 'run-1',
    workflowId: 'wf-1',
    workflowName: 'Test Workflow',
    status: 'pending',
    input: null,
    output: null,
    error: null,
    triggeredBy: 'manual',
    createdAt: NOW,
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

function makeStepRun(): WorkflowStepRun {
  return {
    id: 'sr-1',
    runId: 'run-1',
    stepId: 's1',
    stepName: 'Step 1',
    stepType: 'transform',
    status: 'completed',
    input: null,
    output: null,
    error: null,
    startedAt: NOW,
    completedAt: NOW,
    durationMs: 100,
  };
}

function makeStorage(overrides: Partial<WorkflowStorage> = {}): WorkflowStorage {
  return {
    seedBuiltinWorkflows: vi.fn().mockResolvedValue(undefined),
    createDefinition: vi.fn().mockResolvedValue(makeDefinition()),
    getDefinition: vi.fn().mockResolvedValue(makeDefinition()),
    listDefinitions: vi.fn().mockResolvedValue({ definitions: [makeDefinition()], total: 1 }),
    updateDefinition: vi.fn().mockResolvedValue(makeDefinition()),
    deleteDefinition: vi.fn().mockResolvedValue(true),
    createRun: vi.fn().mockResolvedValue(makeRun()),
    updateRun: vi.fn().mockResolvedValue(makeRun()),
    getRun: vi.fn().mockResolvedValue(makeRun()),
    listRuns: vi.fn().mockResolvedValue({ runs: [makeRun()], total: 1 }),
    getStepRunsForRun: vi.fn().mockResolvedValue([makeStepRun()]),
    createStepRun: vi.fn().mockResolvedValue(makeStepRun()),
    updateStepRun: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as WorkflowStorage;
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as never;
}

function buildManager(overrides: Partial<WorkflowStorage> = {}) {
  return new WorkflowManager({
    storage: makeStorage(overrides),
    logger: makeLogger(),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WorkflowManager.initialize', () => {
  it('seeds built-in workflow templates via storage', async () => {
    const storage = makeStorage();
    const manager = new WorkflowManager({ storage, logger: makeLogger() });
    await manager.initialize();
    expect(storage.seedBuiltinWorkflows).toHaveBeenCalledWith([]);
  });
});

describe('WorkflowManager.createDefinition', () => {
  it('delegates creation to storage and returns the definition', async () => {
    const storage = makeStorage();
    const manager = new WorkflowManager({ storage, logger: makeLogger() });

    const def = await manager.createDefinition({
      name: 'My Workflow',
      steps: [],
      edges: [],
      triggers: [],
      version: 1,
      createdBy: 'user-1',
    });

    expect(storage.createDefinition).toHaveBeenCalled();
    expect(def.id).toBe('wf-1');
  });
});

describe('WorkflowManager.getDefinition', () => {
  it('returns definition from storage', async () => {
    const manager = buildManager();
    const def = await manager.getDefinition('wf-1');
    expect(def?.id).toBe('wf-1');
  });

  it('returns null when not found', async () => {
    const manager = buildManager({ getDefinition: vi.fn().mockResolvedValue(null) });
    expect(await manager.getDefinition('missing')).toBeNull();
  });
});

describe('WorkflowManager.listDefinitions', () => {
  it('returns paginated definitions from storage', async () => {
    const manager = buildManager();
    const result = await manager.listDefinitions({ limit: 10, offset: 0 });
    expect(result.definitions).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('passes options through to storage', async () => {
    const storage = makeStorage();
    const manager = new WorkflowManager({ storage, logger: makeLogger() });
    await manager.listDefinitions({ limit: 5, offset: 10 });
    expect(storage.listDefinitions).toHaveBeenCalledWith({ limit: 5, offset: 10 });
  });
});

describe('WorkflowManager.updateDefinition', () => {
  it('delegates update to storage and returns updated definition', async () => {
    const storage = makeStorage();
    const manager = new WorkflowManager({ storage, logger: makeLogger() });

    const result = await manager.updateDefinition('wf-1', { name: 'Updated' });
    expect(storage.updateDefinition).toHaveBeenCalledWith('wf-1', { name: 'Updated' });
    expect(result).not.toBeNull();
  });

  it('returns null when definition not found', async () => {
    const manager = buildManager({ updateDefinition: vi.fn().mockResolvedValue(null) });
    expect(await manager.updateDefinition('missing', { name: 'x' })).toBeNull();
  });
});

describe('WorkflowManager.deleteDefinition', () => {
  it('returns true on successful deletion', async () => {
    expect(await buildManager().deleteDefinition('wf-1')).toBe(true);
  });

  it('returns false when definition not found', async () => {
    const manager = buildManager({ deleteDefinition: vi.fn().mockResolvedValue(false) });
    expect(await manager.deleteDefinition('missing')).toBe(false);
  });
});

describe('WorkflowManager.triggerRun', () => {
  it('throws when workflow definition is not found', async () => {
    const manager = buildManager({ getDefinition: vi.fn().mockResolvedValue(null) });
    await expect(manager.triggerRun('missing')).rejects.toThrow('Workflow not found: missing');
  });

  it('throws when workflow is disabled', async () => {
    const manager = buildManager({
      getDefinition: vi.fn().mockResolvedValue(makeDefinition({ isEnabled: false })),
    });
    await expect(manager.triggerRun('wf-1')).rejects.toThrow('Workflow is disabled');
  });

  it('creates a run and returns it immediately (202 pattern)', async () => {
    const storage = makeStorage();
    const manager = new WorkflowManager({ storage, logger: makeLogger() });

    const run = await manager.triggerRun('wf-1', { key: 'value' }, 'api');
    expect(run.id).toBe('run-1');
    expect(storage.createRun).toHaveBeenCalledWith('wf-1', 'Test Workflow', { key: 'value' }, 'api');
  });

  it('defaults triggeredBy to "manual"', async () => {
    const storage = makeStorage();
    const manager = new WorkflowManager({ storage, logger: makeLogger() });
    await manager.triggerRun('wf-1');
    expect(storage.createRun).toHaveBeenCalledWith('wf-1', 'Test Workflow', undefined, 'manual');
  });
});

describe('WorkflowManager.getRun', () => {
  it('returns null when run is not found', async () => {
    const manager = buildManager({ getRun: vi.fn().mockResolvedValue(null) });
    expect(await manager.getRun('missing')).toBeNull();
  });

  it('combines run with its step runs', async () => {
    const manager = buildManager();
    const result = await manager.getRun('run-1');
    expect(result?.id).toBe('run-1');
    expect(result?.stepRuns).toHaveLength(1);
    expect(result?.stepRuns[0].id).toBe('sr-1');
  });
});

describe('WorkflowManager.listRuns', () => {
  it('delegates to storage with workflowId and options', async () => {
    const storage = makeStorage();
    const manager = new WorkflowManager({ storage, logger: makeLogger() });

    const result = await manager.listRuns('wf-1', { limit: 5 });
    expect(storage.listRuns).toHaveBeenCalledWith('wf-1', { limit: 5 });
    expect(result.total).toBe(1);
  });

  it('works without workflowId or options', async () => {
    const manager = buildManager();
    const result = await manager.listRuns();
    expect(result.runs).toHaveLength(1);
  });
});

describe('WorkflowManager.cancelRun', () => {
  it('returns null when run not found', async () => {
    const manager = buildManager({ getRun: vi.fn().mockResolvedValue(null) });
    expect(await manager.cancelRun('missing')).toBeNull();
  });

  it('cancels a pending run', async () => {
    const storage = makeStorage({
      getRun: vi.fn().mockResolvedValue(makeRun({ status: 'pending' })),
      updateRun: vi.fn().mockResolvedValue(makeRun({ status: 'cancelled' })),
    });
    const manager = new WorkflowManager({ storage, logger: makeLogger() });

    const result = await manager.cancelRun('run-1');
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'cancelled' })
    );
    expect(result?.status).toBe('cancelled');
  });

  it('cancels a running run', async () => {
    const storage = makeStorage({
      getRun: vi.fn().mockResolvedValue(makeRun({ status: 'running' })),
      updateRun: vi.fn().mockResolvedValue(makeRun({ status: 'cancelled' })),
    });
    const manager = new WorkflowManager({ storage, logger: makeLogger() });

    await manager.cancelRun('run-1');
    expect(storage.updateRun).toHaveBeenCalled();
  });

  it('returns run as-is when already completed (no update)', async () => {
    const storage = makeStorage({
      getRun: vi.fn().mockResolvedValue(makeRun({ status: 'completed' })),
    });
    const manager = new WorkflowManager({ storage, logger: makeLogger() });

    const result = await manager.cancelRun('run-1');
    expect(storage.updateRun).not.toHaveBeenCalled();
    expect(result?.status).toBe('completed');
  });

  it('returns run as-is when already failed', async () => {
    const storage = makeStorage({
      getRun: vi.fn().mockResolvedValue(makeRun({ status: 'failed' })),
    });
    const manager = new WorkflowManager({ storage, logger: makeLogger() });

    const result = await manager.cancelRun('run-1');
    expect(storage.updateRun).not.toHaveBeenCalled();
    expect(result?.status).toBe('failed');
  });

  it('returns run as-is when already cancelled', async () => {
    const storage = makeStorage({
      getRun: vi.fn().mockResolvedValue(makeRun({ status: 'cancelled' })),
    });
    const manager = new WorkflowManager({ storage, logger: makeLogger() });

    const result = await manager.cancelRun('run-1');
    expect(storage.updateRun).not.toHaveBeenCalled();
  });
});
