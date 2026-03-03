import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CouncilManager } from './council-manager.js';
import type { CouncilStorage } from './council-storage.js';
import type { SubAgentManager } from './manager.js';
import type { SecureLogger } from '../logging/logger.js';

// ─── Mock AIClient ─────────────────────────────────────────────────
vi.mock('../ai/client.js', () => ({
  AIClient: vi.fn().mockImplementation(function () {
    return {
      chat: vi.fn().mockResolvedValue({
        content: '{"converged":false,"reasoning":"Still diverging"}',
        usage: { totalTokens: 100 },
      }),
    };
  }),
}));

// ─── Fixtures ──────────────────────────────────────────────────────

const TEMPLATE = {
  id: 'tmpl-1',
  name: 'Board of Directors',
  description: 'Strategic review',
  members: [
    { role: 'CFO', profileName: 'analyst', description: 'Finance', weight: 1, perspective: 'Financial perspective' },
    { role: 'CTO', profileName: 'coder', description: 'Tech', weight: 1, perspective: 'Technical perspective' },
  ],
  facilitatorProfile: 'summarizer',
  deliberationStrategy: 'rounds' as const,
  maxRounds: 2,
  votingStrategy: 'facilitator_judgment' as const,
  isBuiltin: false,
  createdAt: 1000,
};

const RUN = {
  id: 'run-1',
  templateId: 'tmpl-1',
  templateName: 'Board of Directors',
  topic: 'Should we expand?',
  context: null,
  status: 'pending' as const,
  deliberationStrategy: 'rounds' as const,
  maxRounds: 2,
  completedRounds: 0,
  decision: null,
  consensus: null,
  dissents: null,
  reasoning: null,
  confidence: null,
  tokenBudget: 500000,
  tokensUsed: 0,
  createdAt: 1000,
  startedAt: null,
  completedAt: null,
  initiatedBy: null,
};

const DELEGATION_RESULT = {
  delegationId: 'del-1',
  profile: 'analyst',
  status: 'completed' as const,
  result: '{"position":"Support expansion","confidence":0.8,"keyPoints":["Growing market"]}',
  error: null,
  tokenUsage: { prompt: 100, completion: 50, total: 150 },
  durationMs: 500,
  subDelegations: [],
};

// ─── Mock factories ────────────────────────────────────────────────

function makeLogger(): SecureLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as SecureLogger;
}

function makeStorage(overrides?: Partial<CouncilStorage>): CouncilStorage {
  return {
    getTemplate: vi.fn().mockResolvedValue(TEMPLATE),
    getTemplateByName: vi.fn().mockResolvedValue(null),
    listTemplates: vi.fn().mockResolvedValue({ templates: [TEMPLATE], total: 1 }),
    createTemplate: vi.fn().mockResolvedValue(TEMPLATE),
    updateTemplate: vi.fn().mockResolvedValue(TEMPLATE),
    deleteTemplate: vi.fn().mockResolvedValue(true),
    createRun: vi.fn().mockResolvedValue(RUN),
    getRun: vi.fn().mockResolvedValue(RUN),
    updateRun: vi.fn().mockResolvedValue(undefined),
    listRuns: vi.fn().mockResolvedValue({ runs: [RUN], total: 1 }),
    createPosition: vi.fn().mockResolvedValue({
      id: 'pos-1',
      councilRunId: 'run-1',
      memberRole: 'CFO',
      profileName: 'analyst',
      round: 1,
      position: 'Support expansion',
      confidence: 0.8,
      keyPoints: ['Growing market'],
      agreements: [],
      disagreements: [],
      createdAt: 1000,
    }),
    getPositionsForRun: vi.fn().mockResolvedValue([]),
    getPositionsForRound: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as CouncilStorage;
}

function makeSubAgentManager(overrides?: Partial<SubAgentManager>): SubAgentManager {
  return {
    delegate: vi.fn().mockResolvedValue(DELEGATION_RESULT),
    ...overrides,
  } as unknown as SubAgentManager;
}

function buildManager(opts?: {
  storageOverrides?: Partial<CouncilStorage>;
  agentOverrides?: Partial<SubAgentManager>;
}) {
  const storage = makeStorage(opts?.storageOverrides);
  const subAgentManager = makeSubAgentManager(opts?.agentOverrides);
  const logger = makeLogger();
  const manager = new CouncilManager({
    storage: storage as any,
    subAgentManager: subAgentManager as any,
    aiClientConfig: { model: { provider: 'anthropic', model: 'claude-3-haiku-20240307' } as never },
    aiClientDeps: {},
    logger: logger as any,
  });
  return { manager, storage, subAgentManager, logger };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('CouncilManager', () => {
  describe('initialize', () => {
    it('initializes without seeding templates', async () => {
      const { manager, logger } = buildManager();
      await manager.initialize();
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('CouncilManager initialized'));
    });
  });

  describe('getCatalog', () => {
    it('returns catalog entries', () => {
      const { manager } = buildManager();
      const catalog = manager.getCatalog();
      expect(catalog.length).toBeGreaterThanOrEqual(2);
      expect(catalog[0]!.name).toBe('Board of Directors');
      expect(catalog[1]!.name).toBe('Architecture Review Board');
    });
  });

  describe('installFromCatalog', () => {
    it('installs a template from catalog', async () => {
      const { manager, storage } = buildManager();
      await manager.installFromCatalog('Board of Directors');
      expect(storage.createTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Board of Directors' })
      );
    });

    it('rejects unknown catalog entry', async () => {
      const { manager } = buildManager();
      await expect(manager.installFromCatalog('Unknown Template')).rejects.toThrow(
        'Catalog template not found'
      );
    });

    it('rejects duplicate install', async () => {
      const { manager } = buildManager({
        storageOverrides: {
          getTemplateByName: vi.fn().mockResolvedValue(TEMPLATE),
        },
      });
      await expect(manager.installFromCatalog('Board of Directors')).rejects.toThrow(
        'Template already installed'
      );
    });
  });

  describe('template CRUD', () => {
    it('lists templates', async () => {
      const { manager } = buildManager();
      const result = await manager.listTemplates();
      expect(result.templates).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('gets a template', async () => {
      const { manager } = buildManager();
      const result = await manager.getTemplate('tmpl-1');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Board of Directors');
    });

    it('creates a template', async () => {
      const { manager } = buildManager();
      const result = await manager.createTemplate({
        name: 'Custom',
        members: [],
        facilitatorProfile: 'summarizer',
      } as any);
      expect(result.name).toBe('Board of Directors'); // returns mock
    });

    it('deletes a template', async () => {
      const { manager } = buildManager();
      const result = await manager.deleteTemplate('tmpl-1');
      expect(result).toBe(true);
    });
  });

  describe('runs', () => {
    it('lists runs', async () => {
      const { manager } = buildManager();
      const result = await manager.listRuns();
      expect(result.runs).toHaveLength(1);
    });

    it('gets a run with positions', async () => {
      const { manager } = buildManager();
      const result = await manager.getRun('run-1');
      expect(result).not.toBeNull();
      expect(result!.positions).toBeDefined();
    });

    it('cancels a running council', async () => {
      const { manager, storage } = buildManager({
        storageOverrides: {
          getRun: vi.fn().mockResolvedValue({ ...RUN, status: 'running' }),
        },
      });
      await manager.cancelRun('run-1');
      expect(storage.updateRun).toHaveBeenCalledWith(
        'run-1',
        expect.objectContaining({ status: 'cancelled' })
      );
    });

    it('rejects cancel for completed council', async () => {
      const { manager } = buildManager({
        storageOverrides: {
          getRun: vi.fn().mockResolvedValue({ ...RUN, status: 'completed' }),
        },
      });
      await expect(manager.cancelRun('run-1')).rejects.toThrow('Cannot cancel council in status');
    });
  });

  describe('convene', () => {
    it('rejects missing template', async () => {
      const { manager } = buildManager({
        storageOverrides: { getTemplate: vi.fn().mockResolvedValue(null) },
      });
      await expect(manager.convene({ templateId: 'bad', topic: 'test' })).rejects.toThrow(
        'Council template not found'
      );
    });

    it('runs single_pass strategy (1 round)', async () => {
      const singlePassTemplate = {
        ...TEMPLATE,
        deliberationStrategy: 'single_pass' as const,
        maxRounds: 1,
      };
      const completedRun = { ...RUN, status: 'completed' as const, decision: 'Support expansion' };
      const { manager, storage, subAgentManager } = buildManager({
        storageOverrides: {
          getTemplate: vi.fn().mockResolvedValue(singlePassTemplate),
          getRun: vi.fn()
            .mockResolvedValueOnce(RUN)        // first call from createRun flow
            .mockResolvedValue(completedRun),   // subsequent calls
        },
      });

      const result = await manager.convene({ templateId: 'tmpl-1', topic: 'Should we expand?' });

      // Should delegate to each member once (single pass)
      expect(subAgentManager.delegate).toHaveBeenCalledTimes(2);
      // Should create positions for each member
      expect(storage.createPosition).toHaveBeenCalledTimes(2);
      // Should update run as completed
      expect(storage.updateRun).toHaveBeenCalledWith(
        'run-1',
        expect.objectContaining({ status: 'completed' })
      );
    });

    it('runs rounds strategy (fixed N rounds)', async () => {
      const completedRun = { ...RUN, status: 'completed' as const, decision: 'Support expansion' };
      const { manager, storage, subAgentManager } = buildManager({
        storageOverrides: {
          getRun: vi.fn()
            .mockResolvedValueOnce(RUN)
            .mockResolvedValue(completedRun),
        },
      });

      await manager.convene({ templateId: 'tmpl-1', topic: 'Should we expand?' });

      // 2 rounds x 2 members = 4 delegations
      expect(subAgentManager.delegate).toHaveBeenCalledTimes(4);
      // 4 positions created
      expect(storage.createPosition).toHaveBeenCalledTimes(4);
    });

    it('runs until_consensus with early convergence', async () => {
      const consensusTemplate = {
        ...TEMPLATE,
        deliberationStrategy: 'until_consensus' as const,
        maxRounds: 3,
      };
      const completedRun = { ...RUN, status: 'completed' as const };

      // Make AIClient return converged=true for convergence check
      const { AIClient } = await import('../ai/client.js');
      (AIClient as ReturnType<typeof vi.fn>).mockImplementationOnce(function () {
        return {
          chat: vi.fn().mockResolvedValue({
            content: '{"converged":true,"reasoning":"Members agree"}',
            usage: { totalTokens: 50 },
          }),
        };
      });

      const { manager, subAgentManager } = buildManager({
        storageOverrides: {
          getTemplate: vi.fn().mockResolvedValue(consensusTemplate),
          getRun: vi.fn()
            .mockResolvedValueOnce(RUN)
            .mockResolvedValue(completedRun),
        },
      });

      await manager.convene({ templateId: 'tmpl-1', topic: 'Test convergence' });

      // Should stop after round 1 due to convergence: 2 members * 1 round = 2
      expect(subAgentManager.delegate).toHaveBeenCalledTimes(2);
    });

    it('handles delegation failure gracefully', async () => {
      const completedRun = { ...RUN, status: 'completed' as const };
      const failingDelegate = vi.fn()
        .mockRejectedValueOnce(new Error('Agent unavailable'))
        .mockResolvedValue(DELEGATION_RESULT);

      const { manager, storage } = buildManager({
        storageOverrides: {
          getTemplate: vi.fn().mockResolvedValue({ ...TEMPLATE, maxRounds: 1, deliberationStrategy: 'single_pass' as const }),
          getRun: vi.fn()
            .mockResolvedValueOnce(RUN)
            .mockResolvedValue(completedRun),
        },
        agentOverrides: { delegate: failingDelegate },
      });

      await manager.convene({ templateId: 'tmpl-1', topic: 'Test failure' });

      // Should still create positions for both members (one error, one success)
      expect(storage.createPosition).toHaveBeenCalledTimes(2);
      // The error position should contain error text
      expect(storage.createPosition).toHaveBeenCalledWith(
        expect.objectContaining({ position: expect.stringContaining('Error') })
      );
    });

    it('parses unstructured response as fallback', async () => {
      const completedRun = { ...RUN, status: 'completed' as const };
      const { manager, storage } = buildManager({
        storageOverrides: {
          getTemplate: vi.fn().mockResolvedValue({ ...TEMPLATE, maxRounds: 1, deliberationStrategy: 'single_pass' as const }),
          getRun: vi.fn()
            .mockResolvedValueOnce(RUN)
            .mockResolvedValue(completedRun),
        },
        agentOverrides: {
          delegate: vi.fn().mockResolvedValue({
            ...DELEGATION_RESULT,
            result: 'I think we should definitely expand into new markets.',
          }),
        },
      });

      await manager.convene({ templateId: 'tmpl-1', topic: 'Test fallback' });

      // Should still create positions (using free-text fallback)
      expect(storage.createPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          position: 'I think we should definitely expand into new markets.',
          confidence: 0.5,
          keyPoints: [],
        })
      );
    });

    it('includes prior positions in round 2+ prompts', async () => {
      const positions = [
        {
          id: 'pos-1',
          councilRunId: 'run-1',
          memberRole: 'CFO',
          profileName: 'analyst',
          round: 1,
          position: 'Support expansion',
          confidence: 0.8,
          keyPoints: ['Good ROI'],
          agreements: [],
          disagreements: [],
          createdAt: 1000,
        },
      ];
      const completedRun = { ...RUN, status: 'completed' as const };
      const { manager, subAgentManager } = buildManager({
        storageOverrides: {
          getRun: vi.fn()
            .mockResolvedValueOnce(RUN)
            .mockResolvedValue(completedRun),
          getPositionsForRound: vi.fn().mockResolvedValue(positions),
        },
      });

      await manager.convene({ templateId: 'tmpl-1', topic: 'Test context' });

      // Round 2 calls should include prior positions in the task
      const round2Calls = (subAgentManager.delegate as ReturnType<typeof vi.fn>).mock.calls.slice(2);
      expect(round2Calls.length).toBe(2);
      for (const call of round2Calls) {
        expect(call[0].task).toContain('round 2');
        expect(call[0].task).toContain('CFO');
      }
    });

    it('respects token budget per call', async () => {
      const completedRun = { ...RUN, status: 'completed' as const };
      const { manager, subAgentManager } = buildManager({
        storageOverrides: {
          getTemplate: vi.fn().mockResolvedValue({ ...TEMPLATE, maxRounds: 1, deliberationStrategy: 'single_pass' as const }),
          getRun: vi.fn()
            .mockResolvedValueOnce(RUN)
            .mockResolvedValue(completedRun),
        },
      });

      await manager.convene({ templateId: 'tmpl-1', topic: 'Budget test', tokenBudget: 10000 });

      // Each delegate call should have a limited maxTokenBudget
      for (const call of (subAgentManager.delegate as ReturnType<typeof vi.fn>).mock.calls) {
        expect(call[0].maxTokenBudget).toBeLessThanOrEqual(10000);
        expect(call[0].maxTokenBudget).toBeGreaterThan(0);
      }
    });

    it('handles complete failure gracefully', async () => {
      const failedRun = { ...RUN, status: 'failed' as const, decision: 'Error: All agents down' };
      const { manager, storage } = buildManager({
        storageOverrides: {
          getTemplate: vi.fn().mockResolvedValue({ ...TEMPLATE, maxRounds: 1, deliberationStrategy: 'single_pass' as const }),
          createRun: vi.fn().mockResolvedValue(RUN),
          getRun: vi.fn().mockResolvedValue(failedRun),
          updateRun: vi.fn().mockResolvedValue(undefined),
          getPositionsForRun: vi.fn().mockResolvedValue([]),
          createPosition: vi.fn().mockResolvedValue({
            id: 'pos-x', councilRunId: 'run-1', memberRole: 'CFO', profileName: 'analyst',
            round: 1, position: 'Error', confidence: 0, keyPoints: [], agreements: [], disagreements: [],
            createdAt: 1000,
          }),
        },
        agentOverrides: {
          delegate: vi.fn().mockRejectedValue(new Error('All agents down')),
        },
      });

      // Should not throw — errors are caught and recorded
      const result = await manager.convene({ templateId: 'tmpl-1', topic: 'Failure test' });
      expect(result).not.toBeNull();
    });
  });
});
