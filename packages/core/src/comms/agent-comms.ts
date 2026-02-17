/**
 * AgentComms — E2E encrypted communication between SecureYeoman agents.
 *
 * Manages peer discovery, message encryption/decryption, and local logging.
 */

import { AgentCrypto, sanitizePayload } from './crypto.js';
import { CommsStorage } from './storage.js';
import type {
  AgentIdentity,
  EncryptedMessage,
  MessagePayload,
  MessageLogQuery,
  AgentCommsDeps,
  CommsConfig,
} from './types.js';
import { uuidv7 } from '../utils/crypto.js';

export class AgentComms {
  private crypto: AgentCrypto | null = null;
  private storage: CommsStorage | null = null;
  private readonly config: CommsConfig;
  private readonly deps: AgentCommsDeps;
  private agentId: string;
  private agentName: string;

  constructor(config: CommsConfig, deps: AgentCommsDeps) {
    this.config = config;
    this.deps = deps;
    this.agentId = uuidv7();
    this.agentName = config.agentName || 'FRIDAY';
  }

  async init(opts: { keyStorePath?: string; dbPath?: string } = {}): Promise<void> {
    this.crypto = new AgentCrypto(opts.keyStorePath);
    this.storage = new CommsStorage();
    this.deps.logger.debug('Agent comms initialized', {
      agentId: this.agentId,
      publicKey: this.crypto.publicKey.slice(0, 20) + '...',
    });
  }

  getIdentity(): AgentIdentity {
    if (!this.crypto) throw new Error('Agent comms not initialized');
    return {
      id: this.agentId,
      name: this.agentName,
      publicKey: this.crypto.publicKey,
      signingKey: this.crypto.signingPublicKey,
      endpoint: '',
      capabilities: [],
      lastSeenAt: Date.now(),
    };
  }

  // ── Peer Management ────────────────────────────────────────

  async addPeer(identity: AgentIdentity): Promise<void> {
    if (!this.storage) throw new Error('Agent comms not initialized');
    if ((await this.storage.getPeerCount()) >= this.config.maxPeers) {
      throw new Error(`Maximum peer limit reached (${this.config.maxPeers})`);
    }
    await this.storage.addPeer(identity);
    this.deps.logger.debug('Peer added', { peerId: identity.id, name: identity.name });
  }

  async getPeer(id: string): Promise<AgentIdentity | null> {
    if (!this.storage) throw new Error('Agent comms not initialized');
    return await this.storage.getPeer(id);
  }

  async listPeers(): Promise<AgentIdentity[]> {
    if (!this.storage) throw new Error('Agent comms not initialized');
    return await this.storage.listPeers();
  }

  async removePeer(id: string): Promise<boolean> {
    if (!this.storage) throw new Error('Agent comms not initialized');
    return await this.storage.removePeer(id);
  }

  // ── Message Operations ─────────────────────────────────────

  async encryptMessage(toAgentId: string, payload: MessagePayload): Promise<EncryptedMessage> {
    if (!this.crypto || !this.storage) throw new Error('Agent comms not initialized');

    const peer = await this.storage.getPeer(toAgentId);
    if (!peer) throw new Error(`Unknown peer: ${toAgentId}`);

    // 1. Sanitize payload
    const sanitized = sanitizePayload(payload);

    // 2. Encrypt
    const encrypted = this.crypto.encrypt(sanitized, peer.publicKey);

    // 3. Sign
    const dataToSign = Buffer.from(encrypted.ciphertext + encrypted.nonce + this.agentId);
    const signature = this.crypto.signData(dataToSign);

    // 4. Log locally
    await this.storage.logMessage('sent', toAgentId, payload.type, JSON.stringify(encrypted));

    const message: EncryptedMessage = {
      id: uuidv7(),
      fromAgentId: this.agentId,
      toAgentId,
      ephemeralPublicKey: encrypted.ephemeralPublicKey,
      nonce: encrypted.nonce,
      ciphertext: encrypted.ciphertext,
      signature,
      timestamp: Date.now(),
    };

    this.deps.logger.debug('Message encrypted', {
      toAgent: toAgentId,
      type: payload.type,
    });

    return message;
  }

  async decryptMessage(encrypted: EncryptedMessage): Promise<MessagePayload> {
    if (!this.crypto || !this.storage) throw new Error('Agent comms not initialized');

    // 1. Verify sender is known
    const sender = await this.storage.getPeer(encrypted.fromAgentId);
    if (!sender) throw new Error(`Unknown sender: ${encrypted.fromAgentId}`);

    // 2. Verify signature
    const dataToVerify = Buffer.from(
      encrypted.ciphertext + encrypted.nonce + encrypted.fromAgentId
    );
    const valid = this.crypto.verifySignature(dataToVerify, encrypted.signature, sender.signingKey);
    if (!valid) {
      throw new Error('Invalid message signature');
    }

    // 3. Decrypt
    const payload = this.crypto.decrypt({
      ephemeralPublicKey: encrypted.ephemeralPublicKey,
      nonce: encrypted.nonce,
      ciphertext: encrypted.ciphertext,
    });

    // 4. Log locally
    await this.storage.logMessage(
      'received',
      encrypted.fromAgentId,
      payload.type,
      JSON.stringify({
        ephemeralPublicKey: encrypted.ephemeralPublicKey,
        nonce: encrypted.nonce,
        ciphertext: encrypted.ciphertext,
      })
    );

    // 5. Update peer last seen
    await this.storage.updatePeerLastSeen(encrypted.fromAgentId);

    this.deps.logger.debug('Message decrypted', {
      fromAgent: encrypted.fromAgentId,
      type: payload.type,
    });

    return payload;
  }

  // ── Message Log ────────────────────────────────────────────

  async getMessageLog(query?: MessageLogQuery): Promise<
    {
      id: string;
      direction: string;
      peerAgentId: string;
      messageType: string;
      timestamp: number;
    }[]
  > {
    if (!this.storage) throw new Error('Agent comms not initialized');
    const rows = await this.storage.queryMessageLog(query);
    return rows.map((r) => ({
      id: r.id,
      direction: r.direction,
      peerAgentId: r.peer_agent_id,
      messageType: r.message_type,
      timestamp: r.timestamp,
    }));
  }

  // ── Maintenance ────────────────────────────────────────────

  async runMaintenance(): Promise<{ pruned: number }> {
    if (!this.storage) return { pruned: 0 };
    const pruned = await this.storage.pruneOldMessages(this.config.messageRetentionDays);
    return { pruned };
  }

  // ── Cleanup ────────────────────────────────────────────────

  close(): void {
    this.storage?.close();
  }
}
