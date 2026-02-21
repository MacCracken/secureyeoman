import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubAgentStorage } from './storage.js';

// ─── Mock pool ──────────────────────────────────────────────────────
let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Helpers ────────────────────────────────────────────────────────

const profileRow = {
  id: 'prof-1',
  name: 'researcher',
  description: 'Research agent',
  system_prompt: 'You are a researcher',
  max_token_budget: 50000,
  allowed_tools: ['web_search'],
  default_model: null,
  is_builtin: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  type: 'llm',
  command: null,
  command_args: null,
  command_env: null,
  mcp_tool: null,
  mcp_tool_input: null,
};

const delegationRow = {
  id: 'del-1',
  parent_delegation_id: null,
  profile_id: 'prof-1',
  task: 'test task',
  context: null,
  status: 'pending',
  result: null,
  error: null,
  depth: 0,
  max_depth: 3,
  token_budget: 50000,
  tokens_used_prompt: 0,
  tokens_used_completion: 0,
  timeout_ms: 300000,
  started_at: null,
  completed_at: null,
  created_at: '2024-01-01T00:00:00Z',
  initiated_by: null,
  correlation_id: null,
};

const messageRow = {
  id: 'msg-1',
  delegation_id: 'del-1',
  role: 'user',
  content: 'hello',
  tool_calls: null,
  tool_result: null,
  token_count: 10,
  created_at: '2024-01-01T00:00:00Z',
};

function ok(rows: any[], rowCount = rows.length) {
  return Promise.resolve({ rows, rowCount });
}

describe('SubAgentStorage', () => {
  let storage: SubAgentStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new SubAgentStorage();
  });

  describe('seedBuiltinProfiles', () => {
    it('inserts each builtin profile via upsert', async () => {
      await storage.seedBuiltinProfiles();
      // 4 builtin profiles
      expect(mockQuery).toHaveBeenCalledTimes(4);
    });
  });

  describe('getProfile', () => {
    it('returns profile when row is found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [profileRow], rowCount: 1 });
      const result = await storage.getProfile('prof-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('prof-1');
      expect(result!.name).toBe('researcher');
      expect(result!.systemPrompt).toBe('You are a researcher');
    });

    it('returns null when no row found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getProfile('no-such-id');
      expect(result).toBeNull();
    });
  });

  describe('getProfileByName', () => {
    it('returns profile when found by name', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [profileRow], rowCount: 1 });
      const result = await storage.getProfileByName('researcher');
      expect(result!.name).toBe('researcher');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getProfileByName('unknown');
      expect(result).toBeNull();
    });
  });

  describe('listProfiles', () => {
    it('returns profiles list with count', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 }) // count
        .mockResolvedValueOnce({
          rows: [profileRow, { ...profileRow, id: 'prof-2', name: 'coder' }],
          rowCount: 2,
        }); // rows
      const result = await storage.listProfiles();
      expect(result.total).toBe(2);
      expect(result.profiles).toHaveLength(2);
    });

    it('uses defaults for limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.listProfiles();
      expect(result.total).toBe(0);
      expect(result.profiles).toHaveLength(0);
    });

    it('accepts custom limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listProfiles({ limit: 5, offset: 5 });
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('createProfile', () => {
    it('inserts a new profile and returns it', async () => {
      const newRow = { ...profileRow, id: 'new-id', name: 'custom', is_builtin: false };
      mockQuery.mockResolvedValueOnce({ rows: [newRow], rowCount: 1 });
      const result = await storage.createProfile({
        name: 'custom',
        systemPrompt: 'You are custom',
        maxTokenBudget: 30000,
        allowedTools: [],
      });
      expect(result.name).toBe('custom');
    });

    it('uses defaults for optional fields', async () => {
      const newRow = { ...profileRow };
      mockQuery.mockResolvedValueOnce({ rows: [newRow], rowCount: 1 });
      await storage.createProfile({ name: 'minimal', systemPrompt: 'prompt' });
      expect(mockQuery).toHaveBeenCalledOnce();
    });
  });

  describe('updateProfile', () => {
    it('returns null when profile does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // getProfile returns null
      const result = await storage.updateProfile('no-such', { name: 'new' });
      expect(result).toBeNull();
    });

    it('returns existing when no updates provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [profileRow], rowCount: 1 }); // getProfile
      const result = await storage.updateProfile('prof-1', {});
      expect(result!.id).toBe('prof-1');
      expect(mockQuery).toHaveBeenCalledOnce(); // only getProfile call
    });

    it('updates name when provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [profileRow], rowCount: 1 }) // getProfile
        .mockResolvedValueOnce({ rows: [{ ...profileRow, name: 'new-name' }], rowCount: 1 }); // update
      const result = await storage.updateProfile('prof-1', { name: 'new-name' });
      expect(result!.name).toBe('new-name');
    });

    it('updates multiple fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [profileRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ ...profileRow, max_token_budget: 80000 }], rowCount: 1 });
      await storage.updateProfile('prof-1', {
        name: 'updated',
        description: 'desc',
        systemPrompt: 'prompt',
        maxTokenBudget: 80000,
        allowedTools: ['search'],
        defaultModel: 'gpt-4',
      });
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteProfile', () => {
    it('returns true when row deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.deleteProfile('prof-1');
      expect(result).toBe(true);
    });

    it('returns false when no row deleted (builtin or not found)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.deleteProfile('builtin-id');
      expect(result).toBe(false);
    });
  });

  describe('createDelegation', () => {
    it('inserts delegation and returns record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [delegationRow], rowCount: 1 });
      const result = await storage.createDelegation({
        id: 'del-1',
        profileId: 'prof-1',
        task: 'test task',
        status: 'pending',
        depth: 0,
        maxDepth: 3,
        tokenBudget: 50000,
        timeoutMs: 300000,
      });
      expect(result.id).toBe('del-1');
      expect(result.status).toBe('pending');
    });

    it('accepts optional fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            ...delegationRow,
            parent_delegation_id: 'parent-1',
            initiated_by: 'user1',
            correlation_id: 'corr-1',
            context: 'ctx',
          },
        ],
        rowCount: 1,
      });
      const result = await storage.createDelegation({
        id: 'del-2',
        parentDelegationId: 'parent-1',
        profileId: 'prof-1',
        task: 'task',
        context: 'ctx',
        status: 'running',
        depth: 1,
        maxDepth: 3,
        tokenBudget: 50000,
        timeoutMs: 300000,
        initiatedBy: 'user1',
        correlationId: 'corr-1',
      });
      expect(result.parentDelegationId).toBe('parent-1');
    });
  });

  describe('updateDelegation', () => {
    it('returns null when no updates provided', async () => {
      const result = await storage.updateDelegation('del-1', {});
      expect(result).toBeNull();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('updates status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...delegationRow, status: 'completed' }],
        rowCount: 1,
      });
      const result = await storage.updateDelegation('del-1', { status: 'completed' });
      expect(result!.status).toBe('completed');
    });

    it('updates all fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [delegationRow], rowCount: 1 });
      await storage.updateDelegation('del-1', {
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

  describe('getDelegation', () => {
    it('returns delegation when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [delegationRow], rowCount: 1 });
      const result = await storage.getDelegation('del-1');
      expect(result!.id).toBe('del-1');
      expect(result!.depth).toBe(0);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getDelegation('no-such');
      expect(result).toBeNull();
    });
  });

  describe('listDelegations', () => {
    it('returns delegations without filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [delegationRow], rowCount: 1 });
      const result = await storage.listDelegations();
      expect(result.total).toBe(1);
      expect(result.delegations).toHaveLength(1);
    });

    it('filters by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [delegationRow], rowCount: 1 });
      await storage.listDelegations({ status: 'pending' });
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('filters by profileId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listDelegations({ profileId: 'prof-1', limit: 10, offset: 0 });
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('getActiveDelegations', () => {
    it('returns active delegations', async () => {
      const runningRow = { ...delegationRow, status: 'running' };
      mockQuery.mockResolvedValueOnce({ rows: [delegationRow, runningRow], rowCount: 2 });
      const result = await storage.getActiveDelegations();
      expect(result).toHaveLength(2);
    });

    it('returns empty array when none active', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getActiveDelegations();
      expect(result).toHaveLength(0);
    });
  });

  describe('getDelegationTree', () => {
    it('returns tree records', async () => {
      const child = { ...delegationRow, id: 'del-2', parent_delegation_id: 'del-1', depth: 1 };
      mockQuery.mockResolvedValueOnce({ rows: [delegationRow, child], rowCount: 2 });
      const result = await storage.getDelegationTree('del-1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('del-1');
    });
  });

  describe('storeDelegationMessage', () => {
    it('inserts and returns message record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [messageRow], rowCount: 1 });
      const result = await storage.storeDelegationMessage({
        delegationId: 'del-1',
        role: 'user',
        content: 'hello',
      });
      expect(result.delegationId).toBe('del-1');
      expect(result.role).toBe('user');
      expect(result.tokenCount).toBe(10);
    });

    it('handles tool calls and results', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [messageRow], rowCount: 1 });
      await storage.storeDelegationMessage({
        delegationId: 'del-1',
        role: 'assistant',
        toolCalls: [{ name: 'search', input: {} }],
        toolResult: { result: 'ok' },
        tokenCount: 50,
      });
      expect(mockQuery).toHaveBeenCalledOnce();
    });
  });

  describe('getDelegationMessages', () => {
    it('returns messages for delegation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [messageRow], rowCount: 1 });
      const result = await storage.getDelegationMessages('del-1');
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
    });

    it('returns empty array when no messages', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getDelegationMessages('del-empty');
      expect(result).toHaveLength(0);
    });
  });

  describe('close', () => {
    it('is a no-op', () => {
      expect(() => storage.close()).not.toThrow();
    });
  });
});
