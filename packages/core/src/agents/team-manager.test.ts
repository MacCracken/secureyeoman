/**
 * TeamManager unit tests
 *
 * Uses mocked storage + subAgentManager + AIClient — no database required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamManager } from './team-manager.js';
import type { TeamStorage } from './team-storage.js';
import type { SubAgentManager } from './manager.js';
import type { SecureLogger } from '../logging/logger.js';
import type { TeamDefinition, TeamRun } from '@secureyeoman/shared';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../ai/client.js', () => ({
  AIClient: vi.fn().mockImplementation(function () {
    return {
      chat: vi.fn().mockResolvedValue({
        content: '{"assignTo":["researcher"],"reasoning":"Best fit"}',
        usage: { totalTokens: 100 },
      }),
    };
  }),
}));

const TEAM: TeamDefinition = {
  id: 'team-1',
  name: 'Research Team',
  description: 'Research and analysis',
  members: [
    { role: 'Researcher', profileName: 'researcher', description: 'Gathers info' },
    { role: 'Analyst', profileName: 'analyst', description: 'Analyses data' },
  ],
  coordinatorProfileName: 'researcher',
  isBuiltin: false,
  createdAt: 1000,
  updatedAt: 1000,
};

const RUN: TeamRun = {
  id: 'run-1',
  teamId: 'team-1',
  teamName: 'Research Team',
  task: 'Research AI trends',
  status: 'pending',
  result: null,
  error: null,
  coordinatorReasoning: null,
  assignedMembers: [],
  tokenBudget: 100000,
  tokensUsed: 0,
  createdAt: 1000,
  startedAt: null,
  completedAt: null,
};

function makeStorage(overrides: Partial<TeamStorage> = {}): TeamStorage {
  return {
    createTeam: vi.fn().mockResolvedValue(TEAM),
    getTeam: vi.fn().mockResolvedValue(TEAM),
    listTeams: vi.fn().mockResolvedValue({ teams: [TEAM], total: 1 }),
    updateTeam: vi.fn().mockResolvedValue(TEAM),
    deleteTeam: vi.fn().mockResolvedValue(undefined),
    seedBuiltinTeams: vi.fn().mockResolvedValue(undefined),
    createRun: vi.fn().mockResolvedValue(RUN),
    getRun: vi.fn().mockResolvedValue(RUN),
    updateRun: vi.fn().mockResolvedValue(undefined),
    listRuns: vi.fn().mockResolvedValue({ runs: [RUN], total: 1 }),
    ...overrides,
  } as unknown as TeamStorage;
}

function makeSubAgentManager(): SubAgentManager {
  return {
    delegate: vi.fn().mockResolvedValue({
      result: 'AI trends analysis done',
      tokensUsed: 500,
    }),
  } as unknown as SubAgentManager;
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

function makeManager(overrides: { storage?: TeamStorage; subAgentManager?: SubAgentManager } = {}) {
  return new TeamManager({
    storage: overrides.storage ?? makeStorage(),
    subAgentManager: overrides.subAgentManager ?? makeSubAgentManager(),
    aiClientConfig: { model: { provider: 'anthropic', model: 'claude-3-haiku-20240307' } as never },
    aiClientDeps: {},
    logger: makeLogger(),
  });
}

// ── initialize ────────────────────────────────────────────────────────────────

describe('TeamManager.initialize', () => {
  it('seeds builtin teams on init', async () => {
    const storage = makeStorage();
    const manager = makeManager({ storage });
    await manager.initialize();
    expect(storage.seedBuiltinTeams).toHaveBeenCalledOnce();
  });
});

// ── CRUD ──────────────────────────────────────────────────────────────────────

describe('TeamManager CRUD', () => {
  let manager: TeamManager;
  let storage: TeamStorage;

  beforeEach(() => {
    storage = makeStorage();
    manager = makeManager({ storage });
  });

  it('createTeam delegates to storage', async () => {
    const data = { name: 'My Team', members: [{ role: 'Dev', profileName: 'coder' }] };
    await manager.createTeam(data);
    expect(storage.createTeam).toHaveBeenCalledWith(data);
  });

  it('getTeam returns team from storage', async () => {
    const team = await manager.getTeam('team-1');
    expect(team?.id).toBe('team-1');
  });

  it('getTeam returns null when not found', async () => {
    (storage.getTeam as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const team = await manager.getTeam('missing');
    expect(team).toBeNull();
  });

  it('listTeams returns paginated list', async () => {
    const result = await manager.listTeams({ limit: 10, offset: 0 });
    expect(result.teams).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('updateTeam rejects builtin teams', async () => {
    (storage.getTeam as ReturnType<typeof vi.fn>).mockResolvedValue({ ...TEAM, isBuiltin: true });
    await expect(manager.updateTeam('team-1', { name: 'New Name' })).rejects.toThrow('builtin');
  });

  it('updateTeam throws when team not found', async () => {
    (storage.getTeam as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(manager.updateTeam('missing', { name: 'x' })).rejects.toThrow('not found');
  });

  it('updateTeam succeeds for non-builtin teams', async () => {
    await manager.updateTeam('team-1', { name: 'Updated' });
    expect(storage.updateTeam).toHaveBeenCalledWith('team-1', { name: 'Updated' });
  });

  it('deleteTeam rejects builtin teams', async () => {
    (storage.getTeam as ReturnType<typeof vi.fn>).mockResolvedValue({ ...TEAM, isBuiltin: true });
    await expect(manager.deleteTeam('team-1')).rejects.toThrow('builtin');
  });

  it('deleteTeam throws when team not found', async () => {
    (storage.getTeam as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(manager.deleteTeam('missing')).rejects.toThrow('not found');
  });
});

// ── run ───────────────────────────────────────────────────────────────────────

describe('TeamManager.run', () => {
  it('throws when team not found', async () => {
    const storage = makeStorage({ getTeam: vi.fn().mockResolvedValue(null) });
    const manager = makeManager({ storage });
    await expect(manager.run('missing', { task: 'do thing', tokenBudget: 1000 })).rejects.toThrow(
      'not found'
    );
  });

  it('creates a run record and returns it immediately (fire-and-forget)', async () => {
    const storage = makeStorage();
    const manager = makeManager({ storage });
    const run = await manager.run('team-1', { task: 'research AI', tokenBudget: 10000 });
    expect(storage.createRun).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'team-1', task: 'research AI' })
    );
    expect(run.id).toBe('run-1');
    expect(run.status).toBe('pending');
  });

  it('delegates to subAgentManager when coordinator assigns a member', async () => {
    const subAgentManager = makeSubAgentManager();
    const storage = makeStorage();
    const manager = makeManager({ storage, subAgentManager });

    // Allow _executeRun to complete
    await manager.run('team-1', { task: 'research AI', tokenBudget: 10000 });
    // Give the fire-and-forget time to run
    await new Promise((r) => setTimeout(r, 50));

    expect(subAgentManager.delegate).toHaveBeenCalledWith(
      expect.objectContaining({ profile: 'researcher', task: 'research AI' })
    );
  });

  it('getRun returns run from storage', async () => {
    const storage = makeStorage();
    const manager = makeManager({ storage });
    const run = await manager.getRun('run-1');
    expect(run?.id).toBe('run-1');
  });

  it('listRuns delegates to storage', async () => {
    const storage = makeStorage();
    const manager = makeManager({ storage });
    const result = await manager.listRuns('team-1', { limit: 10 });
    expect(result.runs).toHaveLength(1);
  });
});

// ── coordinator fallback ───────────────────────────────────────────────────────

describe('TeamManager coordinator fallback', () => {
  it('falls back to first member when coordinator returns invalid JSON', async () => {
    const { AIClient } = await import('../ai/client.js');
    (AIClient as ReturnType<typeof vi.fn>).mockImplementationOnce(function () {
      return {
        chat: vi.fn().mockResolvedValue({
          content: 'I cannot decide at this time.',
          usage: { totalTokens: 50 },
        }),
      };
    });

    const subAgentManager = makeSubAgentManager();
    const storage = makeStorage();
    const manager = makeManager({ storage, subAgentManager });

    await manager.run('team-1', { task: 'do something', tokenBudget: 1000 });
    await new Promise((r) => setTimeout(r, 50));

    // Should have delegated to the first member as fallback
    expect(subAgentManager.delegate).toHaveBeenCalledWith(
      expect.objectContaining({ profile: 'researcher' })
    );
  });
});
