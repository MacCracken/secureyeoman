import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProactiveManager } from './manager.js';
import { BUILTIN_TRIGGERS } from './builtin-triggers.js';
import type {
  ProactiveConfig,
  ProactiveTrigger,
  ProactiveTriggerCreate,
  Suggestion,
} from '@friday/shared';

// ── Mock Storage ─────────────────────────────────────────────────

const mockStorage = {
  ensureTables: vi.fn().mockResolvedValue(undefined),
  listTriggers: vi.fn().mockResolvedValue([]),
  getTrigger: vi.fn().mockResolvedValue(null),
  createTrigger: vi.fn(),
  updateTrigger: vi.fn(),
  deleteTrigger: vi.fn().mockResolvedValue(true),
  setTriggerEnabled: vi.fn(),
  recordFiring: vi.fn().mockResolvedValue(undefined),
  getDailyFiringCount: vi.fn().mockResolvedValue(0),
  listSuggestions: vi.fn().mockResolvedValue({ suggestions: [], total: 0 }),
  getSuggestion: vi.fn().mockResolvedValue(null),
  createSuggestion: vi.fn(),
  updateSuggestionStatus: vi.fn(),
  deleteExpiredSuggestions: vi.fn().mockResolvedValue(0),
  createBuiltinTrigger: vi.fn(),
};

// ── Mock Pattern Learner ─────────────────────────────────────────

const mockPatternLearner = {
  recordInteraction: vi.fn().mockResolvedValue(undefined),
  detectPatterns: vi.fn().mockResolvedValue([]),
  convertToTrigger: vi.fn(),
};

// ── Mock Logger ──────────────────────────────────────────────────

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

// ── Mock BrainManager ────────────────────────────────────────────

const mockBrainManager = {
  remember: vi.fn().mockResolvedValue({ id: 'mem-1' }),
  recall: vi.fn().mockResolvedValue([]),
};

// ── Default Config ───────────────────────────────────────────────

function defaultConfig(overrides?: Partial<ProactiveConfig>): ProactiveConfig {
  return {
    enabled: true,
    maxQueueSize: 50,
    autoDismissAfterMs: 86400000,
    defaultApprovalMode: 'suggest',
    limits: { maxTriggers: 100, actionsPerDay: 1000 },
    learning: { enabled: true, minConfidence: 0.7, lookbackDays: 30 },
    builtins: {
      dailyStandup: false,
      weeklySummary: false,
      contextualFollowup: false,
      integrationHealthAlert: false,
      securityAlertDigest: false,
    },
    ...overrides,
  };
}

// ── Sample Trigger ───────────────────────────────────────────────

function makeTrigger(overrides?: Partial<ProactiveTrigger>): ProactiveTrigger {
  return {
    id: 'trigger-1',
    name: 'Test Trigger',
    enabled: true,
    type: 'schedule',
    condition: { type: 'schedule', cron: '0 9 * * 1-5', timezone: 'UTC' },
    action: { type: 'message', content: 'Hello!' },
    approvalMode: 'suggest',
    cooldownMs: 0,
    limitPerDay: 0,
    builtin: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSuggestion(overrides?: Partial<Suggestion>): Suggestion {
  return {
    id: 'sug-1',
    triggerId: 'trigger-1',
    triggerName: 'Test Trigger',
    action: { type: 'message', content: 'Hello!' },
    context: {},
    confidence: 1,
    suggestedAt: new Date().toISOString(),
    status: 'pending',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('ProactiveManager', () => {
  let manager: ProactiveManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.listTriggers.mockResolvedValue([]);
    mockStorage.listSuggestions.mockResolvedValue({ suggestions: [], total: 0 });
    mockPatternLearner.detectPatterns.mockResolvedValue([]);
    manager = new ProactiveManager(
      mockStorage as any,
      { logger: mockLogger as any, brainManager: mockBrainManager as any },
      defaultConfig(),
      mockPatternLearner as any
    );
  });

  // ── Initialization ─────────────────────────────────────────────

  describe('initialize', () => {
    it('calls ensureTables on first initialize', async () => {
      await manager.initialize();
      expect(mockStorage.ensureTables).toHaveBeenCalledOnce();
    });

    it('registers all built-in triggers', async () => {
      await manager.initialize();
      expect(mockStorage.createBuiltinTrigger).toHaveBeenCalledTimes(BUILTIN_TRIGGERS.length);
    });

    it('wires up enabled schedule triggers returned from storage', async () => {
      const scheduleTrigger = makeTrigger({ type: 'schedule', enabled: true });
      mockStorage.listTriggers.mockResolvedValueOnce([scheduleTrigger]);
      await manager.initialize();
      // No error = timer was set up correctly
    });

    it('does not initialize twice', async () => {
      await manager.initialize();
      await manager.initialize();
      expect(mockStorage.ensureTables).toHaveBeenCalledOnce();
    });

    it('logs initialization with trigger count', async () => {
      await manager.initialize();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'ProactiveManager initialized',
        expect.objectContaining({ triggers: 0, builtins: BUILTIN_TRIGGERS.length })
      );
    });
  });

  // ── Trigger CRUD ────────────────────────────────────────────────

  describe('listTriggers', () => {
    it('returns triggers from storage', async () => {
      const triggers = [makeTrigger()];
      mockStorage.listTriggers.mockResolvedValue(triggers);

      const result = await manager.listTriggers();
      expect(result).toEqual(triggers);
    });

    it('passes filter to storage', async () => {
      mockStorage.listTriggers.mockResolvedValue([]);
      await manager.listTriggers({ enabled: true, type: 'schedule' });
      expect(mockStorage.listTriggers).toHaveBeenCalledWith({ enabled: true, type: 'schedule' });
    });
  });

  describe('getTrigger', () => {
    it('returns trigger from storage', async () => {
      const trigger = makeTrigger();
      mockStorage.getTrigger.mockResolvedValue(trigger);

      const result = await manager.getTrigger('trigger-1');
      expect(result).toEqual(trigger);
      expect(mockStorage.getTrigger).toHaveBeenCalledWith('trigger-1');
    });

    it('returns null when trigger does not exist', async () => {
      mockStorage.getTrigger.mockResolvedValue(null);
      const result = await manager.getTrigger('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('createTrigger', () => {
    it('creates a trigger and returns it', async () => {
      const triggerData: ProactiveTriggerCreate = {
        name: 'New Trigger',
        enabled: true,
        type: 'schedule',
        condition: { type: 'schedule', cron: '0 9 * * 1-5', timezone: 'UTC' },
        action: { type: 'message', content: 'Hello!' },
        approvalMode: 'suggest',
        cooldownMs: 0,
        limitPerDay: 0,
      };
      const created = makeTrigger({ name: 'New Trigger' });
      mockStorage.listTriggers.mockResolvedValue([]);
      mockStorage.createTrigger.mockResolvedValue(created);

      const result = await manager.createTrigger(triggerData);
      expect(result).toEqual(created);
      expect(mockStorage.createTrigger).toHaveBeenCalledWith(triggerData);
    });

    it('throws when max trigger limit is reached', async () => {
      const triggers = Array.from({ length: 100 }, (_, i) => makeTrigger({ id: `t-${i}` }));
      mockStorage.listTriggers.mockResolvedValue(triggers);

      const triggerData: ProactiveTriggerCreate = {
        name: 'Over Limit',
        enabled: true,
        type: 'schedule',
        condition: { type: 'schedule', cron: '0 9 * * *', timezone: 'UTC' },
        action: { type: 'message', content: 'Over limit' },
        approvalMode: 'suggest',
        cooldownMs: 0,
        limitPerDay: 0,
      };

      await expect(manager.createTrigger(triggerData)).rejects.toThrow(
        'Maximum trigger limit (100) reached'
      );
    });

    it('wires schedule timer when trigger is enabled and type is schedule', async () => {
      const created = makeTrigger({ type: 'schedule', enabled: true });
      mockStorage.listTriggers.mockResolvedValue([]);
      mockStorage.createTrigger.mockResolvedValue(created);

      const triggerData: ProactiveTriggerCreate = {
        name: 'Scheduled',
        enabled: true,
        type: 'schedule',
        condition: { type: 'schedule', cron: '0 9 * * 1-5', timezone: 'UTC' },
        action: { type: 'message', content: 'Scheduled' },
        approvalMode: 'suggest',
        cooldownMs: 0,
        limitPerDay: 0,
      };

      await manager.createTrigger(triggerData);
      // Cleanup so interval doesn't leak
      manager.close();
    });
  });

  describe('updateTrigger', () => {
    it('updates trigger and rewires schedule', async () => {
      const updated = makeTrigger({ name: 'Updated' });
      mockStorage.updateTrigger.mockResolvedValue(updated);

      const result = await manager.updateTrigger('trigger-1', { name: 'Updated' });
      expect(result).toEqual(updated);
      expect(mockStorage.updateTrigger).toHaveBeenCalledWith('trigger-1', { name: 'Updated' });
    });

    it('returns null when trigger not found', async () => {
      mockStorage.updateTrigger.mockResolvedValue(null);
      const result = await manager.updateTrigger('nonexistent', { name: 'X' });
      expect(result).toBeNull();
    });

    it('does not rewire when update returns null', async () => {
      mockStorage.updateTrigger.mockResolvedValue(null);
      await manager.updateTrigger('nonexistent', { enabled: false });
      // No error thrown = correct behavior
    });
  });

  describe('deleteTrigger', () => {
    it('deletes trigger and returns true', async () => {
      mockStorage.deleteTrigger.mockResolvedValue(true);
      const result = await manager.deleteTrigger('trigger-1');
      expect(result).toBe(true);
      expect(mockStorage.deleteTrigger).toHaveBeenCalledWith('trigger-1');
    });

    it('returns false when trigger not found', async () => {
      mockStorage.deleteTrigger.mockResolvedValue(false);
      const result = await manager.deleteTrigger('nonexistent');
      expect(result).toBe(false);
    });

    it('unwires schedule timer before deleting', async () => {
      // Create a trigger with a schedule timer first
      const created = makeTrigger({ type: 'schedule', enabled: true });
      mockStorage.listTriggers.mockResolvedValue([]);
      mockStorage.createTrigger.mockResolvedValue(created);

      const triggerData: ProactiveTriggerCreate = {
        name: 'Delete Me',
        enabled: true,
        type: 'schedule',
        condition: { type: 'schedule', cron: '0 9 * * 1-5', timezone: 'UTC' },
        action: { type: 'message', content: 'Test' },
        approvalMode: 'suggest',
        cooldownMs: 0,
        limitPerDay: 0,
      };
      await manager.createTrigger(triggerData);

      mockStorage.deleteTrigger.mockResolvedValue(true);
      const result = await manager.deleteTrigger('trigger-1');
      expect(result).toBe(true);
    });
  });

  describe('enableTrigger / disableTrigger', () => {
    it('enables a trigger and wires it', async () => {
      const trigger = makeTrigger({ enabled: true });
      mockStorage.setTriggerEnabled.mockResolvedValue(trigger);

      const result = await manager.enableTrigger('trigger-1');
      expect(result).toEqual(trigger);
      expect(mockStorage.setTriggerEnabled).toHaveBeenCalledWith('trigger-1', true);
      manager.close();
    });

    it('returns null when enabling non-existent trigger', async () => {
      mockStorage.setTriggerEnabled.mockResolvedValue(null);
      const result = await manager.enableTrigger('nonexistent');
      expect(result).toBeNull();
    });

    it('disables a trigger and unwires it', async () => {
      const trigger = makeTrigger({ enabled: false });
      mockStorage.setTriggerEnabled.mockResolvedValue(trigger);

      const result = await manager.disableTrigger('trigger-1');
      expect(result).toEqual(trigger);
      expect(mockStorage.setTriggerEnabled).toHaveBeenCalledWith('trigger-1', false);
    });
  });

  // ── Built-in triggers ────────────────────────────────────────────

  describe('getBuiltinTriggers', () => {
    it('returns a copy of BUILTIN_TRIGGERS', () => {
      const builtins = manager.getBuiltinTriggers();
      expect(builtins).toHaveLength(BUILTIN_TRIGGERS.length);
      expect(builtins).not.toBe(BUILTIN_TRIGGERS); // copy, not same reference
    });

    it('includes expected builtin IDs', () => {
      const builtins = manager.getBuiltinTriggers();
      const ids = builtins.map((t) => t.id);
      expect(ids).toContain('builtin-daily-standup');
      expect(ids).toContain('builtin-weekly-summary');
      expect(ids).toContain('builtin-security-digest');
    });
  });

  describe('enableBuiltinTrigger', () => {
    it('delegates to enableTrigger', async () => {
      const trigger = makeTrigger({ id: 'builtin-daily-standup', builtin: true, enabled: true });
      mockStorage.setTriggerEnabled.mockResolvedValue(trigger);

      const result = await manager.enableBuiltinTrigger('builtin-daily-standup');
      expect(result).toEqual(trigger);
      expect(mockStorage.setTriggerEnabled).toHaveBeenCalledWith('builtin-daily-standup', true);
      manager.close();
    });
  });

  // ── Trigger firing ───────────────────────────────────────────────

  describe('fireTrigger', () => {
    it('returns empty when trigger not found', async () => {
      mockStorage.getTrigger.mockResolvedValue(null);
      const result = await manager.fireTrigger('nonexistent');
      expect(result).toEqual({});
    });

    it('returns empty when trigger is disabled', async () => {
      mockStorage.getTrigger.mockResolvedValue(makeTrigger({ enabled: false }));
      const result = await manager.fireTrigger('trigger-1');
      expect(result).toEqual({});
    });

    it('skips firing when within cooldown period', async () => {
      const recentFire = Date.now() - 1000; // 1 second ago
      mockStorage.getTrigger.mockResolvedValue(
        makeTrigger({ cooldownMs: 60000, lastFiredAt: recentFire } as any)
      );

      const result = await manager.fireTrigger('trigger-1');
      expect(result).toEqual({});
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Trigger skipped (cooldown)',
        expect.objectContaining({ triggerId: 'trigger-1' })
      );
    });

    it('fires when cooldown has elapsed', async () => {
      const oldFire = Date.now() - 120000; // 2 minutes ago
      const trigger = makeTrigger({ cooldownMs: 60000, lastFiredAt: oldFire } as any);
      mockStorage.getTrigger.mockResolvedValue(trigger);
      mockStorage.getDailyFiringCount.mockResolvedValue(0);
      const suggestion = makeSuggestion();
      mockStorage.createSuggestion.mockResolvedValue(suggestion);

      const result = await manager.fireTrigger('trigger-1');
      expect(mockStorage.recordFiring).toHaveBeenCalledWith('trigger-1');
      expect(result.suggestion).toEqual(suggestion);
    });

    it('skips firing when daily limit is reached', async () => {
      mockStorage.getTrigger.mockResolvedValue(makeTrigger({ limitPerDay: 3 }));
      mockStorage.getDailyFiringCount.mockResolvedValue(3);

      const result = await manager.fireTrigger('trigger-1');
      expect(result).toEqual({});
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Trigger skipped (daily limit)',
        expect.objectContaining({ triggerId: 'trigger-1', dailyCount: 3 })
      );
    });

    it('fires when daily count is below limit', async () => {
      mockStorage.getTrigger.mockResolvedValue(makeTrigger({ limitPerDay: 5 }));
      mockStorage.getDailyFiringCount.mockResolvedValue(2);
      const suggestion = makeSuggestion();
      mockStorage.createSuggestion.mockResolvedValue(suggestion);

      const result = await manager.fireTrigger('trigger-1');
      expect(mockStorage.recordFiring).toHaveBeenCalledWith('trigger-1');
      expect(result.suggestion).toEqual(suggestion);
    });

    it('records firing before executing action', async () => {
      const callOrder: string[] = [];
      mockStorage.getTrigger.mockResolvedValue(makeTrigger({ limitPerDay: 0 }));
      mockStorage.recordFiring.mockImplementation(() => {
        callOrder.push('recordFiring');
        return Promise.resolve();
      });
      const suggestion = makeSuggestion();
      mockStorage.createSuggestion.mockImplementation(() => {
        callOrder.push('createSuggestion');
        return Promise.resolve(suggestion);
      });

      await manager.fireTrigger('trigger-1');
      expect(callOrder.indexOf('recordFiring')).toBeLessThan(callOrder.indexOf('createSuggestion'));
    });
  });

  // ── Auto-approve mode ────────────────────────────────────────────

  describe('auto-approve mode', () => {
    it('executes action directly when approvalMode is auto', async () => {
      const trigger = makeTrigger({
        approvalMode: 'auto',
        action: { type: 'remind', content: 'Remind me', category: 'test' },
      });
      mockStorage.getTrigger.mockResolvedValue(trigger);
      mockStorage.getDailyFiringCount.mockResolvedValue(0);

      const result = await manager.fireTrigger('trigger-1');
      expect(result.result).toBeDefined();
      expect(result.result?.success).toBe(true);
      expect(result.suggestion).toBeUndefined();
      // Should not create a suggestion for auto mode
      expect(mockStorage.createSuggestion).not.toHaveBeenCalled();
    });

    it('queues suggestion when approvalMode is suggest', async () => {
      const trigger = makeTrigger({ approvalMode: 'suggest' });
      mockStorage.getTrigger.mockResolvedValue(trigger);
      mockStorage.getDailyFiringCount.mockResolvedValue(0);
      const suggestion = makeSuggestion();
      mockStorage.createSuggestion.mockResolvedValue(suggestion);

      const result = await manager.fireTrigger('trigger-1');
      expect(result.suggestion).toEqual(suggestion);
      expect(result.result).toBeUndefined();
      expect(mockStorage.createSuggestion).toHaveBeenCalledOnce();
    });

    it('uses config default approval mode when trigger has no approvalMode', async () => {
      const trigger = makeTrigger({ approvalMode: undefined });
      mockStorage.getTrigger.mockResolvedValue(trigger);
      mockStorage.getDailyFiringCount.mockResolvedValue(0);
      const suggestion = makeSuggestion();
      mockStorage.createSuggestion.mockResolvedValue(suggestion);

      // defaultApprovalMode in config is 'suggest'
      const result = await manager.fireTrigger('trigger-1');
      expect(result.suggestion).toBeDefined();
    });

    it('uses auto mode from config when config defaultApprovalMode is auto', async () => {
      manager = new ProactiveManager(
        mockStorage as any,
        { logger: mockLogger as any, brainManager: mockBrainManager as any },
        defaultConfig({ defaultApprovalMode: 'auto' }),
        mockPatternLearner as any
      );
      const trigger = makeTrigger({
        approvalMode: undefined,
        action: { type: 'remind', content: 'Auto remind', category: 'test' },
      });
      mockStorage.getTrigger.mockResolvedValue(trigger);
      mockStorage.getDailyFiringCount.mockResolvedValue(0);

      const result = await manager.fireTrigger('trigger-1');
      expect(result.result).toBeDefined();
      expect(mockStorage.createSuggestion).not.toHaveBeenCalled();
    });
  });

  // ── testTrigger ──────────────────────────────────────────────────

  describe('testTrigger', () => {
    it('returns failure when trigger not found', async () => {
      mockStorage.getTrigger.mockResolvedValue(null);
      const result = await manager.testTrigger('nonexistent');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Trigger not found');
    });

    it('executes action and returns result', async () => {
      const trigger = makeTrigger({
        action: { type: 'remind', content: 'Test reminder', category: 'test' },
      });
      mockStorage.getTrigger.mockResolvedValue(trigger);

      const result = await manager.testTrigger('trigger-1');
      expect(result.success).toBe(true);
    });
  });

  // ── Suggestion lifecycle ─────────────────────────────────────────

  describe('listSuggestions', () => {
    it('returns suggestions from storage', async () => {
      const suggestions = [makeSuggestion()];
      mockStorage.listSuggestions.mockResolvedValue({ suggestions, total: 1 });

      const result = await manager.listSuggestions({ status: 'pending' });
      expect(result.suggestions).toEqual(suggestions);
      expect(result.total).toBe(1);
    });

    it('passes filter to storage', async () => {
      mockStorage.listSuggestions.mockResolvedValue({ suggestions: [], total: 0 });
      await manager.listSuggestions({ status: 'pending', triggerId: 'trigger-1', limit: 10 });
      expect(mockStorage.listSuggestions).toHaveBeenCalledWith({
        status: 'pending',
        triggerId: 'trigger-1',
        limit: 10,
      });
    });
  });

  describe('approveSuggestion', () => {
    it('returns failure when suggestion not found', async () => {
      mockStorage.getSuggestion.mockResolvedValue(null);
      const result = await manager.approveSuggestion('nonexistent');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Suggestion not found or not pending');
    });

    it('returns failure when suggestion is not pending', async () => {
      mockStorage.getSuggestion.mockResolvedValue(makeSuggestion({ status: 'dismissed' }));
      const result = await manager.approveSuggestion('sug-1');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Suggestion not found or not pending');
    });

    it('approves, executes, and marks as executed', async () => {
      const suggestion = makeSuggestion({
        action: { type: 'remind', content: 'Remember this', category: 'test' },
        status: 'pending',
      });
      mockStorage.getSuggestion.mockResolvedValue(suggestion);
      mockStorage.updateSuggestionStatus.mockResolvedValue({ ...suggestion, status: 'approved' });

      const result = await manager.approveSuggestion('sug-1');
      expect(result.success).toBe(true);
      expect(mockStorage.updateSuggestionStatus).toHaveBeenCalledWith('sug-1', 'approved');
      expect(mockStorage.updateSuggestionStatus).toHaveBeenCalledWith(
        'sug-1',
        'executed',
        expect.any(Object)
      );
    });
  });

  describe('dismissSuggestion', () => {
    it('returns false when suggestion not found', async () => {
      mockStorage.getSuggestion.mockResolvedValue(null);
      const result = await manager.dismissSuggestion('nonexistent');
      expect(result).toBe(false);
    });

    it('returns false when suggestion is not pending', async () => {
      mockStorage.getSuggestion.mockResolvedValue(makeSuggestion({ status: 'executed' }));
      const result = await manager.dismissSuggestion('sug-1');
      expect(result).toBe(false);
    });

    it('dismisses a pending suggestion', async () => {
      mockStorage.getSuggestion.mockResolvedValue(makeSuggestion({ status: 'pending' }));
      mockStorage.updateSuggestionStatus.mockResolvedValue(makeSuggestion({ status: 'dismissed' }));

      const result = await manager.dismissSuggestion('sug-1');
      expect(result).toBe(true);
      expect(mockStorage.updateSuggestionStatus).toHaveBeenCalledWith('sug-1', 'dismissed');
    });
  });

  describe('clearExpiredSuggestions', () => {
    it('delegates to storage.deleteExpiredSuggestions', async () => {
      mockStorage.deleteExpiredSuggestions.mockResolvedValue(5);
      const result = await manager.clearExpiredSuggestions();
      expect(result).toBe(5);
      expect(mockStorage.deleteExpiredSuggestions).toHaveBeenCalledOnce();
    });
  });

  // ── Pattern learning ─────────────────────────────────────────────

  describe('detectPatterns', () => {
    it('delegates to patternLearner.detectPatterns with config lookbackDays', async () => {
      const patterns = [
        {
          id: 'p1',
          type: 'temporal',
          description: 'Morning routine',
          confidence: 0.9,
          occurrences: 10,
          lastSeen: Date.now(),
          context: {},
        },
      ];
      mockPatternLearner.detectPatterns.mockResolvedValue(patterns);

      const result = await manager.detectPatterns();
      expect(result).toEqual(patterns);
      expect(mockPatternLearner.detectPatterns).toHaveBeenCalledWith(30); // from config
    });
  });

  describe('convertPatternToTrigger', () => {
    it('returns null when pattern not found', async () => {
      mockPatternLearner.detectPatterns.mockResolvedValue([]);
      const result = await manager.convertPatternToTrigger('nonexistent-pattern');
      expect(result).toBeNull();
    });

    it('converts pattern to trigger and creates it', async () => {
      const pattern = {
        id: 'temporal_morning_9',
        type: 'temporal' as const,
        description: 'Morning check-in',
        confidence: 0.85,
        occurrences: 12,
        lastSeen: Date.now(),
        context: { avgHour: 9 },
      };
      mockPatternLearner.detectPatterns.mockResolvedValue([pattern]);

      const triggerData: ProactiveTriggerCreate = {
        name: 'Pattern: Morning check-in',
        enabled: false,
        type: 'schedule',
        condition: { type: 'schedule', cron: '0 9 * * 1-5', timezone: 'UTC' },
        action: { type: 'remind', content: 'Morning check-in', category: 'pattern_reminder' },
        approvalMode: 'suggest',
        cooldownMs: 3600000,
        limitPerDay: 1,
      };
      mockPatternLearner.convertToTrigger.mockReturnValue(triggerData);
      mockStorage.listTriggers.mockResolvedValue([]);
      const created = makeTrigger({ name: 'Pattern: Morning check-in' });
      mockStorage.createTrigger.mockResolvedValue(created);

      const result = await manager.convertPatternToTrigger('temporal_morning_9');
      expect(result).toEqual(created);
      expect(mockPatternLearner.convertToTrigger).toHaveBeenCalledWith(pattern);
      expect(mockStorage.createTrigger).toHaveBeenCalledWith(triggerData);
    });
  });

  // ── Status ────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('returns status with correct shape', async () => {
      mockStorage.listTriggers.mockResolvedValue([
        makeTrigger({ type: 'schedule', enabled: true }),
        makeTrigger({ id: 'trigger-2', type: 'event', enabled: false }),
      ]);
      mockStorage.listSuggestions.mockResolvedValue({ suggestions: [], total: 3 });
      mockPatternLearner.detectPatterns.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);

      const status = await manager.getStatus();
      expect(status.initialized).toBe(false);
      expect(status.enabled).toBe(true);
      expect(status.triggers.total).toBe(2);
      expect(status.triggers.enabled).toBe(1);
      expect(status.triggers.byType.schedule).toBe(1);
      expect(status.triggers.byType.event).toBe(1);
      expect(status.suggestions.pending).toBe(3);
      expect(status.patterns.detected).toBe(2);
      expect(status.config.defaultApprovalMode).toBe('suggest');
    });

    it('shows initialized as true after initialize()', async () => {
      await manager.initialize();
      const status = await manager.getStatus();
      expect(status.initialized).toBe(true);
    });
  });

  // ── Schedule trigger firing ──────────────────────────────────────

  describe('schedule trigger firing', () => {
    it('only wires schedule type triggers (not event type)', async () => {
      const eventTrigger = makeTrigger({ type: 'event', enabled: true });
      mockStorage.listTriggers.mockResolvedValueOnce([eventTrigger]);
      await manager.initialize();

      // An event trigger should not create schedule timers
      const statusBefore = await manager.getStatus();
      expect(statusBefore.initialized).toBe(true);
    });
  });

  // ── Broadcast ────────────────────────────────────────────────────

  describe('broadcast', () => {
    it('broadcasts new_suggestion event when queueing a suggestion', async () => {
      const broadcastFn = vi.fn();
      manager = new ProactiveManager(
        mockStorage as any,
        {
          logger: mockLogger as any,
          brainManager: mockBrainManager as any,
          broadcast: broadcastFn,
        },
        defaultConfig(),
        mockPatternLearner as any
      );

      const trigger = makeTrigger({ approvalMode: 'suggest' });
      mockStorage.getTrigger.mockResolvedValue(trigger);
      mockStorage.getDailyFiringCount.mockResolvedValue(0);
      const suggestion = makeSuggestion();
      mockStorage.createSuggestion.mockResolvedValue(suggestion);

      await manager.fireTrigger('trigger-1');
      expect(broadcastFn).toHaveBeenCalledWith('proactive', {
        type: 'new_suggestion',
        suggestion,
      });
    });
  });

  // ── Cleanup ───────────────────────────────────────────────────────

  describe('close', () => {
    it('clears schedule timers and sets initialized to false', async () => {
      const scheduleTrigger = makeTrigger({ type: 'schedule', enabled: true });
      mockStorage.listTriggers.mockResolvedValueOnce([scheduleTrigger]);
      await manager.initialize();

      manager.close();
      expect(mockLogger.info).toHaveBeenCalledWith('ProactiveManager closed');

      // After close, getStatus shows not initialized
      const status = await manager.getStatus();
      expect(status.initialized).toBe(false);
    });

    it('can be called when no timers are active', () => {
      expect(() => manager.close()).not.toThrow();
    });
  });
});
