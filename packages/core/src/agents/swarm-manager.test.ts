import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SwarmManager } from './swarm-manager.js';
import type { SwarmStorage } from './swarm-storage.js';
import type { SubAgentManager } from './manager.js';

// ── Mock data ────────────────────────────────────────────────────────

const TEMPLATE = {
  id: 'tmpl-1',
  name: 'research-and-code',
  description: 'Sequential pipeline',
  strategy: 'sequential' as const,
  roles: [
    { role: 'researcher', profileName: 'researcher', description: 'Gather info' },
    { role: 'coder', profileName: 'coder', description: 'Implement' },
  ],
  coordinatorProfile: null,
  isBuiltin: false,
  createdAt: 1000,
};

const RUN = {
  id: 'run-1',
  templateId: 'tmpl-1',
  task: 'Build feature',
  status: 'pending' as const,
  results: [],
  totalTokensUsed: 0,
  createdAt: 1000,
  completedAt: null,
  startedAt: null,
  result: null,
  error: null,
  tokensUsedPrompt: 0,
  tokensUsedCompletion: 0,
  context: null,
  tokenBudget: null,
  members: [],
};

const MEMBER = {
  id: 'mem-1',
  swarmRunId: 'run-1',
  role: 'researcher',
  profileName: 'researcher',
  seqOrder: 0,
  status: 'pending' as const,
  result: null,
  delegationId: null,
  startedAt: null,
  completedAt: null,
};

const DELEGATION_RESULT = {
  delegationId: 'del-1',
  profile: 'researcher',
  status: 'completed' as const,
  result: 'Research done',
  error: null,
  tokenUsage: { prompt: 100, completion: 50, total: 150 },
  durationMs: 500,
  subDelegations: [],
};

function makeMockStorage(overrides?: Partial<SwarmStorage>): SwarmStorage {
  return {
    seedBuiltinTemplates: vi.fn().mockResolvedValue(undefined),
    listTemplates: vi.fn().mockResolvedValue({ templates: [TEMPLATE], total: 1 }),
    getTemplate: vi.fn().mockResolvedValue(TEMPLATE),
    createTemplate: vi.fn().mockResolvedValue(TEMPLATE),
    deleteTemplate: vi.fn().mockResolvedValue(true),
    createRun: vi.fn().mockResolvedValue(RUN),
    getRun: vi.fn().mockResolvedValue(RUN),
    updateRun: vi.fn().mockResolvedValue(undefined),
    listRuns: vi.fn().mockResolvedValue({ runs: [RUN], total: 1 }),
    getMembersForRun: vi.fn().mockResolvedValue([MEMBER]),
    createMember: vi.fn().mockResolvedValue(MEMBER),
    updateMember: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SwarmStorage;
}

function makeMockSubAgentManager(overrides?: Partial<SubAgentManager>): SubAgentManager {
  return {
    delegate: vi.fn().mockResolvedValue(DELEGATION_RESULT),
    ...overrides,
  } as unknown as SubAgentManager;
}

function makeMockLogger() {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

function buildManager(
  storageOverrides?: Partial<SwarmStorage>,
  agentOverrides?: Partial<SubAgentManager>
) {
  const storage = makeMockStorage(storageOverrides);
  const subAgentManager = makeMockSubAgentManager(agentOverrides);
  const logger = makeMockLogger();
  const manager = new SwarmManager({
    storage: storage as any,
    subAgentManager: subAgentManager as any,
    logger: logger as any,
  });
  return { manager, storage, subAgentManager, logger };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('SwarmManager.initialize', () => {
  it('calls seedBuiltinTemplates', async () => {
    const { manager, storage } = buildManager();
    await manager.initialize();
    expect(storage.seedBuiltinTemplates).toHaveBeenCalledOnce();
  });
});

describe('SwarmManager.listTemplates', () => {
  it('delegates to storage', async () => {
    const { manager, storage } = buildManager();
    const result = await manager.listTemplates({ limit: 10, offset: 0 });
    expect(storage.listTemplates).toHaveBeenCalledWith({ limit: 10, offset: 0 });
    expect(result.templates).toHaveLength(1);
  });
});

describe('SwarmManager.getTemplate', () => {
  it('returns template from storage', async () => {
    const { manager } = buildManager();
    const tmpl = await manager.getTemplate('tmpl-1');
    expect(tmpl?.id).toBe('tmpl-1');
  });

  it('returns null when not found', async () => {
    const { manager } = buildManager({ getTemplate: vi.fn().mockResolvedValue(null) });
    const tmpl = await manager.getTemplate('missing');
    expect(tmpl).toBeNull();
  });
});

describe('SwarmManager.createTemplate', () => {
  it('delegates to storage and returns template', async () => {
    const { manager, storage } = buildManager();
    const result = await manager.createTemplate({
      name: 'new-template',
      strategy: 'sequential',
      roles: [],
    });
    expect(storage.createTemplate).toHaveBeenCalledOnce();
    expect(result.id).toBe('tmpl-1');
  });
});

describe('SwarmManager.deleteTemplate', () => {
  it('delegates to storage', async () => {
    const { manager, storage } = buildManager();
    const result = await manager.deleteTemplate('tmpl-1');
    expect(storage.deleteTemplate).toHaveBeenCalledWith('tmpl-1');
    expect(result).toBe(true);
  });
});

describe('SwarmManager.getSwarmRun', () => {
  it('returns run merged with members', async () => {
    const { manager } = buildManager();
    const run = await manager.getSwarmRun('run-1');
    expect(run?.id).toBe('run-1');
    expect(run?.members).toHaveLength(1);
    expect(run?.members[0].role).toBe('researcher');
  });

  it('returns null when run not found', async () => {
    const { manager } = buildManager({ getRun: vi.fn().mockResolvedValue(null) });
    const run = await manager.getSwarmRun('missing');
    expect(run).toBeNull();
  });
});

describe('SwarmManager.listSwarmRuns', () => {
  it('delegates to storage', async () => {
    const { manager, storage } = buildManager();
    const result = await manager.listSwarmRuns({ status: 'completed', limit: 5 });
    expect(storage.listRuns).toHaveBeenCalledWith({ status: 'completed', limit: 5 });
    expect(result.runs).toHaveLength(1);
  });
});

describe('SwarmManager.cancelSwarm', () => {
  it('cancels a pending run', async () => {
    const { manager, storage } = buildManager({
      getRun: vi.fn().mockResolvedValue({ ...RUN, status: 'pending' }),
    });
    await manager.cancelSwarm('run-1');
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'cancelled' })
    );
  });

  it('cancels a running run', async () => {
    const { manager, storage } = buildManager({
      getRun: vi.fn().mockResolvedValue({ ...RUN, status: 'running' }),
    });
    await manager.cancelSwarm('run-1');
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'cancelled' })
    );
  });

  it('throws when run not found', async () => {
    const { manager } = buildManager({ getRun: vi.fn().mockResolvedValue(null) });
    await expect(manager.cancelSwarm('missing')).rejects.toThrow('not found');
  });

  it('throws when run is already completed', async () => {
    const { manager } = buildManager({
      getRun: vi.fn().mockResolvedValue({ ...RUN, status: 'completed' }),
    });
    await expect(manager.cancelSwarm('run-1')).rejects.toThrow('Cannot cancel');
  });

  it('throws when run is failed', async () => {
    const { manager } = buildManager({
      getRun: vi.fn().mockResolvedValue({ ...RUN, status: 'failed' }),
    });
    await expect(manager.cancelSwarm('run-1')).rejects.toThrow('Cannot cancel');
  });
});

describe('SwarmManager.executeSwarm — sequential strategy', () => {
  it('runs sequential strategy and returns completed run', async () => {
    const coderMember = { ...MEMBER, id: 'mem-2', role: 'coder', seqOrder: 1 };
    const createMemberMock = vi
      .fn()
      .mockResolvedValueOnce(MEMBER)
      .mockResolvedValueOnce(coderMember);

    const finalRun = {
      ...RUN,
      status: 'completed',
      result: 'Done',
      members: [MEMBER, coderMember],
    };
    const getRun = vi
      .fn()
      .mockResolvedValueOnce(RUN) // initial getRun in executeSwarm
      .mockResolvedValueOnce(finalRun); // final getSwarmRun

    const { manager, subAgentManager } = buildManager({
      createMember: createMemberMock,
      getRun,
      getMembersForRun: vi.fn().mockResolvedValue([MEMBER, coderMember]),
    });

    const result = await manager.executeSwarm({ templateId: 'tmpl-1', task: 'Build feature' });
    expect(result.id).toBe('run-1');
    expect(subAgentManager.delegate).toHaveBeenCalledTimes(2);
  });

  it('throws when template not found', async () => {
    const { manager } = buildManager({ getTemplate: vi.fn().mockResolvedValue(null) });
    await expect(manager.executeSwarm({ templateId: 'missing', task: 'task' })).rejects.toThrow(
      'not found'
    );
  });

  it('marks member as failed but run as completed when delegate throws in sequential mode', async () => {
    const { manager, storage } = buildManager(
      { createMember: vi.fn().mockResolvedValue(MEMBER) },
      { delegate: vi.fn().mockRejectedValue(new Error('profile not found')) }
    );
    await manager.executeSwarm({ templateId: 'tmpl-1', task: 'Build feature' });
    // Member is marked failed
    expect(storage.updateMember).toHaveBeenCalledWith(
      MEMBER.id,
      expect.objectContaining({ status: 'failed' })
    );
    // Run still completes (error captured in result string)
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });
});

describe('SwarmManager.executeSwarm — parallel strategy', () => {
  const PARALLEL_TEMPLATE = {
    ...TEMPLATE,
    strategy: 'parallel' as const,
    coordinatorProfile: null,
  };

  it('runs parallel strategy and combines results', async () => {
    const mem2 = { ...MEMBER, id: 'mem-2', role: 'coder', seqOrder: 1 };
    const createMemberMock = vi.fn().mockResolvedValueOnce(MEMBER).mockResolvedValueOnce(mem2);

    const { manager, subAgentManager } = buildManager({
      getTemplate: vi.fn().mockResolvedValue(PARALLEL_TEMPLATE),
      createMember: createMemberMock,
    });

    await manager.executeSwarm({ templateId: 'tmpl-1', task: 'Build feature' });
    expect(subAgentManager.delegate).toHaveBeenCalledTimes(2);
  });

  it('synthesizes results with coordinator when coordinatorProfile is set', async () => {
    const parallelWithCoordinator = {
      ...PARALLEL_TEMPLATE,
      coordinatorProfile: 'coordinator',
    };
    const coordMember = { ...MEMBER, id: 'mem-coord', role: 'coordinator', seqOrder: 2 };
    const createMemberMock = vi
      .fn()
      .mockResolvedValueOnce(MEMBER)
      .mockResolvedValueOnce({ ...MEMBER, id: 'mem-2', role: 'coder', seqOrder: 1 })
      .mockResolvedValueOnce(coordMember);

    const { manager, subAgentManager } = buildManager({
      getTemplate: vi.fn().mockResolvedValue(parallelWithCoordinator),
      createMember: createMemberMock,
    });

    await manager.executeSwarm({ templateId: 'tmpl-1', task: 'Build feature' });
    // Called for researcher + coder + coordinator
    expect(subAgentManager.delegate).toHaveBeenCalledTimes(3);
  });
});

describe('SwarmManager.executeSwarm — dynamic strategy', () => {
  const DYNAMIC_TEMPLATE = {
    ...TEMPLATE,
    strategy: 'dynamic' as const,
    roles: [],
    coordinatorProfile: 'researcher',
  };

  it('delegates to coordinator profile', async () => {
    const { manager, subAgentManager } = buildManager({
      getTemplate: vi.fn().mockResolvedValue(DYNAMIC_TEMPLATE),
      createMember: vi.fn().mockResolvedValue(MEMBER),
    });

    await manager.executeSwarm({ templateId: 'tmpl-1', task: 'Build feature' });
    expect(subAgentManager.delegate).toHaveBeenCalledOnce();
    expect(subAgentManager.delegate).toHaveBeenCalledWith(
      expect.objectContaining({ profile: 'researcher' })
    );
  });

  it('uses default coordinator profile when not set', async () => {
    const dynamicNoCoord = { ...DYNAMIC_TEMPLATE, coordinatorProfile: null };
    const { manager, subAgentManager } = buildManager({
      getTemplate: vi.fn().mockResolvedValue(dynamicNoCoord),
      createMember: vi.fn().mockResolvedValue(MEMBER),
    });

    await manager.executeSwarm({ templateId: 'tmpl-1', task: 'Build feature' });
    expect(subAgentManager.delegate).toHaveBeenCalledWith(
      expect.objectContaining({ profile: 'researcher' }) // falls back to 'researcher'
    );
  });
});
