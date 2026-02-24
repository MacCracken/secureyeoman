/**
 * WorkflowStorage integration tests
 *
 * Requires a running PostgreSQL instance (TEST_DB_* env vars).
 * Covers: definition CRUD, run CRUD, step-run CRUD, seed idempotency, pagination.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { WorkflowStorage } from './workflow-storage.js';
import { setupTestDb, teardownTestDb, truncateWorkflowTables } from '../test-setup.js';
import type { WorkflowStep } from '@secureyeoman/shared';

function makeStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: 'step1',
    type: 'transform',
    name: 'Step 1',
    config: { outputTemplate: 'hello' },
    dependsOn: [],
    onError: 'fail',
    ...overrides,
  };
}

function defData(name: string) {
  return {
    name,
    steps: [] as WorkflowStep[],
    edges: [] as never[],
    triggers: [] as never[],
    version: 1 as const,
    createdBy: 'system',
    isEnabled: true,
  };
}

describe('WorkflowStorage', () => {
  let storage: WorkflowStorage;

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateWorkflowTables();
    storage = new WorkflowStorage();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // ── Definitions ────────────────────────────────────────────────────────────

  describe('createDefinition / getDefinition', () => {
    it('creates and retrieves a definition with all fields', async () => {
      const def = await storage.createDefinition({
        name: 'Test Workflow',
        description: 'A test',
        steps: [makeStep()],
        edges: [],
        triggers: [],
        isEnabled: true,
        version: 1,
        createdBy: 'system',
      });

      expect(def.id).toBeDefined();
      expect(def.name).toBe('Test Workflow');
      expect(def.description).toBe('A test');
      expect(def.steps).toHaveLength(1);
      expect(def.isEnabled).toBe(true);
      expect(def.createdAt).toBeGreaterThan(0);

      const retrieved = await storage.getDefinition(def.id);
      expect(retrieved?.id).toBe(def.id);
      expect(retrieved?.name).toBe('Test Workflow');
    });

    it('returns null for a missing definition', async () => {
      expect(await storage.getDefinition('nonexistent')).toBeNull();
    });
  });

  describe('listDefinitions', () => {
    it('lists definitions ordered by name ascending', async () => {
      await storage.createDefinition(defData('Bravo'));
      await storage.createDefinition(defData('Alpha'));

      const { definitions, total } = await storage.listDefinitions();
      expect(total).toBe(2);
      expect(definitions[0].name).toBe('Alpha');
      expect(definitions[1].name).toBe('Bravo');
    });

    it('supports limit/offset pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await storage.createDefinition(defData(`Workflow-${i}`));
      }

      const page = await storage.listDefinitions({ limit: 2, offset: 1 });
      expect(page.total).toBe(5);
      expect(page.definitions).toHaveLength(2);
    });

    it('returns empty list when no definitions exist', async () => {
      const { definitions, total } = await storage.listDefinitions();
      expect(total).toBe(0);
      expect(definitions).toHaveLength(0);
    });
  });

  describe('updateDefinition', () => {
    it('updates name and isEnabled', async () => {
      const def = await storage.createDefinition(defData('Old Name'));
      const updated = await storage.updateDefinition(def.id, { name: 'New Name', isEnabled: false });
      expect(updated?.name).toBe('New Name');
      expect(updated?.isEnabled).toBe(false);
    });

    it('updates steps, edges, triggers, and version', async () => {
      const def = await storage.createDefinition(defData('Wf'));
      const updated = await storage.updateDefinition(def.id, {
        steps: [makeStep({ id: 'new-step', name: 'New Step' })],
        version: 2,
      });
      expect(updated?.steps).toHaveLength(1);
      expect(updated?.steps[0].id).toBe('new-step');
      expect(updated?.version).toBe(2);
    });

    it('returns current definition unchanged when no fields provided', async () => {
      const def = await storage.createDefinition(defData('Same'));
      const result = await storage.updateDefinition(def.id, {});
      expect(result?.id).toBe(def.id);
      expect(result?.name).toBe('Same');
    });

    it('returns null when definition not found', async () => {
      expect(await storage.updateDefinition('nonexistent', { name: 'x' })).toBeNull();
    });
  });

  describe('deleteDefinition', () => {
    it('deletes a definition and returns true', async () => {
      const def = await storage.createDefinition(defData('Delete Me'));
      expect(await storage.deleteDefinition(def.id)).toBe(true);
      expect(await storage.getDefinition(def.id)).toBeNull();
    });

    it('returns false when definition not found', async () => {
      expect(await storage.deleteDefinition('nonexistent')).toBe(false);
    });
  });

  describe('seedBuiltinWorkflows', () => {
    it('seeds a workflow on first call and skips on second (idempotent)', async () => {
      const templates = [defData('Builtin Workflow')];
      await storage.seedBuiltinWorkflows(templates);
      await storage.seedBuiltinWorkflows(templates);

      const { total } = await storage.listDefinitions();
      expect(total).toBe(1);
    });
  });

  // ── Runs ───────────────────────────────────────────────────────────────────

  describe('createRun / getRun', () => {
    it('creates and retrieves a run', async () => {
      const def = await storage.createDefinition(defData('Wf'));
      const run = await storage.createRun(def.id, def.name, { key: 'val' }, 'api');

      expect(run.id).toBeDefined();
      expect(run.workflowId).toBe(def.id);
      expect(run.status).toBe('pending');
      expect(run.input).toEqual({ key: 'val' });
      expect(run.triggeredBy).toBe('api');

      const retrieved = await storage.getRun(run.id);
      expect(retrieved?.id).toBe(run.id);
      expect(retrieved?.status).toBe('pending');
    });

    it('creates run with null input', async () => {
      const def = await storage.createDefinition(defData('Wf'));
      const run = await storage.createRun(def.id, def.name, null);
      expect(run.input).toBeNull();
    });

    it('returns null for a missing run', async () => {
      expect(await storage.getRun('nonexistent')).toBeNull();
    });
  });

  describe('updateRun', () => {
    it('updates status and completedAt', async () => {
      const def = await storage.createDefinition(defData('Wf'));
      const run = await storage.createRun(def.id, def.name);
      const now = Date.now();

      const updated = await storage.updateRun(run.id, { status: 'completed', completedAt: now });
      expect(updated?.status).toBe('completed');
      expect(updated?.completedAt).toBe(now);
    });

    it('updates output and error fields', async () => {
      const def = await storage.createDefinition(defData('Wf'));
      const run = await storage.createRun(def.id, def.name);

      const updated = await storage.updateRun(run.id, {
        status: 'failed',
        error: 'something went wrong',
        output: { step1: 'partial' },
      });
      expect(updated?.error).toBe('something went wrong');
      expect(updated?.output).toEqual({ step1: 'partial' });
    });

    it('returns null when no updates given', async () => {
      const def = await storage.createDefinition(defData('Wf'));
      const run = await storage.createRun(def.id, def.name);
      expect(await storage.updateRun(run.id, {})).toBeNull();
    });
  });

  describe('listRuns', () => {
    it('lists all runs ordered by created_at desc', async () => {
      const def = await storage.createDefinition(defData('Wf'));
      const r1 = await storage.createRun(def.id, def.name);
      const r2 = await storage.createRun(def.id, def.name);

      const { runs, total } = await storage.listRuns();
      expect(total).toBe(2);
      // Most recently created is first
      expect(runs[0].id).toBe(r2.id);
      expect(runs[1].id).toBe(r1.id);
    });

    it('filters by workflowId', async () => {
      const def1 = await storage.createDefinition(defData('Wf1'));
      const def2 = await storage.createDefinition(defData('Wf2'));
      await storage.createRun(def1.id, def1.name);
      await storage.createRun(def2.id, def2.name);

      const { runs, total } = await storage.listRuns(def1.id);
      expect(total).toBe(1);
      expect(runs[0].workflowId).toBe(def1.id);
    });

    it('supports limit/offset pagination', async () => {
      const def = await storage.createDefinition(defData('Wf'));
      for (let i = 0; i < 5; i++) {
        await storage.createRun(def.id, def.name);
      }

      const page = await storage.listRuns(undefined, { limit: 2, offset: 1 });
      expect(page.total).toBe(5);
      expect(page.runs).toHaveLength(2);
    });
  });

  // ── Step runs ──────────────────────────────────────────────────────────────

  describe('createStepRun / getStepRunsForRun', () => {
    it('creates step runs and retrieves them for a run', async () => {
      const def = await storage.createDefinition(defData('Wf'));
      const run = await storage.createRun(def.id, def.name);

      const sr1 = await storage.createStepRun(run.id, 'step1', 'Step 1', 'transform');
      const sr2 = await storage.createStepRun(run.id, 'step2', 'Step 2', 'condition');

      expect(sr1.id).toBeDefined();
      expect(sr1.stepId).toBe('step1');
      expect(sr1.status).toBe('pending');

      const stepRuns = await storage.getStepRunsForRun(run.id);
      expect(stepRuns).toHaveLength(2);
      expect(stepRuns.some((sr) => sr.stepId === 'step1')).toBe(true);
      expect(stepRuns.some((sr) => sr.stepId === 'step2')).toBe(true);
    });

    it('returns empty array when run has no step runs', async () => {
      const def = await storage.createDefinition(defData('Wf'));
      const run = await storage.createRun(def.id, def.name);
      expect(await storage.getStepRunsForRun(run.id)).toHaveLength(0);
    });
  });

  describe('updateStepRun', () => {
    it('updates status, completedAt, durationMs, and output', async () => {
      const def = await storage.createDefinition(defData('Wf'));
      const run = await storage.createRun(def.id, def.name);
      const sr = await storage.createStepRun(run.id, 'step1', 'Step 1', 'transform');

      const now = Date.now();
      const updated = await storage.updateStepRun(sr.id, {
        status: 'completed',
        completedAt: now,
        durationMs: 500,
        output: { result: 'done' },
      });

      expect(updated?.status).toBe('completed');
      expect(updated?.durationMs).toBe(500);
      expect(updated?.output).toEqual({ result: 'done' });
    });

    it('updates error field on failure', async () => {
      const def = await storage.createDefinition(defData('Wf'));
      const run = await storage.createRun(def.id, def.name);
      const sr = await storage.createStepRun(run.id, 'step1', 'Step 1', 'agent');

      const updated = await storage.updateStepRun(sr.id, {
        status: 'failed',
        error: 'agent unavailable',
      });
      expect(updated?.status).toBe('failed');
      expect(updated?.error).toBe('agent unavailable');
    });

    it('returns null when no updates given', async () => {
      const def = await storage.createDefinition(defData('Wf'));
      const run = await storage.createRun(def.id, def.name);
      const sr = await storage.createStepRun(run.id, 'step1', 'Step 1', 'transform');
      expect(await storage.updateStepRun(sr.id, {})).toBeNull();
    });
  });
});
