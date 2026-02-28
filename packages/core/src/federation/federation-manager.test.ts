/**
 * FederationManager tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FederationManager } from './federation-manager.js';
import type { FederationPeer } from './federation-storage.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock FederationStorage
const mockStorage = {
  create: vi.fn(),
  findById: vi.fn(),
  findBySharedSecretHash: vi.fn(),
  list: vi.fn(),
  updateStatus: vi.fn(),
  updateFeatures: vi.fn(),
  delete: vi.fn(),
  logSync: vi.fn(),
  close: vi.fn(),
};

// Mock federation-crypto — must use the actual module path
vi.mock('./federation-crypto.js', () => ({
  encryptSecret: vi.fn((plain: string, _master: string) => `enc:${plain}`),
  decryptSecret: vi.fn((enc: string, _master: string) => enc.replace('enc:', '')),
  hashSecret: vi.fn((raw: string) => `hash:${raw}`),
  encryptBundle: vi.fn((data: unknown) => JSON.stringify(data)),
  decryptBundle: vi.fn((ciphertext: string) => JSON.parse(ciphertext)),
}));

// Mock uuidv7
vi.mock('../utils/crypto.js', () => ({
  uuidv7: vi.fn(() => 'test-uuid-123'),
  sha256: vi.fn((s: string) => `sha256:${s}`),
  generateSecureToken: vi.fn((n: number) => 'x'.repeat(n)),
  secureCompare: vi.fn(),
}));

function makePeer(overrides?: Partial<FederationPeer>): FederationPeer {
  return {
    id: 'peer-1',
    name: 'Test Peer',
    url: 'https://remote.example.com',
    sharedSecretHash: 'hash:mysecret',
    sharedSecretEnc: 'enc:mysecret',
    status: 'unknown',
    features: { knowledge: true, marketplace: true, personalities: false },
    lastSeen: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeManager() {
  return new FederationManager({
    storage: mockStorage as any,
    masterSecret: 'test-master-secret',
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(),
      })),
    } as any,
  });
}

describe('FederationManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockStorage.create.mockReset();
    mockStorage.findById.mockReset();
    mockStorage.findBySharedSecretHash.mockReset();
    mockStorage.list.mockReset();
    mockStorage.updateStatus.mockReset();
    mockStorage.updateFeatures.mockReset();
    mockStorage.delete.mockReset();
    mockStorage.logSync.mockReset();

    // Default: logSync succeeds
    mockStorage.logSync.mockResolvedValue(undefined);
    mockStorage.updateStatus.mockResolvedValue(undefined);
  });

  describe('addPeer', () => {
    it('should add a peer with encrypted + hashed secret', async () => {
      const peer = makePeer();
      mockStorage.create.mockResolvedValueOnce(peer);
      // The fire-and-forget checkHealth call — needs findById to return peer
      mockStorage.findById.mockResolvedValue(peer);
      mockFetch.mockResolvedValue({ ok: true });

      const manager = makeManager();
      const result = await manager.addPeer('https://remote.example.com', 'Test Peer', 'mysecret');

      expect(mockStorage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Peer',
          url: 'https://remote.example.com',
          sharedSecretHash: 'hash:mysecret',
          sharedSecretEnc: 'enc:mysecret',
          status: 'unknown',
        })
      );
      expect(result).toBe(peer);
    });

    it('should reject private/loopback URL 192.168.x.x (SSRF guard)', async () => {
      const manager = makeManager();
      await expect(manager.addPeer('https://192.168.1.1', 'Bad Peer', 'sec')).rejects.toThrow(
        /private\/loopback/
      );
    });

    it('should reject localhost (SSRF guard)', async () => {
      const manager = makeManager();
      await expect(manager.addPeer('https://localhost', 'Bad Peer', 'sec')).rejects.toThrow(
        /private\/loopback/
      );
    });

    it('should reject 10.x.x.x (SSRF guard)', async () => {
      const manager = makeManager();
      await expect(manager.addPeer('https://10.0.0.1', 'Bad Peer', 'sec')).rejects.toThrow(
        /private\/loopback/
      );
    });

    it('should reject 127.0.0.1 (SSRF guard)', async () => {
      const manager = makeManager();
      await expect(manager.addPeer('https://127.0.0.1', 'Bad Peer', 'sec')).rejects.toThrow(
        /private\/loopback/
      );
    });

    it('should reject invalid URL', async () => {
      const manager = makeManager();
      await expect(manager.addPeer('not-a-url', 'Peer', 'sec')).rejects.toThrow(/Invalid URL/);
    });
  });

  describe('removePeer', () => {
    it('should delete the peer from storage', async () => {
      mockStorage.delete.mockResolvedValueOnce(undefined);
      const manager = makeManager();
      await manager.removePeer('peer-1');
      expect(mockStorage.delete).toHaveBeenCalledWith('peer-1');
    });
  });

  describe('listPeers', () => {
    it('should return peers with sharedSecretEnc stripped', async () => {
      const peer = makePeer({ sharedSecretEnc: 'super-secret-enc' });
      mockStorage.list.mockResolvedValueOnce([peer]);

      const manager = makeManager();
      const peers = await manager.listPeers();

      expect(peers).toHaveLength(1);
      expect((peers[0] as any).sharedSecretEnc).toBeUndefined();
      expect(peers[0].name).toBe('Test Peer');
    });

    it('should return empty array when no peers', async () => {
      mockStorage.list.mockResolvedValueOnce([]);
      const manager = makeManager();
      const peers = await manager.listPeers();
      expect(peers).toHaveLength(0);
    });
  });

  describe('checkHealth', () => {
    it('should return online when peer responds 200', async () => {
      const peer = makePeer();
      mockStorage.findById.mockResolvedValueOnce(peer);
      mockFetch.mockResolvedValueOnce({ ok: true });

      const manager = makeManager();
      const status = await manager.checkHealth('peer-1');

      expect(status).toBe('online');
      expect(mockStorage.updateStatus).toHaveBeenCalledWith('peer-1', 'online', expect.any(Date));
    });

    it('should return offline when peer responds non-2xx', async () => {
      const peer = makePeer();
      mockStorage.findById.mockResolvedValueOnce(peer);
      mockFetch.mockResolvedValueOnce({ ok: false });

      const manager = makeManager();
      const status = await manager.checkHealth('peer-1');

      expect(status).toBe('offline');
      expect(mockStorage.updateStatus).toHaveBeenCalledWith('peer-1', 'offline', undefined);
    });

    it('should return offline when fetch throws (network error)', async () => {
      const peer = makePeer();
      mockStorage.findById.mockResolvedValueOnce(peer);
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const manager = makeManager();
      const status = await manager.checkHealth('peer-1');

      expect(status).toBe('offline');
      expect(mockStorage.updateStatus).toHaveBeenCalledWith('peer-1', 'offline', undefined);
    });

    it('should throw for unknown peer', async () => {
      mockStorage.findById.mockResolvedValueOnce(null);
      const manager = makeManager();
      await expect(manager.checkHealth('unknown')).rejects.toThrow(/Unknown peer/);
    });

    it('should log a sync entry after health check', async () => {
      const peer = makePeer();
      mockStorage.findById.mockResolvedValueOnce(peer);
      mockFetch.mockResolvedValueOnce({ ok: true });

      const manager = makeManager();
      await manager.checkHealth('peer-1');

      expect(mockStorage.logSync).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'health_check', status: 'success' })
      );
    });
  });

  describe('searchKnowledge', () => {
    it('should fetch from peer /api/v1/federation/knowledge/search', async () => {
      const peer = makePeer();
      mockStorage.findById.mockResolvedValueOnce(peer);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ entries: [{ id: 'k1', content: 'hello' }] }),
      });

      const manager = makeManager();
      const results = await manager.searchKnowledge('peer-1', 'hello', { limit: 5 });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ id: 'k1' });
      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('/api/v1/federation/knowledge/search');
      expect(callUrl).toContain('q=hello');
    });

    it('should return empty array when entries key is missing', async () => {
      const peer = makePeer();
      mockStorage.findById.mockResolvedValueOnce(peer);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const manager = makeManager();
      const results = await manager.searchKnowledge('peer-1', 'query');
      expect(results).toEqual([]);
    });

    it('should throw and log error when peer request fails', async () => {
      const peer = makePeer();
      mockStorage.findById.mockResolvedValueOnce(peer);
      mockFetch.mockRejectedValueOnce(new Error('network error'));

      const manager = makeManager();
      await expect(manager.searchKnowledge('peer-1', 'q')).rejects.toThrow();
      expect(mockStorage.logSync).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error', type: 'knowledge_search' })
      );
    });
  });

  describe('validateIncomingSecret', () => {
    it('should find peer by hashed secret', async () => {
      const peer = makePeer();
      mockStorage.findBySharedSecretHash.mockResolvedValueOnce(peer);

      const manager = makeManager();
      const result = await manager.validateIncomingSecret('mysecret');

      expect(result).toBe(peer);
      expect(mockStorage.findBySharedSecretHash).toHaveBeenCalledWith('hash:mysecret');
    });

    it('should return null for unknown secret', async () => {
      mockStorage.findBySharedSecretHash.mockResolvedValueOnce(null);

      const manager = makeManager();
      const result = await manager.validateIncomingSecret('wrong');

      expect(result).toBeNull();
    });
  });

  describe('runHealthCycle', () => {
    it('should check health for all peers', async () => {
      const peers = [
        makePeer({ id: 'p1' }),
        makePeer({ id: 'p2', url: 'https://peer2.example.com' }),
      ];
      mockStorage.list.mockResolvedValueOnce(peers);
      // For each checkHealth call
      mockStorage.findById
        .mockResolvedValueOnce(peers[0])
        .mockResolvedValueOnce(peers[1]);
      mockFetch.mockResolvedValue({ ok: true });

      const manager = makeManager();
      await manager.runHealthCycle();

      expect(mockStorage.updateStatus).toHaveBeenCalledTimes(2);
    });

    it('should not throw when individual health checks fail', async () => {
      const peers = [makePeer({ id: 'p1' })];
      mockStorage.list.mockResolvedValueOnce(peers);
      mockStorage.findById.mockResolvedValueOnce(null); // unknown peer

      const manager = makeManager();
      // Should not throw — allSettled handles individual failures
      await expect(manager.runHealthCycle()).resolves.toBeUndefined();
    });
  });

  describe('health cycle start/stop', () => {
    it('should start and stop the health cycle without error', () => {
      const manager = makeManager();
      manager.startHealthCycle(100_000);
      manager.stopHealthCycle();
    });

    it('should not double-start the health cycle', () => {
      const manager = makeManager();
      manager.startHealthCycle(100_000);
      manager.startHealthCycle(100_000); // second call is no-op
      manager.stopHealthCycle();
    });

    it('stopHealthCycle is safe to call when not started', () => {
      const manager = makeManager();
      manager.stopHealthCycle(); // should not throw
    });
  });

  describe('listPeerMarketplace', () => {
    it('should fetch and return skills array from peer marketplace', async () => {
      const peer = makePeer();
      mockStorage.findById.mockResolvedValueOnce(peer);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ skills: [{ id: 's1', name: 'Test Skill' }] }),
      });

      const manager = makeManager();
      const skills = await manager.listPeerMarketplace('peer-1');

      expect(skills).toHaveLength(1);
      expect((skills[0] as any).name).toBe('Test Skill');
    });

    it('should return empty array when skills key is missing', async () => {
      const peer = makePeer();
      mockStorage.findById.mockResolvedValueOnce(peer);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const manager = makeManager();
      const skills = await manager.listPeerMarketplace('peer-1');
      expect(skills).toEqual([]);
    });
  });
});
