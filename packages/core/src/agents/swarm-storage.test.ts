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
    it('upserts all builtin templates (5)', async () => {
      await storage.seedBuiltinTemplates();
      expect(mockQuery).toHaveBeenCalledTimes(5);
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

  // ── Additional coverage tests ────────────────────────────────────

  describe('updateTemplate', () => {
    it('returns null when no fields provided', async () => {
      const result = await storage.updateTemplate('tmpl-1', {});
      expect(result).toBeNull();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('updates name only', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...templateRow, name: 'New Name' }],
        rowCount: 1,
      });
      const result = await storage.updateTemplate('tmpl-1', { name: 'New Name' });
      expect(result!.name).toBe('New Name');
    });

    it('updates description only', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...templateRow, description: 'Updated desc' }],
        rowCount: 1,
      });
      const result = await storage.updateTemplate('tmpl-1', { description: 'Updated desc' });
      expect(result!.description).toBe('Updated desc');
    });

    it('updates strategy only', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...templateRow, strategy: 'sequential' }],
        rowCount: 1,
      });
      const result = await storage.updateTemplate('tmpl-1', { strategy: 'sequential' as any });
      expect(result!.strategy).toBe('sequential');
    });

    it('updates roles only', async () => {
      const newRoles = [{ role: 'writer', profileName: 'writer', description: 'Writes' }];
      mockQuery.mockResolvedValueOnce({ rows: [{ ...templateRow, roles: newRoles }], rowCount: 1 });
      const result = await storage.updateTemplate('tmpl-1', { roles: newRoles as any });
      expect(result!.roles).toEqual(newRoles);
    });

    it('updates coordinatorProfile', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...templateRow, coordinator_profile: 'coord-1' }],
        rowCount: 1,
      });
      const result = await storage.updateTemplate('tmpl-1', { coordinatorProfile: 'coord-1' });
      expect(result!.coordinatorProfile).toBe('coord-1');
    });

    it('updates coordinatorProfile to null (via undefined value)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...templateRow, coordinator_profile: null }],
        rowCount: 1,
      });
      // When coordinatorProfile is explicitly in the data object with undefined value,
      // the `'coordinatorProfile' in data` check is true and it pushes null
      const data = { coordinatorProfile: undefined };
      const result = await storage.updateTemplate('tmpl-1', data as any);
      expect(result!.coordinatorProfile).toBeNull();
    });

    it('returns null when template not found (builtin or missing)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.updateTemplate('no-such', { name: 'X' });
      expect(result).toBeNull();
    });

    it('updates multiple fields at once', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...templateRow, name: 'New', description: 'Desc', strategy: 'sequential' }],
        rowCount: 1,
      });
      const result = await storage.updateTemplate('tmpl-1', {
        name: 'New',
        description: 'Desc',
        strategy: 'sequential' as any,
      });
      expect(result!.name).toBe('New');
    });
  });

  describe('updateRun — individual field branches', () => {
    it('updates result only', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...runRow, result: 'output' }], rowCount: 1 });
      const result = await storage.updateRun('run-1', { result: 'output' });
      expect(result!.result).toBe('output');
    });

    it('updates error only', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...runRow, error: 'fail' }], rowCount: 1 });
      const result = await storage.updateRun('run-1', { error: 'fail' });
      expect(result!.error).toBe('fail');
    });

    it('updates tokensUsedPrompt only', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...runRow, tokens_used_prompt: 500 }],
        rowCount: 1,
      });
      const result = await storage.updateRun('run-1', { tokensUsedPrompt: 500 });
      expect(result!.tokensUsedPrompt).toBe(500);
    });

    it('updates tokensUsedCompletion only', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...runRow, tokens_used_completion: 300 }],
        rowCount: 1,
      });
      const result = await storage.updateRun('run-1', { tokensUsedCompletion: 300 });
      expect(result!.tokensUsedCompletion).toBe(300);
    });

    it('updates startedAt only', async () => {
      const now = Date.now();
      mockQuery.mockResolvedValueOnce({ rows: [{ ...runRow, started_at: now }], rowCount: 1 });
      const result = await storage.updateRun('run-1', { startedAt: now });
      expect(result!.startedAt).toBe(now);
    });

    it('updates completedAt only', async () => {
      const now = Date.now();
      mockQuery.mockResolvedValueOnce({ rows: [{ ...runRow, completed_at: now }], rowCount: 1 });
      const result = await storage.updateRun('run-1', { completedAt: now });
      expect(result!.completedAt).toBe(now);
    });

    it('returns null when run not found after update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.updateRun('no-such', { status: 'completed' as any });
      expect(result).toBeNull();
    });
  });

  describe('updateMember — individual field branches', () => {
    it('updates result only', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...memberRow, result: 'output' }], rowCount: 1 });
      const result = await storage.updateMember('mem-1', { result: 'output' });
      expect(result!.result).toBe('output');
    });

    it('updates delegationId only', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...memberRow, delegation_id: 'del-2' }],
        rowCount: 1,
      });
      const result = await storage.updateMember('mem-1', { delegationId: 'del-2' });
      expect(result!.delegationId).toBe('del-2');
    });

    it('updates startedAt only', async () => {
      const now = Date.now();
      mockQuery.mockResolvedValueOnce({ rows: [{ ...memberRow, started_at: now }], rowCount: 1 });
      const result = await storage.updateMember('mem-1', { startedAt: now });
      expect(result!.startedAt).toBe(now);
    });

    it('updates completedAt only', async () => {
      const now = Date.now();
      mockQuery.mockResolvedValueOnce({ rows: [{ ...memberRow, completed_at: now }], rowCount: 1 });
      const result = await storage.updateMember('mem-1', { completedAt: now });
      expect(result!.completedAt).toBe(now);
    });

    it('returns null when member not found after update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.updateMember('no-such', { status: 'done' });
      expect(result).toBeNull();
    });
  });

  describe('toTs helper (via row mapping)', () => {
    it('converts ISO string timestamp', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            ...runRow,
            created_at: '2024-01-15T10:00:00Z',
            started_at: '2024-01-15T10:01:00Z',
            completed_at: null,
          },
        ],
        rowCount: 1,
      });
      const result = await storage.getRun('run-1');
      expect(result!.createdAt).toBe(new Date('2024-01-15T10:00:00Z').getTime());
      expect(result!.startedAt).toBe(new Date('2024-01-15T10:01:00Z').getTime());
      expect(result!.completedAt).toBeNull();
    });

    it('passes through numeric timestamps', async () => {
      const ts = 1700000000000;
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...memberRow, created_at: ts, started_at: ts, completed_at: ts }],
        rowCount: 1,
      });
      const members = await storage.getMembersForRun('run-1');
      expect(members[0]!.createdAt).toBe(ts);
      expect(members[0]!.startedAt).toBe(ts);
      expect(members[0]!.completedAt).toBe(ts);
    });

    it('handles null/undefined in optional timestamps', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...runRow, started_at: undefined, completed_at: null }],
        rowCount: 1,
      });
      const result = await storage.getRun('run-1');
      expect(result!.startedAt).toBeNull();
      expect(result!.completedAt).toBeNull();
    });
  });

  describe('templateFromRow — roles null fallback', () => {
    it('uses empty array when roles is null', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...templateRow, roles: null }],
        rowCount: 1,
      });
      const result = await storage.getTemplate('tmpl-1');
      expect(result!.roles).toEqual([]);
    });
  });

  describe('listTemplates — countResult null fallback', () => {
    it('returns total 0 when countResult is null', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // count returns no rows
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.listTemplates();
      expect(result.total).toBe(0);
    });
  });

  describe('listRuns — countRow null fallback', () => {
    it('returns total 0 when countRow is null', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // count returns no rows
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.listRuns();
      expect(result.total).toBe(0);
    });
  });

  describe('getProfileSkills', () => {
    it('maps raw rows to CatalogSkill objects', async () => {
      const now = Date.now();
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'skill-1',
            name: 'Test Skill',
            description: 'A skill',
            version: '2.0.0',
            author: 'alice',
            author_info: { name: 'Alice' },
            category: 'security',
            tags: ['a', 'b'],
            download_count: 10,
            rating: 4.5,
            installed: true,
            installed_globally: false,
            source: 'published',
            origin: 'marketplace',
            published_at: now,
            instructions: 'Do stuff',
            trigger_patterns: ['hello'],
            use_when: 'always',
            do_not_use_when: 'never',
            success_criteria: 'works',
            mcp_tools_allowed: ['tool1'],
            routing: 'explicit',
            autonomy_level: 'L2',
            tools: [],
            created_at: now,
            updated_at: now,
          },
        ],
        rowCount: 1,
      });
      const skills = await storage.getProfileSkills('profile-1');
      expect(skills).toHaveLength(1);
      expect(skills[0]!.id).toBe('skill-1');
      expect(skills[0]!.name).toBe('Test Skill');
      expect(skills[0]!.version).toBe('2.0.0');
      expect(skills[0]!.category).toBe('security');
      expect(skills[0]!.routing).toBe('explicit');
      expect(skills[0]!.autonomyLevel).toBe('L2');
    });

    it('uses defaults for null/missing fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'skill-2',
            name: 'Minimal',
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
        rowCount: 1,
      });
      const skills = await storage.getProfileSkills('profile-1');
      expect(skills[0]!.description).toBe('');
      expect(skills[0]!.version).toBe('1.0.0');
      expect(skills[0]!.author).toBe('');
      expect(skills[0]!.category).toBe('general');
      expect(skills[0]!.tags).toEqual([]);
      expect(skills[0]!.downloadCount).toBe(0);
      expect(skills[0]!.rating).toBe(0);
      expect(skills[0]!.installed).toBe(false);
      expect(skills[0]!.installedGlobally).toBe(false);
      expect(skills[0]!.source).toBe('published');
      expect(skills[0]!.origin).toBe('marketplace');
      expect(skills[0]!.publishedAt).toBe(0);
      expect(skills[0]!.instructions).toBe('');
      expect(skills[0]!.triggerPatterns).toEqual([]);
      expect(skills[0]!.useWhen).toBe('');
      expect(skills[0]!.doNotUseWhen).toBe('');
      expect(skills[0]!.successCriteria).toBe('');
      expect(skills[0]!.mcpToolsAllowed).toEqual([]);
      expect(skills[0]!.routing).toBe('fuzzy');
      expect(skills[0]!.autonomyLevel).toBe('L1');
      expect(skills[0]!.tools).toEqual([]);
    });

    it('returns empty array when no skills', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const skills = await storage.getProfileSkills('profile-empty');
      expect(skills).toEqual([]);
    });
  });

  describe('addProfileSkill', () => {
    it('calls query with insert', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.addProfileSkill('profile-1', 'skill-1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agents.profile_skills'),
        ['profile-1', 'skill-1']
      );
    });
  });

  describe('removeProfileSkill', () => {
    it('calls execute with delete', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.removeProfileSkill('profile-1', 'skill-1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM agents.profile_skills'),
        ['profile-1', 'skill-1']
      );
    });
  });

  describe('createTemplate — optional field defaults', () => {
    it('uses empty string for description when not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [templateRow], rowCount: 1 });
      await storage.createTemplate({
        name: 'No Desc',
        strategy: 'parallel',
        roles: [],
      });
      // The second arg to the INSERT should include '' for description
      const callArgs = mockQuery.mock.calls[0][1] as unknown[];
      expect(callArgs[2]).toBe(''); // description default
    });

    it('passes coordinatorProfile when provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...templateRow, coordinator_profile: 'coord' }],
        rowCount: 1,
      });
      await storage.createTemplate({
        name: 'With Coord',
        strategy: 'parallel',
        roles: [],
        coordinatorProfile: 'coord',
      });
      const callArgs = mockQuery.mock.calls[0][1] as unknown[];
      expect(callArgs[5]).toBe('coord');
    });
  });
});
