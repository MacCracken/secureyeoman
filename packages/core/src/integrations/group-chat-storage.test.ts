import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroupChatStorage } from './group-chat-storage.js';

// ─── Mock pg-pool ─────────────────────────────────────────────

let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Test Data ────────────────────────────────────────────────

const channelRow = {
  integration_id: 'int-1',
  chat_id: 'ch-1',
  platform: 'slack',
  integration_name: 'My Slack',
  last_message_at: 3000,
  last_message_text: 'Hello world',
  message_count: 5,
  unreplied_count: 2,
  personality_id: null,
};

const messageRow = {
  id: 'msg-1',
  integration_id: 'int-1',
  platform: 'slack',
  direction: 'inbound',
  sender_id: 'user-1',
  sender_name: 'Alice',
  chat_id: 'ch-1',
  text: 'Hello',
  attachments: [],
  reply_to_message_id: null,
  platform_message_id: 'pm-1',
  metadata: {},
  timestamp: 3000,
  personality_id: null,
};

// ─── Tests ────────────────────────────────────────────────────

describe('GroupChatStorage', () => {
  let storage: GroupChatStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new GroupChatStorage();
  });

  describe('listChannels', () => {
    it('returns channels and total with no filters', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [channelRow], rowCount: 1 }) // channel list
        .mockResolvedValueOnce({ rows: [{ total: 1 }], rowCount: 1 }); // count

      const result = await storage.listChannels();

      expect(result.channels).toHaveLength(1);
      expect(result.total).toBe(1);
      const ch = result.channels[0];
      expect(ch.integrationId).toBe('int-1');
      expect(ch.chatId).toBe('ch-1');
      expect(ch.platform).toBe('slack');
      expect(ch.integrationName).toBe('My Slack');
      expect(ch.lastMessageAt).toBe(3000);
      expect(ch.messageCount).toBe(5);
      expect(ch.unrepliedCount).toBe(2);
    });

    it('queries integration.messages (schema-qualified)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: 0 }], rowCount: 1 });

      await storage.listChannels();

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('integration.messages');
      expect(sql).toContain('integration.integrations');
    });

    it('applies platform filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: 0 }], rowCount: 1 });

      await storage.listChannels({ platform: 'slack' });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('m.platform =');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain('slack');
    });

    it('applies integrationId filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: 0 }], rowCount: 1 });

      await storage.listChannels({ integrationId: 'int-1' });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('m.integration_id =');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain('int-1');
    });

    it('applies both platform and integrationId filters', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: 0 }], rowCount: 1 });

      await storage.listChannels({ platform: 'discord', integrationId: 'int-2' });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('m.platform =');
      expect(sql).toContain('m.integration_id =');
    });

    it('uses default limit=50 and offset=0', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: 0 }], rowCount: 1 });

      await storage.listChannels();

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain(50); // default limit
      expect(params).toContain(0);  // default offset
    });

    it('uses custom limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: 0 }], rowCount: 1 });

      await storage.listChannels({ limit: 10, offset: 20 });

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain(10);
      expect(params).toContain(20);
    });

    it('resolves personality name when personality_id is set', async () => {
      const rowWithPersonality = { ...channelRow, personality_id: 'pers-1' };
      mockQuery
        .mockResolvedValueOnce({ rows: [rowWithPersonality], rowCount: 1 }) // channels
        .mockResolvedValueOnce({ rows: [{ total: 1 }], rowCount: 1 })      // count
        .mockResolvedValueOnce({                                             // soul.personalities
          rows: [{ id: 'pers-1', name: 'FRIDAY' }],
          rowCount: 1,
        });

      const result = await storage.listChannels();

      expect(result.channels[0].personalityId).toBe('pers-1');
      expect(result.channels[0].personalityName).toBe('FRIDAY');
      // third query should target soul.personalities
      const personalitySql = mockQuery.mock.calls[2][0] as string;
      expect(personalitySql).toContain('soul.personalities');
    });

    it('returns null personalityName when personality_id is null', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [channelRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ total: 1 }], rowCount: 1 });

      const result = await storage.listChannels();
      expect(result.channels[0].personalityId).toBeNull();
      expect(result.channels[0].personalityName).toBeNull();
    });

    it('returns empty result set when no channels', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: 0 }], rowCount: 1 });

      const result = await storage.listChannels();
      expect(result.channels).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('listMessages', () => {
    it('returns messages and total for a channel', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [messageRow], rowCount: 1 }) // messages
        .mockResolvedValueOnce({ rows: [{ total: 1 }], rowCount: 1 }); // count

      const result = await storage.listMessages('int-1', 'ch-1');

      expect(result.messages).toHaveLength(1);
      expect(result.total).toBe(1);
      const msg = result.messages[0];
      expect(msg.id).toBe('msg-1');
      expect(msg.integrationId).toBe('int-1');
      expect(msg.platform).toBe('slack');
      expect(msg.direction).toBe('inbound');
      expect(msg.senderId).toBe('user-1');
      expect(msg.senderName).toBe('Alice');
      expect(msg.chatId).toBe('ch-1');
      expect(msg.text).toBe('Hello');
      expect(msg.timestamp).toBe(3000);
      expect(msg.platformMessageId).toBe('pm-1');
    });

    it('queries integration.messages (schema-qualified)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: 0 }], rowCount: 1 });

      await storage.listMessages('int-1', 'ch-1');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('integration.messages');
    });

    it('passes integrationId and chatId as query params', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: 0 }], rowCount: 1 });

      await storage.listMessages('int-42', 'ch-99');

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('int-42');
      expect(params[1]).toBe('ch-99');
    });

    it('applies before filter when provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: 0 }], rowCount: 1 });

      await storage.listMessages('int-1', 'ch-1', { before: 5000 });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('timestamp <');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain(5000);
    });

    it('uses default limit=50 and offset=0', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: 0 }], rowCount: 1 });

      await storage.listMessages('int-1', 'ch-1');

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain(50); // default limit
      expect(params).toContain(0);  // default offset
    });

    it('uses custom limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: 0 }], rowCount: 1 });

      await storage.listMessages('int-1', 'ch-1', { limit: 20, offset: 40 });

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain(20);
      expect(params).toContain(40);
    });

    it('resolves personality name when personality_id is set', async () => {
      const rowWithPersonality = { ...messageRow, personality_id: 'pers-2' };
      mockQuery
        .mockResolvedValueOnce({ rows: [rowWithPersonality], rowCount: 1 }) // messages
        .mockResolvedValueOnce({ rows: [{ total: 1 }], rowCount: 1 })       // count
        .mockResolvedValueOnce({                                              // soul.personalities
          rows: [{ id: 'pers-2', name: 'T.Ron' }],
          rowCount: 1,
        });

      const result = await storage.listMessages('int-1', 'ch-1');

      expect(result.messages[0].personalityId).toBe('pers-2');
      expect(result.messages[0].personalityName).toBe('T.Ron');
      const personalitySql = mockQuery.mock.calls[2][0] as string;
      expect(personalitySql).toContain('soul.personalities');
    });

    it('maps optional fields to undefined when null', async () => {
      const rowWithNulls = {
        ...messageRow,
        reply_to_message_id: null,
        platform_message_id: null,
        personality_id: null,
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [rowWithNulls], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ total: 1 }], rowCount: 1 });

      const result = await storage.listMessages('int-1', 'ch-1');
      expect(result.messages[0].replyToMessageId).toBeUndefined();
      expect(result.messages[0].platformMessageId).toBeUndefined();
      expect(result.messages[0].personalityId).toBeNull();
      expect(result.messages[0].personalityName).toBeNull();
    });

    it('returns empty result when no messages', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: 0 }], rowCount: 1 });

      const result = await storage.listMessages('int-1', 'ch-1');
      expect(result.messages).toEqual([]);
      expect(result.total).toBe(0);
    });
  });
});
