/**
 * IntentStorage Tests
 *
 * Unit tests using vi.spyOn on protected PgBaseStorage methods.
 * No database required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntentStorage } from './storage.js';
import type { OrgIntentDoc } from './schema.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;

function makeDoc(overrides: Partial<OrgIntentDoc> = {}): OrgIntentDoc {
  return {
    name: 'Test Intent',
    apiVersion: 'v1',
    goals: [{ id: 'g1', title: 'Goal 1', description: 'desc', priority: 'high', status: 'active' }],
    signals: [],
    dataSources: [],
    authorizedActions: [],
    tradeoffProfiles: [],
    hardBoundaries: [],
    policies: [],
    delegationFramework: { tenants: [] },
    context: [],
    ...overrides,
  };
}

function makeIntentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'intent-1',
    name: 'Test Intent',
    api_version: 'v1',
    doc: makeDoc(),
    is_active: false,
    created_at: String(NOW),
    updated_at: String(NOW),
    ...overrides,
  };
}

function makeLogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-1',
    event_type: 'action_blocked',
    item_id: null,
    rule: 'no_pii',
    rationale: null,
    action_attempted: null,
    agent_id: null,
    session_id: null,
    personality_id: null,
    metadata: null,
    created_at: String(NOW),
    ...overrides,
  };
}

// ─── createIntent ─────────────────────────────────────────────────────────────

describe('IntentStorage.createIntent()', () => {
  it('inserts and returns a record', async () => {
    const storage = new IntentStorage();
    const row = makeIntentRow();
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(row);

    const result = await storage.createIntent(makeDoc());
    expect(result.id).toBe('intent-1');
    expect(result.name).toBe('Test Intent');
    expect(result.apiVersion).toBe('v1');
    expect(result.isActive).toBe(false);
    expect(result.createdAt).toBe(NOW);
    expect(result.goals).toHaveLength(1);
  });

  it('fills in optional doc fields with defaults', async () => {
    const storage = new IntentStorage();
    const row = makeIntentRow({ doc: { name: 'Minimal', apiVersion: 'v1' } });
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(row);

    const result = await storage.createIntent({ name: 'Minimal', apiVersion: 'v1' } as OrgIntentDoc);
    expect(result.goals).toEqual([]);
    expect(result.signals).toEqual([]);
    expect(result.delegationFramework).toEqual({ tenants: [] });
    expect(result.context).toEqual([]);
  });
});

// ─── updateIntent ─────────────────────────────────────────────────────────────

describe('IntentStorage.updateIntent()', () => {
  it('returns null when intent not found', async () => {
    const storage = new IntentStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(null);

    const result = await storage.updateIntent('nonexistent', { name: 'New Name' });
    expect(result).toBeNull();
  });

  it('merges patch and returns updated record', async () => {
    const storage = new IntentStorage();
    const existing = makeIntentRow();
    const updated = makeIntentRow({ name: 'Updated', doc: { ...makeDoc(), name: 'Updated' } });

    const queryOneSpy = vi.spyOn(storage as any, 'queryOne')
      .mockResolvedValueOnce(existing)  // first call: fetch existing
      .mockResolvedValueOnce(updated);  // second call: fetch updated
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);

    const result = await storage.updateIntent('intent-1', { name: 'Updated' });
    expect(result?.name).toBe('Updated');
    expect(queryOneSpy).toHaveBeenCalledTimes(2);
  });

  it('returns null if updated row disappears', async () => {
    const storage = new IntentStorage();
    const existing = makeIntentRow();
    vi.spyOn(storage as any, 'queryOne')
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(null);
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);

    const result = await storage.updateIntent('intent-1', { name: 'X' });
    expect(result).toBeNull();
  });
});

// ─── deleteIntent ─────────────────────────────────────────────────────────────

describe('IntentStorage.deleteIntent()', () => {
  it('returns true when a row was deleted', async () => {
    const storage = new IntentStorage();
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);
    expect(await storage.deleteIntent('intent-1')).toBe(true);
  });

  it('returns false when nothing was deleted', async () => {
    const storage = new IntentStorage();
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(0);
    expect(await storage.deleteIntent('missing')).toBe(false);
  });
});

// ─── getIntentDoc ─────────────────────────────────────────────────────────────

describe('IntentStorage.getIntentDoc()', () => {
  it('returns record when found', async () => {
    const storage = new IntentStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(makeIntentRow());
    const result = await storage.getIntentDoc('intent-1');
    expect(result?.id).toBe('intent-1');
  });

  it('returns null when not found', async () => {
    const storage = new IntentStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(null);
    expect(await storage.getIntentDoc('missing')).toBeNull();
  });
});

// ─── listIntents ─────────────────────────────────────────────────────────────

describe('IntentStorage.listIntents()', () => {
  it('returns list of intent metadata', async () => {
    const storage = new IntentStorage();
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([
      { id: 'i1', name: 'A', api_version: 'v1', is_active: true, created_at: String(NOW), updated_at: String(NOW) },
      { id: 'i2', name: 'B', api_version: 'v1', is_active: false, created_at: String(NOW), updated_at: String(NOW) },
    ]);

    const result = await storage.listIntents();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('i1');
    expect(result[0].isActive).toBe(true);
    expect(result[1].id).toBe('i2');
  });

  it('returns empty array when no intents exist', async () => {
    const storage = new IntentStorage();
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([]);
    expect(await storage.listIntents()).toEqual([]);
  });
});

// ─── getActiveIntent ──────────────────────────────────────────────────────────

describe('IntentStorage.getActiveIntent()', () => {
  it('returns active intent record', async () => {
    const storage = new IntentStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(makeIntentRow({ is_active: true }));
    const result = await storage.getActiveIntent();
    expect(result?.isActive).toBe(true);
  });

  it('returns null when no active intent', async () => {
    const storage = new IntentStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(null);
    expect(await storage.getActiveIntent()).toBeNull();
  });
});

// ─── setActiveIntent ──────────────────────────────────────────────────────────

describe('IntentStorage.setActiveIntent()', () => {
  it('calls withTransaction to deactivate all then activate one', async () => {
    const storage = new IntentStorage();
    const clientMock = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
    vi.spyOn(storage as any, 'withTransaction').mockImplementation(
      async (fn: (client: typeof clientMock) => Promise<void>) => {
        await fn(clientMock);
      }
    );

    await storage.setActiveIntent('intent-1');
    expect(clientMock.query).toHaveBeenCalledTimes(2);
    expect(clientMock.query.mock.calls[0][0]).toContain('is_active = FALSE');
    expect(clientMock.query.mock.calls[1][0]).toContain('is_active = TRUE');
  });
});

// ─── getGoalSnapshots ─────────────────────────────────────────────────────────

describe('IntentStorage.getGoalSnapshots()', () => {
  it('returns a map keyed by goalId', async () => {
    const storage = new IntentStorage();
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([
      { intent_id: 'i1', goal_id: 'g1', is_active: true, activated_at: String(NOW), completed_at: null },
      { intent_id: 'i1', goal_id: 'g2', is_active: false, activated_at: null, completed_at: String(NOW) },
    ]);

    const map = await storage.getGoalSnapshots('i1');
    expect(map.size).toBe(2);
    expect(map.get('g1')?.isActive).toBe(true);
    expect(map.get('g1')?.activatedAt).toBe(NOW);
    expect(map.get('g2')?.completedAt).toBe(NOW);
    expect(map.get('g2')?.activatedAt).toBeNull();
  });

  it('returns empty map when no snapshots', async () => {
    const storage = new IntentStorage();
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([]);
    const map = await storage.getGoalSnapshots('i1');
    expect(map.size).toBe(0);
  });
});

// ─── upsertGoalSnapshot ───────────────────────────────────────────────────────

describe('IntentStorage.upsertGoalSnapshot()', () => {
  it('executes an upsert', async () => {
    const storage = new IntentStorage();
    const executeSpy = vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);
    await storage.upsertGoalSnapshot('i1', 'g1', true, NOW, true, false);
    expect(executeSpy).toHaveBeenCalledOnce();
    const [sql, params] = executeSpy.mock.calls[0];
    expect(sql).toContain('intent_goal_snapshots');
    expect(params[0]).toBe('i1');
    expect(params[1]).toBe('g1');
    expect(params[2]).toBe(true);
    expect(params[3]).toBe(NOW); // setActivatedAt=true → now
    expect(params[4]).toBeNull(); // setCompletedAt=false → null
  });

  it('passes null for activated_at when setActivatedAt=false', async () => {
    const storage = new IntentStorage();
    const executeSpy = vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);
    await storage.upsertGoalSnapshot('i1', 'g1', false, NOW, false, true);
    const params = executeSpy.mock.calls[0][1];
    expect(params[3]).toBeNull();  // activated_at
    expect(params[4]).toBe(NOW);   // completed_at
  });
});

// ─── getGoalTimeline ──────────────────────────────────────────────────────────

describe('IntentStorage.getGoalTimeline()', () => {
  it('returns log entries for a goal', async () => {
    const storage = new IntentStorage();
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([
      makeLogRow({ event_type: 'goal_activated', item_id: 'g1' }),
      makeLogRow({ id: 'log-2', event_type: 'goal_completed', item_id: 'g1' }),
    ]);
    const entries = await storage.getGoalTimeline('i1', 'g1');
    expect(entries).toHaveLength(2);
    expect(entries[0].eventType).toBe('goal_activated');
    expect(entries[1].eventType).toBe('goal_completed');
  });
});

// ─── logEnforcement ───────────────────────────────────────────────────────────

describe('IntentStorage.logEnforcement()', () => {
  it('inserts a full log entry', async () => {
    const storage = new IntentStorage();
    const executeSpy = vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);
    await storage.logEnforcement({
      id: 'log-1',
      eventType: 'action_blocked',
      rule: 'no_pii',
      createdAt: NOW,
      itemId: 'item-1',
      rationale: 'PII detected',
      actionAttempted: 'send_email',
      agentId: 'agent-1',
      sessionId: 'session-1',
      personalityId: 'personality-1',
      metadata: { key: 'value' },
    });
    expect(executeSpy).toHaveBeenCalledOnce();
  });

  it('inserts with minimal fields (nulls for optional)', async () => {
    const storage = new IntentStorage();
    const executeSpy = vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);
    await storage.logEnforcement({ eventType: 'signal_triggered', rule: 'test', createdAt: NOW });
    const params = executeSpy.mock.calls[0][1];
    expect(params[2]).toBeNull(); // item_id
    expect(params[4]).toBeNull(); // rationale
    expect(params[9]).toBeNull(); // metadata
  });

  it('generates id and createdAt if not provided', async () => {
    const storage = new IntentStorage();
    const executeSpy = vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);
    await storage.logEnforcement({ eventType: 'signal_triggered', rule: 'auto' } as any);
    const params = executeSpy.mock.calls[0][1];
    expect(typeof params[0]).toBe('string'); // generated id
    expect(typeof params[10]).toBe('number'); // generated timestamp
  });
});

// ─── queryEnforcementLog ──────────────────────────────────────────────────────

describe('IntentStorage.queryEnforcementLog()', () => {
  it('returns all entries when no opts given', async () => {
    const storage = new IntentStorage();
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([makeLogRow()]);
    const entries = await storage.queryEnforcementLog();
    expect(entries).toHaveLength(1);
    expect(entries[0].rule).toBe('no_pii');
  });

  it('filters by eventType', async () => {
    const storage = new IntentStorage();
    const spy = vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([makeLogRow()]);
    await storage.queryEnforcementLog({ eventType: 'action_blocked' });
    const [sql, params] = spy.mock.calls[0];
    expect(sql).toContain('event_type = $1');
    expect(params[0]).toBe('action_blocked');
  });

  it('filters by agentId', async () => {
    const storage = new IntentStorage();
    const spy = vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([]);
    await storage.queryEnforcementLog({ agentId: 'agent-1' });
    const [sql, params] = spy.mock.calls[0];
    expect(sql).toContain('agent_id');
    expect(params).toContain('agent-1');
  });

  it('filters by itemId', async () => {
    const storage = new IntentStorage();
    const spy = vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([]);
    await storage.queryEnforcementLog({ itemId: 'item-1' });
    const [sql] = spy.mock.calls[0];
    expect(sql).toContain('item_id');
  });

  it('filters by since timestamp', async () => {
    const storage = new IntentStorage();
    const spy = vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([]);
    await storage.queryEnforcementLog({ since: NOW });
    const [sql, params] = spy.mock.calls[0];
    expect(sql).toContain('created_at >=');
    expect(params).toContain(NOW);
  });

  it('applies custom limit', async () => {
    const storage = new IntentStorage();
    const spy = vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([]);
    await storage.queryEnforcementLog({ limit: 10 });
    const [sql, params] = spy.mock.calls[0];
    expect(sql).toContain('LIMIT $');
    expect(params).toContain(10);
  });

  it('maps all optional log fields from row', async () => {
    const storage = new IntentStorage();
    const fullRow = makeLogRow({
      item_id: 'g1',
      rationale: 'Test reason',
      action_attempted: 'do_thing',
      agent_id: 'a1',
      session_id: 's1',
      personality_id: 'p1',
      metadata: { foo: 'bar' },
    });
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([fullRow]);
    const entries = await storage.queryEnforcementLog();
    const e = entries[0];
    expect(e.itemId).toBe('g1');
    expect(e.rationale).toBe('Test reason');
    expect(e.actionAttempted).toBe('do_thing');
    expect(e.agentId).toBe('a1');
    expect(e.sessionId).toBe('s1');
    expect(e.personalityId).toBe('p1');
    expect(e.metadata).toEqual({ foo: 'bar' });
  });
});
