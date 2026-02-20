import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProactiveStorage } from './storage.js';

// ── Mock pg-pool ─────────────────────────────────────────────────
// We mock the pool at the module level so that PgBaseStorage methods
// (queryMany, queryOne, execute) can be intercepted via the pool's query fn.

const mockQuery = vi.fn();

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

// ── Row factories ────────────────────────────────────────────────

function makeTriggerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trigger-1',
    name: 'Test Trigger',
    description: null,
    enabled: true,
    type: 'schedule',
    condition: JSON.stringify({ type: 'schedule', cron: '0 9 * * 1-5', timezone: 'UTC' }),
    action: JSON.stringify({ type: 'message', content: 'Hello!' }),
    approval_mode: 'suggest',
    cooldown_ms: 0,
    limit_per_day: 0,
    builtin: false,
    last_fired_at: null,
    fire_count: 0,
    created_at: '2026-02-16T09:00:00.000Z',
    updated_at: '2026-02-16T09:00:00.000Z',
    ...overrides,
  };
}

function makeSuggestionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sug-1',
    trigger_id: 'trigger-1',
    trigger_name: 'Test Trigger',
    action: JSON.stringify({ type: 'message', content: 'Hello!' }),
    context: JSON.stringify({}),
    confidence: 1,
    suggested_at: '2026-02-16T09:00:00.000Z',
    status: 'pending',
    expires_at: '2026-02-17T09:00:00.000Z',
    approved_at: null,
    executed_at: null,
    dismissed_at: null,
    result: null,
    ...overrides,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

/** Simulate a pg query returning rows */
function queryReturns(rows: unknown[]) {
  mockQuery.mockResolvedValueOnce({ rows, rowCount: rows.length });
}

/** Simulate a pg query returning a rowCount (no rows) */
function executeReturns(rowCount: number) {
  mockQuery.mockResolvedValueOnce({ rows: [], rowCount });
}

// ── Tests ────────────────────────────────────────────────────────

describe('ProactiveStorage', () => {
  let storage: ProactiveStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new ProactiveStorage();
  });

  // ── Instantiation ────────────────────────────────────────────────

  it('can be instantiated', () => {
    expect(storage).toBeInstanceOf(ProactiveStorage);
  });

  it('has all required trigger methods', () => {
    expect(typeof storage.ensureTables).toBe('function');
    expect(typeof storage.listTriggers).toBe('function');
    expect(typeof storage.getTrigger).toBe('function');
    expect(typeof storage.createTrigger).toBe('function');
    expect(typeof storage.updateTrigger).toBe('function');
    expect(typeof storage.deleteTrigger).toBe('function');
    expect(typeof storage.setTriggerEnabled).toBe('function');
    expect(typeof storage.recordFiring).toBe('function');
    expect(typeof storage.getDailyFiringCount).toBe('function');
    expect(typeof storage.createBuiltinTrigger).toBe('function');
  });

  it('has all required suggestion methods', () => {
    expect(typeof storage.listSuggestions).toBe('function');
    expect(typeof storage.getSuggestion).toBe('function');
    expect(typeof storage.createSuggestion).toBe('function');
    expect(typeof storage.updateSuggestionStatus).toBe('function');
    expect(typeof storage.deleteExpiredSuggestions).toBe('function');
  });

  it('extends PgBaseStorage (has close method)', () => {
    expect(typeof storage.close).toBe('function');
  });

  // ── ensureTables ─────────────────────────────────────────────────

  describe('ensureTables', () => {
    it('executes DDL statements', async () => {
      executeReturns(0);
      await storage.ensureTables();
      expect(mockQuery).toHaveBeenCalledOnce();
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS proactive');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS proactive.triggers');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS proactive.suggestions');
    });
  });

  // ── Trigger CRUD ─────────────────────────────────────────────────

  describe('listTriggers', () => {
    it('returns all triggers when no filter', async () => {
      const rows = [makeTriggerRow(), makeTriggerRow({ id: 'trigger-2', name: 'Second' })];
      queryReturns([{ count: '2' }]);
      queryReturns(rows);

      const result = await storage.listTriggers();
      expect(result.triggers).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.triggers[0].id).toBe('trigger-1');
      expect(result.triggers[1].id).toBe('trigger-2');
    });

    it('maps row fields to domain object correctly', async () => {
      queryReturns([{ count: '1' }]);
      queryReturns([makeTriggerRow()]);
      const { triggers } = await storage.listTriggers();
      const [trigger] = triggers;

      expect(trigger.id).toBe('trigger-1');
      expect(trigger.name).toBe('Test Trigger');
      expect(trigger.description).toBeUndefined();
      expect(trigger.enabled).toBe(true);
      expect(trigger.type).toBe('schedule');
      expect(trigger.condition).toEqual({ type: 'schedule', cron: '0 9 * * 1-5', timezone: 'UTC' });
      expect(trigger.action).toEqual({ type: 'message', content: 'Hello!' });
      expect(trigger.approvalMode).toBe('suggest');
      expect(trigger.cooldownMs).toBe(0);
      expect(trigger.limitPerDay).toBe(0);
      expect(trigger.builtin).toBe(false);
      expect((trigger as any).lastFiredAt).toBeUndefined();
      expect((trigger as any).fireCount).toBe(0);
    });

    it('parses lastFiredAt when present', async () => {
      queryReturns([{ count: '1' }]);
      queryReturns([makeTriggerRow({ last_fired_at: '2026-02-16T08:00:00.000Z', fire_count: 3 })]);
      const { triggers } = await storage.listTriggers();
      const [trigger] = triggers;
      expect((trigger as any).lastFiredAt).toBeTypeOf('number');
      expect((trigger as any).fireCount).toBe(3);
    });

    it('filters by enabled=true', async () => {
      queryReturns([{ count: '1' }]);
      queryReturns([makeTriggerRow({ enabled: true })]);

      await storage.listTriggers({ enabled: true });
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain('enabled = $1');
      expect(mockQuery.mock.calls[0][1]).toContain(true);
    });

    it('filters by type', async () => {
      queryReturns([{ count: '1' }]);
      queryReturns([makeTriggerRow({ type: 'event' })]);

      await storage.listTriggers({ type: 'event' });
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain('type = $1');
      expect(mockQuery.mock.calls[0][1]).toContain('event');
    });

    it('filters by both type and enabled', async () => {
      queryReturns([{ count: '0' }]);
      queryReturns([]);

      await storage.listTriggers({ type: 'schedule', enabled: false });
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain('type = $1');
      expect(sql).toContain('enabled = $2');
    });

    it('returns empty array when no triggers', async () => {
      queryReturns([{ count: '0' }]);
      queryReturns([]);
      const result = await storage.listTriggers();
      expect(result.triggers).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('getTrigger', () => {
    it('returns a trigger by id', async () => {
      queryReturns([makeTriggerRow()]);
      const result = await storage.getTrigger('trigger-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('trigger-1');
    });

    it('returns null when trigger not found', async () => {
      queryReturns([]);
      const result = await storage.getTrigger('nonexistent');
      expect(result).toBeNull();
    });

    it('passes the id as query parameter', async () => {
      queryReturns([]);
      await storage.getTrigger('my-trigger-id');
      expect(mockQuery.mock.calls[0][1]).toEqual(['my-trigger-id']);
    });
  });

  describe('createTrigger', () => {
    it('inserts a trigger and returns the created row', async () => {
      queryReturns([makeTriggerRow()]);

      const result = await storage.createTrigger({
        name: 'Test Trigger',
        enabled: true,
        type: 'schedule',
        condition: { type: 'schedule', cron: '0 9 * * 1-5', timezone: 'UTC' },
        action: { type: 'message', content: 'Hello!' },
        approvalMode: 'suggest',
        cooldownMs: 0,
        limitPerDay: 0,
      });

      expect(result.id).toBe('trigger-1');
      expect(result.name).toBe('Test Trigger');
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain('INSERT INTO proactive.triggers');
      expect(sql).toContain('RETURNING *');
    });

    it('uses defaults for optional fields', async () => {
      queryReturns([makeTriggerRow()]);

      await storage.createTrigger({
        name: 'Minimal',
        enabled: true,
        type: 'event',
        condition: { type: 'event', eventType: 'my-event' },
        action: { type: 'message', content: 'Alert!' },
        approvalMode: 'suggest',
        cooldownMs: 0,
        limitPerDay: 0,
      });

      const values: unknown[] = mockQuery.mock.calls[0][1];
      // description (index 2) defaults to null
      expect(values[2]).toBeNull();
    });
  });

  describe('updateTrigger', () => {
    it('returns updated trigger', async () => {
      queryReturns([makeTriggerRow({ name: 'Updated Name' })]);

      const result = await storage.updateTrigger('trigger-1', { name: 'Updated Name' });
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Updated Name');
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain('UPDATE proactive.triggers SET');
      expect(sql).toContain('RETURNING *');
    });

    it('returns null when trigger not found', async () => {
      queryReturns([]);
      const result = await storage.updateTrigger('nonexistent', { name: 'X' });
      expect(result).toBeNull();
    });

    it('calls getTrigger when no fields to update', async () => {
      // When updates array is empty, it delegates to getTrigger
      queryReturns([makeTriggerRow()]);
      const result = await storage.updateTrigger('trigger-1', {});
      expect(result).not.toBeNull();
      // getTrigger uses SELECT not UPDATE
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain('SELECT');
    });

    it('updates multiple fields at once', async () => {
      queryReturns([makeTriggerRow({ enabled: false, cooldown_ms: 60000 })]);

      await storage.updateTrigger('trigger-1', { enabled: false, cooldownMs: 60000 });
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain('enabled = $');
      expect(sql).toContain('cooldown_ms = $');
    });
  });

  describe('deleteTrigger', () => {
    it('returns true when deleted', async () => {
      executeReturns(1);
      const result = await storage.deleteTrigger('trigger-1');
      expect(result).toBe(true);
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain('DELETE FROM proactive.triggers');
    });

    it('returns false when trigger not found', async () => {
      executeReturns(0);
      const result = await storage.deleteTrigger('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('setTriggerEnabled', () => {
    it('enables a trigger and returns it', async () => {
      queryReturns([makeTriggerRow({ enabled: true })]);
      const result = await storage.setTriggerEnabled('trigger-1', true);
      expect(result).not.toBeNull();
      expect(result!.enabled).toBe(true);
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain('UPDATE proactive.triggers SET enabled = $1');
      expect(mockQuery.mock.calls[0][1]).toContain(true);
    });

    it('disables a trigger and returns it', async () => {
      queryReturns([makeTriggerRow({ enabled: false })]);
      const result = await storage.setTriggerEnabled('trigger-1', false);
      expect(result).not.toBeNull();
      expect(result!.enabled).toBe(false);
    });

    it('returns null when trigger not found', async () => {
      queryReturns([]);
      const result = await storage.setTriggerEnabled('nonexistent', true);
      expect(result).toBeNull();
    });
  });

  // ── Firing ───────────────────────────────────────────────────────

  describe('recordFiring', () => {
    it('updates last_fired_at and increments fire_count', async () => {
      executeReturns(1);
      await storage.recordFiring('trigger-1');
      expect(mockQuery).toHaveBeenCalledOnce();
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain('last_fired_at = now()');
      expect(sql).toContain('fire_count = fire_count + 1');
      expect(mockQuery.mock.calls[0][1]).toEqual(['trigger-1']);
    });
  });

  describe('getDailyFiringCount', () => {
    it('returns the daily count', async () => {
      queryReturns([{ count: '7' }]);
      const result = await storage.getDailyFiringCount('trigger-1');
      expect(result).toBe(7);
    });

    it('returns 0 when no firings today', async () => {
      queryReturns([{ count: '0' }]);
      const result = await storage.getDailyFiringCount('trigger-1');
      expect(result).toBe(0);
    });

    it('returns 0 when query returns null row', async () => {
      queryReturns([]);
      const result = await storage.getDailyFiringCount('trigger-1');
      expect(result).toBe(0);
    });

    it('queries suggestions table with CURRENT_DATE filter', async () => {
      queryReturns([{ count: '2' }]);
      await storage.getDailyFiringCount('trigger-1');
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain('proactive.suggestions');
      expect(sql).toContain('CURRENT_DATE');
    });
  });

  // ── Builtin triggers ─────────────────────────────────────────────

  describe('createBuiltinTrigger', () => {
    it('upserts a builtin trigger', async () => {
      queryReturns([makeTriggerRow({ builtin: true })]);

      const trigger = {
        id: 'builtin-daily-standup',
        name: 'Daily Standup',
        enabled: false,
        type: 'schedule' as const,
        condition: { type: 'schedule' as const, cron: '0 9 * * 1-5', timezone: 'UTC' },
        action: { type: 'message' as const, content: 'Good morning!' },
        approvalMode: 'auto' as const,
        cooldownMs: 43200000,
        limitPerDay: 1,
        builtin: true,
      };

      const result = await storage.createBuiltinTrigger(trigger);
      expect(result).not.toBeNull();
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain('INSERT INTO proactive.triggers');
      expect(sql).toContain('ON CONFLICT (id) DO UPDATE SET');
    });
  });

  // ── Suggestion CRUD ──────────────────────────────────────────────

  describe('listSuggestions', () => {
    it('returns suggestions and total count', async () => {
      // First call = COUNT query, second call = SELECT rows
      queryReturns([{ count: '2' }]);
      queryReturns([makeSuggestionRow(), makeSuggestionRow({ id: 'sug-2' })]);

      const result = await storage.listSuggestions();
      expect(result.total).toBe(2);
      expect(result.suggestions).toHaveLength(2);
    });

    it('maps suggestion row fields to domain object', async () => {
      queryReturns([{ count: '1' }]);
      queryReturns([makeSuggestionRow()]);

      const { suggestions } = await storage.listSuggestions();
      const [sug] = suggestions;

      expect(sug.id).toBe('sug-1');
      expect(sug.triggerId).toBe('trigger-1');
      expect(sug.triggerName).toBe('Test Trigger');
      expect(sug.action).toEqual({ type: 'message', content: 'Hello!' });
      expect(sug.context).toEqual({});
      expect(sug.confidence).toBe(1);
      expect(sug.status).toBe('pending');
      expect(sug.approvedAt).toBeUndefined();
      expect(sug.executedAt).toBeUndefined();
      expect(sug.dismissedAt).toBeUndefined();
      expect(sug.result).toBeUndefined();
    });

    it('parses result JSON when present', async () => {
      queryReturns([{ count: '1' }]);
      queryReturns([
        makeSuggestionRow({ result: JSON.stringify({ success: true, message: 'ok' }) }),
      ]);

      const { suggestions } = await storage.listSuggestions();
      expect(suggestions[0].result).toEqual({ success: true, message: 'ok' });
    });

    it('filters by status', async () => {
      queryReturns([{ count: '1' }]);
      queryReturns([makeSuggestionRow({ status: 'approved' })]);

      await storage.listSuggestions({ status: 'approved' });
      const countSql: string = mockQuery.mock.calls[0][0];
      expect(countSql).toContain('status = $1');
    });

    it('filters by triggerId', async () => {
      queryReturns([{ count: '1' }]);
      queryReturns([makeSuggestionRow()]);

      await storage.listSuggestions({ triggerId: 'trigger-1' });
      const countSql: string = mockQuery.mock.calls[0][0];
      expect(countSql).toContain('trigger_id = $1');
    });

    it('filters by status and triggerId together', async () => {
      queryReturns([{ count: '0' }]);
      queryReturns([]);

      await storage.listSuggestions({ status: 'pending', triggerId: 'trigger-1' });
      const countSql: string = mockQuery.mock.calls[0][0];
      expect(countSql).toContain('status = $1');
      expect(countSql).toContain('trigger_id = $2');
    });

    it('returns total 0 when no suggestions', async () => {
      queryReturns([{ count: '0' }]);
      queryReturns([]);

      const result = await storage.listSuggestions();
      expect(result.total).toBe(0);
      expect(result.suggestions).toEqual([]);
    });
  });

  describe('getSuggestion', () => {
    it('returns a suggestion by id', async () => {
      queryReturns([makeSuggestionRow()]);
      const result = await storage.getSuggestion('sug-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('sug-1');
    });

    it('returns null when suggestion not found', async () => {
      queryReturns([]);
      const result = await storage.getSuggestion('nonexistent');
      expect(result).toBeNull();
    });

    it('passes id as query parameter', async () => {
      queryReturns([]);
      await storage.getSuggestion('my-sug-id');
      expect(mockQuery.mock.calls[0][1]).toEqual(['my-sug-id']);
    });
  });

  describe('createSuggestion', () => {
    it('inserts a suggestion and returns it', async () => {
      queryReturns([makeSuggestionRow()]);

      const result = await storage.createSuggestion({
        triggerId: 'trigger-1',
        triggerName: 'Test Trigger',
        action: { type: 'message', content: 'Hello!' },
        context: { key: 'value' },
        confidence: 0.9,
        expiresAt: new Date('2026-02-17T09:00:00.000Z'),
      });

      expect(result.id).toBe('sug-1');
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain('INSERT INTO proactive.suggestions');
      expect(sql).toContain('RETURNING *');
    });

    it('uses default context when not provided', async () => {
      queryReturns([makeSuggestionRow()]);

      await storage.createSuggestion({
        triggerId: 'trigger-1',
        triggerName: 'Test Trigger',
        action: { type: 'message', content: 'Hello!' },
        expiresAt: new Date('2026-02-17T09:00:00.000Z'),
      });

      const values: unknown[] = mockQuery.mock.calls[0][1];
      // context is at index 4 (id, trigger_id, trigger_name, action, context, confidence, expires_at)
      expect(values[4]).toBe(JSON.stringify({}));
    });

    it('uses default confidence of 1 when not provided', async () => {
      queryReturns([makeSuggestionRow()]);

      await storage.createSuggestion({
        triggerId: 'trigger-1',
        triggerName: 'Test Trigger',
        action: { type: 'message', content: 'Hello!' },
        expiresAt: new Date('2026-02-17T09:00:00.000Z'),
      });

      const values: unknown[] = mockQuery.mock.calls[0][1];
      expect(values[5]).toBe(1);
    });
  });

  // ── Status transitions ───────────────────────────────────────────

  describe('updateSuggestionStatus', () => {
    it('sets status to approved and sets approved_at timestamp', async () => {
      queryReturns([
        makeSuggestionRow({ status: 'approved', approved_at: '2026-02-16T09:05:00.000Z' }),
      ]);

      const result = await storage.updateSuggestionStatus('sug-1', 'approved');
      expect(result).not.toBeNull();
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain('status = $1');
      expect(sql).toContain('approved_at = now()');
    });

    it('sets status to executed and sets executed_at timestamp', async () => {
      queryReturns([
        makeSuggestionRow({ status: 'executed', executed_at: '2026-02-16T09:10:00.000Z' }),
      ]);

      await storage.updateSuggestionStatus('sug-1', 'executed');
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain('executed_at = now()');
    });

    it('sets status to dismissed and sets dismissed_at timestamp', async () => {
      queryReturns([
        makeSuggestionRow({ status: 'dismissed', dismissed_at: '2026-02-16T09:15:00.000Z' }),
      ]);

      await storage.updateSuggestionStatus('sug-1', 'dismissed');
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain('dismissed_at = now()');
    });

    it('stores result JSON when provided', async () => {
      queryReturns([
        makeSuggestionRow({ status: 'executed', result: JSON.stringify({ success: true }) }),
      ]);

      await storage.updateSuggestionStatus('sug-1', 'executed', { success: true, message: 'done' });
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain('result =');
    });

    it('returns null when suggestion not found', async () => {
      queryReturns([]);
      const result = await storage.updateSuggestionStatus('nonexistent', 'approved');
      expect(result).toBeNull();
    });

    it('does not set timestamp field for expired status', async () => {
      queryReturns([makeSuggestionRow({ status: 'expired' })]);
      await storage.updateSuggestionStatus('sug-1', 'expired');
      const sql: string = mockQuery.mock.calls[0][0];
      // expired has no dedicated timestamp column
      expect(sql).not.toContain('expired_at');
    });
  });

  // ── Expired cleanup ──────────────────────────────────────────────

  describe('deleteExpiredSuggestions', () => {
    it('deletes pending expired suggestions and returns count', async () => {
      executeReturns(3);
      const result = await storage.deleteExpiredSuggestions();
      expect(result).toBe(3);
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain(
        "DELETE FROM proactive.suggestions WHERE status = 'pending' AND expires_at < now()"
      );
    });

    it('returns 0 when nothing to delete', async () => {
      executeReturns(0);
      const result = await storage.deleteExpiredSuggestions();
      expect(result).toBe(0);
    });
  });
});
