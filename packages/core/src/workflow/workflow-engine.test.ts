/**
 * WorkflowEngine unit tests
 *
 * Tests the DAG execution engine using mocked storage — no database required.
 * Covers: topological sort, cycle detection, step dispatch (all 9 types),
 * condition gates, error-handling modes (fail/continue/skip/fallback),
 * retry policy, template / condition helpers, and CI/CD step types (Phase 90).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkflowEngine, WorkflowCycleError } from './workflow-engine.js';
import type { WorkflowStorage } from './workflow-storage.js';
import type {
  WorkflowDefinition,
  WorkflowRun,
  WorkflowStep,
  WorkflowStepRun,
} from '@secureyeoman/shared';
import type { SecureLogger } from '../logging/logger.js';

const mockExecFileSync = vi.fn();
vi.mock('node:child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

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

function makeAlertManager() {
  return {
    evaluate: vi.fn().mockResolvedValue(undefined),
    createRule: vi.fn(),
    updateRule: vi.fn(),
    deleteRule: vi.fn(),
    listRules: vi.fn(),
    getRule: vi.fn(),
    testRule: vi.fn(),
  };
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
    cicdConfig?: unknown;
    alertManager?: unknown;
    councilManager?: unknown;
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
    cicdConfig: (opts.cicdConfig ?? null) as never,
    alertManager: (opts.alertManager ?? null) as never,
    councilManager: (opts.councilManager ?? null) as never,
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
      (_runId: string, stepId: string) => {
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
      expect.objectContaining({ resourceType: 'memory' }),
      'Workflow resource step'
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
      expect.any(Object),
      'MCP tool step not wired to mcpClientManager'
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
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('DataCurationManager'),
      })
    );
  });
});

describe('WorkflowEngine.execute — step dispatch: training_job (finetune)', () => {
  it('starts finetune job and polls until complete', async () => {
    const job = { id: 'job-1', status: 'complete', adapterPath: '/tmp/adapter' };
    const finetuneManager = {
      getJob: vi
        .fn()
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
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('FinetuneManager'),
      })
    );
  });
});

describe('WorkflowEngine.execute — step dispatch: training_job (distillation)', () => {
  it('polls distillation job until complete', async () => {
    const distillationManager = {
      getJob: vi
        .fn()
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
        modelEndpoint: 'https://model.example.com/generate',
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
      runEvaluation: vi
        .fn()
        .mockRejectedValue(new Error('either samples or datasetPath must be provided')),
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
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('ApprovalManager'),
      })
    );
  });
});

// ── Feature 1: triggerMode ─────────────────────────────────────────────────────

describe('WorkflowEngine.execute — triggerMode: any', () => {
  it('any-step runs when at least one dep completed', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });

    const depA = makeStep({ id: 'a', type: 'transform', config: { outputTemplate: 'aOut' } });
    const depB = makeStep({
      id: 'b',
      type: 'agent',
      config: {},
      onError: 'continue', // will fail (no subAgentManager)
    });
    const anyStep = makeStep({
      id: 'c',
      type: 'transform',
      config: { outputTemplate: 'cOut' },
      dependsOn: ['a', 'b'],
      triggerMode: 'any',
    });

    await engine.execute(makeRun(), makeDefinition([depA, depB, anyStep]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('any-step is skipped when all deps failed', async () => {
    const storage = makeStorage();
    // No subAgentManager → agent steps fail
    const engine = makeEngine({ storage, subAgentManager: null });

    const depA = makeStep({ id: 'a', type: 'agent', config: {}, onError: 'continue' });
    const depB = makeStep({ id: 'b', type: 'agent', config: {}, onError: 'continue' });
    const anyStep = makeStep({
      id: 'c',
      type: 'transform',
      config: { outputTemplate: 'cOut' },
      dependsOn: ['a', 'b'],
      triggerMode: 'any',
    });

    await engine.execute(makeRun(), makeDefinition([depA, depB, anyStep]));

    // any-step should have been recorded as skipped
    expect(storage.updateStepRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'skipped' })
    );
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('any-step with single dep behaves the same as all', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });

    const dep = makeStep({ id: 'dep', type: 'transform', config: { outputTemplate: 'x' } });
    const anyStep = makeStep({
      id: 'consumer',
      type: 'transform',
      config: { outputTemplate: 'y' },
      dependsOn: ['dep'],
      triggerMode: 'any',
    });

    await engine.execute(makeRun(), makeDefinition([dep, anyStep]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('triggerMode: all (default) — backward compatible: waits for all deps', async () => {
    const executionOrder: string[] = [];
    const storage = makeStorage();
    (storage.createStepRun as ReturnType<typeof vi.fn>).mockImplementation(
      (_runId: string, stepId: string) => {
        executionOrder.push(stepId);
        return makeStepRun(stepId);
      }
    );
    const engine = makeEngine({ storage });

    const depA = makeStep({ id: 'a', type: 'transform', config: { outputTemplate: 'a' } });
    const depB = makeStep({ id: 'b', type: 'transform', config: { outputTemplate: 'b' } });
    const allStep = makeStep({
      id: 'c',
      type: 'transform',
      config: { outputTemplate: 'c' },
      dependsOn: ['a', 'b'],
      // triggerMode defaults to 'all'
    });

    await engine.execute(makeRun(), makeDefinition([depA, depB, allStep]));

    expect(executionOrder.indexOf('c')).toBeGreaterThan(executionOrder.indexOf('a'));
    expect(executionOrder.indexOf('c')).toBeGreaterThan(executionOrder.indexOf('b'));
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('cycle detection still works with any-step in the graph', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });

    // a → b (any) → a creates a cycle
    const stepA = makeStep({ id: 'a', dependsOn: ['b'], triggerMode: 'any' });
    const stepB = makeStep({ id: 'b', dependsOn: ['a'], triggerMode: 'any' });

    await engine.execute(makeRun(), makeDefinition([stepA, stepB]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed', error: expect.stringContaining('cycle') })
    );
  });

  it('any-step placed in tier right after its earliest dep', async () => {
    const executionOrder: string[] = [];
    const storage = makeStorage();
    (storage.createStepRun as ReturnType<typeof vi.fn>).mockImplementation(
      (_runId: string, stepId: string) => {
        executionOrder.push(stepId);
        return makeStepRun(stepId);
      }
    );
    const engine = makeEngine({ storage });

    // a has no deps, b depends on a (chain), c is 'any' dep on [a, b]
    // With triggerMode:any, c should appear after a but not necessarily after b
    const stepA = makeStep({ id: 'a', type: 'transform', config: { outputTemplate: 'a' } });
    const stepB = makeStep({
      id: 'b',
      type: 'transform',
      config: { outputTemplate: 'b' },
      dependsOn: ['a'],
    });
    const stepC = makeStep({
      id: 'c',
      type: 'transform',
      config: { outputTemplate: 'c' },
      dependsOn: ['a', 'b'],
      triggerMode: 'any',
    });

    await engine.execute(makeRun(), makeDefinition([stepA, stepB, stepC]));

    // c must execute after a (its earliest dep)
    expect(executionOrder.indexOf('c')).toBeGreaterThan(executionOrder.indexOf('a'));
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });
});

// ── Feature 3: strict output schema enforcement ────────────────────────────────

describe('WorkflowEngine.execute — outputSchemaMode', () => {
  const makeSchemaStep = (outputSchemaMode?: string) =>
    makeStep({
      id: 'typed',
      type: 'transform',
      config: {
        outputTemplate: 'not-valid-json', // plain string — won't match {type:object}
        outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
        ...(outputSchemaMode ? { outputSchemaMode } : {}),
      },
    });

  it('outputSchemaMode: audit (default) — step completes despite schema violation', async () => {
    const storage = makeStorage();
    const logger = makeLogger();
    const engine = makeEngine({ storage, logger });

    await engine.execute(makeRun(), makeDefinition([makeSchemaStep()]));

    expect(logger.warn).toHaveBeenCalledWith(expect.any(Object), 'Step output schema violation');
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('outputSchemaMode: strict — step fails on schema mismatch', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });

    await engine.execute(makeRun(), makeDefinition([makeSchemaStep('strict')]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('schema validation'),
      })
    );
  });

  it('outputSchemaMode: strict with onError: continue — workflow completes after strict-fail', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });

    const step = makeStep({
      id: 'typed',
      type: 'transform',
      config: {
        outputTemplate: 'not-an-object',
        outputSchema: { type: 'object' },
        outputSchemaMode: 'strict',
      },
      onError: 'continue',
    });

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

  it('no outputSchema — no validation attempted (existing behavior)', async () => {
    const storage = makeStorage();
    const logger = makeLogger();
    const engine = makeEngine({ storage, logger });

    const step = makeStep({
      id: 'plain',
      type: 'transform',
      config: { outputTemplate: 'just text' },
    });

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(logger.warn).not.toHaveBeenCalledWith(
      'Step output schema violation',
      expect.any(Object)
    );
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });
});

// ─── CI/CD Step Types (Phase 90) ─────────────────────────────────────────────

describe('WorkflowEngine.execute — step dispatch: ci_trigger (github-actions)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dispatches GitHub Actions workflow and returns queued status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => '' })
    );
    const cicdConfig = { githubToken: 'gh-tok' };
    const engine = makeEngine({ cicdConfig });
    const storage = engine['storage'] as ReturnType<typeof makeStorage>;
    const step = makeStep({
      id: 'trigger',
      type: 'ci_trigger',
      config: {
        provider: 'github-actions',
        owner: 'myorg',
        repo: 'myrepo',
        ref: 'main',
        workflowId: 'ci.yml',
      },
    });
    await engine.execute(makeRun(), makeDefinition([step]));
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
    const fetchMock = vi.mocked(global.fetch as ReturnType<typeof vi.fn>);
    const calledUrl = (fetchMock.mock.calls[0] as string[])[0]!;
    expect(calledUrl).toContain('/repos/myorg/myrepo/actions/workflows/ci.yml/dispatches');
  });

  it('fails when GitHub Actions dispatch returns 422', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'Error' })
    );
    const engine = makeEngine({ cicdConfig: { githubToken: 'tok' } });
    const step = makeStep({
      id: 'trigger',
      type: 'ci_trigger',
      config: {
        provider: 'github-actions',
        owner: 'o',
        repo: 'r',
        ref: 'main',
        workflowId: 'ci.yml',
      },
    });
    const storage = engine['storage'] as ReturnType<typeof makeStorage>;
    await engine.execute(makeRun(), makeDefinition([step]));
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('fails for unsupported ci_trigger provider', async () => {
    const engine = makeEngine();
    const step = makeStep({
      id: 'trigger',
      type: 'ci_trigger',
      config: { provider: 'circleci', owner: 'o', repo: 'r', ref: 'main' },
    });
    const storage = engine['storage'] as ReturnType<typeof makeStorage>;
    await engine.execute(makeRun(), makeDefinition([step]));
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });
});

describe('WorkflowEngine.execute — step dispatch: ci_wait (github-actions)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('polls GitHub run and returns conclusion when completed', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ status: 'in_progress', conclusion: null }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({
            status: 'completed',
            conclusion: 'success',
            html_url: 'https://github.com',
          }),
        })
    );
    const engine = makeEngine({ cicdConfig: { githubToken: 'gh-tok' } });
    const step = makeStep({
      id: 'wait',
      type: 'ci_wait',
      config: {
        provider: 'github-actions',
        owner: 'org',
        repo: 'repo',
        runId: '42',
        pollIntervalMs: 1,
        timeoutMs: 5000,
      },
    });
    const storage = engine['storage'] as ReturnType<typeof makeStorage>;
    await engine.execute(makeRun(), makeDefinition([step]));
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('fails when ci_wait times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ status: 'in_progress', conclusion: null }),
      })
    );
    const engine = makeEngine({ cicdConfig: { githubToken: 'tok' } });
    const step = makeStep({
      id: 'wait',
      type: 'ci_wait',
      config: {
        provider: 'github-actions',
        owner: 'o',
        repo: 'r',
        runId: '1',
        pollIntervalMs: 1,
        timeoutMs: 5,
      },
    });
    const storage = engine['storage'] as ReturnType<typeof makeStorage>;
    await engine.execute(makeRun(), makeDefinition([step]));
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('fails for unsupported ci_wait provider', async () => {
    const engine = makeEngine();
    const step = makeStep({
      id: 'wait',
      type: 'ci_wait',
      config: { provider: 'travis', runId: '1' },
    });
    const storage = engine['storage'] as ReturnType<typeof makeStorage>;
    await engine.execute(makeRun(), makeDefinition([step]));
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('ci_trigger then ci_wait pipeline completes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://github.com',
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const engine = makeEngine({ cicdConfig: { githubToken: 'gh-tok' } });
    const triggerStep = makeStep({
      id: 'trigger',
      type: 'ci_trigger',
      config: {
        provider: 'github-actions',
        owner: 'o',
        repo: 'r',
        ref: 'main',
        workflowId: 'ci.yml',
      },
      dependsOn: [],
    });
    const waitStep = makeStep({
      id: 'wait',
      type: 'ci_wait',
      config: {
        provider: 'github-actions',
        owner: 'o',
        repo: 'r',
        runId: '999',
        pollIntervalMs: 1,
        timeoutMs: 5000,
      },
      dependsOn: ['trigger'],
    });
    const storage = engine['storage'] as ReturnType<typeof makeStorage>;
    await engine.execute(
      makeRun(),
      makeDefinition([triggerStep, waitStep], {
        edges: [{ source: 'trigger', target: 'wait' }],
      })
    );
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });
});

// ── Phase 94 — Additional coverage tests ─────────────────────────────────────

describe('WorkflowEngine.execute — ci_trigger (gitlab)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches GitLab pipeline and returns runId from response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 42, web_url: 'https://gitlab.example.com/p/123' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const storage = makeStorage();
    const engine = makeEngine({
      storage,
      cicdConfig: { gitlabUrl: 'https://gitlab.example.com', gitlabToken: 'gl-tok' },
    });
    const step = makeStep({
      id: 'gl-trigger',
      type: 'ci_trigger',
      config: {
        provider: 'gitlab',
        projectId: '123',
        ref: 'main',
        inputs: { ENV: 'staging' },
      },
    });
    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
    const fetchCall = fetchMock.mock.calls[0]!;
    expect(fetchCall[0]).toContain('/api/v4/projects/123/pipeline');
    const opts = fetchCall[1] as RequestInit;
    expect(opts.headers).toMatchObject({ 'PRIVATE-TOKEN': 'gl-tok' });
  });

  it('fails workflow when GitLab trigger returns error', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad ref',
    });
    vi.stubGlobal('fetch', fetchMock);
    const storage = makeStorage();
    const engine = makeEngine({ storage, cicdConfig: { gitlabToken: 'gl-tok' } });
    const step = makeStep({
      id: 'gl-trigger',
      type: 'ci_trigger',
      config: { provider: 'gitlab', projectId: '99', ref: 'bad-branch' },
    });
    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('GitLab pipeline trigger failed'),
      })
    );
  });
});

describe('WorkflowEngine.execute — ci_wait (gitlab)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('polls GitLab pipeline until terminal status', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'running', web_url: 'https://gl.example.com/p/1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'success', web_url: 'https://gl.example.com/p/1' }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const storage = makeStorage();
    const engine = makeEngine({
      storage,
      cicdConfig: { gitlabUrl: 'https://gl.example.com', gitlabToken: 'gl-tok' },
    });
    const step = makeStep({
      id: 'gl-wait',
      type: 'ci_wait',
      config: {
        provider: 'gitlab',
        projectId: '10',
        runId: '42',
        pollIntervalMs: 1,
        timeoutMs: 5000,
      },
    });
    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('times out when GitLab pipeline never reaches terminal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'running', web_url: 'https://gl.example.com' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const storage = makeStorage();
    const engine = makeEngine({ storage, cicdConfig: { gitlabToken: 'gl-tok' } });
    const step = makeStep({
      id: 'gl-wait',
      type: 'ci_wait',
      config: {
        provider: 'gitlab',
        projectId: '10',
        runId: '42',
        pollIntervalMs: 1,
        timeoutMs: 10, // very short timeout
      },
    });
    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('did not complete within'),
      })
    );
  });

  it('fails for unsupported ci_wait provider', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'wait-bad',
      type: 'ci_wait',
      config: { provider: 'circleci', runId: '1' },
    });
    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('unsupported provider'),
      })
    );
  });
});

describe('WorkflowEngine.evaluateCondition — cache hit', () => {
  it('returns cached compiled function on second call with same expression', () => {
    const engine = makeEngine();
    const ctx = { steps: {}, input: { x: 5 } };

    // First call — compiles and caches
    const result1 = engine.evaluateCondition('input.x > 3', ctx);
    expect(result1).toBe(true);

    // Second call — should hit cache (same expression)
    const result2 = engine.evaluateCondition('input.x > 3', ctx);
    expect(result2).toBe(true);

    // Different expression — miss
    const result3 = engine.evaluateCondition('input.x > 10', ctx);
    expect(result3).toBe(false);
  });
});

describe('WorkflowEngine.execute — human_approval timeout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails workflow when waitForDecision throws (timeout/rejection)', async () => {
    const approvalManager = {
      createRequest: vi.fn().mockResolvedValue({ id: 'req-1' }),
      waitForDecision: vi.fn().mockRejectedValue(new Error('Approval request timed out')),
    };
    const storage = makeStorage();
    const engine = makeEngine({ storage, approvalManager });
    const step = makeStep({
      id: 'approval',
      type: 'human_approval',
      config: { timeoutMs: 100, reportTemplate: '{"summary":"test"}' },
    });
    await engine.execute(makeRun(), makeDefinition([step]));

    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('timed out'),
      })
    );
  });

  it('human_approval with non-JSON reportTemplate wraps as summary', async () => {
    const approvalManager = {
      createRequest: vi.fn().mockResolvedValue({ id: 'req-2' }),
      waitForDecision: vi.fn().mockResolvedValue(undefined),
    };
    const storage = makeStorage();
    const engine = makeEngine({ storage, approvalManager });
    const step = makeStep({
      id: 'approval',
      type: 'human_approval',
      config: { reportTemplate: 'plain text report' },
    });
    await engine.execute(makeRun(), makeDefinition([step]));

    // The createRequest call should have report: { summary: 'plain text report' }
    const createCall = approvalManager.createRequest.mock.calls[0]![0] as Record<string, unknown>;
    expect(createCall.report).toEqual({ summary: 'plain text report' });
  });
});

describe('WorkflowEngine.execute — onError: skip marks step as skipped', () => {
  it('step is recorded as skipped and workflow completes', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    // Use agent step without subAgentManager to trigger error
    const step = makeStep({
      id: 'agent-step',
      type: 'agent',
      name: 'Failing agent',
      config: { profile: 'coder', taskTemplate: 'do something' },
      onError: 'skip',
    });
    await engine.execute(makeRun(), makeDefinition([step]));

    // Step should be recorded as skipped
    expect(storage.updateStepRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'skipped' })
    );
    // Workflow should complete
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });
});

describe('WorkflowEngine.execute — onError: fallback executes fallback step', () => {
  it('runs the fallbackStepId when primary step fails with onError=fallback', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    // Primary step fails (agent without manager)
    const primary = makeStep({
      id: 'primary',
      type: 'agent',
      name: 'Primary Agent',
      config: { profile: 'x', taskTemplate: 'task' },
      onError: 'fallback',
      fallbackStepId: 'backup',
    });
    // Fallback is a simple transform
    const backup = makeStep({
      id: 'backup',
      type: 'transform',
      name: 'Backup Transform',
      config: { outputTemplate: 'fallback output' },
      dependsOn: [],
    });
    await engine.execute(makeRun(), makeDefinition([primary, backup]));

    // Primary should be marked failed
    expect(storage.updateStepRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'failed' })
    );
    // Backup step should also have run (createStepRun called for it)
    const createCalls = (storage.createStepRun as ReturnType<typeof vi.fn>).mock.calls;
    const backupCreated = createCalls.some((c: unknown[]) => c[1] === 'backup');
    expect(backupCreated).toBe(true);
    // Workflow should complete
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });
});

describe('WorkflowEngine.execute — outputSchemaMode: strict with onError: fallback', () => {
  it('strict schema failure triggers fallback step execution', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const primary = makeStep({
      id: 'typed',
      type: 'transform',
      config: {
        outputTemplate: 'not-json',
        outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
        outputSchemaMode: 'strict',
      },
      onError: 'fallback',
      fallbackStepId: 'recovery',
    });
    const recovery = makeStep({
      id: 'recovery',
      type: 'transform',
      name: 'Recovery',
      config: { outputTemplate: 'recovered' },
    });
    await engine.execute(makeRun(), makeDefinition([primary, recovery]));

    // Workflow should complete (fallback ran)
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
    // Recovery step created
    const createCalls = (storage.createStepRun as ReturnType<typeof vi.fn>).mock.calls;
    const recoveryCreated = createCalls.some((c: unknown[]) => c[1] === 'recovery');
    expect(recoveryCreated).toBe(true);
  });
});

// ── Phase 103: Security & Memory fixes ──────────────────────────────────────

describe('WorkflowEngine — prototype pollution prevention (Phase 103)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('strips __proto__ key from headers template', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: vi.fn().mockResolvedValue('{}'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'hook',
      type: 'webhook',
      config: {
        url: 'https://example.com/hook',
        headersTemplate: '{"__proto__":{"polluted":true},"X-Custom":"safe"}',
      },
    });

    await engine.execute(makeRun(), makeDefinition([step]));

    const fetchHeaders = mockFetch.mock.calls[0]?.[1]?.headers;
    // Headers use Object.create(null) so __proto__ is a harmless data property,
    // not a prototype chain reference. Verify no actual prototype pollution occurred.
    expect(Object.getPrototypeOf(fetchHeaders)).toBeNull();
    expect((Object.prototype as any).polluted).toBeUndefined();
    expect(fetchHeaders).toHaveProperty('X-Custom', 'safe');
  });

  it('strips constructor and prototype keys from headers template', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: vi.fn().mockResolvedValue('{}'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'hook',
      type: 'webhook',
      config: {
        url: 'https://example.com/hook',
        headersTemplate: '{"constructor":"bad","prototype":"bad","Accept":"json"}',
      },
    });

    await engine.execute(makeRun(), makeDefinition([step]));

    const fetchHeaders = mockFetch.mock.calls[0]?.[1]?.headers;
    // Headers use Object.create(null) so constructor/prototype are harmless data properties.
    // Verify the null prototype prevents any prototype chain access.
    expect(Object.getPrototypeOf(fetchHeaders)).toBeNull();
    expect(fetchHeaders).toHaveProperty('Accept', 'json');
  });
});

describe('WorkflowEngine — SSRF prevention in webhook step (Phase 103)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects webhook to localhost', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'hook',
      type: 'webhook',
      config: { url: 'http://127.0.0.1/admin' },
    });

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(mockFetch).not.toHaveBeenCalled();
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('rejects webhook to cloud metadata endpoint', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'hook',
      type: 'webhook',
      config: { url: 'http://169.254.169.254/latest/meta-data/' },
    });

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('allows webhook to valid public URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: vi.fn().mockResolvedValue('ok'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'hook',
      type: 'webhook',
      config: { url: 'https://hooks.example.com/wf' },
    });

    await engine.execute(makeRun(), makeDefinition([step]));

    expect(mockFetch).toHaveBeenCalledWith('https://hooks.example.com/wf', expect.any(Object));
  });
});

// _conditionCache was removed in Phase 121 (replaced by safe-eval). Tests deleted.

// ── Job Completion Events (Phase 104) ─────────────────────────────────────────

describe('WorkflowEngine job completion events', () => {
  it('emits completion event on successful run', async () => {
    const alertMgr = makeAlertManager();
    const storage = makeStorage();
    const engine = makeEngine({ storage, alertManager: alertMgr });

    const def = makeDefinition([
      makeStep({ id: 'step1', type: 'transform', config: { expression: '"done"' } }),
    ]);
    const run = makeRun();

    await engine.execute(run, def);

    // Allow fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(alertMgr.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        jobs: {
          workflow: {
            completed: expect.objectContaining({
              durationMs: expect.any(Number),
            }),
          },
        },
      })
    );
  });

  it('emits failure event when workflow fails', async () => {
    const alertMgr = makeAlertManager();
    const storage = makeStorage();
    const engine = makeEngine({ storage, alertManager: alertMgr });

    // Step depends on missing dep → will fail to resolve
    const def = makeDefinition([
      makeStep({
        id: 'step1',
        type: 'agent',
        config: { prompt: 'test' },
        dependsOn: ['nonexistent'],
      }),
    ]);
    const run = makeRun();

    await engine.execute(run, def);

    await new Promise((r) => setTimeout(r, 10));

    expect(alertMgr.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        jobs: {
          workflow: {
            failed: expect.objectContaining({
              error: 1,
              durationMs: expect.any(Number),
            }),
          },
        },
      })
    );
  });

  it('works without alertManager (null)', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage, alertManager: null });

    const def = makeDefinition([
      makeStep({ id: 'step1', type: 'transform', config: { expression: '"ok"' } }),
    ]);
    const run = makeRun();

    // Should not throw
    await engine.execute(run, def);
  });
});

// ── Phase 105: Static validation branch coverage ─────────────────────────────

describe('WorkflowEngine.validateConditionExpression (Phase 105)', () => {
  it('returns valid=true for a correct expression', () => {
    const result = WorkflowEngine.validateConditionExpression('steps.a.output === "ok"');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns valid=false with error for syntax error', () => {
    const result = WorkflowEngine.validateConditionExpression('invalid ===');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('WorkflowEngine.validateWorkflowConditions (Phase 105)', () => {
  it('returns empty array for steps with valid conditions', () => {
    const steps = [
      {
        id: 'a',
        condition: 'steps.b.output',
        type: 'agent',
        name: 'A',
        dependsOn: [],
        onError: 'fail' as const,
      },
    ] as any[];
    const errors = WorkflowEngine.validateWorkflowConditions(steps);
    expect(errors).toEqual([]);
  });

  it('returns errors for steps with invalid condition expressions', () => {
    const steps = [
      {
        id: 'a',
        condition: 'invalid ===',
        type: 'agent',
        name: 'A',
        dependsOn: [],
        onError: 'fail' as const,
      },
      { id: 'b', type: 'agent', name: 'B', dependsOn: [], onError: 'fail' as const },
    ] as any[];
    const errors = WorkflowEngine.validateWorkflowConditions(steps);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.stepId).toBe('a');
    expect(errors[0]!.error).toBeDefined();
  });

  it('skips steps without conditions', () => {
    const steps = [
      { id: 'a', type: 'agent', name: 'A', dependsOn: [], onError: 'fail' as const },
    ] as any[];
    const errors = WorkflowEngine.validateWorkflowConditions(steps);
    expect(errors).toEqual([]);
  });
});

// ── Deterministic Step Dispatch (Phase 107-A) ─────────────────────────────────

describe('WorkflowEngine deterministic dispatch', () => {
  beforeEach(() => {
    _srCounter = 0;
    mockExecFileSync.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deterministic=true with command succeeds — returns stdout, skips agent', async () => {
    mockExecFileSync.mockReturnValue('deterministic-output\n');
    const engine = makeEngine();
    const step = makeStep({
      id: 'det1',
      type: 'agent',
      config: { deterministic: true, command: 'echo hello' },
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'echo',
      ['hello'],
      expect.objectContaining({
        timeout: 30000,
        encoding: 'utf-8',
      })
    );
  });

  it('deterministic=true with command fails — falls through to agent dispatch', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('command not found');
    });
    const mockDelegate = vi.fn().mockResolvedValue({ result: 'agent-result' });
    const engine = makeEngine({
      subAgentManager: { delegate: mockDelegate },
    });
    const step = makeStep({
      id: 'det2',
      type: 'agent',
      config: {
        deterministic: true,
        command: 'bad-cmd',
        profile: 'default',
        taskTemplate: 'do something',
      },
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(mockDelegate).toHaveBeenCalled();
  });

  it('deterministic=true without command or function — normal dispatch', async () => {
    const mockDelegate = vi.fn().mockResolvedValue({ result: 'normal-result' });
    const engine = makeEngine({
      subAgentManager: { delegate: mockDelegate },
    });
    const step = makeStep({
      id: 'det3',
      type: 'agent',
      config: { deterministic: true, profile: 'default', taskTemplate: 'task' },
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(mockExecFileSync).not.toHaveBeenCalled();
    expect(mockDelegate).toHaveBeenCalled();
  });

  it('deterministic flag absent — normal dispatch (backwards compat)', async () => {
    const mockDelegate = vi.fn().mockResolvedValue({ result: 'ok' });
    const engine = makeEngine({
      subAgentManager: { delegate: mockDelegate },
    });
    const step = makeStep({
      id: 'det4',
      type: 'agent',
      config: { profile: 'default', taskTemplate: 'task' },
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(mockExecFileSync).not.toHaveBeenCalled();
    expect(mockDelegate).toHaveBeenCalled();
  });

  it('deterministic=true with custom timeoutMs passes to execFileSync', async () => {
    mockExecFileSync.mockReturnValue('output');
    const engine = makeEngine();
    const step = makeStep({
      id: 'det5',
      type: 'agent',
      config: { deterministic: true, command: 'node -e "1"', timeoutMs: 5000 },
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'node',
      ['-e', '"1"'],
      expect.objectContaining({
        timeout: 5000,
      })
    );
  });

  it('deterministic=true with command that has no args', async () => {
    mockExecFileSync.mockReturnValue('date-output');
    const engine = makeEngine();
    const step = makeStep({
      id: 'det6',
      type: 'agent',
      config: { deterministic: true, command: 'date' },
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(mockExecFileSync).toHaveBeenCalledWith('date', [], expect.any(Object));
  });
});

// ── Additional branch coverage tests ──────────────────────────────────────────

describe('WorkflowEngine.execute — step dispatch: council', () => {
  it('fails workflow when councilManager not available', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'council1',
      type: 'council',
      config: { templateId: 'ct-1', topicTemplate: 'Discuss topic' },
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('delegates to councilManager and captures result', async () => {
    const storage = makeStorage();
    const mockCouncilManager = {
      convene: vi.fn().mockResolvedValue({ decision: 'Consensus reached' }),
    };
    const engine = makeEngine({ storage, councilManager: mockCouncilManager as any });
    const step = makeStep({
      id: 'council1',
      type: 'council',
      config: {
        templateId: 'ct-1',
        topicTemplate: 'Should we deploy?',
        contextTemplate: 'Background info',
        tokenBudget: 5000,
        maxRounds: 3,
      },
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(mockCouncilManager.convene).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'ct-1',
        topic: 'Should we deploy?',
        context: 'Background info',
        tokenBudget: 5000,
        maxRounds: 3,
        initiatedBy: 'workflow',
      })
    );
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });
});

describe('WorkflowEngine.execute — step dispatch: diagram_generation', () => {
  it('returns diagram config container with toolChain', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'diagram1',
      type: 'diagram_generation',
      config: {
        diagramType: 'sequence',
        descriptionTemplate: 'User flow diagram',
        style: 'detailed',
        format: 'png',
      },
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('uses default values when config properties missing', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'diagram2',
      type: 'diagram_generation',
      config: {},
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });
});

describe('WorkflowEngine.execute — step dispatch: document_analysis', () => {
  it('returns document analysis config with toolChain', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'doc1',
      type: 'document_analysis',
      config: {
        analysisType: 'entities',
        documentTemplate: 'Some document text',
        outputFormat: 'json',
      },
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('uses default values when config properties missing', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'doc2',
      type: 'document_analysis',
      config: {},
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });
});

describe('WorkflowEngine.execute — agent step with contextTemplate', () => {
  it('includes context when contextTemplate is provided', async () => {
    const mockSubAgentManager = {
      delegate: vi.fn().mockResolvedValue({ result: 'Done with context' }),
    };
    const engine = makeEngine({ subAgentManager: mockSubAgentManager as any });
    const step = makeStep({
      id: 'agent-ctx',
      type: 'agent',
      config: {
        profile: 'researcher',
        taskTemplate: 'Do research',
        contextTemplate: 'Prior context info',
        modelOverride: 'gpt-4o',
        maxTokenBudget: 10000,
      },
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(mockSubAgentManager.delegate).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'Prior context info',
        modelOverride: 'gpt-4o',
        maxTokenBudget: 10000,
      })
    );
  });

  it('omits context when contextTemplate is not provided', async () => {
    const mockSubAgentManager = {
      delegate: vi.fn().mockResolvedValue({ result: 'Done' }),
    };
    const engine = makeEngine({ subAgentManager: mockSubAgentManager as any });
    const step = makeStep({
      id: 'agent-noctx',
      type: 'agent',
      config: { profile: 'researcher', taskTemplate: 'Do research' },
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(mockSubAgentManager.delegate).toHaveBeenCalledWith(
      expect.objectContaining({
        context: undefined,
      })
    );
  });
});

describe('WorkflowEngine.execute — swarm step with optional params', () => {
  it('passes contextTemplate and tokenBudget to swarmManager', async () => {
    const mockSwarmManager = {
      executeSwarm: vi.fn().mockResolvedValue({ result: 'Swarmed' }),
    };
    const engine = makeEngine({ swarmManager: mockSwarmManager as any });
    const step = makeStep({
      id: 'swarm-full',
      type: 'swarm',
      config: {
        templateId: 'tmpl-1',
        taskTemplate: 'Swarm task',
        contextTemplate: 'Swarm context',
        tokenBudget: 25000,
      },
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(mockSwarmManager.executeSwarm).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'Swarm context',
        tokenBudget: 25000,
      })
    );
  });
});

describe('WorkflowEngine.execute — subworkflow nesting depth limit', () => {
  it('fails when subworkflow depth exceeds MAX_SUBWORKFLOW_DEPTH', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    // Set depth to max
    (engine as any).subworkflowDepth = 10;
    const step = makeStep({
      id: 'sub1',
      type: 'subworkflow',
      config: { workflowId: 'wf-sub' },
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });
});

describe('WorkflowEngine.execute — subworkflow with inputTemplate', () => {
  it('passes resolved input to sub-workflow', async () => {
    const subDef = makeDefinition(
      [makeStep({ id: 'sub-step1', type: 'transform', config: { outputTemplate: 'sub-done' } })],
      { id: 'wf-sub', name: 'Sub WF' }
    );
    const subRun = makeRun({
      id: 'sub-run-1',
      workflowId: 'wf-sub',
      output: { 'sub-step1': 'sub-done' },
    });
    const storage = makeStorage();
    (storage.getDefinition as any).mockResolvedValue(subDef);
    (storage.createRun as any).mockResolvedValue(subRun);
    (storage.getRun as any).mockResolvedValue({ ...subRun, output: { result: 'sub-result' } });

    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'sub-with-input',
      type: 'subworkflow',
      config: { workflowId: 'wf-sub', inputTemplate: 'some input data' },
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(storage.createRun).toHaveBeenCalledWith(
      'wf-sub',
      'Sub WF',
      expect.objectContaining({ data: 'some input data' }),
      'subworkflow'
    );
  });
});

describe('WorkflowEngine.execute — output record handling', () => {
  it('stores string output directly as result', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'str-out',
      type: 'transform',
      config: { outputTemplate: 'hello world' },
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(storage.updateStepRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        status: 'completed',
        output: { result: 'hello world' },
      })
    );
  });

  it('stores null output without result wrapper', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'null-out',
      type: 'mcp',
      config: {},
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(storage.updateStepRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        status: 'completed',
        output: null,
      })
    );
  });
});

describe('WorkflowEngine.execute — fallback step without fallbackStepId', () => {
  it('onError=fallback without fallbackStepId — does not crash', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'fb-no-id',
      type: 'agent',
      config: { profile: 'test', taskTemplate: 'do it' },
      onError: 'fallback',
      // no fallbackStepId
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    // Should complete without crash
    expect(storage.updateStepRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'failed' })
    );
  });
});

describe('WorkflowEngine.execute — training_job: distillation not available', () => {
  it('fails when distillationManager not available for distillation job', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'train-dist-na',
      type: 'training_job',
      config: { jobType: 'distillation', jobId: 'job-1' },
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });
});

describe('WorkflowEngine.execute — evaluation without evaluationManager', () => {
  it('fails when evaluationManager not available', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'eval-na',
      type: 'evaluation',
      config: { datasetPath: '/tmp/test.jsonl' },
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });
});

describe('WorkflowEngine.execute — conditional_deploy with NaN metric', () => {
  it('does not deploy when metric is NaN', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'cond-nan',
      type: 'conditional_deploy',
      config: {
        metricPath: 'steps.eval.output.nonexistent',
        threshold: 0.5,
      },
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    // Step should complete but with deployed:false since NaN < threshold
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });
});

describe('WorkflowEngine.execute — conditional_deploy with finetuneManager', () => {
  it('registers with Ollama when finetuneManager and jobId are provided', async () => {
    const mockFinetuneManager = {
      registerWithOllama: vi.fn().mockResolvedValue(undefined),
    };
    const mockLineageStorage = {
      recordDeployment: vi.fn().mockResolvedValue(undefined),
    };
    const engine = makeEngine({
      finetuneManager: mockFinetuneManager as any,
      lineageStorage: mockLineageStorage as any,
    });

    // Set up context with a high metric value
    const evalStep = makeStep({
      id: 'eval',
      type: 'transform',
      config: { outputTemplate: '0.9' },
    });
    const deployStep = makeStep({
      id: 'deploy',
      type: 'conditional_deploy',
      config: {
        metricPath: 'steps.eval.output',
        threshold: 0.5,
        jobId: 'job-123',
      },
      dependsOn: ['eval'],
    });
    const def = makeDefinition([evalStep, deployStep]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(mockFinetuneManager.registerWithOllama).toHaveBeenCalledWith(
      'job-123',
      'http://ollama:11434'
    );
  });

  it('handles Ollama registration failure gracefully (non-fatal)', async () => {
    const storage = makeStorage();
    const mockFinetuneManager = {
      registerWithOllama: vi.fn().mockRejectedValue(new Error('Ollama down')),
    };
    const engine = makeEngine({
      storage,
      finetuneManager: mockFinetuneManager as any,
    });
    const evalStep = makeStep({
      id: 'eval',
      type: 'transform',
      config: { outputTemplate: '0.9' },
    });
    const deployStep = makeStep({
      id: 'deploy',
      type: 'conditional_deploy',
      config: {
        metricPath: 'steps.eval.output',
        threshold: 0.5,
        jobId: 'job-123',
      },
      dependsOn: ['eval'],
    });
    const def = makeDefinition([evalStep, deployStep]);
    const run = makeRun();
    await engine.execute(run, def);
    // Should still succeed
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });
});

describe('WorkflowEngine.execute — triggerMode: any edge cases', () => {
  it('any-step with empty dependsOn behaves like a root step', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const step = makeStep({
      id: 'any-root',
      type: 'transform',
      config: { outputTemplate: 'root-any' },
      triggerMode: 'any' as any,
      dependsOn: [],
    });
    const def = makeDefinition([step]);
    const run = makeRun();
    await engine.execute(run, def);
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });
});

describe('WorkflowEngine.execute — webhook step defaults', () => {
  it('uses POST and no body when not configured', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('ok'),
    });
    try {
      const engine = makeEngine();
      const step = makeStep({
        id: 'wh-defaults',
        type: 'webhook',
        config: { url: 'https://example.com/hook' },
      });
      const def = makeDefinition([step]);
      const run = makeRun();
      await engine.execute(run, def);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.com/hook',
        expect.objectContaining({
          method: 'POST',
          body: undefined,
        })
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
