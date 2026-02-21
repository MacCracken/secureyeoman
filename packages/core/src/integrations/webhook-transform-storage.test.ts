import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookTransformStorage } from './webhook-transform-storage.js';

// ─── Mock pg-pool ─────────────────────────────────────────────
// WebhookTransformStorage uses this.getPool().query() directly.

let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Test Data ────────────────────────────────────────────────

const ruleRow = {
  id: 'rule-1',
  integration_id: null,
  name: 'GitHub PR Rule',
  match_event: 'pull_request',
  priority: '10',
  enabled: true,
  extract_rules: [{ field: 'text', path: '$.pull_request.title', default: '' }],
  template: '{{action}} PR: {{title}}',
  created_at: '1000',
  updated_at: '2000',
};

// ─── Tests ────────────────────────────────────────────────────

describe('WebhookTransformStorage', () => {
  let storage: WebhookTransformStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new WebhookTransformStorage();
  });

  describe('createRule', () => {
    it('inserts and returns rule from RETURNING row', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [ruleRow], rowCount: 1 });

      const result = await storage.createRule({
        name: 'GitHub PR Rule',
        matchEvent: 'pull_request',
        priority: 10,
        extractRules: [{ field: 'text', path: '$.pull_request.title' }],
        template: '{{action}} PR: {{title}}',
      });

      expect(result.id).toBe('rule-1');
      expect(result.name).toBe('GitHub PR Rule');
      expect(result.matchEvent).toBe('pull_request');
      expect(result.priority).toBe(10);
      expect(result.enabled).toBe(true);
      expect(result.template).toBe('{{action}} PR: {{title}}');
      expect(result.integrationId).toBeNull();
      expect(result.createdAt).toBe(1000);
    });

    it('uses defaults for optional fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [ruleRow], rowCount: 1 });
      await storage.createRule({ name: 'Simple Rule' });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBeNull(); // integrationId
      expect(params[3]).toBeNull(); // matchEvent
      expect(params[4]).toBe(100); // default priority
      expect(params[5]).toBe(true); // default enabled
      expect(params[6]).toBe('[]'); // empty extractRules
      expect(params[7]).toBeNull(); // no template
    });

    it('uses provided integrationId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [ruleRow], rowCount: 1 });
      await storage.createRule({ name: 'Scoped Rule', integrationId: 'int-1' });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('int-1');
    });
  });

  describe('getRule', () => {
    it('returns rule when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [ruleRow], rowCount: 1 });
      const result = await storage.getRule('rule-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('rule-1');
      expect(result!.priority).toBe(10);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getRule('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listRules', () => {
    it('returns all rules without filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [ruleRow], rowCount: 1 });
      const result = await storage.listRules();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('rule-1');
    });

    it('filters by integrationId (includes global rules)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [ruleRow], rowCount: 1 });
      await storage.listRules({ integrationId: 'int-1' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('integration_id = $1 OR integration_id IS NULL');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('int-1');
    });

    it('filters by enabled', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listRules({ enabled: true });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('enabled =');
    });

    it('filters by both integrationId and enabled', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listRules({ integrationId: 'int-1', enabled: false });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('integration_id');
      expect(sql).toContain('enabled =');
    });

    it('orders by priority ASC', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listRules();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY priority ASC');
    });
  });

  describe('updateRule', () => {
    it('returns existing rule when no fields to update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [ruleRow], rowCount: 1 }); // getRule fallback
      const result = await storage.updateRule('rule-1', {});
      expect(result).not.toBeNull();
      expect(result!.id).toBe('rule-1');
    });

    it('updates name and returns result', async () => {
      const updatedRow = { ...ruleRow, name: 'Updated Rule' };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 });
      const result = await storage.updateRule('rule-1', { name: 'Updated Rule' });
      expect(result!.name).toBe('Updated Rule');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('name =');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.updateRule('nonexistent', { enabled: false });
      expect(result).toBeNull();
    });

    it('updates multiple fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [ruleRow], rowCount: 1 });
      await storage.updateRule('rule-1', {
        name: 'New',
        priority: 5,
        enabled: false,
        matchEvent: 'push',
        extractRules: [],
        template: null,
      });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('name =');
      expect(sql).toContain('priority =');
      expect(sql).toContain('enabled =');
      expect(sql).toContain('match_event =');
      expect(sql).toContain('extract_rules =');
      expect(sql).toContain('template =');
    });

    it('serializes extractRules as JSON', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [ruleRow], rowCount: 1 });
      await storage.updateRule('rule-1', {
        extractRules: [{ field: 'text', path: '$.body' }],
      });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('[{"field":"text","path":"$.body"}]');
    });
  });

  describe('deleteRule', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'rule-1' }], rowCount: 1 });
      const result = await storage.deleteRule('rule-1');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.deleteRule('nonexistent');
      expect(result).toBe(false);
    });
  });
});
