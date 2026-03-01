import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FederationStorage } from './federation-storage.js';

// ─── Mock pool ───────────────────────────────────────────────────────
let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Fixtures ────────────────────────────────────────────────────────

const now = new Date();
const peerRow = {
  id: 'peer-1',
  name: 'Node Alpha',
  url: 'https://alpha.example.com',
  shared_secret_hash: 'abc123hash',
  shared_secret_enc: 'encblob==',
  status: 'online',
  features: { knowledge: true, marketplace: false, personalities: true },
  last_seen: now,
  created_at: now,
  updated_at: now,
};

function ok(rows: any[], rowCount = rows.length) {
  return Promise.resolve({ rows, rowCount });
}

describe('FederationStorage', () => {
  let storage: FederationStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new FederationStorage();
  });

  describe('create', () => {
    it('inserts a peer and returns the record', async () => {
      mockQuery.mockResolvedValueOnce(ok([peerRow]));
      const result = await storage.create({
        id: 'peer-1',
        name: 'Node Alpha',
        url: 'https://alpha.example.com',
        sharedSecretHash: 'abc123hash',
        sharedSecretEnc: 'encblob==',
        status: 'online',
        features: { knowledge: true, marketplace: false, personalities: true },
        lastSeen: now,
      });
      expect(result.id).toBe('peer-1');
      expect(result.name).toBe('Node Alpha');
      expect(result.status).toBe('online');
    });
  });

  describe('findById', () => {
    it('returns peer when found', async () => {
      mockQuery.mockResolvedValueOnce(ok([peerRow]));
      const result = await storage.findById('peer-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('peer-1');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce(ok([]));
      const result = await storage.findById('missing');
      expect(result).toBeNull();
    });
  });

  describe('findBySharedSecretHash', () => {
    it('returns peer when hash matches', async () => {
      mockQuery.mockResolvedValueOnce(ok([peerRow]));
      const result = await storage.findBySharedSecretHash('abc123hash');
      expect(result!.sharedSecretHash).toBe('abc123hash');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce(ok([]));
      expect(await storage.findBySharedSecretHash('nope')).toBeNull();
    });
  });

  describe('list', () => {
    it('returns all peers', async () => {
      const row2 = { ...peerRow, id: 'peer-2', name: 'Node Beta' };
      mockQuery.mockResolvedValueOnce(ok([peerRow, row2]));
      const result = await storage.list();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('peer-1');
      expect(result[1].id).toBe('peer-2');
    });

    it('returns empty array when no peers', async () => {
      mockQuery.mockResolvedValueOnce(ok([]));
      expect(await storage.list()).toEqual([]);
    });
  });

  describe('updateStatus', () => {
    it('executes update with status and lastSeen', async () => {
      await storage.updateStatus('peer-1', 'offline', new Date());
      expect(mockQuery).toHaveBeenCalledOnce();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE federation.peers');
    });

    it('executes update without lastSeen', async () => {
      await storage.updateStatus('peer-1', 'unknown');
      expect(mockQuery).toHaveBeenCalledOnce();
    });
  });

  describe('updateFeatures', () => {
    it('executes JSONB merge update', async () => {
      await storage.updateFeatures('peer-1', { knowledge: false });
      expect(mockQuery).toHaveBeenCalledOnce();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('features = features ||');
    });
  });

  describe('delete', () => {
    it('executes DELETE query', async () => {
      await storage.delete('peer-1');
      expect(mockQuery).toHaveBeenCalledOnce();
      expect(mockQuery.mock.calls[0][0]).toContain('DELETE FROM federation.peers');
    });
  });

  describe('logSync', () => {
    it('inserts a sync log entry', async () => {
      await storage.logSync({
        peerId: 'peer-1',
        type: 'knowledge_search',
        status: 'success',
        metadata: { query: 'test' },
      });
      expect(mockQuery).toHaveBeenCalledOnce();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO federation.sync_log');
    });

    it('logs error status', async () => {
      await storage.logSync({
        peerId: 'peer-1',
        type: 'health_check',
        status: 'error',
        metadata: { reason: 'timeout' },
      });
      const values = mockQuery.mock.calls[0][1] as unknown[];
      expect(values).toContain('error');
    });
  });

  describe('close', () => {
    it('is a no-op', () => {
      expect(() => storage.close()).not.toThrow();
    });
  });
});
