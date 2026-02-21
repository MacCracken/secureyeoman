import { describe, it, expect, vi, beforeEach } from 'vitest';
import { A2AStorage } from './storage.js';

// ─── Mock pool ──────────────────────────────────────────────────────
let mockQuery: ReturnType<typeof vi.fn>;
let mockClient: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({
    query: (...args: any[]) => mockQuery(...args),
    connect: () => Promise.resolve(mockClient),
  }),
}));

// ─── Row fixtures ───────────────────────────────────────────────────

const peerRow = {
  id: 'peer-1',
  name: 'Agent Smith',
  url: 'https://agent.example.com',
  public_key: 'pk-abc',
  trust_level: 'trusted',
  last_seen: '2024-01-01T00:00:00Z',
  status: 'online',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const capabilityRow = {
  id: 'cap-1',
  peer_id: 'peer-1',
  name: 'web_search',
  description: 'Search the web',
  version: '1.0',
};

const messageRow = {
  id: 'msg-1',
  type: 'delegate',
  from_peer_id: 'peer-1',
  to_peer_id: 'peer-2',
  payload: { task: 'do something' },
  timestamp: '2024-01-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
};

describe('A2AStorage', () => {
  let storage: A2AStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: vi.fn(),
    };
    storage = new A2AStorage();
  });

  describe('addPeer', () => {
    it('inserts peer and returns with capabilities', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [peerRow], rowCount: 1 }) // upsert
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // getCapabilities
      const result = await storage.addPeer({
        name: 'Agent Smith',
        url: 'https://agent.example.com',
        publicKey: 'pk-abc',
      });
      expect(result.id).toBe('peer-1');
      expect(result.capabilities).toHaveLength(0);
    });

    it('uses provided id when given', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [peerRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [capabilityRow], rowCount: 1 });
      const result = await storage.addPeer({
        id: 'peer-1',
        name: 'Agent Smith',
        url: 'https://agent.example.com',
        publicKey: 'pk-abc',
        trustLevel: 'trusted',
        status: 'online',
      });
      expect(result.capabilities).toHaveLength(1);
    });
  });

  describe('getPeer', () => {
    it('returns peer when found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [peerRow], rowCount: 1 }) // peer query
        .mockResolvedValueOnce({ rows: [capabilityRow], rowCount: 1 }); // capabilities
      const result = await storage.getPeer('peer-1');
      expect(result!.id).toBe('peer-1');
      expect(result!.trustLevel).toBe('trusted');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getPeer('no-such');
      expect(result).toBeNull();
    });
  });

  describe('listPeers', () => {
    it('returns peers without filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 }) // count
        .mockResolvedValueOnce({ rows: [peerRow], rowCount: 1 }) // rows
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // capabilities for peer-1
      const result = await storage.listPeers();
      expect(result.total).toBe(1);
      expect(result.peers).toHaveLength(1);
    });

    it('filters by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listPeers({ status: 'online' });
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('filters by trustLevel', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listPeers({ trustLevel: 'trusted', limit: 10, offset: 0 });
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('updatePeer', () => {
    it('returns null when peer not found', async () => {
      // getPeer calls: peer query + caps (but peer not found so only 1 call)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.updatePeer('no-such', { status: 'offline' });
      expect(result).toBeNull();
    });

    it('returns existing when no updates', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [peerRow], rowCount: 1 }) // getPeer - peer row
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // getPeer - capabilities
      const result = await storage.updatePeer('peer-1', {});
      expect(result!.id).toBe('peer-1');
      expect(mockQuery).toHaveBeenCalledTimes(2); // only getPeer
    });

    it('updates status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [peerRow], rowCount: 1 }) // getPeer - peer row
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // getPeer - capabilities
        .mockResolvedValueOnce({ rows: [{ ...peerRow, status: 'offline' }], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // getCapabilities after update
      const result = await storage.updatePeer('peer-1', { status: 'offline' });
      expect(result!.status).toBe('offline');
    });

    it('updates all fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [peerRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [peerRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.updatePeer('peer-1', {
        name: 'New Name',
        url: 'https://new.com',
        publicKey: 'new-pk',
        trustLevel: 'untrusted',
        status: 'offline',
        lastSeen: Date.now(),
      });
      expect(mockQuery).toHaveBeenCalledTimes(4);
    });
  });

  describe('removePeer', () => {
    it('returns true when deleted', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // DELETE capabilities
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // DELETE peer
      const result = await storage.removePeer('peer-1');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // DELETE capabilities
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // DELETE peer
      const result = await storage.removePeer('no-such');
      expect(result).toBe(false);
    });
  });

  describe('setCapabilities', () => {
    it('deletes and inserts capabilities via transaction', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
      await storage.setCapabilities('peer-1', [
        { name: 'search', description: 'Web search', version: '1.0' },
        { name: 'code', description: 'Code execution', version: '2.0' },
      ]);
      // BEGIN + DELETE + 2 inserts + COMMIT = 5 queries
      expect(mockClient.query).toHaveBeenCalledTimes(5);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('handles empty capabilities (only delete)', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
      await storage.setCapabilities('peer-1', []);
      // BEGIN + DELETE + COMMIT = 3 queries
      expect(mockClient.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('getCapabilities', () => {
    it('returns capabilities for peer', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [capabilityRow], rowCount: 1 });
      const result = await storage.getCapabilities('peer-1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('web_search');
      expect(result[0].version).toBe('1.0');
    });

    it('returns empty array when peer has no capabilities', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getCapabilities('peer-1');
      expect(result).toHaveLength(0);
    });
  });

  describe('searchCapabilities', () => {
    it('returns matching capabilities with peer id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [capabilityRow], rowCount: 1 });
      const result = await storage.searchCapabilities('search');
      expect(result).toHaveLength(1);
      expect(result[0].peerId).toBe('peer-1');
      expect(result[0].capability.name).toBe('web_search');
    });

    it('returns empty when no match', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.searchCapabilities('nonexistent');
      expect(result).toHaveLength(0);
    });
  });

  describe('logMessage', () => {
    it('inserts message', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.logMessage({
        id: 'msg-1',
        type: 'delegate' as any,
        fromPeerId: 'peer-1',
        toPeerId: 'peer-2',
        payload: { task: 'do something' },
        timestamp: Date.now(),
      });
      expect(mockQuery).toHaveBeenCalledOnce();
    });
  });

  describe('listMessages', () => {
    it('returns all messages without filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [messageRow], rowCount: 1 });
      const result = await storage.listMessages();
      expect(result.total).toBe(1);
      expect(result.messages).toHaveLength(1);
    });

    it('filters by peerId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [messageRow], rowCount: 1 });
      await storage.listMessages({ peerId: 'peer-1' });
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('filters by type and peerId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listMessages({ peerId: 'peer-1', type: 'delegate', limit: 5, offset: 0 });
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });
});
