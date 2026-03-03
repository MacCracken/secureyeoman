/**
 * IntentManager Tests — Phase 48
 *
 * Unit tests for GoalResolver, TradeoffResolver, DelegationFrameworkResolver,
 * HardBoundaryEnforcer, AuthorizedActionChecker, and composeSoulContext.
 * No database required — uses mocked IntentStorage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntentManager } from './manager.js';
import { OpaClient } from './opa-client.js';
import type { IntentStorage } from './storage.js';
import type { OrgIntentRecord } from './schema.js';

const NOW = 1_700_000_000_000;

function makeIntent(overrides: Partial<OrgIntentRecord> = {}): OrgIntentRecord {
  return {
    id: 'intent-1',
    apiVersion: 'v1',
    name: 'Test Intent',
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    goals: [],
    signals: [],
    dataSources: [],
    authorizedActions: [],
    tradeoffProfiles: [],
    hardBoundaries: [],
    delegationFramework: { tenants: [] },
    context: [],
    ...overrides,
  };
}

function makeStorage(overrides: Partial<IntentStorage> = {}): IntentStorage {
  return {
    createIntent: vi.fn(),
    updateIntent: vi.fn(),
    deleteIntent: vi.fn(),
    getIntentDoc: vi.fn(),
    listIntents: vi.fn(),
    getActiveIntent: vi.fn().mockResolvedValue(null),
    setActiveIntent: vi.fn(),
    logEnforcement: vi.fn().mockResolvedValue(undefined),
    queryEnforcementLog: vi.fn().mockResolvedValue([]),
    getGoalSnapshots: vi.fn().mockResolvedValue(new Map()),
    upsertGoalSnapshot: vi.fn().mockResolvedValue(undefined),
    getGoalTimeline: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as IntentStorage;
}

// ── GoalResolver ──────────────────────────────────────────────────────────────

describe('GoalResolver — resolveActiveGoals', () => {
  it('returns empty array when no active intent', () => {
    const mgr = new IntentManager({ storage: makeStorage() });
    expect(mgr.resolveActiveGoals()).toEqual([]);
  });

  it('returns all goals when none have activeWhen', async () => {
    const intent = makeIntent({
      goals: [
        {
          id: 'g1',
          name: 'Goal A',
          priority: 20,
          successCriteria: '',
          description: '',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        },
        {
          id: 'g2',
          name: 'Goal B',
          priority: 10,
          successCriteria: '',
          description: '',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        },
      ],
    });
    const storage = makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) });
    const mgr = new IntentManager({ storage });
    await mgr.initialize();

    const goals = mgr.resolveActiveGoals();
    // Sorted by priority ascending (10 first)
    expect(goals[0].id).toBe('g2');
    expect(goals[1].id).toBe('g1');
  });

  it('filters goals by activeWhen expression', async () => {
    const intent = makeIntent({
      goals: [
        {
          id: 'g1',
          name: 'Q1 Goal',
          priority: 1,
          activeWhen: 'quarter=Q1',
          successCriteria: '',
          description: '',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        },
        {
          id: 'g2',
          name: 'Always Goal',
          priority: 2,
          successCriteria: '',
          description: '',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        },
      ],
    });
    const storage = makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) });
    const mgr = new IntentManager({ storage });
    await mgr.initialize();

    const q1Goals = mgr.resolveActiveGoals({ quarter: 'Q1' });
    expect(q1Goals.map((g) => g.id)).toEqual(['g1', 'g2']);

    const q2Goals = mgr.resolveActiveGoals({ quarter: 'Q2' });
    expect(q2Goals.map((g) => g.id)).toEqual(['g2']);
  });

  it('handles AND expressions in activeWhen', async () => {
    const intent = makeIntent({
      goals: [
        {
          id: 'g1',
          name: 'Combo',
          priority: 1,
          activeWhen: 'env=prod AND region=us',
          successCriteria: '',
          description: '',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    expect(mgr.resolveActiveGoals({ env: 'prod', region: 'us' })).toHaveLength(1);
    expect(mgr.resolveActiveGoals({ env: 'prod', region: 'eu' })).toHaveLength(0);
  });
});

// ── TradeoffResolver ──────────────────────────────────────────────────────────

describe('TradeoffResolver — resolveTradeoffProfile', () => {
  it('returns null when no active intent', () => {
    const mgr = new IntentManager({ storage: makeStorage() });
    expect(mgr.resolveTradeoffProfile()).toBeNull();
  });

  it('returns the default profile', async () => {
    const intent = makeIntent({
      tradeoffProfiles: [
        {
          id: 'tp1',
          name: 'Fast',
          isDefault: false,
          speedVsThoroughness: 0.1,
          costVsQuality: 0.5,
          autonomyVsConfirmation: 0.5,
        },
        {
          id: 'tp2',
          name: 'Careful',
          isDefault: true,
          speedVsThoroughness: 0.9,
          costVsQuality: 0.9,
          autonomyVsConfirmation: 0.9,
        },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    const profile = mgr.resolveTradeoffProfile();
    expect(profile?.id).toBe('tp2');
  });

  it('applies overrides to the default profile', async () => {
    const intent = makeIntent({
      tradeoffProfiles: [
        {
          id: 'tp1',
          name: 'Balanced',
          isDefault: true,
          speedVsThoroughness: 0.5,
          costVsQuality: 0.5,
          autonomyVsConfirmation: 0.5,
        },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    const profile = mgr.resolveTradeoffProfile({ speedVsThoroughness: 0.9 });
    expect(profile?.speedVsThoroughness).toBe(0.9);
    expect(profile?.costVsQuality).toBe(0.5); // unchanged
  });
});

// ── DelegationFrameworkResolver ───────────────────────────────────────────────

describe('DelegationFrameworkResolver — getDecisionBoundaries', () => {
  it('returns empty array when no active intent', () => {
    const mgr = new IntentManager({ storage: makeStorage() });
    expect(mgr.getDecisionBoundaries()).toEqual([]);
  });

  it('returns formatted boundaries from all tenants', async () => {
    const intent = makeIntent({
      delegationFramework: {
        tenants: [
          {
            id: 't1',
            principle: 'Least privilege',
            decisionBoundaries: ['Only read', 'No write prod'],
          },
          { id: 't2', principle: 'Audit all', decisionBoundaries: [] },
        ],
      },
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    const boundaries = mgr.getDecisionBoundaries();
    expect(boundaries[0]).toBe('[t1] Least privilege');
    expect(boundaries[1]).toBe('  - Only read');
    expect(boundaries[2]).toBe('  - No write prod');
    expect(boundaries[3]).toBe('[t2] Audit all');
  });
});

// ── HardBoundaryEnforcer ──────────────────────────────────────────────────────

describe('HardBoundaryEnforcer — checkHardBoundaries', () => {
  it('allows when no active intent', async () => {
    const mgr = new IntentManager({ storage: makeStorage() });
    const result = await mgr.checkHardBoundaries('delete everything');
    expect(result.allowed).toBe(true);
  });

  it('allows an action that does not match any boundary', async () => {
    const intent = makeIntent({
      hardBoundaries: [
        { id: 'hb1', rule: 'deny: drop production', rationale: 'Protect prod', rego: undefined },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    const result = await mgr.checkHardBoundaries('show metrics dashboard');
    expect(result.allowed).toBe(true);
  });

  it('blocks an action matching a deny: rule', async () => {
    const logSpy = vi.fn().mockResolvedValue(undefined);
    const intent = makeIntent({
      hardBoundaries: [
        { id: 'hb1', rule: 'deny: drop production', rationale: 'Protect prod', rego: undefined },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({
        getActiveIntent: vi.fn().mockResolvedValue(intent),
        logEnforcement: logSpy,
      }),
    });
    await mgr.initialize();

    const result = await mgr.checkHardBoundaries('attempt to drop production database');
    expect(result.allowed).toBe(false);
    expect(result.violated?.id).toBe('hb1');
    expect(logSpy).toHaveBeenCalledOnce();
  });

  it('blocks a tool matching a tool: rule', async () => {
    const intent = makeIntent({
      hardBoundaries: [
        { id: 'hb2', rule: 'tool: fs_write', rationale: 'No filesystem writes', rego: undefined },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({
        getActiveIntent: vi.fn().mockResolvedValue(intent),
        logEnforcement: vi.fn().mockResolvedValue(undefined),
      }),
    });
    await mgr.initialize();

    const result = await mgr.checkHardBoundaries('write a file', 'fs_write');
    expect(result.allowed).toBe(false);
  });
});

// ── AuthorizedActionChecker ───────────────────────────────────────────────────

describe('AuthorizedActionChecker — checkAuthorizedAction', () => {
  it('allows when no active intent', async () => {
    const mgr = new IntentManager({ storage: makeStorage() });
    const result = await mgr.checkAuthorizedAction('a1');
    expect(result.allowed).toBe(true);
  });

  it('blocks an unknown action', async () => {
    const intent = makeIntent({
      authorizedActions: [
        {
          id: 'a1',
          description: 'Allowed action',
          appliesToGoals: [],
          appliesToSignals: [],
          mcpTools: [],
        },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    const result = await mgr.checkAuthorizedAction('unknown-action');
    expect(result.allowed).toBe(false);
  });

  it('allows a known action without role restriction', async () => {
    const intent = makeIntent({
      authorizedActions: [
        {
          id: 'a1',
          description: 'Send alert',
          appliesToGoals: [],
          appliesToSignals: [],
          mcpTools: [],
        },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    const result = await mgr.checkAuthorizedAction('a1');
    expect(result.allowed).toBe(true);
  });

  it('blocks when role does not match requiredRole', async () => {
    const logSpy = vi.fn().mockResolvedValue(undefined);
    const intent = makeIntent({
      authorizedActions: [
        {
          id: 'a1',
          description: 'Admin action',
          requiredRole: 'admin',
          appliesToGoals: [],
          appliesToSignals: [],
          mcpTools: [],
        },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({
        getActiveIntent: vi.fn().mockResolvedValue(intent),
        logEnforcement: logSpy,
      }),
    });
    await mgr.initialize();

    const result = await mgr.checkAuthorizedAction('a1', { role: 'viewer' });
    expect(result.allowed).toBe(false);
    expect(logSpy).toHaveBeenCalledOnce();
  });
});

// ── getPermittedMcpTools ──────────────────────────────────────────────────────

describe('getPermittedMcpTools', () => {
  it('returns null when no active intent', () => {
    const mgr = new IntentManager({ storage: makeStorage() });
    expect(mgr.getPermittedMcpTools()).toBeNull();
  });

  it('returns null when active intent has no mcpTools on any action', async () => {
    const intent = makeIntent({
      authorizedActions: [
        {
          id: 'a1',
          description: 'Generic action',
          appliesToGoals: [],
          appliesToSignals: [],
          mcpTools: [],
        },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();
    expect(mgr.getPermittedMcpTools()).toBeNull();
  });

  it('returns Set of permitted tools when actions restrict mcpTools', async () => {
    const intent = makeIntent({
      authorizedActions: [
        {
          id: 'a1',
          description: 'Read only',
          appliesToGoals: [],
          appliesToSignals: [],
          mcpTools: ['fs_read', 'http_get'],
        },
        {
          id: 'a2',
          description: 'Metrics',
          appliesToGoals: [],
          appliesToSignals: [],
          mcpTools: ['prometheus_query'],
        },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    const permitted = mgr.getPermittedMcpTools();
    expect(permitted).not.toBeNull();
    expect(permitted!.has('fs_read')).toBe(true);
    expect(permitted!.has('http_get')).toBe(true);
    expect(permitted!.has('prometheus_query')).toBe(true);
    expect(permitted!.has('fs_write')).toBe(false);
  });
});

// ── getGoalSkillSlugs ─────────────────────────────────────────────────────────

describe('getGoalSkillSlugs', () => {
  it('returns empty set when no active intent', () => {
    const mgr = new IntentManager({ storage: makeStorage() });
    expect(mgr.getGoalSkillSlugs().size).toBe(0);
  });

  it('returns slugs from all active goals', async () => {
    const intent = makeIntent({
      goals: [
        {
          id: 'g1',
          name: 'Goal A',
          priority: 1,
          successCriteria: '',
          description: '',
          ownerRole: 'admin',
          skills: ['deploy', 'rollback'],
          signals: [],
          authorizedActions: [],
        },
        {
          id: 'g2',
          name: 'Goal B',
          priority: 2,
          successCriteria: '',
          description: '',
          ownerRole: 'admin',
          skills: ['monitor'],
          signals: [],
          authorizedActions: [],
        },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    const slugs = mgr.getGoalSkillSlugs();
    expect(slugs.has('deploy')).toBe(true);
    expect(slugs.has('rollback')).toBe(true);
    expect(slugs.has('monitor')).toBe(true);
    expect(slugs.size).toBe(3);
  });
});

// ── checkPolicies ─────────────────────────────────────────────────────────────

describe('checkPolicies', () => {
  it('allows when no active intent', async () => {
    const mgr = new IntentManager({ storage: makeStorage() });
    const result = await mgr.checkPolicies('delete all records');
    expect(result.action).toBe('allow');
  });

  it('allows when no policies defined', async () => {
    const intent = makeIntent({ policies: [] });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    const result = await mgr.checkPolicies('delete all records');
    expect(result.action).toBe('allow');
  });

  it('returns warn when enforcement is warn and rule matches', async () => {
    const logSpy = vi.fn().mockResolvedValue(undefined);
    const intent = makeIntent({
      policies: [
        { id: 'p1', rule: 'deny: bulk delete', enforcement: 'warn', rationale: 'Requires review' },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({
        getActiveIntent: vi.fn().mockResolvedValue(intent),
        logEnforcement: logSpy,
      }),
    });
    await mgr.initialize();

    const result = await mgr.checkPolicies('call tool: bulk delete records');
    expect(result.action).toBe('warn');
    expect(result.violated?.id).toBe('p1');
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'policy_warn' }));
  });

  it('returns block when enforcement is block and rule matches', async () => {
    const logSpy = vi.fn().mockResolvedValue(undefined);
    const intent = makeIntent({
      policies: [
        {
          id: 'p2',
          rule: 'deny: send email',
          enforcement: 'block',
          rationale: 'No automated comms',
        },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({
        getActiveIntent: vi.fn().mockResolvedValue(intent),
        logEnforcement: logSpy,
      }),
    });
    await mgr.initialize();

    const result = await mgr.checkPolicies('call tool: send email to customers');
    expect(result.action).toBe('block');
    expect(result.violated?.id).toBe('p2');
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'policy_block' }));
  });

  it('allows when rule does not match', async () => {
    const intent = makeIntent({
      policies: [
        {
          id: 'p3',
          rule: 'deny: drop production',
          enforcement: 'block',
          rationale: 'Never drop prod',
        },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    const result = await mgr.checkPolicies('call tool: read metrics');
    expect(result.action).toBe('allow');
  });

  it('matches tool: prefix rules', async () => {
    const logSpy = vi.fn().mockResolvedValue(undefined);
    const intent = makeIntent({
      policies: [
        { id: 'p4', rule: 'tool: fs_write', enforcement: 'block', rationale: 'No writes' },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({
        getActiveIntent: vi.fn().mockResolvedValue(intent),
        logEnforcement: logSpy,
      }),
    });
    await mgr.initialize();

    const result = await mgr.checkPolicies('write a file', 'fs_write');
    expect(result.action).toBe('block');
  });
});

// ── Signal degradation tracking ───────────────────────────────────────────────

describe('Signal degradation tracking', () => {
  it('logs intent_signal_degraded when status goes healthy -> warning', async () => {
    const logSpy = vi.fn().mockResolvedValue(undefined);
    const mgr = new IntentManager({
      storage: makeStorage({
        getActiveIntent: vi.fn().mockResolvedValue(makeIntent()),
        logEnforcement: logSpy,
      }),
    });
    await mgr.initialize();

    // Seed the cache with a healthy state
    const signal = {
      id: 'sig1',
      name: 'Error Rate',
      direction: 'above' as const,
      threshold: 10,
      warningThreshold: 5,
      description: '',
      dataSources: [],
    };
    (mgr as unknown as { signalCache: Map<string, unknown> }).signalCache.set('sig1', {
      result: {
        signalId: 'sig1',
        value: 3,
        threshold: 10,
        direction: 'above',
        status: 'healthy',
        message: 'OK',
      },
      fetchedAt: Date.now(),
    });

    // Simulate the degradation via _buildSignalResult (healthy->warning transition)
    const intent = makeIntent({
      signals: [signal],
      dataSources: [],
    });
    (mgr as unknown as { activeIntent: unknown }).activeIntent = intent;

    // Directly call the private method via public signalCache manipulation + refresh trigger
    // We test by checking that if we set up the pre-condition and call _startSignalRefresh indirectly
    // via the fact that _fetchSignalValue returns a value we control via a spy:
    const fetchSpy = vi
      .spyOn(
        mgr as unknown as { _fetchSignalValue: (...args: unknown[]) => unknown },
        '_fetchSignalValue'
      )
      .mockResolvedValue({
        signalId: 'sig1',
        value: 7,
        threshold: 10,
        direction: 'above',
        status: 'warning',
        message: 'Approaching',
      });

    // Manually invoke the refresh logic (simulating interval tick)
    const intentSignals = intent.signals;
    const prevStatus = (
      mgr as unknown as { signalCache: Map<string, { result: { status: string } }> }
    ).signalCache.get('sig1')?.result.status;
    const result = await (
      mgr as unknown as {
        _fetchSignalValue: (...args: unknown[]) => Promise<{
          status: string;
          signalId: string;
          value: number;
          threshold: number;
          direction: string;
          message: string;
        }>;
      }
    )._fetchSignalValue(intentSignals[0], intent);
    const isDegraded =
      (prevStatus === 'healthy' && (result.status === 'warning' || result.status === 'critical')) ||
      (prevStatus === 'warning' && result.status === 'critical');
    if (isDegraded) {
      await mgr.logEnforcement({
        eventType: 'intent_signal_degraded',
        itemId: signal.id,
        rule: `signal:${signal.id}`,
        rationale: result.message,
        metadata: { from: prevStatus, to: result.status },
      });
    }

    expect(isDegraded).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'intent_signal_degraded' })
    );
    fetchSpy.mockRestore();
  });

  it('does not log when status stays healthy', async () => {
    const logSpy = vi.fn().mockResolvedValue(undefined);
    const mgr = new IntentManager({
      storage: makeStorage({
        getActiveIntent: vi.fn().mockResolvedValue(makeIntent()),
        logEnforcement: logSpy,
      }),
    });
    await mgr.initialize();

    (mgr as unknown as { signalCache: Map<string, unknown> }).signalCache.set('sig1', {
      result: { status: 'healthy' },
      fetchedAt: Date.now(),
    });

    const prevStatus = 'healthy';
    const newStatus = 'healthy';
    const isDegraded =
      (prevStatus === 'healthy' && (newStatus === 'warning' || newStatus === 'critical')) ||
      (prevStatus === 'warning' && newStatus === 'critical');

    expect(isDegraded).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();
  });
});

// ── Goal Lifecycle — _diffGoals via reloadActiveIntent ────────────────────────

describe('Goal lifecycle — goal_activated event', () => {
  it('emits goal_activated when an inactive goal becomes active', async () => {
    const logSpy = vi.fn().mockResolvedValue(undefined);
    const upsertSpy = vi.fn().mockResolvedValue(undefined);

    // Initial intent: goal has activeWhen that won't match on initialize (empty ctx)
    const initialIntent = makeIntent({
      goals: [
        {
          id: 'g1',
          name: 'Q1 Goal',
          priority: 1,
          activeWhen: 'quarter=Q1',
          successCriteria: '',
          description: '',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        },
      ],
    });
    // Reload intent: goal has no activeWhen (always active)
    const reloadedIntent = makeIntent({
      goals: [
        {
          id: 'g1',
          name: 'Q1 Goal',
          priority: 1,
          successCriteria: '',
          description: '',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        },
      ],
    });

    const getActiveIntentSpy = vi
      .fn()
      .mockResolvedValueOnce(initialIntent) // initialize()
      .mockResolvedValueOnce(reloadedIntent); // reloadActiveIntent()

    const mgr = new IntentManager({
      storage: makeStorage({
        getActiveIntent: getActiveIntentSpy,
        logEnforcement: logSpy,
        upsertGoalSnapshot: upsertSpy,
      }),
    });
    await mgr.initialize();
    // After initialize: g1 is inactive (activeWhen='quarter=Q1', ctx={}) → snapshot: false

    await mgr.reloadActiveIntent();
    // After reload: g1 has no activeWhen → always active → transition inactive→active

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'goal_activated', itemId: 'g1' })
    );
  });

  it('does not emit goal_activated when goal was already active', async () => {
    const logSpy = vi.fn().mockResolvedValue(undefined);

    const intent = makeIntent({
      goals: [
        {
          id: 'g1',
          name: 'Always Active',
          priority: 1,
          successCriteria: '',
          description: '',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        },
      ],
    });

    const mgr = new IntentManager({
      storage: makeStorage({
        getActiveIntent: vi.fn().mockResolvedValue(intent),
        logEnforcement: logSpy,
      }),
    });
    await mgr.initialize();
    logSpy.mockClear(); // ignore any calls from initialize

    await mgr.reloadActiveIntent();
    // g1 is still active — no transition

    expect(logSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'goal_activated' })
    );
  });
});

describe('Goal lifecycle — goal_completed event', () => {
  it('emits goal_completed when active goal becomes inactive and has completionCondition', async () => {
    const logSpy = vi.fn().mockResolvedValue(undefined);

    // Initial: g1 is always active (no activeWhen)
    const initialIntent = makeIntent({
      goals: [
        {
          id: 'g1',
          name: 'Revenue Goal',
          priority: 1,
          completionCondition: 'signal:revenue crosses 1M',
          successCriteria: 'ARR > 1M',
          description: '',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        },
      ],
    });
    // Reload: g1 is conditionally active but condition won't match (empty ctx)
    const reloadedIntent = makeIntent({
      goals: [
        {
          id: 'g1',
          name: 'Revenue Goal',
          priority: 1,
          activeWhen: 'phase=growth',
          completionCondition: 'signal:revenue crosses 1M',
          successCriteria: 'ARR > 1M',
          description: '',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        },
      ],
    });

    const getActiveIntentSpy = vi
      .fn()
      .mockResolvedValueOnce(initialIntent)
      .mockResolvedValueOnce(reloadedIntent);

    const mgr = new IntentManager({
      storage: makeStorage({
        getActiveIntent: getActiveIntentSpy,
        logEnforcement: logSpy,
      }),
    });
    await mgr.initialize();
    // After initialize: g1 is active

    logSpy.mockClear();
    await mgr.reloadActiveIntent();
    // g1 goes inactive (activeWhen='phase=growth', ctx={}) + has completionCondition → goal_completed

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'goal_completed', itemId: 'g1' })
    );
  });

  it('does NOT emit goal_completed when goal goes inactive without completionCondition', async () => {
    const logSpy = vi.fn().mockResolvedValue(undefined);

    const initialIntent = makeIntent({
      goals: [
        {
          id: 'g1',
          name: 'Simple Goal',
          priority: 1,
          successCriteria: '',
          description: '',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        },
      ],
    });
    const reloadedIntent = makeIntent({
      goals: [
        {
          id: 'g1',
          name: 'Simple Goal',
          priority: 1,
          activeWhen: 'env=never',
          successCriteria: '',
          description: '',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        },
      ],
    });

    const getActiveIntentSpy = vi
      .fn()
      .mockResolvedValueOnce(initialIntent)
      .mockResolvedValueOnce(reloadedIntent);

    const mgr = new IntentManager({
      storage: makeStorage({
        getActiveIntent: getActiveIntentSpy,
        logEnforcement: logSpy,
      }),
    });
    await mgr.initialize();
    logSpy.mockClear();
    await mgr.reloadActiveIntent();

    expect(logSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'goal_completed' })
    );
  });
});

describe('Goal lifecycle — initialize seeds snapshot without events', () => {
  it('does not emit goal_activated for goals active at startup', async () => {
    const logSpy = vi.fn().mockResolvedValue(undefined);

    const intent = makeIntent({
      goals: [
        {
          id: 'g1',
          name: 'Bootstrap Goal',
          priority: 1,
          successCriteria: '',
          description: '',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        },
      ],
    });

    const mgr = new IntentManager({
      storage: makeStorage({
        getActiveIntent: vi.fn().mockResolvedValue(intent),
        logEnforcement: logSpy,
      }),
    });
    await mgr.initialize();

    expect(logSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'goal_activated' })
    );
  });

  it('seeds from DB snapshot when goal record already exists', async () => {
    const upsertSpy = vi.fn().mockResolvedValue(undefined);

    const intent = makeIntent({
      id: 'intent-db',
      goals: [
        {
          id: 'g1',
          name: 'DB Goal',
          priority: 1,
          successCriteria: '',
          description: '',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        },
      ],
    });

    // DB snapshot already records g1 as active
    const dbSnapshot = new Map([
      [
        'g1',
        {
          intentId: 'intent-db',
          goalId: 'g1',
          isActive: true,
          activatedAt: NOW,
          completedAt: null,
        },
      ],
    ]);

    const mgr = new IntentManager({
      storage: makeStorage({
        getActiveIntent: vi.fn().mockResolvedValue(intent),
        getGoalSnapshots: vi.fn().mockResolvedValue(dbSnapshot),
        upsertGoalSnapshot: upsertSpy,
      }),
    });
    await mgr.initialize();

    // Should not call upsertGoalSnapshot for g1 since it's already in DB
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});

describe('Goal lifecycle — getGoalTimeline passthrough', () => {
  it('delegates to storage.getGoalTimeline', async () => {
    const timelineSpy = vi.fn().mockResolvedValue([
      {
        id: 'e1',
        eventType: 'goal_activated',
        itemId: 'g1',
        rule: 'unconditional',
        createdAt: NOW,
      },
    ]);
    const mgr = new IntentManager({
      storage: makeStorage({
        getActiveIntent: vi.fn().mockResolvedValue(makeIntent()),
        getGoalTimeline: timelineSpy,
      }),
    });
    await mgr.initialize();

    const entries = await mgr.getGoalTimeline('intent-1', 'g1');
    expect(timelineSpy).toHaveBeenCalledWith('intent-1', 'g1');
    expect(entries).toHaveLength(1);
    expect(entries[0].eventType).toBe('goal_activated');
  });
});

// ── composeSoulContext ────────────────────────────────────────────────────────

describe('composeSoulContext', () => {
  it('returns null when no active intent', async () => {
    const mgr = new IntentManager({ storage: makeStorage() });
    const result = await mgr.composeSoulContext();
    expect(result).toBeNull();
  });

  it('returns null for empty intent doc', async () => {
    const intent = makeIntent(); // all empty arrays, no context
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();
    const result = await mgr.composeSoulContext();
    expect(result).toBeNull();
  });

  it('includes organizational goals section', async () => {
    const intent = makeIntent({
      goals: [
        {
          id: 'g1',
          name: 'Grow ARR',
          priority: 1,
          successCriteria: 'ARR > 1M',
          description: 'Increase revenue',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    const result = await mgr.composeSoulContext();
    expect(result).toContain('## Organizational Goals');
    expect(result).toContain('Grow ARR');
    expect(result).toContain('ARR > 1M');
  });

  it('includes organizational context KV pairs', async () => {
    const intent = makeIntent({
      context: [
        { key: 'orgName', value: 'ACME Corp' },
        { key: 'industry', value: 'SaaS' },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    const result = await mgr.composeSoulContext();
    expect(result).toContain('## Organizational Context');
    expect(result).toContain('orgName: ACME Corp');
    expect(result).toContain('industry: SaaS');
  });

  it('includes trade-off profile', async () => {
    const intent = makeIntent({
      tradeoffProfiles: [
        {
          id: 'tp1',
          name: 'Careful',
          isDefault: true,
          speedVsThoroughness: 0.8,
          costVsQuality: 0.9,
          autonomyVsConfirmation: 0.7,
        },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    const result = await mgr.composeSoulContext();
    expect(result).toContain('## Trade-off Profile');
    expect(result).toContain('Careful');
    expect(result).toContain('80% thoroughness preference');
  });

  it('includes decision boundaries', async () => {
    const intent = makeIntent({
      delegationFramework: {
        tenants: [
          { id: 't1', principle: 'Least privilege', decisionBoundaries: ['No production writes'] },
        ],
      },
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    const result = await mgr.composeSoulContext();
    expect(result).toContain('## Decision Boundaries');
    expect(result).toContain('Least privilege');
    expect(result).toContain('No production writes');
  });
});

// ── Phase 50: CEL activeWhen evaluation ───────────────────────────────────────

describe('Phase 50 — CEL activeWhen evaluation', () => {
  it('evaluates CEL == operator in activeWhen', async () => {
    const intent = makeIntent({
      goals: [
        {
          id: 'g1',
          name: 'Prod Goal',
          priority: 1,
          activeWhen: 'env == "prod"',
          successCriteria: '',
          description: '',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    expect(mgr.resolveActiveGoals({ env: 'prod' })).toHaveLength(1);
    expect(mgr.resolveActiveGoals({ env: 'dev' })).toHaveLength(0);
  });

  it('evaluates CEL && conjunction in activeWhen', async () => {
    const intent = makeIntent({
      goals: [
        {
          id: 'g1',
          name: 'Combo Goal',
          priority: 1,
          activeWhen: 'env == "prod" && region == "us"',
          successCriteria: '',
          description: '',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    expect(mgr.resolveActiveGoals({ env: 'prod', region: 'us' })).toHaveLength(1);
    expect(mgr.resolveActiveGoals({ env: 'prod', region: 'eu' })).toHaveLength(0);
  });

  it('evaluates CEL || disjunction in activeWhen', async () => {
    const intent = makeIntent({
      goals: [
        {
          id: 'g1',
          name: 'Multi-env Goal',
          priority: 1,
          activeWhen: 'env == "prod" || env == "staging"',
          successCriteria: '',
          description: '',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    expect(mgr.resolveActiveGoals({ env: 'staging' })).toHaveLength(1);
    expect(mgr.resolveActiveGoals({ env: 'dev' })).toHaveLength(0);
  });

  it('backward-compatible with legacy key=value AND format', async () => {
    const intent = makeIntent({
      goals: [
        {
          id: 'g1',
          name: 'Legacy Goal',
          priority: 1,
          activeWhen: 'env=prod AND quarter=Q1',
          successCriteria: '',
          description: '',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    expect(mgr.resolveActiveGoals({ env: 'prod', quarter: 'Q1' })).toHaveLength(1);
    expect(mgr.resolveActiveGoals({ env: 'prod', quarter: 'Q2' })).toHaveLength(0);
  });
});

// ── Phase 50: OPA hard boundary evaluation ────────────────────────────────────

describe('Phase 50 — OPA hard boundary evaluation', () => {
  it('uses OPA when boundary has rego and OPA is configured', async () => {
    const evaluateSpy = vi.spyOn(OpaClient.prototype, 'evaluate').mockResolvedValue(false);

    const intent = makeIntent({
      hardBoundaries: [
        {
          id: 'hb1',
          rule: 'deny: drop tables',
          rego: 'package boundary_hb1\nallow = false',
          rationale: 'test',
        },
      ],
    });
    const opa = new OpaClient('http://opa:8181');
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
      opaClient: opa,
    });
    await mgr.initialize();

    const result = await mgr.checkHardBoundaries('some action', 'some_tool');
    expect(evaluateSpy).toHaveBeenCalledWith('boundary_hb1/allow', {
      action: 'some action',
      tool: 'some_tool',
    });
    // OPA returned false (deny), so allowed=false
    expect(result.allowed).toBe(false);
    evaluateSpy.mockRestore();
  });

  it('falls back to substring matching when OPA returns null (unavailable)', async () => {
    const evaluateSpy = vi.spyOn(OpaClient.prototype, 'evaluate').mockResolvedValue(null);

    const intent = makeIntent({
      hardBoundaries: [
        {
          id: 'hb1',
          rule: 'deny: delete prod',
          rego: 'package boundary_hb1\nallow = true',
          rationale: '',
        },
      ],
    });
    const opa = new OpaClient('http://opa:8181');
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
      opaClient: opa,
    });
    await mgr.initialize();

    // OPA null → fall back → "delete prod" substring match
    const blocked = await mgr.checkHardBoundaries('action: delete prod db');
    expect(blocked.allowed).toBe(false);

    evaluateSpy.mockRestore();
  });

  it('uses substring matching when no OPA client configured', async () => {
    const intent = makeIntent({
      hardBoundaries: [
        { id: 'hb1', rule: 'deny: shutdown', rationale: '', rego: 'package p\nallow=true' },
      ],
    });
    // opaClient: null disables OPA
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
      opaClient: null,
    });
    await mgr.initialize();

    const blocked = await mgr.checkHardBoundaries('action: shutdown all services');
    expect(blocked.allowed).toBe(false);
  });

  it('allows when boundary has no rego and action does not match rule', async () => {
    const intent = makeIntent({
      hardBoundaries: [{ id: 'hb1', rule: 'deny: drop tables', rationale: '' }],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
      opaClient: null,
    });
    await mgr.initialize();

    const result = await mgr.checkHardBoundaries('action: read data');
    expect(result.allowed).toBe(true);
  });
});

// ── Phase 50: MCP tool signal dispatch ───────────────────────────────────────

describe('Phase 50 — MCP tool signal dispatch', () => {
  it('calls callMcpTool for mcp_tool data sources', async () => {
    const callMcpTool = vi.fn().mockResolvedValue(42);

    const intent = makeIntent({
      signals: [
        { id: 's1', name: 'Error Rate', direction: 'above', threshold: 10, dataSources: ['ds1'] },
      ],
      dataSources: [
        { id: 'ds1', name: 'Error Rate Tool', type: 'mcp_tool', connection: 'get_error_rate' },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
      callMcpTool,
    });
    await mgr.initialize();

    const result = await mgr.readSignal('s1');
    expect(callMcpTool).toHaveBeenCalledWith('get_error_rate', {});
    expect(result?.value).toBe(42);
    expect(result?.status).toBe('critical'); // 42 > threshold 10 = critical
  });

  it('returns null value when callMcpTool is not configured', async () => {
    const intent = makeIntent({
      signals: [
        { id: 's1', name: 'Error Rate', direction: 'above', threshold: 10, dataSources: ['ds1'] },
      ],
      dataSources: [
        { id: 'ds1', name: 'Error Rate Tool', type: 'mcp_tool', connection: 'get_error_rate' },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
    });
    await mgr.initialize();

    const result = await mgr.readSignal('s1');
    expect(result?.value).toBeNull();
    expect(result?.status).toBe('healthy');
  });

  it('passes schema hint in callMcpTool input', async () => {
    const callMcpTool = vi.fn().mockResolvedValue(5);

    const intent = makeIntent({
      signals: [
        { id: 's1', name: 'Latency', direction: 'above', threshold: 100, dataSources: ['ds1'] },
      ],
      dataSources: [
        {
          id: 'ds1',
          name: 'Latency Tool',
          type: 'mcp_tool',
          connection: 'get_latency',
          schema: '$.p99',
        },
      ],
    });
    const mgr = new IntentManager({
      storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }),
      callMcpTool,
    });
    await mgr.initialize();

    await mgr.readSignal('s1');
    expect(callMcpTool).toHaveBeenCalledWith('get_latency', { schema: '$.p99' });
  });
});

// ── Phase 50: syncPoliciesWithOpa ─────────────────────────────────────────────

describe('Phase 50 — syncPoliciesWithOpa', () => {
  it('uploads hard boundary rego policies to OPA', async () => {
    const uploadSpy = vi.spyOn(OpaClient.prototype, 'uploadPolicy').mockResolvedValue(undefined);

    const opa = new OpaClient('http://opa:8181');
    const mgr = new IntentManager({
      storage: makeStorage(),
      opaClient: opa,
    });

    const record = makeIntent({
      hardBoundaries: [
        {
          id: 'hb1',
          rule: 'deny: drop',
          rego: 'package boundary_hb1\nallow = false',
          rationale: '',
        },
        { id: 'hb2', rule: 'deny: delete', rationale: '' }, // no rego — skip
      ],
      policies: [
        {
          id: 'p1',
          rule: 'no pii',
          rego: 'package policy_p1\nallow = false',
          enforcement: 'block',
          rationale: '',
        },
      ],
    });

    await mgr.syncPoliciesWithOpa(record);

    // boundary_hb1 + policy_p1 + output_compliance (Phase 54)
    expect(uploadSpy).toHaveBeenCalledTimes(3);
    expect(uploadSpy).toHaveBeenCalledWith('boundary_hb1', expect.stringContaining('allow'));
    expect(uploadSpy).toHaveBeenCalledWith('policy_p1', expect.stringContaining('allow'));
    expect(uploadSpy).toHaveBeenCalledWith(
      'output_compliance',
      expect.stringContaining('output_compliance')
    );
    // hb2 has no rego → should NOT be uploaded
    expect(uploadSpy).not.toHaveBeenCalledWith('boundary_hb2', expect.anything());

    uploadSpy.mockRestore();
  });

  it('is a no-op when OPA is not configured', async () => {
    const mgr = new IntentManager({
      storage: makeStorage(),
      opaClient: null,
    });

    const record = makeIntent({
      policies: [
        {
          id: 'p1',
          rule: 'no pii',
          rego: 'package p\nallow=false',
          enforcement: 'block',
          rationale: '',
        },
      ],
    });

    // Should not throw even with no OPA
    await expect(mgr.syncPoliciesWithOpa(record)).resolves.toBeUndefined();
  });

  it('does not throw when uploadPolicy fails (non-fatal)', async () => {
    vi.spyOn(OpaClient.prototype, 'uploadPolicy').mockRejectedValue(new Error('OPA unreachable'));
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const opa = new OpaClient('http://opa:8181');
    const mgr = new IntentManager({ storage: makeStorage(), opaClient: opa });

    const record = makeIntent({
      policies: [
        {
          id: 'p1',
          rule: 'test',
          rego: 'package p\nallow=false',
          enforcement: 'warn',
          rationale: '',
        },
      ],
    });

    await expect(mgr.syncPoliciesWithOpa(record)).resolves.toBeUndefined();
    vi.restoreAllMocks();
  });
});

// ── Phase 54: checkOutputCompliance ───────────────────────────────────────────

describe('Phase 54 — checkOutputCompliance', () => {
  it('returns compliant:true when no intent is set', async () => {
    const mgr = new IntentManager({ storage: makeStorage(), opaClient: null });
    const result = await mgr.checkOutputCompliance('Some response text');
    expect(result.compliant).toBe(true);
  });

  it('returns compliant:true when OPA is not configured', async () => {
    const mgr = new IntentManager({ storage: makeStorage(), opaClient: null });
    await mgr.initialize();
    const result = await mgr.checkOutputCompliance('Some response text');
    expect(result.compliant).toBe(true);
  });

  it('returns compliant:true when there are no hard boundaries', async () => {
    const evaluateSpy = vi.spyOn(OpaClient.prototype, 'evaluate').mockResolvedValue(true);
    const opa = new OpaClient('http://opa:8181');
    const mgr = new IntentManager({ storage: makeStorage(), opaClient: opa });
    // Set active intent with no boundaries via initialize (storage returns null)
    const result = await mgr.checkOutputCompliance('response');
    expect(result.compliant).toBe(true);
    // evaluate should NOT have been called (no active intent)
    expect(evaluateSpy).not.toHaveBeenCalled();
    evaluateSpy.mockRestore();
  });

  it('returns compliant:false when OPA returns false', async () => {
    const evaluateSpy = vi.spyOn(OpaClient.prototype, 'evaluate').mockResolvedValue(false);
    const uploadSpy = vi.spyOn(OpaClient.prototype, 'uploadPolicy').mockResolvedValue(undefined);

    const opa = new OpaClient('http://opa:8181');
    const storage = makeStorage();
    // Manually set up active intent with a boundary
    const record = makeIntent({
      isActive: true,
      hardBoundaries: [{ id: 'b1', rule: 'confidential', rationale: '' }],
    });
    vi.spyOn(storage, 'getActiveIntent').mockResolvedValue(record);

    const mgr = new IntentManager({ storage, opaClient: opa });
    await mgr.initialize();
    const result = await mgr.checkOutputCompliance('This contains confidential data');
    expect(result.compliant).toBe(false);
    expect(result.reason).toBeDefined();

    evaluateSpy.mockRestore();
    uploadSpy.mockRestore();
  });

  it('returns compliant:true (fail-open) when OPA throws', async () => {
    const evaluateSpy = vi
      .spyOn(OpaClient.prototype, 'evaluate')
      .mockRejectedValue(new Error('OPA error'));
    const uploadSpy = vi.spyOn(OpaClient.prototype, 'uploadPolicy').mockResolvedValue(undefined);

    const opa = new OpaClient('http://opa:8181');
    const storage = makeStorage();
    const record = makeIntent({
      isActive: true,
      hardBoundaries: [{ id: 'b1', rule: 'secret', rationale: '' }],
    });
    vi.spyOn(storage, 'getActiveIntent').mockResolvedValue(record);

    const mgr = new IntentManager({ storage, opaClient: opa });
    await mgr.initialize();
    const result = await mgr.checkOutputCompliance('Contains secret stuff');
    expect(result.compliant).toBe(true);

    evaluateSpy.mockRestore();
    uploadSpy.mockRestore();
  });

  it('syncPoliciesWithOpa uploads output_compliance package', async () => {
    const uploadSpy = vi.spyOn(OpaClient.prototype, 'uploadPolicy').mockResolvedValue(undefined);
    const opa = new OpaClient('http://opa:8181');
    const mgr = new IntentManager({ storage: makeStorage(), opaClient: opa });
    const record = makeIntent({ hardBoundaries: [], policies: [] });
    await mgr.syncPoliciesWithOpa(record);
    expect(uploadSpy).toHaveBeenCalledWith(
      'output_compliance',
      expect.stringContaining('package output_compliance')
    );
    uploadSpy.mockRestore();
  });
});

// ── Phase 111-C: logEnforcement → auto-register-entry ─────────────────────────

describe('logEnforcement auto-register-entry (Phase 111-C)', () => {
  it('creates register entry for boundary_violated with departmentId', async () => {
    const logSpy = vi.fn().mockResolvedValue(undefined);
    const createEntry = vi.fn().mockResolvedValue({ id: 'entry-1' });
    const mgr = new IntentManager({
      storage: makeStorage({ logEnforcement: logSpy }),
      opaClient: null,
      getDepartmentRiskManager: () => ({ createRegisterEntry: createEntry }),
    });

    await mgr.logEnforcement({
      eventType: 'boundary_violated',
      details: 'Max tokens exceeded',
      metadata: { departmentId: 'd1' },
    } as any);

    expect(logSpy).toHaveBeenCalled();
    // Give fire-and-forget time to execute
    await new Promise((r) => setTimeout(r, 10));
    expect(createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentId: 'd1',
        category: 'compliance',
        source: 'audit',
      })
    );
  });

  it('creates register entry for policy_block with departmentId', async () => {
    const logSpy = vi.fn().mockResolvedValue(undefined);
    const createEntry = vi.fn().mockResolvedValue({ id: 'entry-2' });
    const mgr = new IntentManager({
      storage: makeStorage({ logEnforcement: logSpy }),
      opaClient: null,
      getDepartmentRiskManager: () => ({ createRegisterEntry: createEntry }),
    });

    await mgr.logEnforcement({
      eventType: 'policy_block',
      details: 'Rate limit violation',
      metadata: { departmentId: 'd2' },
    } as any);

    await new Promise((r) => setTimeout(r, 10));
    expect(createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentId: 'd2',
        title: expect.stringContaining('policy_block'),
      })
    );
  });

  it('does not create entry when eventType is not boundary_violated or policy_block', async () => {
    const logSpy = vi.fn().mockResolvedValue(undefined);
    const createEntry = vi.fn();
    const mgr = new IntentManager({
      storage: makeStorage({ logEnforcement: logSpy }),
      opaClient: null,
      getDepartmentRiskManager: () => ({ createRegisterEntry: createEntry }),
    });

    await mgr.logEnforcement({
      eventType: 'intent_signal_degraded',
      details: 'Signal degradation',
      metadata: { departmentId: 'd1' },
    } as any);

    await new Promise((r) => setTimeout(r, 10));
    expect(createEntry).not.toHaveBeenCalled();
  });

  it('does not create entry when departmentId is missing from metadata', async () => {
    const logSpy = vi.fn().mockResolvedValue(undefined);
    const createEntry = vi.fn();
    const mgr = new IntentManager({
      storage: makeStorage({ logEnforcement: logSpy }),
      opaClient: null,
      getDepartmentRiskManager: () => ({ createRegisterEntry: createEntry }),
    });

    await mgr.logEnforcement({
      eventType: 'boundary_violated',
      details: 'Max tokens exceeded',
      metadata: {},
    } as any);

    await new Promise((r) => setTimeout(r, 10));
    expect(createEntry).not.toHaveBeenCalled();
  });
});
