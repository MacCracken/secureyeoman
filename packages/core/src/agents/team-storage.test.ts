import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamStorage } from './team-storage.js';

// ─── Mock pool ───────────────────────────────────────────────────────
let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Fixtures ────────────────────────────────────────────────────────

const now = Date.now();

const teamRow = {
  id: 'team-1',
  name: 'Research Team',
  description: 'A research team',
  members: [{ role: 'Researcher', profileName: 'researcher', description: 'Does research' }],
  coordinator_profile_name: 'researcher',
  is_builtin: false,
  created_at: now,
  updated_at: now,
};

const runRow = {
  id: 'run-1',
  team_id: 'team-1',
  team_name: 'Research Team',
  task: 'Analyze the market',
  status: 'pending',
  result: null,
  error: null,
  coordinator_reasoning: null,
  assigned_members: [],
  token_budget: 200000,
  tokens_used: 0,
  created_at: now,
  started_at: null,
  completed_at: null,
  initiated_by: null,
};

function ok(rows: any[], rowCount = rows.length) {
  return Promise.resolve({ rows, rowCount });
}

describe('TeamStorage', () => {
  let storage: TeamStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new TeamStorage();
  });

  // ── Teams ───────────────────────────────────────────────────────

  describe('createTeam', () => {
    it('inserts team and returns record', async () => {
      mockQuery.mockResolvedValueOnce(ok([teamRow]));
      const result = await storage.createTeam({
        name: 'Research Team',
        description: 'A research team',
        members: [{ role: 'Researcher', profileName: 'researcher', description: 'Does research' }],
        coordinatorProfileName: 'researcher',
      });
      expect(result.id).toBe('team-1');
      expect(result.name).toBe('Research Team');
      expect(result.isBuiltin).toBe(false);
    });

    it('throws when DB returns no row', async () => {
      mockQuery.mockResolvedValueOnce(ok([]));
      await expect(storage.createTeam({ name: 'Fail', members: [] })).rejects.toThrow(
        'Failed to create team'
      );
    });

    it('handles optional fields', async () => {
      mockQuery.mockResolvedValueOnce(
        ok([{ ...teamRow, description: null, coordinator_profile_name: null }])
      );
      const result = await storage.createTeam({ name: 'Minimal', members: [] });
      expect(result.description).toBeUndefined();
      expect(result.coordinatorProfileName).toBeUndefined();
    });
  });

  describe('getTeam', () => {
    it('returns team when found', async () => {
      mockQuery.mockResolvedValueOnce(ok([teamRow]));
      const result = await storage.getTeam('team-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('team-1');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce(ok([]));
      expect(await storage.getTeam('no-such')).toBeNull();
    });
  });

  describe('listTeams', () => {
    it('returns teams with total', async () => {
      const team2 = { ...teamRow, id: 'team-2', name: 'Security Team' };
      mockQuery
        .mockResolvedValueOnce(ok([teamRow, team2])) // rows
        .mockResolvedValueOnce(ok([{ count: '2' }])); // count
      const result = await storage.listTeams();
      expect(result.total).toBe(2);
      expect(result.teams).toHaveLength(2);
    });

    it('uses default limit/offset', async () => {
      mockQuery.mockResolvedValueOnce(ok([])).mockResolvedValueOnce(ok([{ count: '0' }]));
      const result = await storage.listTeams();
      expect(result.total).toBe(0);
    });

    it('passes custom limit and offset', async () => {
      mockQuery.mockResolvedValueOnce(ok([])).mockResolvedValueOnce(ok([{ count: '10' }]));
      await storage.listTeams({ limit: 5, offset: 5 });
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateTeam', () => {
    it('updates name only', async () => {
      mockQuery.mockResolvedValueOnce(ok([{ ...teamRow, name: 'New Name' }]));
      const result = await storage.updateTeam('team-1', { name: 'New Name' });
      expect(result.name).toBe('New Name');
    });

    it('throws when team not found', async () => {
      mockQuery.mockResolvedValueOnce(ok([]));
      await expect(storage.updateTeam('no-such', { name: 'X' })).rejects.toThrow('Team not found');
    });

    it('updates all fields', async () => {
      mockQuery.mockResolvedValueOnce(ok([teamRow]));
      await storage.updateTeam('team-1', {
        name: 'Updated',
        description: 'new desc',
        members: [],
        coordinatorProfileName: 'analyst',
      });
      expect(mockQuery).toHaveBeenCalledOnce();
    });
  });

  describe('deleteTeam', () => {
    it('executes DELETE query', async () => {
      await storage.deleteTeam('team-1');
      expect(mockQuery).toHaveBeenCalledOnce();
      expect(mockQuery.mock.calls[0][0]).toContain('DELETE FROM agents.teams');
    });
  });

  describe('seedBuiltinTeams', () => {
    it('seeds 3 builtin teams when none exist (2 queries per team)', async () => {
      // For each of 3 teams: queryOne(SELECT) returns no row → execute(INSERT)
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      await storage.seedBuiltinTeams();
      // 3 SELECT + 3 INSERT = 6 calls
      expect(mockQuery).toHaveBeenCalledTimes(6);
    });

    it('skips existing builtin teams', async () => {
      // Each SELECT returns an existing row → skips INSERT
      mockQuery.mockResolvedValue({ rows: [{ id: 'existing' }], rowCount: 1 });
      await storage.seedBuiltinTeams();
      // 3 SELECT calls only (no INSERTs)
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });
  });

  // ── Runs ────────────────────────────────────────────────────────

  describe('createRun', () => {
    it('inserts run and returns record', async () => {
      mockQuery.mockResolvedValueOnce(ok([runRow]));
      const result = await storage.createRun({
        teamId: 'team-1',
        teamName: 'Research Team',
        task: 'Analyze the market',
        tokenBudget: 200000,
      });
      expect(result.id).toBe('run-1');
      expect(result.status).toBe('pending');
      expect(result.teamId).toBe('team-1');
    });

    it('handles initiatedBy', async () => {
      mockQuery.mockResolvedValueOnce(ok([{ ...runRow, initiated_by: 'user-1' }]));
      const result = await storage.createRun({
        teamId: 'team-1',
        teamName: 'Research Team',
        task: 'task',
        tokenBudget: 100000,
        initiatedBy: 'user-1',
      });
      expect(result.initiatedBy).toBe('user-1');
    });

    it('throws when DB returns no row', async () => {
      mockQuery.mockResolvedValueOnce(ok([]));
      await expect(
        storage.createRun({ teamId: 't', teamName: 'T', task: 'x', tokenBudget: 1 })
      ).rejects.toThrow('Failed to create team run');
    });
  });

  describe('getRun', () => {
    it('returns run when found', async () => {
      mockQuery.mockResolvedValueOnce(ok([runRow]));
      const result = await storage.getRun('run-1');
      expect(result!.id).toBe('run-1');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce(ok([]));
      expect(await storage.getRun('no-such')).toBeNull();
    });
  });

  describe('updateRun', () => {
    it('returns early when no fields to update', async () => {
      await storage.updateRun('run-1', {});
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('updates status', async () => {
      await storage.updateRun('run-1', { status: 'running' });
      expect(mockQuery).toHaveBeenCalledOnce();
    });

    it('updates all fields including null result/error', async () => {
      await storage.updateRun('run-1', {
        status: 'completed',
        result: 'done',
        error: null,
        coordinatorReasoning: 'I chose the researcher',
        assignedMembers: ['researcher'],
        tokensUsed: 500,
        startedAt: now,
        completedAt: now,
      });
      expect(mockQuery).toHaveBeenCalledOnce();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE agents.team_runs');
    });

    it("updates 'result' when value is null (in updates guard)", async () => {
      await storage.updateRun('run-1', { result: null });
      expect(mockQuery).toHaveBeenCalledOnce();
    });

    it("updates 'error' when value is null", async () => {
      await storage.updateRun('run-1', { error: null });
      expect(mockQuery).toHaveBeenCalledOnce();
    });

    it("updates 'coordinatorReasoning' when value is null", async () => {
      await storage.updateRun('run-1', { coordinatorReasoning: null });
      expect(mockQuery).toHaveBeenCalledOnce();
    });
  });

  describe('listRuns', () => {
    it('returns all runs without team filter', async () => {
      mockQuery.mockResolvedValueOnce(ok([runRow])).mockResolvedValueOnce(ok([{ count: '1' }]));
      const result = await storage.listRuns();
      expect(result.total).toBe(1);
      expect(result.runs).toHaveLength(1);
    });

    it('filters by teamId', async () => {
      mockQuery.mockResolvedValueOnce(ok([runRow])).mockResolvedValueOnce(ok([{ count: '1' }]));
      const result = await storage.listRuns('team-1');
      expect(result.runs).toHaveLength(1);
    });

    it('maps null timestamps correctly', async () => {
      mockQuery.mockResolvedValueOnce(ok([runRow])).mockResolvedValueOnce(ok([{ count: '1' }]));
      const result = await storage.listRuns();
      expect(result.runs[0].startedAt).toBeNull();
      expect(result.runs[0].completedAt).toBeNull();
    });
  });
});
