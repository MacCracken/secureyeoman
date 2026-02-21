import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SwarmStorage } from './swarm-storage.js';

// ─── Mock pool ──────────────────────────────────────────────────────
let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Row fixtures ───────────────────────────────────────────────────

const templateRow = {
  id: 'tmpl-1',
  name: 'Research Team',
  description: 'A research swarm',
  strategy: 'parallel',
  roles: [{ role: 'researcher', profileName: 'researcher', description: 'Does research' }],
  coordinator_profile: null,
  is_builtin: false,
  created_at: Date.now(),
};

const runRow = {
  id: 'run-1',
  template_id: 'tmpl-1',
  template_name: 'Research Team',
  task: 'Analyze the market',
  context: null,
  status: 'pending',
  strategy: 'parallel',
  result: null,
  error: null,
  token_budget: 500000,
  tokens_used_prompt: 0,
  tokens_used_completion: 0,
  created_at: Date.now(),
  started_at: null,
  completed_at: null,
  initiated_by: null,
};

const memberRow = {
  id: 'mem-1',
  swarm_run_id: 'run-1',
  role: 'researcher',
  profile_name: 'researcher',
  delegation_id: null,
  status: 'pending',
  result: null,
  seq_order: 0,
  created_at: Date.now(),
  started_at: null,
  completed_at: null,
};

describe('SwarmStorage', () => {
  let storage: SwarmStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new SwarmStorage();
  });

  describe('seedBuiltinTemplates', () => {
    it('upserts all builtin templates (4)', async () => {
      await storage.seedBuiltinTemplates();
      expect(mockQuery).toHaveBeenCalledTimes(4);
    });
  });

  describe('getTemplate', () => {
    it('returns template when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [templateRow], rowCount: 1 });
      const result = await storage.getTemplate('tmpl-1');
      expect(result!.id).toBe('tmpl-1');
      expect(result!.strategy).toBe('parallel');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getTemplate('no-such');
      expect(result).toBeNull();
    });
  });

  describe('listTemplates', () => {
    it('returns templates with total', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [templateRow, { ...templateRow, id: 'tmpl-2' }],
          rowCount: 2,
        });
      const result = await storage.listTemplates();
      expect(result.total).toBe(2);
      expect(result.templates).toHaveLength(2);
    });

    it('accepts custom limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listTemplates({ limit: 2, offset: 4 });
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('createTemplate', () => {
    it('inserts and returns template', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [templateRow], rowCount: 1 });
      const result = await storage.createTemplate({
        name: 'Research Team',
        description: 'A research swarm',
        strategy: 'parallel',
        roles: [],
      });
      expect(result.name).toBe('Research Team');
    });

    it('uses defaults for optional fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [templateRow], rowCount: 1 });
      await storage.createTemplate({
        name: 'Minimal',
        strategy: 'sequential',
        roles: [],
      });
      expect(mockQuery).toHaveBeenCalledOnce();
    });
  });

  describe('deleteTemplate', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.deleteTemplate('tmpl-1');
      expect(result).toBe(true);
    });

    it('returns false for builtin or missing', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.deleteTemplate('builtin-id');
      expect(result).toBe(false);
    });
  });

  describe('createRun', () => {
    it('inserts run and returns record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [runRow], rowCount: 1 });
      const result = await storage.createRun(
        { task: 'Analyze the market' },
        {
          id: 'tmpl-1',
          name: 'Research Team',
          description: '',
          strategy: 'parallel',
          roles: [],
          coordinatorProfile: null,
          isBuiltin: false,
          createdAt: Date.now(),
        }
      );
      expect(result.id).toBe('run-1');
      expect(result.status).toBe('pending');
    });

    it('uses provided token budget and initiatedBy', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [runRow], rowCount: 1 });
      await storage.createRun(
        { task: 'Task', tokenBudget: 100000, initiatedBy: 'user1', context: 'ctx' },
        {
          id: 'tmpl-1',
          name: 'Team',
          description: '',
          strategy: 'sequential',
          roles: [],
          coordinatorProfile: null,
          isBuiltin: false,
          createdAt: Date.now(),
        }
      );
      expect(mockQuery).toHaveBeenCalledOnce();
    });
  });

  describe('updateRun', () => {
    it('returns null when no updates', async () => {
      const result = await storage.updateRun('run-1', {});
      expect(result).toBeNull();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('updates status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...runRow, status: 'running' }], rowCount: 1 });
      const result = await storage.updateRun('run-1', { status: 'running' });
      expect(result!.status).toBe('running');
    });

    it('updates all fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [runRow], rowCount: 1 });
      await storage.updateRun('run-1', {
        status: 'completed',
        result: 'done',
        error: null,
        tokensUsedPrompt: 100,
        tokensUsedCompletion: 200,
        startedAt: Date.now(),
        completedAt: Date.now(),
      });
      expect(mockQuery).toHaveBeenCalledOnce();
    });
  });

  describe('getRun', () => {
    it('returns run when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [runRow], rowCount: 1 });
      const result = await storage.getRun('run-1');
      expect(result!.id).toBe('run-1');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getRun('no-such');
      expect(result).toBeNull();
    });
  });

  describe('listRuns', () => {
    it('returns runs without filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [runRow], rowCount: 1 });
      const result = await storage.listRuns();
      expect(result.total).toBe(1);
      expect(result.runs).toHaveLength(1);
    });

    it('filters by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listRuns({ status: 'running', limit: 10, offset: 0 });
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('createMember', () => {
    it('inserts and returns member', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [memberRow], rowCount: 1 });
      const result = await storage.createMember({
        swarmRunId: 'run-1',
        role: 'researcher',
        profileName: 'researcher',
        seqOrder: 0,
      });
      expect(result.id).toBe('mem-1');
      expect(result.role).toBe('researcher');
    });
  });

  describe('updateMember', () => {
    it('returns null when no updates', async () => {
      const result = await storage.updateMember('mem-1', {});
      expect(result).toBeNull();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('updates status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...memberRow, status: 'running' }], rowCount: 1 });
      const result = await storage.updateMember('mem-1', { status: 'running' });
      expect(result!.status).toBe('running');
    });

    it('updates all fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [memberRow], rowCount: 1 });
      await storage.updateMember('mem-1', {
        status: 'completed',
        result: 'done',
        delegationId: 'del-1',
        startedAt: Date.now(),
        completedAt: Date.now(),
      });
      expect(mockQuery).toHaveBeenCalledOnce();
    });
  });

  describe('getMembersForRun', () => {
    it('returns members for run', async () => {
      const m2 = { ...memberRow, id: 'mem-2', seq_order: 1 };
      mockQuery.mockResolvedValueOnce({ rows: [memberRow, m2], rowCount: 2 });
      const result = await storage.getMembersForRun('run-1');
      expect(result).toHaveLength(2);
    });

    it('returns empty when no members', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getMembersForRun('run-empty');
      expect(result).toHaveLength(0);
    });
  });
});
