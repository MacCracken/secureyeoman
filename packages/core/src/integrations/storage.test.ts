import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntegrationStorage } from './storage.js';

// ─── Mock pg-pool ─────────────────────────────────────────────

let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Test Data ────────────────────────────────────────────────

const integrationRow = {
  id: 'int-1',
  platform: 'slack',
  display_name: 'My Slack',
  enabled: true,
  status: 'connected',
  config: { token: 'xoxb-test' },
  connected_at: 1000,
  last_message_at: 2000,
  message_count: 5,
  error_message: null,
  created_at: 500,
  updated_at: 1500,
};

const messageRow = {
  id: 'msg-1',
  integration_id: 'int-1',
  platform: 'slack',
  direction: 'inbound',
  sender_id: 'user-1',
  sender_name: 'Alice',
  chat_id: 'channel-1',
  text: 'Hello',
  attachments: [],
  reply_to_message_id: null,
  platform_message_id: 'pm-1',
  metadata: {},
  timestamp: 3000,
};

// ─── Tests ────────────────────────────────────────────────────

describe('IntegrationStorage', () => {
  let storage: IntegrationStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new IntegrationStorage();
  });

  describe('createIntegration', () => {
    it('inserts and returns the created integration', async () => {
      // INSERT then SELECT
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [integrationRow], rowCount: 1 }); // SELECT (getIntegration)

      const result = await storage.createIntegration({
        platform: 'slack',
        displayName: 'My Slack',
        enabled: true,
        config: { token: 'xoxb-test' },
      });

      expect(result.id).toBe('int-1');
      expect(result.platform).toBe('slack');
      expect(result.displayName).toBe('My Slack');
      expect(result.status).toBe('connected');
    });

    it('uses default enabled=false when not provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ ...integrationRow, enabled: false }], rowCount: 1 });

      await storage.createIntegration({ platform: 'slack', displayName: 'Slack', config: {} });
      const insertCall = mockQuery.mock.calls[0][1];
      expect(insertCall[3]).toBe(false); // enabled defaults to false
    });
  });

  describe('getIntegration', () => {
    it('returns the integration when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [integrationRow], rowCount: 1 });
      const result = await storage.getIntegration('int-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('int-1');
      expect(result!.connectedAt).toBe(1000);
      expect(result!.lastMessageAt).toBe(2000);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getIntegration('nonexistent');
      expect(result).toBeNull();
    });

    it('maps optional fields to undefined when null', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            ...integrationRow,
            connected_at: null,
            last_message_at: null,
            error_message: null,
          },
        ],
        rowCount: 1,
      });
      const result = await storage.getIntegration('int-1');
      expect(result!.connectedAt).toBeUndefined();
      expect(result!.lastMessageAt).toBeUndefined();
      expect(result!.errorMessage).toBeUndefined();
    });
  });

  describe('listIntegrations', () => {
    it('returns all integrations without filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [integrationRow], rowCount: 1 });
      const result = await storage.listIntegrations();
      expect(result).toHaveLength(1);
      expect(result[0].platform).toBe('slack');
    });

    it('filters by platform', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [integrationRow], rowCount: 1 });
      const result = await storage.listIntegrations({ platform: 'slack' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('platform =');
    });

    it('filters by enabled', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listIntegrations({ enabled: false });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('enabled =');
    });

    it('filters by both platform and enabled', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [integrationRow], rowCount: 1 });
      await storage.listIntegrations({ platform: 'slack', enabled: true });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('platform =');
      expect(sql).toContain('enabled =');
    });

    it('returns empty array when no results', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.listIntegrations();
      expect(result).toEqual([]);
    });
  });

  describe('updateIntegration', () => {
    it('returns null when integration not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // getIntegration returns null
      const result = await storage.updateIntegration('nonexistent', { displayName: 'New Name' });
      expect(result).toBeNull();
    });

    it('updates displayName only', async () => {
      // getIntegration, UPDATE, getIntegration again
      mockQuery
        .mockResolvedValueOnce({ rows: [integrationRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ ...integrationRow, display_name: 'New Name' }],
          rowCount: 1,
        });
      const result = await storage.updateIntegration('int-1', { displayName: 'New Name' });
      expect(result!.displayName).toBe('New Name');
    });

    it('updates all fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [integrationRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [integrationRow], rowCount: 1 });
      await storage.updateIntegration('int-1', {
        platform: 'discord',
        displayName: 'Discord',
        enabled: false,
        config: { token: 'new-token' },
      });
      const updateSql = mockQuery.mock.calls[1][0] as string;
      expect(updateSql).toContain('platform =');
      expect(updateSql).toContain('display_name =');
      expect(updateSql).toContain('enabled =');
      expect(updateSql).toContain('config =');
    });
  });

  describe('deleteIntegration', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.deleteIntegration('int-1');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.deleteIntegration('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('updateStatus', () => {
    it('updates status to connected (sets connected_at)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.updateStatus('int-1', 'connected');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('connected_at');
      expect(sql).toContain('error_message = NULL');
    });

    it('updates status to disconnected (no connected_at)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.updateStatus('int-1', 'disconnected');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).not.toContain('connected_at');
    });

    it('includes errorMessage when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.updateStatus('int-1', 'error', 'Connection failed');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain('Connection failed');
    });
  });

  describe('incrementMessageCount', () => {
    it('increments the message count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.incrementMessageCount('int-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('message_count = message_count + 1');
    });
  });

  describe('storeMessage', () => {
    const msg = {
      integrationId: 'int-1',
      platform: 'slack' as const,
      direction: 'inbound' as const,
      senderId: 'user-1',
      senderName: 'Alice',
      chatId: 'ch-1',
      text: 'Hello',
      attachments: [],
      metadata: {},
      timestamp: 3000,
    };

    it('stores message and returns it with id', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT message
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // incrementMessageCount

      const result = await storage.storeMessage(msg);
      expect(result.id).toBeDefined();
      expect(result.text).toBe('Hello');
      expect(result.integrationId).toBe('int-1');
    });

    it('includes optional fields as null when not provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await storage.storeMessage(msg);
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[9]).toBeNull(); // replyToMessageId
      expect(params[10]).toBeNull(); // platformMessageId
    });

    it('stores optional fields when provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await storage.storeMessage({
        ...msg,
        replyToMessageId: 'reply-1',
        platformMessageId: 'pm-1',
      });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[9]).toBe('reply-1');
      expect(params[10]).toBe('pm-1');
    });
  });

  describe('listMessages', () => {
    it('returns messages for an integration', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [messageRow], rowCount: 1 });
      const result = await storage.listMessages('int-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('msg-1');
      expect(result[0].platform).toBe('slack');
      expect(result[0].platformMessageId).toBe('pm-1');
    });

    it('uses default limit and offset', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listMessages('int-1');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe(50); // default limit
      expect(params[2]).toBe(0); // default offset
    });

    it('uses custom limit and offset', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listMessages('int-1', { limit: 10, offset: 20 });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe(10);
      expect(params[2]).toBe(20);
    });

    it('maps optional message fields', async () => {
      const rowWithNulls = { ...messageRow, reply_to_message_id: null, platform_message_id: null };
      mockQuery.mockResolvedValueOnce({ rows: [rowWithNulls], rowCount: 1 });
      const result = await storage.listMessages('int-1');
      expect(result[0].replyToMessageId).toBeUndefined();
      expect(result[0].platformMessageId).toBeUndefined();
    });
  });
});
