/**
 * IntentManager Tests — Phase 48
 *
 * Unit tests for GoalResolver, TradeoffResolver, DelegationFrameworkResolver,
 * HardBoundaryEnforcer, AuthorizedActionChecker, and composeSoulContext.
 * No database required — uses mocked IntentStorage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntentManager } from './manager.js';
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
        { id: 'g1', name: 'Goal A', priority: 20, successCriteria: '', description: '', ownerRole: 'admin', skills: [], signals: [], authorizedActions: [] },
        { id: 'g2', name: 'Goal B', priority: 10, successCriteria: '', description: '', ownerRole: 'admin', skills: [], signals: [], authorizedActions: [] },
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
        { id: 'g1', name: 'Q1 Goal', priority: 1, activeWhen: 'quarter=Q1', successCriteria: '', description: '', ownerRole: 'admin', skills: [], signals: [], authorizedActions: [] },
        { id: 'g2', name: 'Always Goal', priority: 2, successCriteria: '', description: '', ownerRole: 'admin', skills: [], signals: [], authorizedActions: [] },
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
        { id: 'g1', name: 'Combo', priority: 1, activeWhen: 'env=prod AND region=us', successCriteria: '', description: '', ownerRole: 'admin', skills: [], signals: [], authorizedActions: [] },
      ],
    });
    const mgr = new IntentManager({ storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }) });
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
        { id: 'tp1', name: 'Fast', isDefault: false, speedVsThoroughness: 0.1, costVsQuality: 0.5, autonomyVsConfirmation: 0.5 },
        { id: 'tp2', name: 'Careful', isDefault: true, speedVsThoroughness: 0.9, costVsQuality: 0.9, autonomyVsConfirmation: 0.9 },
      ],
    });
    const mgr = new IntentManager({ storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }) });
    await mgr.initialize();

    const profile = mgr.resolveTradeoffProfile();
    expect(profile?.id).toBe('tp2');
  });

  it('applies overrides to the default profile', async () => {
    const intent = makeIntent({
      tradeoffProfiles: [
        { id: 'tp1', name: 'Balanced', isDefault: true, speedVsThoroughness: 0.5, costVsQuality: 0.5, autonomyVsConfirmation: 0.5 },
      ],
    });
    const mgr = new IntentManager({ storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }) });
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
          { id: 't1', principle: 'Least privilege', decisionBoundaries: ['Only read', 'No write prod'] },
          { id: 't2', principle: 'Audit all', decisionBoundaries: [] },
        ],
      },
    });
    const mgr = new IntentManager({ storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }) });
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
    const mgr = new IntentManager({ storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }) });
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
        { id: 'a1', description: 'Allowed action', appliesToGoals: [], appliesToSignals: [], mcpTools: [] },
      ],
    });
    const mgr = new IntentManager({ storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }) });
    await mgr.initialize();

    const result = await mgr.checkAuthorizedAction('unknown-action');
    expect(result.allowed).toBe(false);
  });

  it('allows a known action without role restriction', async () => {
    const intent = makeIntent({
      authorizedActions: [
        { id: 'a1', description: 'Send alert', appliesToGoals: [], appliesToSignals: [], mcpTools: [] },
      ],
    });
    const mgr = new IntentManager({ storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }) });
    await mgr.initialize();

    const result = await mgr.checkAuthorizedAction('a1');
    expect(result.allowed).toBe(true);
  });

  it('blocks when role does not match requiredRole', async () => {
    const logSpy = vi.fn().mockResolvedValue(undefined);
    const intent = makeIntent({
      authorizedActions: [
        { id: 'a1', description: 'Admin action', requiredRole: 'admin', appliesToGoals: [], appliesToSignals: [], mcpTools: [] },
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

// ── composeSoulContext ────────────────────────────────────────────────────────

describe('composeSoulContext', () => {
  it('returns null when no active intent', async () => {
    const mgr = new IntentManager({ storage: makeStorage() });
    const result = await mgr.composeSoulContext();
    expect(result).toBeNull();
  });

  it('returns null for empty intent doc', async () => {
    const intent = makeIntent(); // all empty arrays, no context
    const mgr = new IntentManager({ storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }) });
    await mgr.initialize();
    const result = await mgr.composeSoulContext();
    expect(result).toBeNull();
  });

  it('includes organizational goals section', async () => {
    const intent = makeIntent({
      goals: [
        { id: 'g1', name: 'Grow ARR', priority: 1, successCriteria: 'ARR > 1M', description: 'Increase revenue', ownerRole: 'admin', skills: [], signals: [], authorizedActions: [] },
      ],
    });
    const mgr = new IntentManager({ storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }) });
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
    const mgr = new IntentManager({ storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }) });
    await mgr.initialize();

    const result = await mgr.composeSoulContext();
    expect(result).toContain('## Organizational Context');
    expect(result).toContain('orgName: ACME Corp');
    expect(result).toContain('industry: SaaS');
  });

  it('includes trade-off profile', async () => {
    const intent = makeIntent({
      tradeoffProfiles: [
        { id: 'tp1', name: 'Careful', isDefault: true, speedVsThoroughness: 0.8, costVsQuality: 0.9, autonomyVsConfirmation: 0.7 },
      ],
    });
    const mgr = new IntentManager({ storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }) });
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
    const mgr = new IntentManager({ storage: makeStorage({ getActiveIntent: vi.fn().mockResolvedValue(intent) }) });
    await mgr.initialize();

    const result = await mgr.composeSoulContext();
    expect(result).toContain('## Decision Boundaries');
    expect(result).toContain('Least privilege');
    expect(result).toContain('No production writes');
  });
});
