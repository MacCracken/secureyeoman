import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { A2AManager } from './manager.js';
import type { A2AConfig } from '@secureyeoman/shared';

// ─── Module mocks ──────────────────────────────────────────────────

vi.mock('./discovery.js', () => ({
  manualDiscover: vi.fn().mockResolvedValue([]),
  mdnsDiscover: vi.fn().mockResolvedValue([]),
}));

vi.mock('../utils/ssrf-guard.js', () => ({
  assertPublicUrl: vi.fn(), // no-op by default
}));

import { manualDiscover, mdnsDiscover } from './discovery.js';
import { assertPublicUrl } from '../utils/ssrf-guard.js';

// ─── Helpers ────────────────────────────────────────────────────────

const peerAgent = {
  id: 'peer-1',
  name: 'Agent Smith',
  url: 'https://agent.example.com',
  publicKey: 'pk-abc',
  trustLevel: 'trusted' as const,
  capabilities: [],
  lastSeen: Date.now(),
  status: 'online' as const,
};

function makeStorage(overrides: any = {}) {
  return {
    listPeers: vi.fn().mockResolvedValue({ peers: [], total: 0 }),
    addPeer: vi.fn().mockResolvedValue(peerAgent),
    getPeer: vi.fn().mockResolvedValue(peerAgent),
    removePeer: vi.fn().mockResolvedValue(true),
    updatePeer: vi.fn().mockResolvedValue(peerAgent),
    setCapabilities: vi.fn().mockResolvedValue(undefined),
    getCapabilities: vi.fn().mockResolvedValue([]),
    logMessage: vi.fn().mockResolvedValue(undefined),
    listMessages: vi.fn().mockResolvedValue({ messages: [], total: 0 }),
    ...overrides,
  };
}

function makeTransport(overrides: any = {}) {
  return {
    send: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeLogger() {
  return {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

function makeAuditChain() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

const defaultConfig: A2AConfig = {
  enabled: true,
  discoveryMethod: 'none' as any,
  trustedPeers: [],
  heartbeatIntervalMs: 60000,
  maxPeers: 50,
  trustThreshold: 'verified' as any,
};

function makeManager(configOverrides: any = {}, storageOverrides: any = {}) {
  const storage = makeStorage(storageOverrides);
  const transport = makeTransport();
  const logger = makeLogger();
  const auditChain = makeAuditChain();
  const config = { ...defaultConfig, ...configOverrides };
  const manager = new A2AManager(config, { storage: storage as any, transport: transport as any, logger: logger as any, auditChain: auditChain as any });
  return { manager, storage, transport, logger, auditChain };
}

describe('A2AManager', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialize', () => {
    it('loads peers from storage and starts heartbeat', async () => {
      vi.useFakeTimers();
      const { manager, storage } = makeManager(
        {},
        { listPeers: vi.fn().mockResolvedValue({ peers: [peerAgent], total: 1 }) }
      );
      await manager.initialize();
      expect(storage.listPeers).toHaveBeenCalled();
      await manager.cleanup();
    });

    it('initiates mdns discovery when discoveryMethod is mdns', async () => {
      vi.useFakeTimers();
      const { manager } = makeManager({ discoveryMethod: 'mdns' });
      await manager.initialize();
      // Flush pending microtasks (the void mdnsDiscover() call)
      await Promise.resolve();
      expect(mdnsDiscover).toHaveBeenCalled();
      await manager.cleanup();
    });

    it('initiates mdns for hybrid method', async () => {
      vi.useFakeTimers();
      const { manager } = makeManager({ discoveryMethod: 'hybrid' });
      await manager.initialize();
      await Promise.resolve();
      expect(mdnsDiscover).toHaveBeenCalled();
      await manager.cleanup();
    });
  });

  describe('addPeer', () => {
    it('creates stub peer when manual discovery returns nothing', async () => {
      vi.mocked(manualDiscover).mockResolvedValueOnce([]);
      const { manager, storage, auditChain } = makeManager();
      const result = await manager.addPeer('https://agent.example.com', 'My Agent');
      expect(storage.addPeer).toHaveBeenCalledWith(expect.objectContaining({
        status: 'unknown',
        trustLevel: 'untrusted',
      }));
      expect(auditChain.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'a2a_peer_added' }));
      expect(result).toBeDefined();
    });

    it('uses discovered peer info when available', async () => {
      vi.mocked(manualDiscover).mockResolvedValueOnce([peerAgent]);
      const { manager, storage } = makeManager();
      const result = await manager.addPeer('https://agent.example.com');
      expect(storage.addPeer).toHaveBeenCalledWith(expect.objectContaining({
        status: 'online',
        trustLevel: 'untrusted',
      }));
      expect(result).toBeDefined();
    });

    it('sets capabilities when discovered peer has them', async () => {
      const peerWithCaps = {
        ...peerAgent,
        capabilities: [{ name: 'search', description: 'Search', version: '1.0' }],
      };
      vi.mocked(manualDiscover).mockResolvedValueOnce([peerWithCaps]);
      const { manager, storage } = makeManager();
      await manager.addPeer('https://agent.example.com');
      expect(storage.setCapabilities).toHaveBeenCalled();
    });

    it('checks SSRF guard for peer URL', async () => {
      vi.mocked(manualDiscover).mockResolvedValueOnce([]);
      const { manager } = makeManager();
      await manager.addPeer('https://agent.example.com');
      expect(assertPublicUrl).toHaveBeenCalledWith('https://agent.example.com', 'Peer URL');
    });
  });

  describe('removePeer', () => {
    it('removes peer and audits', async () => {
      const { manager, storage, auditChain } = makeManager();
      const result = await manager.removePeer('peer-1');
      expect(result).toBe(true);
      expect(storage.removePeer).toHaveBeenCalledWith('peer-1');
      expect(auditChain.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'a2a_peer_removed' }));
    });

    it('does not audit when peer not found', async () => {
      const { manager, auditChain } = makeManager({}, { removePeer: vi.fn().mockResolvedValue(false) });
      const result = await manager.removePeer('no-such');
      expect(result).toBe(false);
      expect(auditChain.record).not.toHaveBeenCalled();
    });
  });

  describe('listPeers', () => {
    it('delegates to storage', async () => {
      const { manager, storage } = makeManager(
        {},
        { listPeers: vi.fn().mockResolvedValue({ peers: [peerAgent], total: 1 }) }
      );
      const result = await manager.listPeers({ status: 'online' });
      expect(result.total).toBe(1);
      expect(storage.listPeers).toHaveBeenCalledWith({ status: 'online' });
    });
  });

  describe('updateTrust', () => {
    it('updates peer trust level and audits', async () => {
      const { manager, storage, auditChain } = makeManager();
      const result = await manager.updateTrust('peer-1', 'trusted');
      expect(result).toBeDefined();
      expect(storage.updatePeer).toHaveBeenCalledWith('peer-1', { trustLevel: 'trusted' });
      expect(auditChain.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'a2a_trust_updated' }));
    });

    it('does not audit when peer not found', async () => {
      const { manager, auditChain } = makeManager({}, { updatePeer: vi.fn().mockResolvedValue(null) });
      await manager.updateTrust('no-such', 'trusted');
      expect(auditChain.record).not.toHaveBeenCalled();
    });
  });

  describe('discover', () => {
    it('returns empty when discoveryMethod is none', async () => {
      const { manager } = makeManager({ discoveryMethod: 'none' });
      const result = await manager.discover();
      expect(result).toHaveLength(0);
    });

    it('discovers via manual method', async () => {
      vi.mocked(manualDiscover).mockResolvedValueOnce([peerAgent]);
      const { manager, storage } = makeManager({
        discoveryMethod: 'manual',
        trustedPeers: ['https://peer.example.com'],
      });
      await manager.discover();
      expect(manualDiscover).toHaveBeenCalled();
      expect(storage.addPeer).toHaveBeenCalled();
    });

    it('discovers via mdns method', async () => {
      vi.mocked(mdnsDiscover).mockResolvedValueOnce([peerAgent]);
      const { manager, storage } = makeManager({ discoveryMethod: 'mdns' });
      await manager.discover();
      expect(mdnsDiscover).toHaveBeenCalled();
      expect(storage.addPeer).toHaveBeenCalled();
    });

    it('discovers via hybrid (both manual and mdns)', async () => {
      vi.mocked(manualDiscover).mockResolvedValueOnce([]);
      vi.mocked(mdnsDiscover).mockResolvedValueOnce([]);
      const { manager } = makeManager({ discoveryMethod: 'hybrid', trustedPeers: [] });
      await manager.discover();
      expect(manualDiscover).toHaveBeenCalled();
      expect(mdnsDiscover).toHaveBeenCalled();
    });
  });

  describe('delegate', () => {
    it('sends message and logs it', async () => {
      const { manager, storage, transport, auditChain } = makeManager();
      const result = await manager.delegate('peer-1', 'Do a task');
      expect(transport.send).toHaveBeenCalled();
      expect(storage.logMessage).toHaveBeenCalled();
      expect(auditChain.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'a2a_delegation_sent' }));
      expect(result).not.toBeNull();
    });

    it('returns null when peer not found', async () => {
      const { manager } = makeManager({}, { getPeer: vi.fn().mockResolvedValue(null) });
      const result = await manager.delegate('no-peer', 'task');
      expect(result).toBeNull();
    });

    it('returns null when transport send fails', async () => {
      const { manager } = makeManager({}, {});
      const transport = makeTransport({ send: vi.fn().mockResolvedValue(false) });
      const { manager: mgr } = makeManager({}, {});
      // Create manager with failing transport
      const storage = makeStorage();
      const logger = makeLogger();
      const auditChain = makeAuditChain();
      const failingManager = new A2AManager(defaultConfig, {
        storage: storage as any,
        transport: { send: vi.fn().mockResolvedValue(false) } as any,
        logger: logger as any,
        auditChain: auditChain as any,
      });
      const result = await failingManager.delegate('peer-1', 'task');
      expect(result).toBeNull();
    });
  });

  describe('queryCapabilities', () => {
    it('returns empty when peer not found', async () => {
      const { manager } = makeManager({}, { getPeer: vi.fn().mockResolvedValue(null) });
      const result = await manager.queryCapabilities('no-peer');
      expect(result).toHaveLength(0);
    });

    it('sends query and returns stored capabilities', async () => {
      const { manager, storage } = makeManager(
        {},
        { getCapabilities: vi.fn().mockResolvedValue([{ name: 'search', description: 'Search', version: '1.0' }]) }
      );
      const result = await manager.queryCapabilities('peer-1');
      expect(storage.logMessage).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('falls back to stored capabilities when transport fails', async () => {
      const storage = makeStorage({
        getCapabilities: vi.fn().mockResolvedValue([{ name: 'chat', description: 'Chat', version: '1.0' }]),
      });
      const failingManager = new A2AManager(defaultConfig, {
        storage: storage as any,
        transport: { send: vi.fn().mockResolvedValue(false) } as any,
        logger: makeLogger() as any,
        auditChain: makeAuditChain() as any,
      });
      const result = await failingManager.queryCapabilities('peer-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getLocalCapabilities', () => {
    it('returns predefined local capabilities', () => {
      const { manager } = makeManager();
      const caps = manager.getLocalCapabilities();
      expect(caps.length).toBeGreaterThan(0);
      expect(caps.some((c) => c.name === 'chat')).toBe(true);
    });
  });

  describe('getMessageHistory', () => {
    it('delegates to storage.listMessages', async () => {
      const { manager, storage } = makeManager(
        {},
        { listMessages: vi.fn().mockResolvedValue({ messages: [], total: 0 }) }
      );
      await manager.getMessageHistory({ peerId: 'peer-1', limit: 20, offset: 0 });
      expect(storage.listMessages).toHaveBeenCalledWith({ peerId: 'peer-1', limit: 20, offset: 0 });
    });
  });

  describe('getConfig', () => {
    it('returns the config', () => {
      const { manager } = makeManager();
      expect(manager.getConfig().enabled).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('clears heartbeat timer', async () => {
      vi.useFakeTimers();
      const { manager } = makeManager();
      await manager.initialize();
      await manager.cleanup();
      // No error thrown
    });

    it('is idempotent', async () => {
      const { manager } = makeManager();
      await manager.cleanup(); // no timer to clear
      await manager.cleanup(); // double cleanup is safe
    });
  });
});
