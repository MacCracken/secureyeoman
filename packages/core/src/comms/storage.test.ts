import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommsStorage } from './storage.js';

// ─── Mock pg-pool ─────────────────────────────────────────────

let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Test Data ────────────────────────────────────────────────

const peerRow = {
  id: 'peer-1',
  name: 'Agent Alpha',
  public_key: 'pk-abc',
  signing_key: 'sk-abc',
  endpoint: 'http://agent-alpha:4000',
  capabilities: ['chat', 'code'],
  last_seen_at: 5000,
};

const msgRow = {
  id: 'msg-1',
  direction: 'sent',
  peer_agent_id: 'peer-1',
  message_type: 'ping',
  encrypted_payload: 'base64data==',
  timestamp: 1000,
};

// ─── Tests ────────────────────────────────────────────────────

describe('CommsStorage', () => {
  let storage: CommsStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new CommsStorage();
  });

  describe('addPeer', () => {
    it('upserts a peer record', async () => {
      await storage.addPeer({
        id: 'peer-1',
        name: 'Agent Alpha',
        publicKey: 'pk-abc',
        signingKey: 'sk-abc',
        endpoint: 'http://agent-alpha:4000',
        capabilities: ['chat'],
        lastSeenAt: 5000,
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO comms.peers');
      expect(sql).toContain('ON CONFLICT');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('peer-1');
      expect(params[1]).toBe('Agent Alpha');
    });
  });

  describe('getPeer', () => {
    it('returns peer when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [peerRow], rowCount: 1 });
      const result = await storage.getPeer('peer-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('peer-1');
      expect(result!.publicKey).toBe('pk-abc');
      expect(result!.capabilities).toEqual(['chat', 'code']);
      expect(result!.lastSeenAt).toBe(5000);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getPeer('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listPeers', () => {
    it('returns all peers ordered by last_seen_at', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [peerRow], rowCount: 1 });
      const result = await storage.listPeers();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('peer-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('last_seen_at DESC');
    });

    it('returns empty array when no peers', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.listPeers();
      expect(result).toEqual([]);
    });
  });

  describe('removePeer', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.removePeer('peer-1');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.removePeer('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('updatePeerLastSeen', () => {
    it('executes UPDATE for last_seen_at', async () => {
      await storage.updatePeerLastSeen('peer-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('last_seen_at');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('peer-1');
    });
  });

  describe('getPeerCount', () => {
    it('returns peer count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '7' }], rowCount: 1 });
      const result = await storage.getPeerCount();
      expect(result).toBe(7);
    });

    it('returns 0 when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getPeerCount();
      expect(result).toBe(0);
    });
  });

  describe('logMessage', () => {
    it('inserts message and returns generated id', async () => {
      const id = await storage.logMessage('sent', 'peer-1', 'ping', 'encrypted-data');
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO comms.message_log');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('sent');
      expect(params[2]).toBe('peer-1');
      expect(params[3]).toBe('ping');
      expect(params[4]).toBe('encrypted-data');
    });
  });

  describe('queryMessageLog', () => {
    it('returns all messages without filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [msgRow], rowCount: 1 });
      const result = await storage.queryMessageLog();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('msg-1');
    });

    it('filters by peerId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryMessageLog({ peerId: 'peer-1' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('peer_agent_id');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain('peer-1');
    });

    it('filters by type', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryMessageLog({ type: 'ping' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('message_type');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain('ping');
    });

    it('applies limit', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryMessageLog({ limit: 10 });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('LIMIT');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain(10);
    });

    it('filters by peerId and type combined', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [msgRow], rowCount: 1 });
      const result = await storage.queryMessageLog({ peerId: 'peer-1', type: 'ping', limit: 5 });
      expect(result).toHaveLength(1);
    });
  });

  describe('pruneOldMessages', () => {
    it('deletes messages older than retention period', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 3 });
      const deleted = await storage.pruneOldMessages(7);
      expect(deleted).toBe(3);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE FROM comms.message_log');
      expect(sql).toContain('timestamp <');
    });
  });

  describe('getMessageCount', () => {
    it('returns message count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '42' }], rowCount: 1 });
      const result = await storage.getMessageCount();
      expect(result).toBe(42);
    });

    it('returns 0 when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getMessageCount();
      expect(result).toBe(0);
    });
  });
});
