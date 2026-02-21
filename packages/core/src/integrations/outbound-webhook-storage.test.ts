import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutboundWebhookStorage } from './outbound-webhook-storage.js';

// ─── Mock pg-pool ─────────────────────────────────────────────
// OutboundWebhookStorage uses this.getPool().query() directly,
// so the mock must return the full { rows, rowCount } shape.

let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Test Data ────────────────────────────────────────────────

const webhookRow = {
  id: 'wh-1',
  name: 'My Webhook',
  url: 'https://example.com/hook',
  secret: null,
  events: ['message.inbound', 'message.outbound'],
  enabled: true,
  last_fired_at: null,
  last_status_code: null,
  consecutive_failures: '0',
  created_at: '1000',
  updated_at: '2000',
};

// ─── Tests ────────────────────────────────────────────────────

describe('OutboundWebhookStorage', () => {
  let storage: OutboundWebhookStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new OutboundWebhookStorage();
  });

  describe('createWebhook', () => {
    it('inserts and returns webhook from RETURNING row', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [webhookRow], rowCount: 1 });

      const result = await storage.createWebhook({
        name: 'My Webhook',
        url: 'https://example.com/hook',
      });

      expect(result.id).toBe('wh-1');
      expect(result.name).toBe('My Webhook');
      expect(result.url).toBe('https://example.com/hook');
      expect(result.enabled).toBe(true);
      expect(result.consecutiveFailures).toBe(0);
      expect(result.lastFiredAt).toBeNull();
      expect(result.lastStatusCode).toBeNull();
      expect(result.createdAt).toBe(1000);
    });

    it('passes defaults for optional fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [webhookRow], rowCount: 1 });
      await storage.createWebhook({ name: 'Test', url: 'https://test.com' });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[3]).toBeNull();       // secret
      expect(params[4]).toBe('[]');       // events serialized
      expect(params[5]).toBe(true);       // enabled default
    });

    it('uses provided events and secret', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [webhookRow], rowCount: 1 });
      await storage.createWebhook({
        name: 'Test',
        url: 'https://test.com',
        secret: 'my-secret',
        events: ['message.inbound'],
        enabled: false,
      });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[3]).toBe('my-secret');
      expect(params[4]).toBe('["message.inbound"]');
      expect(params[5]).toBe(false);
    });
  });

  describe('getWebhook', () => {
    it('returns webhook when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [webhookRow], rowCount: 1 });
      const result = await storage.getWebhook('wh-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('wh-1');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getWebhook('nonexistent');
      expect(result).toBeNull();
    });

    it('maps numeric string fields', async () => {
      const row = {
        ...webhookRow,
        last_fired_at: '5000',
        last_status_code: '200',
        consecutive_failures: '3',
      };
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });
      const result = await storage.getWebhook('wh-1');
      expect(result!.lastFiredAt).toBe(5000);
      expect(result!.lastStatusCode).toBe(200);
      expect(result!.consecutiveFailures).toBe(3);
    });
  });

  describe('listWebhooks', () => {
    it('returns all webhooks without filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [webhookRow], rowCount: 1 });
      const result = await storage.listWebhooks();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('My Webhook');
    });

    it('filters by enabled=true', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [webhookRow], rowCount: 1 });
      await storage.listWebhooks({ enabled: true });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('enabled =');
    });

    it('filters by enabled=false', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listWebhooks({ enabled: false });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain(false);
    });

    it('returns empty array when none', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.listWebhooks();
      expect(result).toEqual([]);
    });
  });

  describe('listForEvent', () => {
    it('returns enabled webhooks for a given event', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [webhookRow], rowCount: 1 });
      const result = await storage.listForEvent('message.inbound');
      expect(result).toHaveLength(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('enabled = true');
      expect(sql).toContain('events @>');
    });

    it('returns empty array when no matching webhooks', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.listForEvent('integration.error');
      expect(result).toEqual([]);
    });
  });

  describe('updateWebhook', () => {
    it('returns existing webhook when no fields to update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [webhookRow], rowCount: 1 }); // getWebhook fallback
      const result = await storage.updateWebhook('wh-1', {});
      expect(result).not.toBeNull();
      expect(result!.id).toBe('wh-1');
    });

    it('updates name and returns result', async () => {
      const updatedRow = { ...webhookRow, name: 'Updated' };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 });
      const result = await storage.updateWebhook('wh-1', { name: 'Updated' });
      expect(result!.name).toBe('Updated');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('name =');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.updateWebhook('nonexistent', { enabled: false });
      expect(result).toBeNull();
    });

    it('serializes events as JSON', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [webhookRow], rowCount: 1 });
      await storage.updateWebhook('wh-1', { events: ['message.inbound'] });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('events =');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain(JSON.stringify(['message.inbound']));
    });
  });

  describe('deleteWebhook', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'wh-1' }], rowCount: 1 });
      const result = await storage.deleteWebhook('wh-1');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.deleteWebhook('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('recordSuccess', () => {
    it('updates last_fired_at, status_code, and resets failures', async () => {
      await storage.recordSuccess('wh-1', 200);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('last_fired_at');
      expect(sql).toContain('last_status_code');
      expect(sql).toContain('consecutive_failures = 0');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe(200);
      expect(params[2]).toBe('wh-1');
    });
  });

  describe('recordFailure', () => {
    it('increments consecutive_failures', async () => {
      await storage.recordFailure('wh-1', 500);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('consecutive_failures = consecutive_failures + 1');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe(500);
      expect(params[2]).toBe('wh-1');
    });

    it('accepts null status code', async () => {
      await storage.recordFailure('wh-1', null);
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBeNull();
    });
  });
});
