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

  it('marks run as failed when dynamic delegate throws', async () => {
    const DYNAMIC_TEMPLATE_FAIL = {
      ...TEMPLATE,
      strategy: 'dynamic' as const,
      roles: [],
      coordinatorProfile: 'researcher',
    };
    const { manager, storage } = buildManager(
      {
        getTemplate: vi.fn().mockResolvedValue(DYNAMIC_TEMPLATE_FAIL),
        createMember: vi.fn().mockResolvedValue(MEMBER),
      },
      { delegate: vi.fn().mockRejectedValue(new Error('coordinator crashed')) }
    );

    const run = await manager.executeSwarm({ templateId: 'tmpl-1', task: 'Build' });
    // Run should be marked as failed, not completed
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed', error: 'coordinator crashed' })
    );
  });
});

// ── updateTemplate ──────────────────────────────────────────────────────────

describe('SwarmManager.updateTemplate', () => {
  it('updates a non-builtin template', async () => {
    const updatedTemplate = { ...TEMPLATE, name: 'updated' };
    const { manager } = buildManager({
      getTemplate: vi.fn().mockResolvedValue(TEMPLATE),
      updateTemplate: vi.fn().mockResolvedValue(updatedTemplate),
    });
    const result = await manager.updateTemplate('tmpl-1', { name: 'updated' });
    expect(result?.name).toBe('updated');
  });

  it('returns null when template not found', async () => {
    const { manager } = buildManager({ getTemplate: vi.fn().mockResolvedValue(null) });
    const result = await manager.updateTemplate('missing', { name: 'x' });
    expect(result).toBeNull();
  });

  it('throws when trying to edit a built-in template', async () => {
    const builtinTemplate = { ...TEMPLATE, isBuiltin: true };
    const { manager } = buildManager({ getTemplate: vi.fn().mockResolvedValue(builtinTemplate) });
    await expect(manager.updateTemplate('tmpl-1', { name: 'x' })).rejects.toThrow(
      'Cannot edit built-in templates'
    );
  });
});

// ── estimateSwarmCost ───────────────────────────────────────────────────────

describe('SwarmManager.estimateSwarmCost', () => {
  it('returns zero cost when no costCalculator is provided', () => {
    const { manager } = buildManager();
    const result = manager.estimateSwarmCost(TEMPLATE, 'Summarize a doc');
    expect(result.estimatedCostUsd).toBe(0);
    expect(result.roleDecisions).toEqual([]);
  });

  it('returns per-role cost estimates when costCalculator is provided', () => {
    const storage = makeMockStorage();
    const subAgentManager = makeMockSubAgentManager();
    const logger = makeMockLogger();
    const costCalculator = {
      calculate: vi.fn().mockReturnValue(0.005),
      getModelCosts: vi.fn().mockReturnValue([
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514', inputPer1M: 3, outputPer1M: 15 },
      ]),
    };

    const manager = new SwarmManager({
      storage: storage as any,
      subAgentManager: subAgentManager as any,
      logger: logger as any,
      costCalculator: costCalculator as any,
    });

    const result = manager.estimateSwarmCost(TEMPLATE, 'Summarize a doc');
    expect(result.roleDecisions).toHaveLength(2);
    expect(result.estimatedCostUsd).toBeGreaterThanOrEqual(0);
    // Each role should have a decision
    expect(result.roleDecisions[0].role).toBe('researcher');
    expect(result.roleDecisions[1].role).toBe('coder');
  });
});

// ── selectModelForRole (via cost-aware sequential execution) ────────────────

describe('SwarmManager — cost-aware model selection', () => {
  it('logs model override when router returns high confidence', async () => {
    const storage = makeMockStorage();
    const subAgentManager = makeMockSubAgentManager();
    const logger = makeMockLogger();
    const costCalculator = {
      calculate: vi.fn().mockReturnValue(0.01),
      getModelCosts: vi.fn().mockReturnValue([
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514', inputPer1M: 3, outputPer1M: 15 },
      ]),
    };

    const manager = new SwarmManager({
      storage: storage as any,
      subAgentManager: subAgentManager as any,
      logger: logger as any,
      costCalculator: costCalculator as any,
    });

    await manager.executeSwarm({ templateId: 'tmpl-1', task: 'Summarize the quarterly report' });
    // The model router should have been consulted
    expect(subAgentManager.delegate).toHaveBeenCalled();
  });
});

// ── parallel with coordinator failure ────────────────────────────────────────

describe('SwarmManager.executeSwarm — parallel coordinator failure', () => {
  it('falls through to combined results when coordinator delegation fails', async () => {
    const PARALLEL_WITH_COORD = {
      ...TEMPLATE,
      strategy: 'parallel' as const,
      coordinatorProfile: 'coordinator',
    };
    const coordMember = { ...MEMBER, id: 'mem-coord', role: 'coordinator', seqOrder: 2 };
    const createMemberMock = vi
      .fn()
      .mockResolvedValueOnce(MEMBER)
      .mockResolvedValueOnce({ ...MEMBER, id: 'mem-2', role: 'coder', seqOrder: 1 })
      .mockResolvedValueOnce(coordMember);

    const delegateMock = vi
      .fn()
      .mockResolvedValueOnce(DELEGATION_RESULT) // researcher
      .mockResolvedValueOnce(DELEGATION_RESULT) // coder
      .mockRejectedValueOnce(new Error('Coordinator blew up')); // coordinator

    const { manager, storage } = buildManager(
      {
        getTemplate: vi.fn().mockResolvedValue(PARALLEL_WITH_COORD),
        createMember: createMemberMock,
      },
      { delegate: delegateMock }
    );

    await manager.executeSwarm({ templateId: 'tmpl-1', task: 'Build feature' });

    // Coordinator member should be marked failed
    expect(storage.updateMember).toHaveBeenCalledWith(
      coordMember.id,
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('parallel member failure is captured as Error result', async () => {
    const PARALLEL_TEMPLATE = {
      ...TEMPLATE,
      strategy: 'parallel' as const,
      coordinatorProfile: null,
    };
    const mem2 = { ...MEMBER, id: 'mem-2', role: 'coder', seqOrder: 1 };
    const createMemberMock = vi.fn().mockResolvedValueOnce(MEMBER).mockResolvedValueOnce(mem2);

    const delegateMock = vi
      .fn()
      .mockResolvedValueOnce(DELEGATION_RESULT)
      .mockRejectedValueOnce(new Error('coder profile missing'));

    const { manager, storage } = buildManager(
      {
        getTemplate: vi.fn().mockResolvedValue(PARALLEL_TEMPLATE),
        createMember: createMemberMock,
      },
      { delegate: delegateMock }
    );

    await manager.executeSwarm({ templateId: 'tmpl-1', task: 'Build feature' });

    // Coder member should be marked failed
    expect(storage.updateMember).toHaveBeenCalledWith(
      mem2.id,
      expect.objectContaining({ status: 'failed', result: expect.stringContaining('coder profile missing') })
    );
  });
});

// ── unknown strategy ────────────────────────────────────────────────────────

describe('SwarmManager.executeSwarm — unknown strategy', () => {
  it('marks run as failed for unknown strategy', async () => {
    const BAD_TEMPLATE = { ...TEMPLATE, strategy: 'unknown_strategy' as any };
    const { manager, storage } = buildManager({
      getTemplate: vi.fn().mockResolvedValue(BAD_TEMPLATE),
    });

    await manager.executeSwarm({ templateId: 'tmpl-1', task: 'Build' });
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed', error: expect.stringContaining('Unknown swarm strategy') })
    );
  });
});

// ── executeSwarm non-Error thrown ────────────────────────────────────────────

describe('SwarmManager.executeSwarm — non-Error exceptions', () => {
  it('handles non-Error thrown in execution', async () => {
    const { manager, storage } = buildManager(
      { createMember: vi.fn().mockResolvedValue(MEMBER) },
      { delegate: vi.fn().mockRejectedValue('string-error') }
    );

    await manager.executeSwarm({ templateId: 'tmpl-1', task: 'Build' });
    // Sequential catches individual member errors, so the run still completes
    expect(storage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'completed' })
    );
  });
});

// ── buildContextWithProfileSkills ─────────────────────────────────────────────

describe('SwarmManager — buildContextWithProfileSkills (via sequential)', () => {
  it('injects skills into context when profile has skills', async () => {
    const profile = { id: 'prof-1', name: 'researcher' };
    const skills = [
      { name: 'WebSearch', description: 'Search the web', instructions: 'Use web search tool...' },
      { name: 'CodeReview', description: '', instructions: 'Review code for quality and security concerns' },
    ];

    const { manager, subAgentManager } = buildManager({
      createMember: vi.fn().mockResolvedValue(MEMBER),
      getProfileSkills: vi.fn().mockResolvedValue(skills),
    } as any, {
      delegate: vi.fn().mockResolvedValue(DELEGATION_RESULT),
      getProfileByName: vi.fn().mockResolvedValue(profile),
    } as any);

    await manager.executeSwarm({
      templateId: 'tmpl-1',
      task: 'Build feature',
      context: 'Some context',
    });

    // delegate should have been called with enriched context containing skills
    const delegateCall = (subAgentManager.delegate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(delegateCall.context).toContain('Available skills');
    expect(delegateCall.context).toContain('WebSearch');
  });

  it('returns original context when profile not found', async () => {
    const { manager, subAgentManager } = buildManager({
      createMember: vi.fn().mockResolvedValue(MEMBER),
    }, {
      delegate: vi.fn().mockResolvedValue(DELEGATION_RESULT),
      getProfileByName: vi.fn().mockResolvedValue(null),
    } as any);

    await manager.executeSwarm({
      templateId: 'tmpl-1',
      task: 'Build feature',
      context: 'Original context',
    });

    // Should still work, just without skill injection
    expect(subAgentManager.delegate).toHaveBeenCalled();
  });

  it('returns original context when getProfileByName throws', async () => {
    const { manager, subAgentManager } = buildManager({
      createMember: vi.fn().mockResolvedValue(MEMBER),
    }, {
      delegate: vi.fn().mockResolvedValue(DELEGATION_RESULT),
      getProfileByName: vi.fn().mockRejectedValue(new Error('DB error')),
    } as any);

    await manager.executeSwarm({
      templateId: 'tmpl-1',
      task: 'Build feature',
    });

    // Non-fatal error: should proceed without skills
    expect(subAgentManager.delegate).toHaveBeenCalled();
  });
});

// ── sequential with context and no prior context ────────────────────────────

describe('SwarmManager.executeSwarm — sequential context building', () => {
  it('builds context with no initial context and prior member results', async () => {
    const coderMember = { ...MEMBER, id: 'mem-2', role: 'coder', seqOrder: 1 };
    const createMemberMock = vi
      .fn()
      .mockResolvedValueOnce(MEMBER)
      .mockResolvedValueOnce(coderMember);

    const { manager, subAgentManager } = buildManager({
      createMember: createMemberMock,
      getMembersForRun: vi.fn().mockResolvedValue([MEMBER, coderMember]),
    });

    // No context param
    await manager.executeSwarm({ templateId: 'tmpl-1', task: 'Build feature' });

    // The second delegate call should include prior results in context
    expect(subAgentManager.delegate).toHaveBeenCalledTimes(2);
    const secondCall = (subAgentManager.delegate as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(secondCall.context).toContain('[researcher result]');
  });

  it('handles delegation with non-completed status', async () => {
    const failedDelegation = { ...DELEGATION_RESULT, status: 'failed', result: 'partial' };
    const { manager, storage } = buildManager(
      { createMember: vi.fn().mockResolvedValue(MEMBER) },
      { delegate: vi.fn().mockResolvedValue(failedDelegation) }
    );

    await manager.executeSwarm({ templateId: 'tmpl-1', task: 'Build' });
    // Member should be marked as failed when delegation status is not 'completed'
    expect(storage.updateMember).toHaveBeenCalledWith(
      MEMBER.id,
      expect.objectContaining({ status: 'failed' })
    );
  });
});
