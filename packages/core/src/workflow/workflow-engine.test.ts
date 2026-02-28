/**
 * WorkflowEngine unit tests
 *
 * Tests the DAG execution engine using mocked storage — no database required.
 * Covers: topological sort, cycle detection, step dispatch (all 9 types),
 * condition gates, error-handling modes (fail/continue/skip/fallback),
 * retry policy, and template / condition helpers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowEngine, WorkflowCycleError } from './workflow-engine.js';
import type { WorkflowStorage } from './workflow-storage.js';
import type {
  WorkflowDefinition,
  WorkflowRun,
  WorkflowStep,
  WorkflowStepRun,
} from '@secureyeoman/shared';
import type { SecureLogger } from '../logging/logger.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

let _srCounter = 0;

function makeStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: 'step1',
    type: 'transform',
    name: 'Step 1',
    config: {},
    dependsOn: [],
    onError: 'fail',
    ...overrides,
  };
}

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 'run-1',
    workflowId: 'wf-1',
    workflowName: 'Test Workflow',
    status: 'pending',
    input: {},
    output: null,
    error: null,
    triggeredBy: 'manual',
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

function makeDefinition(
  steps: WorkflowStep[],
  overrides: Partial<WorkflowDefinition> = {}
): WorkflowDefinition {
  return {
    id: 'wf-1',
    name: 'Test Workflow',
    steps,
    edges: [],
    triggers: [],
    isEnabled: true,
    version: 1,
    createdBy: 'system',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeStepRun(stepId = 'step1'): WorkflowStepRun {
  return {
    id: `sr-${++_srCounter}`,
    runId: 'run-1',
    stepId,
    stepName: 'Step',
    stepType: 'transform',
    status: 'pending',
    input: null,
    output: null,
    error: null,
    startedAt: null,
    completedAt: null,
    durationMs: null,
  };
}

function makeStorage(): WorkflowStorage {
  return {
    updateRun: vi.fn().mockResolvedValue(makeRun()),
    createStepRun: vi
      .fn()
      .mockImplementation(async (_runId: string, stepId: string) => makeStepRun(stepId)),
    updateStepRun: vi.fn().mockResolvedValue(null),
    getDefinition: vi.fn().mockResolvedValue(null),
    createRun: vi.fn().mockResolvedValue(makeRun()),
    getRun: vi.fn().mockResolvedValue(null),
    seedBuiltinWorkflows: vi.fn().mockResolvedValue(undefined),
  } as unknown as WorkflowStorage;
}

function makeLogger(): SecureLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as SecureLogger;
}

function makeEngine(
  opts: {
    storage?: WorkflowStorage;
    subAgentManager?: unknown;
    swarmManager?: unknown;
    logger?: SecureLogger;
    dataCurationManager?: unknown;
    distillationManager?: unknown;
    finetuneManager?: unknown;
    evaluationManager?: unknown;
    approvalManager?: unknown;
    lineageStorage?: unknown;
  } = {}
): WorkflowEngine {
  return new WorkflowEngine({
    storage: opts.storage ?? makeStorage(),
    subAgentManager: (opts.subAgentManager ?? null) as never,
    swarmManager: (opts.swarmManager ?? null) as never,
    logger: opts.logger ?? makeLogger(),
    dataCurationManager: (opts.dataCurationManager ?? null) as never,
    distillationManager: (opts.distillationManager ?? null) as never,
    finetuneManager: (opts.finetuneManager ?? null) as never,
    evaluationManager: (opts.evaluationManager ?? null) as never,
    approvalManager: (opts.approvalManager ?? null) as never,
    lineageStorage: (opts.lineageStorage ?? null) as never,
  });
}

// ── WorkflowCycleError ───────────────────────────────────────────────────────

describe('WorkflowCycleError', () => {
  it('carries cycle step ids in message and inherits from Error', () => {
    const err = new WorkflowCycleError(['step-a', 'step-b']);
    expect(err.message).toContain('step-a');
    expect(err.message).toContain('step-b');
    expect(err.name).toBe('WorkflowCycleError');
    expect(err).toBeInstanceOf(Error);
  });
});

// ── resolveTemplate ──────────────────────────────────────────────────────────

describe('WorkflowEngine.resolveTemplate', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = makeEngine();
  });

  const ctx = () => ({
    steps: {
      step1: { output: 'hello world', status: 'completed' },
      step2: { output: { key: 'value' }, status: 'completed' },
    },
    input: { name: 'Alice', count: 42 },
  });

  it('resolves simple input placeholder', () => {
    expect(engine.resolveTemplate('Hello {{input.name}}!', ctx())).toBe('Hello Alice!');
  });

  it('resolves step output placeholder', () => {
    expect(engine.resolveTemplate('{{steps.step1.output}}', ctx())).toBe('hello world');
  });

  it('serialises object values to JSON', () => {
    expect(engine.resolveTemplate('{{steps.step2.output}}', ctx())).toBe('{"key":"value"}');
  });

  it('returns empty string for missing key', () => {
    expect(engine.resolveTemplate('{{input.nonexistent}}', ctx())).toBe('');
  });

  it('handles multiple placeholders in one template', () => {
    expect(engine.resolveTemplate('{{input.name}} has {{input.count}} items', ctx())).toBe(
      'Alice has 42 items'
    );
  });

  it('returns template unchanged when no placeholders present', () => {
    expect(engine.resolveTemplate('no placeholders', ctx())).toBe('no placeholders');
  });

  it('returns empty string when intermediate path is null', () => {
    const c = { steps: {}, input: { nested: null } };
    expect(engine.resolveTemplate('{{input.nested.deep}}', c as never)).toBe('');
  });
});

// ── evaluateCondition ────────────────────────────────────────────────────────

describe('WorkflowEngine.evaluateCondition', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = makeEngine();
  });

  const ctx = () => ({
    steps: { a: { output: 'done', status: 'completed' } },
    input: { mode: 'fast' },
  });

  it('returns true for "true"', () => {
    expect(engine.evaluateCondition('true', ctx())).toBe(true);
  });

  it('returns false for "false"', () => {
    expect(engine.evaluateCondition('false', ctx())).toBe(false);
  });

  it('evaluates expression referencing steps context', () => {
    expect(engine.evaluateCondition("steps.a.status === 'completed'", ctx())).toBe(true);
  });

  it('evaluates expression referencing input context', () => {
    expect(engine.evaluateCondition("input.mode === 'fast'", ctx())).toBe(true);
  });

  it('returns false for invalid JS (syntax error)', () => {
    expect(engine.evaluateCondition('!!!invalid syntax@@@', ctx())).toBe(false);
  });

  it('returns false for falsy zero expression', () => {
    expect(engine.evaluateCondition('0', ctx())).toBe(false);
  });
});

// ── Topological sort ─────────────────────────────────────────────────────────

describe('WorkflowEngine.execute — topological sort', () => {
  it('throws WorkflowCycleError (captured as workflow failure) for cyclic deps', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });

    const stepA = makeStep({ id: 'a', dependsOn: ['b'] });
    const stepB = makeStep({ id: 'b', dependsOn: ['a'] });

    await engine.execute(makeRun(), makeDefinition([stepA, stepB]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed', error: expect.stringContaining('cycle') })
    );
  });

  it('executes steps in dependency order', async () => {
    const executionOrder: string[] = [];
    const storage = makeStorage();
    (storage.createStepRun as ReturnType<typeof vi.fn>).mockImplementation(
      async (_runId: string, stepId: string) => {
        executionOrder.push(stepId);
        return makeStepRun(stepId);
      }
    );
    const engine = makeEngine({ storage });

    const stepA = makeStep({
      id: 'a',
      type: 'transform',
      config: { outputTemplate: 'a' },
      dependsOn: [],
    });
    const stepB = makeStep({
      id: 'b',
      type: 'transform',
      config: { outputTemplate: 'b' },
      dependsOn: ['a'],
    });

    await engine.execute(makeRun(), makeDefinition([stepA, stepB]));

    expect(executionOrder.indexOf('a')).toBeLessThan(executionOrder.indexOf('b'));
  });

  it('handles empty step list (completes immediately)', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });

    await engine.execute(makeRun(), makeDefinition([]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });
});

// ── Step dispatch ────────────────────────────────────────────────────────────

describe('WorkflowEngine.execute — step dispatch: transform', () => {
  it('resolves template and marks workflow completed', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const run = makeRun({ input: { name: 'World' } });

    const step = makeStep({
      id: 'greet',
      type: 'transform',
      config: { outputTemplate: 'Hello {{input.name}}!' },
    });

    await engine.execute(run, makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      run.id,
      expect.objectContaining({ status: 'completed', output: { greet: 'Hello World!' } })
    );
  });
});

describe('WorkflowEngine.execute — step dispatch: condition', () => {
  it('evaluates condition expression and stores boolean result', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });

    const step = makeStep({ id: 'check', type: 'condition', config: { expression: 'true' } });

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });
});

describe('WorkflowEngine.execute — step dispatch: resource', () => {
  it('logs resource step and returns resourceType + data', async () => {
    const storage = makeStorage();
    const logger = makeLogger();
    const engine = makeEngine({ storage, logger });
    const run = makeRun({ input: { data: 'payload' } });

    const step = makeStep({
      id: 'save',
      type: 'resource',
      config: { resourceType: 'memory', dataTemplate: '{{input.data}}' },
    });

    await engine.execute(run, makeDefinition([step]));

    expect(logger.info).toHaveBeenCalledWith(
      'Workflow resource step',
      expect.objectContaining({ resourceType: 'memory' })
    );
    expect(storage.updateRun).toHaveBeenCalledWith(
      run.id,
      expect.objectContaining({ status: 'completed' })
    );
  });
});

describe('WorkflowEngine.execute — step dispatch: mcp/tool', () => {
  it('warns that MCP is not wired and returns null output', async () => {
    const storage = makeStorage();
    const logger = makeLogger();
    const engine = makeEngine({ storage, logger });

    const step = makeStep({ id: 'mcp1', type: 'mcp', config: {} });
    await engine.execute(makeRun(), makeDefinition([step]));

    expect(logger.warn).toHaveBeenCalledWith(
      'MCP tool step not wired to mcpClientManager',
      expect.any(Object)
    );
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('tool type also warns and returns null', async () => {
    const storage = makeStorage();
    const logger = makeLogger();
    const engine = makeEngine({ storage, logger });

    const step = makeStep({ id: 'tool1', type: 'tool', config: {} });
    await engine.execute(makeRun(), makeDefinition([step]));

    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('WorkflowEngine.execute — step dispatch: agent', () => {
  it('fails workflow when subAgentManager not available', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage, subAgentManager: null });

    const step = makeStep({
      id: 'agent1',
      type: 'agent',
      config: { profile: 'p', taskTemplate: 't' },
    });
    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('delegates to subAgentManager when available', async () => {
    const subAgentManager = {
      delegate: vi.fn().mockResolvedValue({ result: 'analysis done' }),
    };
    const storage = makeStorage();
    const engine = makeEngine({ storage, subAgentManager });
    const run = makeRun({ input: { topic: 'AI' } });

    const step = makeStep({
      id: 'agent1',
      type: 'agent',
      config: { profile: 'analyst', taskTemplate: 'Research {{input.topic}}' },
    });

    await engine.execute(run, makeDefinition([step]));

    expect(subAgentManager.delegate).toHaveBeenCalledWith(
      expect.objectContaining({ profile: 'analyst', task: 'Research AI' })
    );
    expect(storage.updateRun).toHaveBeenCalledWith(
      run.id,
      expect.objectContaining({ status: 'completed', output: { agent1: 'analysis done' } })
    );
  });
});

describe('WorkflowEngine.execute — step dispatch: swarm', () => {
  it('fails workflow when swarmManager not available', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage, swarmManager: null });

    const step = makeStep({
      id: 'sw1',
      type: 'swarm',
      config: { templateId: 'team', taskTemplate: 'build' },
    });
    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('delegates to swarmManager and captures result', async () => {
    const swarmManager = {
      executeSwarm: vi.fn().mockResolvedValue({ result: 'swarm result' }),
    };
    const storage = makeStorage();
    const engine = makeEngine({ storage, swarmManager });
    const run = makeRun({ input: { task: 'build something' } });

    const step = makeStep({
      id: 'sw1',
      type: 'swarm',
      config: { templateId: 'research-team', taskTemplate: '{{input.task}}', tokenBudget: 5000 },
    });

    await engine.execute(run, makeDefinition([step]));

    expect(swarmManager.executeSwarm).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'research-team',
        task: 'build something',
        initiatedBy: 'workflow',
      })
    );
    expect(storage.updateRun).toHaveBeenCalledWith(
      run.id,
      expect.objectContaining({ status: 'completed' })
    );
  });
});

describe('WorkflowEngine.execute — step dispatch: subworkflow', () => {
  it('looks up sub-workflow definition and creates a nested run', async () => {
    const subDef = makeDefinition(
      [makeStep({ id: 'sub-step', type: 'transform', config: { outputTemplate: 'sub-out' } })],
      { id: 'sub-wf-1', name: 'Sub Workflow' }
    );
    const subRun = makeRun({ id: 'sub-run-1', workflowId: 'sub-wf-1' });

    const storage = makeStorage();
    (storage.getDefinition as ReturnType<typeof vi.fn>).mockResolvedValue(subDef);
    (storage.createRun as ReturnType<typeof vi.fn>).mockResolvedValue(subRun);
    (storage.getRun as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...subRun,
      status: 'completed',
      output: { 'sub-step': 'sub-out' },
    });

    const engine = makeEngine({ storage });
    const step = makeStep({ id: 'sub', type: 'subworkflow', config: { workflowId: 'sub-wf-1' } });

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.getDefinition).toHaveBeenCalledWith('sub-wf-1');
    expect(storage.createRun).toHaveBeenCalledWith(subDef.id, subDef.name, {}, 'subworkflow');
  });

  it('fails workflow when sub-workflow definition not found', async () => {
    const storage = makeStorage();
    (storage.getDefinition as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const engine = makeEngine({ storage });
    const step = makeStep({ id: 'sub', type: 'subworkflow', config: { workflowId: 'missing-wf' } });

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed', error: expect.stringContaining('missing-wf') })
    );
  });
});

describe('WorkflowEngine.execute — step dispatch: webhook', () => {
  it('calls fetch with resolved url and method', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: vi.fn().mockResolvedValue('{"ok":true}'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const run = makeRun({ input: { endpoint: 'https://example.com/hook' } });

    const step = makeStep({
      id: 'hook',
      type: 'webhook',
      config: { url: '{{input.endpoint}}', method: 'POST', bodyTemplate: '{"key":"val"}' },
    });

    await engine.execute(run, makeDefinition([step]));

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({ method: 'POST' })
    );
    expect(storage.updateRun).toHaveBeenCalledWith(
      run.id,
      expect.objectContaining({ status: 'completed' })
    );

    vi.unstubAllGlobals();
  });
});

describe('WorkflowEngine.execute — step dispatch: webhook with headersTemplate', () => {
  it('merges resolved headersTemplate into request headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: vi.fn().mockResolvedValue('{}'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const run = makeRun({ input: { tok: 'my-token' } });

    const step = makeStep({
      id: 'hook2',
      type: 'webhook',
      config: {
        url: 'https://example.com/hook',
        method: 'GET',
        headersTemplate: '{"Authorization":"Bearer {{input.tok}}"}',
      },
    });

    await engine.execute(run, makeDefinition([step]));

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer my-token' }),
      })
    );

    vi.unstubAllGlobals();
  });
});

describe('WorkflowEngine.execute — step dispatch: unknown type', () => {
  it('fails workflow for unrecognised step type', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });

    const step = makeStep({ id: 's1', type: 'transform' });
    (step as never as Record<string, unknown>)['type'] = 'unknown_type';

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });
});

// ── Error handling modes ──────────────────────────────────────────────────────

describe('WorkflowEngine.execute — onError modes', () => {
  it('onError=fail (default) — workflow fails when step throws', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage, subAgentManager: null });

    const step = makeStep({ id: 's1', type: 'agent', config: {}, onError: 'fail' });
    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('onError=continue — workflow completes despite step failure', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage, subAgentManager: null });

    const step = makeStep({ id: 's1', type: 'agent', config: {}, onError: 'continue' });
    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
    expect(storage.updateStepRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('onError=skip — step run recorded as skipped, workflow completes', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage, subAgentManager: null });

    const step = makeStep({ id: 's1', type: 'agent', config: {}, onError: 'skip' });
    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateStepRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'skipped' })
    );
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('onError=fallback — fallback step is executed after primary fails', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage, subAgentManager: null });

    const primaryStep = makeStep({
      id: 's1',
      type: 'agent',
      config: {},
      onError: 'fallback',
      fallbackStepId: 'fallback-step',
    });
    const fallbackStep = makeStep({
      id: 'fallback-step',
      type: 'transform',
      config: { outputTemplate: 'fallback result' },
    });

    await engine.execute(makeRun(), makeDefinition([primaryStep, fallbackStep]));

    expect(storage.createStepRun).toHaveBeenCalledWith(
      'run-1',
      'fallback-step',
      expect.any(String),
      expect.any(String)
    );
  });
});

// ── Condition gate ────────────────────────────────────────────────────────────

describe('WorkflowEngine.execute — condition gate', () => {
  it('skips step and records it when condition is false', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });

    const step = makeStep({
      id: 's1',
      type: 'transform',
      config: { outputTemplate: 'hi' },
      condition: 'false',
    });

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateStepRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'skipped' })
    );
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('runs step normally when condition is true', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });

    const step = makeStep({
      id: 's1',
      type: 'transform',
      config: { outputTemplate: 'ran' },
      condition: 'true',
    });

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed', output: { s1: 'ran' } })
    );
  });

  it('absorbs error and skips step when condition storage call throws (inner catch path)', async () => {
    const storage = makeStorage();
    // Simulate a storage failure on the createStepRun triggered by false condition.
    // This is the path that triggers the catch{} block inside executeStep's condition guard.
    (storage.createStepRun as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('db connection lost')
    );
    const engine = makeEngine({ storage });

    const step = makeStep({
      id: 's1',
      type: 'transform',
      config: { outputTemplate: 'ran' },
      condition: 'false', // false → tries createStepRun → db throws → inner catch → skip silently
    });

    await engine.execute(makeRun(), makeDefinition([step]));

    // Workflow still completes because the inner condition catch absorbs the error
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });
});

// ── Retry policy ──────────────────────────────────────────────────────────────

describe('WorkflowEngine.execute — retry policy', () => {
  it('retries on failure and succeeds on second attempt', async () => {
    const subAgentManager = {
      delegate: vi
        .fn()
        .mockRejectedValueOnce(new Error('transient error'))
        .mockResolvedValue({ result: 'ok' }),
    };
    const storage = makeStorage();
    const engine = makeEngine({ storage, subAgentManager });

    const step = makeStep({
      id: 's1',
      type: 'agent',
      config: { profile: 'p', taskTemplate: 't' },
      retryPolicy: { maxAttempts: 2, backoffMs: 0 },
    });

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(subAgentManager.delegate).toHaveBeenCalledTimes(2);
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('exhausts all retries then applies onError=continue', async () => {
    const subAgentManager = {
      delegate: vi.fn().mockRejectedValue(new Error('always fails')),
    };
    const storage = makeStorage();
    const engine = makeEngine({ storage, subAgentManager });

    const step = makeStep({
      id: 's1',
      type: 'agent',
      config: { profile: 'p', taskTemplate: 't' },
      retryPolicy: { maxAttempts: 3, backoffMs: 0 },
      onError: 'continue',
    });

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(subAgentManager.delegate).toHaveBeenCalledTimes(3);
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });
});

// ── ML Pipeline step types (Phase 73) ────────────────────────────────────────

describe('WorkflowEngine.execute — step dispatch: data_curation', () => {
  it('calls dataCurationManager.curateDataset and records output', async () => {
    const dataset = {
      datasetId: 'ds-abc',
      path: '/tmp/dataset_ds-abc.jsonl',
      sampleCount: 50,
      conversationCount: 10,
      filters: {},
      snapshotAt: Date.now(),
    };
    const dataCurationManager = { curateDataset: vi.fn().mockResolvedValue(dataset) };
    const lineageStorage = { recordDataset: vi.fn().mockResolvedValue(undefined) };

    const storage = makeStorage();
    const engine = makeEngine({ storage, dataCurationManager, lineageStorage });
    const run = makeRun({ input: { outputDir: '/tmp' } });
    const step = makeStep({
      id: 'curate',
      type: 'data_curation',
      config: { outputDir: '{{input.outputDir}}', minTurns: 2 },
    });

    await engine.execute(run, makeDefinition([step]));

    expect(dataCurationManager.curateDataset).toHaveBeenCalledWith(
      expect.objectContaining({ outputDir: '/tmp', minTurns: 2 })
    );
    expect(lineageStorage.recordDataset).toHaveBeenCalledWith(
      'run-1',
      'wf-1',
      expect.objectContaining({ datasetId: 'ds-abc' })
    );
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('fails when dataCurationManager not available', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({ id: 'curate', type: 'data_curation', config: {} });

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed', error: expect.stringContaining('DataCurationManager') })
    );
  });
});

describe('WorkflowEngine.execute — step dispatch: training_job (finetune)', () => {
  it('starts finetune job and polls until complete', async () => {
    const job = { id: 'job-1', status: 'complete', adapterPath: '/tmp/adapter' };
    const finetuneManager = {
      getJob: vi.fn()
        .mockResolvedValueOnce({ id: 'job-1', status: 'pending', adapterPath: null })
        .mockResolvedValueOnce(job),
      startJob: vi.fn().mockResolvedValue(undefined),
    };
    const lineageStorage = { recordTrainingJob: vi.fn().mockResolvedValue(undefined) };

    const storage = makeStorage();
    const engine = makeEngine({ storage, finetuneManager, lineageStorage });
    const run = makeRun({ input: { jobId: 'job-1' } });
    const step = makeStep({
      id: 'train',
      type: 'training_job',
      config: { jobType: 'finetune', jobId: '{{input.jobId}}', pollIntervalMs: 0, timeoutMs: 5000 },
    });

    await engine.execute(run, makeDefinition([step]));

    expect(finetuneManager.startJob).toHaveBeenCalledWith('job-1');
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('fails when finetuneManager not available', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'train',
      type: 'training_job',
      config: { jobType: 'finetune', jobId: 'j1' },
    });

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed', error: expect.stringContaining('FinetuneManager') })
    );
  });
});

describe('WorkflowEngine.execute — step dispatch: training_job (distillation)', () => {
  it('polls distillation job until complete', async () => {
    const distillationManager = {
      getJob: vi.fn()
        .mockResolvedValueOnce({ id: 'job-2', status: 'running', outputPath: null })
        .mockResolvedValueOnce({ id: 'job-2', status: 'complete', outputPath: '/tmp/out.jsonl' })
        .mockResolvedValueOnce({ id: 'job-2', status: 'complete', outputPath: '/tmp/out.jsonl' }),
    };
    const lineageStorage = { recordTrainingJob: vi.fn().mockResolvedValue(undefined) };

    const storage = makeStorage();
    const engine = makeEngine({ storage, distillationManager, lineageStorage });
    const step = makeStep({
      id: 'train',
      type: 'training_job',
      config: { jobType: 'distillation', jobId: 'job-2', pollIntervalMs: 0, timeoutMs: 5000 },
    });

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });
});

describe('WorkflowEngine.execute — step dispatch: evaluation', () => {
  it('runs evaluation and records lineage', async () => {
    const evalResult = {
      evalId: 'eval-1',
      metrics: { exact_match: 0.8, char_similarity: 0.75, sample_count: 10 },
      completedAt: Date.now(),
    };
    const evaluationManager = { runEvaluation: vi.fn().mockResolvedValue(evalResult) };
    const lineageStorage = { recordEvaluation: vi.fn().mockResolvedValue(undefined) };

    const storage = makeStorage();
    const engine = makeEngine({ storage, evaluationManager, lineageStorage });
    const step = makeStep({
      id: 'eval',
      type: 'evaluation',
      config: {
        datasetPath: '/tmp/test.jsonl',
        modelEndpoint: 'http://localhost:11434/generate',
        maxSamples: 50,
      },
    });

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(evaluationManager.runEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({ datasetPath: '/tmp/test.jsonl', maxSamples: 50 })
    );
    expect(lineageStorage.recordEvaluation).toHaveBeenCalledWith(
      'run-1',
      'wf-1',
      expect.objectContaining({ evalId: 'eval-1' })
    );
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('fails when neither samples nor datasetPath provided', async () => {
    const evaluationManager = {
      runEvaluation: vi.fn().mockRejectedValue(new Error('either samples or datasetPath must be provided')),
    };
    const storage = makeStorage();
    const engine = makeEngine({ storage, evaluationManager });
    const step = makeStep({ id: 'eval', type: 'evaluation', config: {} });

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });
});

describe('WorkflowEngine.execute — step dispatch: conditional_deploy', () => {
  it('deploys when metric meets threshold', async () => {
    const finetuneManager = {
      registerWithOllama: vi.fn().mockResolvedValue(undefined),
    };
    const lineageStorage = { recordDeployment: vi.fn().mockResolvedValue(undefined) };

    const storage = makeStorage();
    const engine = makeEngine({ storage, finetuneManager, lineageStorage });

    // Inject eval result into context via a preceding transform step
    const evalStep = makeStep({
      id: 'eval',
      type: 'transform',
      config: { outputTemplate: '{"metrics":{"char_similarity":0.8,"sample_count":10}}' },
    });
    const deployStep = makeStep({
      id: 'deploy',
      type: 'conditional_deploy',
      config: {
        metricPath: 'steps.eval.output.metrics.char_similarity',
        threshold: 0.7,
        jobId: 'job-99',
        ollamaUrl: 'http://ollama:11434',
        personalityId: 'p1',
        modelVersion: 'v1',
      },
      dependsOn: ['eval'],
    });

    await engine.execute(makeRun(), makeDefinition([evalStep, deployStep]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('does not deploy when metric below threshold', async () => {
    const finetuneManager = { registerWithOllama: vi.fn().mockResolvedValue(undefined) };
    const storage = makeStorage();
    const engine = makeEngine({ storage, finetuneManager });

    const evalStep = makeStep({
      id: 'eval',
      type: 'transform',
      config: { outputTemplate: '{"metrics":{"char_similarity":0.4,"sample_count":10}}' },
    });
    const deployStep = makeStep({
      id: 'deploy',
      type: 'conditional_deploy',
      config: {
        metricPath: 'steps.eval.output.metrics.char_similarity',
        threshold: 0.7,
        jobId: 'job-99',
      },
      dependsOn: ['eval'],
      onError: 'continue',
    });

    await engine.execute(makeRun(), makeDefinition([evalStep, deployStep]));

    expect(finetuneManager.registerWithOllama).not.toHaveBeenCalled();
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });
});

describe('WorkflowEngine.execute — step dispatch: human_approval', () => {
  it('creates approval request and resolves on approval', async () => {
    const approvalManager = {
      createRequest: vi.fn().mockResolvedValue({ id: 'req-1', timeoutMs: 5000 }),
      waitForDecision: vi.fn().mockResolvedValue('approved'),
    };

    const storage = makeStorage();
    const engine = makeEngine({ storage, approvalManager });
    const step = makeStep({
      id: 'approve',
      type: 'human_approval',
      config: { timeoutMs: 5000 },
    });

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(approvalManager.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({ workflowRunId: 'run-1', stepId: 'approve' })
    );
    expect(approvalManager.waitForDecision).toHaveBeenCalledWith('req-1');
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('fails workflow when approval is rejected', async () => {
    const approvalManager = {
      createRequest: vi.fn().mockResolvedValue({ id: 'req-2', timeoutMs: 5000 }),
      waitForDecision: vi.fn().mockRejectedValue(new Error('Approval request rejected: too low')),
    };

    const storage = makeStorage();
    const engine = makeEngine({ storage, approvalManager });
    const step = makeStep({
      id: 'approve',
      type: 'human_approval',
      config: { timeoutMs: 5000 },
      onError: 'fail',
    });

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed', error: expect.stringContaining('rejected') })
    );
  });

  it('fails when approvalManager not available', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({ id: 'approve', type: 'human_approval', config: {} });

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed', error: expect.stringContaining('ApprovalManager') })
    );
  });
});
