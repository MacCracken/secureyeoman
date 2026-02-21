import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────

const mockCrypto = {
  publicKey: 'pub-key-abc',
  signingPublicKey: 'signing-pub-key',
  encrypt: vi.fn(),
  signData: vi.fn(),
  verifySignature: vi.fn(),
  decrypt: vi.fn(),
};

const mockStorage = {
  getPeerCount: vi.fn(),
  addPeer: vi.fn(),
  getPeer: vi.fn(),
  listPeers: vi.fn(),
  removePeer: vi.fn(),
  logMessage: vi.fn(),
  updatePeerLastSeen: vi.fn(),
  queryMessageLog: vi.fn(),
  pruneOldMessages: vi.fn(),
  close: vi.fn(),
};

vi.mock('./crypto.js', () => ({
  AgentCrypto: vi.fn().mockImplementation(function () {
    return mockCrypto;
  }),
  sanitizePayload: vi.fn().mockImplementation((p: unknown) => p),
}));

vi.mock('./storage.js', () => ({
  CommsStorage: vi.fn().mockImplementation(function () {
    return mockStorage;
  }),
}));

vi.mock('../utils/crypto.js', () => ({
  uuidv7: vi.fn().mockReturnValue('msg-uuid'),
}));

// ─── Tests ────────────────────────────────────────────────────

import { AgentComms } from './agent-comms.js';

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const peerIdentity = {
  id: 'peer-1',
  name: 'Peer Agent',
  publicKey: 'peer-pub-key',
  signingKey: 'peer-signing-key',
  endpoint: 'http://peer:3000',
  capabilities: [],
  lastSeenAt: 1000,
};

describe('AgentComms', () => {
  let comms: AgentComms;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getPeerCount.mockResolvedValue(0);
    mockStorage.addPeer.mockResolvedValue(undefined);
    mockStorage.getPeer.mockResolvedValue(peerIdentity);
    mockStorage.listPeers.mockResolvedValue([peerIdentity]);
    mockStorage.removePeer.mockResolvedValue(true);
    mockStorage.logMessage.mockResolvedValue(undefined);
    mockStorage.updatePeerLastSeen.mockResolvedValue(undefined);
    mockStorage.queryMessageLog.mockResolvedValue([]);
    mockStorage.pruneOldMessages.mockResolvedValue(5);

    comms = new AgentComms({ agentName: 'FRIDAY', maxPeers: 10, messageRetentionDays: 30 } as any, {
      logger: mockLogger as any,
    });
  });

  describe('init', () => {
    it('initializes crypto and storage', async () => {
      await comms.init();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Agent comms initialized',
        expect.objectContaining({ publicKey: expect.stringContaining('pub-key') })
      );
    });
  });

  describe('getIdentity', () => {
    it('throws if not initialized', () => {
      expect(() => comms.getIdentity()).toThrow('not initialized');
    });

    it('returns identity after init', async () => {
      await comms.init();
      const id = comms.getIdentity();
      expect(id.name).toBe('FRIDAY');
      expect(id.publicKey).toBe('pub-key-abc');
      expect(id.signingKey).toBe('signing-pub-key');
    });
  });

  describe('addPeer', () => {
    it('throws if not initialized', async () => {
      await expect(comms.addPeer(peerIdentity)).rejects.toThrow('not initialized');
    });

    it('adds a peer after init', async () => {
      await comms.init();
      await comms.addPeer(peerIdentity);
      expect(mockStorage.addPeer).toHaveBeenCalledWith(peerIdentity);
    });

    it('throws when max peer limit reached', async () => {
      mockStorage.getPeerCount.mockResolvedValue(10);
      await comms.init();
      await expect(comms.addPeer(peerIdentity)).rejects.toThrow('Maximum peer limit');
    });
  });

  describe('getPeer', () => {
    it('returns peer from storage', async () => {
      await comms.init();
      const peer = await comms.getPeer('peer-1');
      expect(peer).toEqual(peerIdentity);
    });
  });

  describe('listPeers', () => {
    it('returns all peers', async () => {
      await comms.init();
      const peers = await comms.listPeers();
      expect(peers).toHaveLength(1);
      expect(peers[0].id).toBe('peer-1');
    });
  });

  describe('removePeer', () => {
    it('returns result from storage', async () => {
      await comms.init();
      const result = await comms.removePeer('peer-1');
      expect(result).toBe(true);
    });
  });

  describe('encryptMessage', () => {
    it('throws if not initialized', async () => {
      await expect(comms.encryptMessage('peer-1', { type: 'ping', data: {} })).rejects.toThrow(
        'not initialized'
      );
    });

    it('throws when peer not found', async () => {
      mockStorage.getPeer.mockResolvedValue(null);
      await comms.init();
      await expect(comms.encryptMessage('unknown', { type: 'ping', data: {} })).rejects.toThrow(
        'Unknown peer'
      );
    });

    it('encrypts, signs, logs, and returns encrypted message', async () => {
      mockCrypto.encrypt.mockReturnValue({
        ciphertext: 'ct',
        nonce: 'nn',
        ephemeralPublicKey: 'epk',
      });
      mockCrypto.signData.mockReturnValue('sig');

      await comms.init();
      const msg = await comms.encryptMessage('peer-1', { type: 'ping', data: { x: 1 } });

      expect(msg.id).toBe('msg-uuid');
      expect(msg.ciphertext).toBe('ct');
      expect(msg.signature).toBe('sig');
      expect(msg.toAgentId).toBe('peer-1');
      expect(mockStorage.logMessage).toHaveBeenCalledWith(
        'sent',
        'peer-1',
        'ping',
        expect.any(String)
      );
    });
  });

  describe('decryptMessage', () => {
    it('throws when sender is unknown', async () => {
      mockStorage.getPeer.mockResolvedValue(null);
      await comms.init();
      await expect(comms.decryptMessage({ fromAgentId: 'unknown' } as any)).rejects.toThrow(
        'Unknown sender'
      );
    });

    it('throws on invalid signature', async () => {
      mockCrypto.verifySignature.mockReturnValue(false);
      await comms.init();
      await expect(
        comms.decryptMessage({
          fromAgentId: 'peer-1',
          ciphertext: 'ct',
          nonce: 'nn',
          signature: 'bad-sig',
          ephemeralPublicKey: 'epk',
          toAgentId: 'me',
          id: 'msg-1',
          timestamp: 1000,
        })
      ).rejects.toThrow('Invalid message signature');
    });

    it('decrypts valid message and returns payload', async () => {
      mockCrypto.verifySignature.mockReturnValue(true);
      mockCrypto.decrypt.mockReturnValue({ type: 'pong', data: { ok: true } });

      await comms.init();
      const payload = await comms.decryptMessage({
        fromAgentId: 'peer-1',
        ciphertext: 'ct',
        nonce: 'nn',
        signature: 'valid',
        ephemeralPublicKey: 'epk',
        toAgentId: 'me',
        id: 'msg-1',
        timestamp: 1000,
      });

      expect(payload.type).toBe('pong');
      expect(mockStorage.logMessage).toHaveBeenCalledWith(
        'received',
        'peer-1',
        'pong',
        expect.any(String)
      );
      expect(mockStorage.updatePeerLastSeen).toHaveBeenCalledWith('peer-1');
    });
  });

  describe('getMessageLog', () => {
    it('throws if not initialized', async () => {
      await expect(comms.getMessageLog()).rejects.toThrow('not initialized');
    });

    it('returns mapped log entries', async () => {
      mockStorage.queryMessageLog.mockResolvedValue([
        {
          id: 'log-1',
          direction: 'sent',
          peer_agent_id: 'peer-1',
          message_type: 'ping',
          timestamp: 1000,
        },
      ]);

      await comms.init();
      const log = await comms.getMessageLog();
      expect(log).toHaveLength(1);
      expect(log[0].peerAgentId).toBe('peer-1');
      expect(log[0].messageType).toBe('ping');
    });
  });

  describe('runMaintenance', () => {
    it('returns 0 pruned when not initialized', async () => {
      const result = await comms.runMaintenance();
      expect(result.pruned).toBe(0);
    });

    it('prunes old messages', async () => {
      await comms.init();
      const result = await comms.runMaintenance();
      expect(result.pruned).toBe(5);
      expect(mockStorage.pruneOldMessages).toHaveBeenCalledWith(30);
    });
  });

  describe('close', () => {
    it('calls storage close', async () => {
      await comms.init();
      comms.close();
      expect(mockStorage.close).toHaveBeenCalled();
    });
  });
});
