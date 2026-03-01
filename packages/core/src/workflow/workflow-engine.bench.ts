/**
 * WorkflowEngine Performance Benchmarks
 *
 * Targets the two pure-computation hot paths:
 *   1. topologicalSort — called once per workflow run; complexity O(V+E)
 *   2. resolveTemplate — called N times per step for Mustache interpolation
 *   3. evaluateCondition — called per conditional step
 *
 * Run:  npm run bench --workspace=packages/core
 *       -- or --
 *       cd packages/core && npx vitest bench
 */

import { bench, describe } from 'vitest';
import { WorkflowEngine, type WorkflowEngineContext } from './workflow-engine.js';
import type { WorkflowStep } from '@secureyeoman/shared';

// ── Minimal engine instance (no external deps needed for pure-compute paths) ──

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => mockLogger,
} as any;

const mockStorage = {} as any;

const engine = new WorkflowEngine({ storage: mockStorage, logger: mockLogger });

// ── Step graph fixtures ───────────────────────────────────────────────────────

function makeLinearSteps(n: number): WorkflowStep[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `step_${i}`,
    name: `Step ${i}`,
    type: 'agent' as const,
    config: {},
    dependsOn: i === 0 ? [] : [`step_${i - 1}`],
    onError: 'fail' as const,
    retryPolicy: undefined,
    condition: undefined,
    triggerMode: 'all' as const,
  }));
}

function makeDiamondSteps(n: number): WorkflowStep[] {
  // Fan out from step_0, all converge at the last step
  const steps: WorkflowStep[] = [
    {
      id: 'root',
      name: 'Root',
      type: 'agent' as const,
      config: {},
      dependsOn: [],
      onError: 'fail' as const,
      retryPolicy: undefined,
      condition: undefined,
      triggerMode: 'all' as const,
    },
  ];

  for (let i = 0; i < n - 2; i++) {
    steps.push({
      id: `branch_${i}`,
      name: `Branch ${i}`,
      type: 'transform' as const,
      config: {},
      dependsOn: ['root'],
      onError: 'continue' as const,
      retryPolicy: undefined,
      condition: undefined,
      triggerMode: 'all' as const,
    });
  }

  steps.push({
    id: 'merge',
    name: 'Merge',
    type: 'transform' as const,
    config: {},
    dependsOn: steps.filter((s) => s.id !== 'root').map((s) => s.id),
    onError: 'fail' as const,
    retryPolicy: undefined,
    condition: undefined,
    triggerMode: 'all' as const,
  });

  return steps;
}

const LINEAR_5 = makeLinearSteps(5);
const LINEAR_20 = makeLinearSteps(20);
const LINEAR_50 = makeLinearSteps(50);
const DIAMOND_10 = makeDiamondSteps(10);
const DIAMOND_30 = makeDiamondSteps(30);

// ── Template context fixtures ─────────────────────────────────────────────────

const CTX_SIMPLE: WorkflowEngineContext = {
  steps: {
    step_0: { output: 'hello world', status: 'completed' },
  },
  input: { topic: 'benchmarking', limit: 42 },
};

const CTX_DEEP: WorkflowEngineContext = {
  steps: {
    fetch: { output: { data: { rows: [{ id: 1, name: 'Alice' }] } }, status: 'completed' },
    transform: { output: { summary: 'done', count: 1 }, status: 'completed' },
    validate: { output: { valid: true, score: 0.97 }, status: 'completed' },
  },
  input: { repo: 'my-org/my-repo', ref: 'main', webhookUrl: 'https://hooks.example.com/abc' },
};

// ── Benchmarks: topological sort ─────────────────────────────────────────────

describe('WorkflowEngine.topologicalSort', () => {
  bench('linear 5 steps', () => {
    (engine as any).topologicalSort(LINEAR_5);
  });

  bench('linear 20 steps', () => {
    (engine as any).topologicalSort(LINEAR_20);
  });

  bench('linear 50 steps', () => {
    (engine as any).topologicalSort(LINEAR_50);
  });

  bench('diamond 10 steps (fan-out/fan-in)', () => {
    (engine as any).topologicalSort(DIAMOND_10);
  });

  bench('diamond 30 steps (fan-out/fan-in)', () => {
    (engine as any).topologicalSort(DIAMOND_30);
  });
});

// ── Benchmarks: template resolution ──────────────────────────────────────────

describe('WorkflowEngine.resolveTemplate', () => {
  bench('no placeholders', () => {
    engine.resolveTemplate('Hello, this is a static string with no interpolation needed.', CTX_SIMPLE);
  });

  bench('single shallow placeholder', () => {
    engine.resolveTemplate('Topic: {{input.topic}}', CTX_SIMPLE);
  });

  bench('multiple shallow placeholders', () => {
    engine.resolveTemplate(
      'Repo: {{input.repo}} @ {{input.ref}} — webhook: {{input.webhookUrl}}',
      CTX_DEEP
    );
  });

  bench('deep nested placeholder', () => {
    engine.resolveTemplate('Score: {{steps.validate.output.score}}', CTX_DEEP);
  });

  bench('complex webhook body template', () => {
    engine.resolveTemplate(
      '{"status":"completed","repo":"{{input.repo}}","ref":"{{input.ref}}","count":"{{steps.transform.output.count}}","valid":"{{steps.validate.output.valid}}"}',
      CTX_DEEP
    );
  });

  bench('missing key (graceful empty)', () => {
    engine.resolveTemplate('Value: {{steps.nonexistent.output.field}}', CTX_SIMPLE);
  });

  bench('object value (JSON.stringify path)', () => {
    engine.resolveTemplate('Data: {{steps.fetch.output}}', CTX_DEEP);
  });
});

// ── Benchmarks: condition evaluation ─────────────────────────────────────────

describe('WorkflowEngine.evaluateCondition', () => {
  bench('simple truthy', () => {
    engine.evaluateCondition('steps.transform && steps.transform.status === "completed"', CTX_DEEP);
  });

  bench('comparison with threshold', () => {
    engine.evaluateCondition('steps.validate.output.score >= 0.9', CTX_DEEP);
  });

  bench('complex AND/OR expression', () => {
    engine.evaluateCondition(
      'steps.fetch.status === "completed" && steps.transform.status === "completed" && steps.validate.output.valid',
      CTX_DEEP
    );
  });

  bench('malformed (error fast-path)', () => {
    engine.evaluateCondition('this is not valid javascript %%%', CTX_SIMPLE);
  });
});
