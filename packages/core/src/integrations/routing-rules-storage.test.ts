/**
 * RoutingRulesStorage Tests
 *
 * Unit tests using vi.spyOn on protected PgBaseStorage methods.
 * No database required.
 */

import { describe, it, expect, vi } from 'vitest';
import { RoutingRulesStorage } from './routing-rules-storage.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    description: 'A test routing rule',
    enabled: true,
    priority: 100,
    trigger_platforms: ['slack'],
    trigger_integration_ids: [],
    trigger_chat_id_pattern: null,
    trigger_sender_id_pattern: null,
    trigger_keyword_pattern: null,
    trigger_direction: 'inbound',
    action_type: 'forward',
    action_target_integration_id: 'int-2',
    action_target_chat_id: null,
    action_personality_id: null,
    action_webhook_url: null,
    action_message_template: null,
    match_count: 0,
    last_matched_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

// ─── list ─────────────────────────────────────────────────────────────────────

describe('RoutingRulesStorage.list()', () => {
  it('returns rules and total count', async () => {
    const storage = new RoutingRulesStorage();
    vi.spyOn(storage as any, 'queryMany')
      .mockResolvedValueOnce([makeRow()])           // rules
      .mockResolvedValueOnce([{ total: 1 }]);        // count

    const result = await storage.list();
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].id).toBe('rule-1');
    expect(result.total).toBe(1);
  });

  it('filters by enabled', async () => {
    const storage = new RoutingRulesStorage();
    const spy = vi.spyOn(storage as any, 'queryMany')
      .mockResolvedValue([]);

    await storage.list({ enabled: true });
    const firstCall = spy.mock.calls[0];
    expect(firstCall[0]).toContain('enabled');
    expect(firstCall[1]).toContain(true);
  });

  it('maps all fields correctly', async () => {
    const storage = new RoutingRulesStorage();
    vi.spyOn(storage as any, 'queryMany')
      .mockResolvedValueOnce([makeRow({
        trigger_chat_id_pattern: 'general*',
        trigger_keyword_pattern: 'help',
        action_personality_id: 'p-1',
        match_count: 5,
        last_matched_at: NOW - 1000,
      })])
      .mockResolvedValueOnce([{ total: 1 }]);

    const result = await storage.list();
    const r = result.rules[0];
    expect(r.triggerChatIdPattern).toBe('general*');
    expect(r.triggerKeywordPattern).toBe('help');
    expect(r.actionPersonalityId).toBe('p-1');
    expect(r.matchCount).toBe(5);
    expect(r.lastMatchedAt).toBe(NOW - 1000);
  });

  it('uses 0 total when countRows is empty', async () => {
    const storage = new RoutingRulesStorage();
    vi.spyOn(storage as any, 'queryMany')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await storage.list();
    expect(result.total).toBe(0);
  });
});

// ─── get ─────────────────────────────────────────────────────────────────────

describe('RoutingRulesStorage.get()', () => {
  it('returns rule when found', async () => {
    const storage = new RoutingRulesStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(makeRow());
    const result = await storage.get('rule-1');
    expect(result?.id).toBe('rule-1');
    expect(result?.actionType).toBe('forward');
  });

  it('returns null when not found', async () => {
    const storage = new RoutingRulesStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(null);
    expect(await storage.get('missing')).toBeNull();
  });
});

// ─── create ───────────────────────────────────────────────────────────────────

describe('RoutingRulesStorage.create()', () => {
  it('inserts and returns the new rule', async () => {
    const storage = new RoutingRulesStorage();
    const executeSpy = vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(makeRow());

    const result = await storage.create({
      name: 'Test Rule',
      actionType: 'forward',
      triggerDirection: 'inbound',
    });

    expect(executeSpy).toHaveBeenCalledOnce();
    const params = executeSpy.mock.calls[0][1];
    expect(params[1]).toBe('Test Rule');    // name
    expect(params[3]).toBe(true);           // enabled default
    expect(params[4]).toBe(100);            // priority default
    expect(result?.id).toBe('rule-1');
  });

  it('uses provided optional fields', async () => {
    const storage = new RoutingRulesStorage();
    const executeSpy = vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(makeRow({ enabled: false, priority: 50 }));

    await storage.create({
      name: 'Low Pri Rule',
      actionType: 'notify',
      enabled: false,
      priority: 50,
      triggerChatIdPattern: 'dev-*',
    });

    const params = executeSpy.mock.calls[0][1];
    expect(params[3]).toBe(false);       // enabled
    expect(params[4]).toBe(50);          // priority
    expect(params[7]).toBe('dev-*');     // trigger_chat_id_pattern
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe('RoutingRulesStorage.update()', () => {
  it('returns null when rule not found', async () => {
    const storage = new RoutingRulesStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(null);
    expect(await storage.update('missing', { name: 'X' })).toBeNull();
  });

  it('updates and returns the updated rule', async () => {
    const storage = new RoutingRulesStorage();
    const queryOneSpy = vi.spyOn(storage as any, 'queryOne')
      .mockResolvedValueOnce(makeRow())            // existing (in update)
      .mockResolvedValueOnce(makeRow({ name: 'Updated' }));  // result (in get)
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);

    const result = await storage.update('rule-1', { name: 'Updated' });
    expect(result?.name).toBe('Updated');
    expect(queryOneSpy).toHaveBeenCalledTimes(2);
  });
});

// ─── delete ───────────────────────────────────────────────────────────────────

describe('RoutingRulesStorage.delete()', () => {
  it('returns true when deleted', async () => {
    const storage = new RoutingRulesStorage();
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);
    expect(await storage.delete('rule-1')).toBe(true);
  });

  it('returns false when not found', async () => {
    const storage = new RoutingRulesStorage();
    vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(0);
    expect(await storage.delete('missing')).toBe(false);
  });
});

// ─── recordMatch ──────────────────────────────────────────────────────────────

describe('RoutingRulesStorage.recordMatch()', () => {
  it('calls execute once to increment match_count', async () => {
    const storage = new RoutingRulesStorage();
    const executeSpy = vi.spyOn(storage as any, 'execute').mockResolvedValueOnce(1);
    await storage.recordMatch('rule-1');
    expect(executeSpy).toHaveBeenCalledOnce();
    expect(executeSpy.mock.calls[0][0]).toContain('match_count');
    expect(executeSpy.mock.calls[0][1][0]).toBe('rule-1');
  });
});

// ─── listEnabled ─────────────────────────────────────────────────────────────

describe('RoutingRulesStorage.listEnabled()', () => {
  it('returns only enabled rules', async () => {
    const storage = new RoutingRulesStorage();
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([makeRow(), makeRow({ id: 'rule-2' })]);

    const rules = await storage.listEnabled();
    expect(rules).toHaveLength(2);
  });

  it('returns empty array when none enabled', async () => {
    const storage = new RoutingRulesStorage();
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([]);
    expect(await storage.listEnabled()).toEqual([]);
  });
});
