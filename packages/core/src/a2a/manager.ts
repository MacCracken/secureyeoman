/**
 * A2AManager — Manages peer-to-peer agent communication.
 *
 * Handles discovery, heartbeats, trust levels, delegation, and capability
 * queries across the A2A mesh network.
 */

import type { A2AConfig } from '@friday/shared';
import type { AuditChain } from '../logging/audit-chain.js';
import type { SecureLogger } from '../logging/logger.js';
import { A2AStorage } from './storage.js';
import { RemoteDelegationTransport } from './transport.js';
import { manualDiscover, mdnsDiscover } from './discovery.js';
import type { PeerAgent, Capability, A2AMessage, TrustLevel } from './types.js';
import { uuidv7 } from '../utils/crypto.js';

export interface A2AManagerDeps {
  storage: A2AStorage;
  transport: RemoteDelegationTransport;
  logger: SecureLogger;
  auditChain: AuditChain;
}

/** Maximum consecutive heartbeat misses before marking a peer offline. */
const MAX_MISSED_HEARTBEATS = 3;

/** Heartbeat interval in milliseconds. */
const HEARTBEAT_INTERVAL_MS = 60_000;

export class A2AManager {
  private readonly config: A2AConfig;
  private readonly deps: A2AManagerDeps;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly missedHeartbeats = new Map<string, number>();

  constructor(config: A2AConfig, deps: A2AManagerDeps) {
    this.config = config;
    this.deps = deps;
  }

  async initialize(): Promise<void> {
    // Load known peers from storage and seed missed-heartbeat counters
    const peers = await this.deps.storage.listPeers();
    for (const peer of peers) {
      this.missedHeartbeats.set(peer.id, 0);
    }

    // Start heartbeat interval
    this.heartbeatTimer = setInterval(() => {
      void this.runHeartbeatCycle();
    }, HEARTBEAT_INTERVAL_MS);

    // If discovery method includes mdns, kick off an initial mDNS scan
    if (this.config.discoveryMethod === 'mdns' || this.config.discoveryMethod === 'hybrid') {
      void mdnsDiscover().then((found) => {
        for (const peer of found) {
          void this.deps.storage.addPeer({
            id: peer.id,
            name: peer.name,
            url: peer.url,
            publicKey: peer.publicKey,
            trustLevel: peer.trustLevel,
            status: peer.status,
          });
        }
      });
    }

    this.deps.logger.debug('A2AManager initialized', {
      peerCount: peers.length,
      discoveryMethod: this.config.discoveryMethod,
    });
  }

  // ── Peer management ────────────────────────────────────────────

  async addPeer(url: string, name?: string): Promise<PeerAgent> {
    // Attempt to discover peer info from the URL
    const discovered = await manualDiscover([url]);
    if (discovered.length > 0) {
      const info = discovered[0]!;
      const peer = await this.deps.storage.addPeer({
        id: info.id,
        name: name ?? info.name,
        url: info.url,
        publicKey: info.publicKey,
        trustLevel: 'untrusted',
        status: 'online',
      });
      if (info.capabilities.length > 0) {
        await this.deps.storage.setCapabilities(peer.id, info.capabilities);
      }
      this.missedHeartbeats.set(peer.id, 0);

      await this.auditRecord('a2a_peer_added', {
        peerId: peer.id,
        peerName: peer.name,
        url: peer.url,
      });

      return await this.deps.storage.getPeer(peer.id) ?? peer;
    }

    // If discovery fails, create a stub peer entry
    const id = uuidv7();
    const peer = await this.deps.storage.addPeer({
      id,
      name: name ?? url,
      url,
      publicKey: '',
      trustLevel: 'untrusted',
      status: 'unknown',
    });
    this.missedHeartbeats.set(peer.id, 0);

    await this.auditRecord('a2a_peer_added', {
      peerId: peer.id,
      peerName: peer.name,
      url: peer.url,
      stub: true,
    });

    return peer;
  }

  async removePeer(id: string): Promise<boolean> {
    const removed = await this.deps.storage.removePeer(id);
    if (removed) {
      this.missedHeartbeats.delete(id);
      await this.auditRecord('a2a_peer_removed', { peerId: id });
    }
    return removed;
  }

  async listPeers(): Promise<PeerAgent[]> {
    return this.deps.storage.listPeers();
  }

  async updateTrust(peerId: string, level: TrustLevel): Promise<PeerAgent | null> {
    const updated = await this.deps.storage.updatePeer(peerId, { trustLevel: level });
    if (updated) {
      await this.auditRecord('a2a_trust_updated', {
        peerId,
        newTrustLevel: level,
      });
    }
    return updated;
  }

  // ── Discovery ──────────────────────────────────────────────────

  async discover(): Promise<PeerAgent[]> {
    const newPeers: PeerAgent[] = [];

    // Manual discovery using configured trusted peer URLs
    if (this.config.discoveryMethod === 'manual' || this.config.discoveryMethod === 'hybrid') {
      const discovered = await manualDiscover(this.config.trustedPeers);
      for (const info of discovered) {
        const peer = await this.deps.storage.addPeer({
          id: info.id,
          name: info.name,
          url: info.url,
          publicKey: info.publicKey,
          trustLevel: 'untrusted',
          status: 'online',
        });
        if (info.capabilities.length > 0) {
          await this.deps.storage.setCapabilities(peer.id, info.capabilities);
        }
        this.missedHeartbeats.set(peer.id, 0);
        const fullPeer = await this.deps.storage.getPeer(peer.id);
        if (fullPeer) newPeers.push(fullPeer);
      }
    }

    // mDNS discovery
    if (this.config.discoveryMethod === 'mdns' || this.config.discoveryMethod === 'hybrid') {
      const discovered = await mdnsDiscover();
      for (const info of discovered) {
        const peer = await this.deps.storage.addPeer({
          id: info.id,
          name: info.name,
          url: info.url,
          publicKey: info.publicKey,
          trustLevel: 'untrusted',
          status: 'online',
        });
        if (info.capabilities.length > 0) {
          await this.deps.storage.setCapabilities(peer.id, info.capabilities);
        }
        this.missedHeartbeats.set(peer.id, 0);
        const fullPeer = await this.deps.storage.getPeer(peer.id);
        if (fullPeer) newPeers.push(fullPeer);
      }
    }

    this.deps.logger.info('A2A discovery completed', {
      method: this.config.discoveryMethod,
      newPeersFound: newPeers.length,
    });

    return newPeers;
  }

  // ── Delegation ─────────────────────────────────────────────────

  async delegate(peerId: string, task: string): Promise<A2AMessage | null> {
    const peer = await this.deps.storage.getPeer(peerId);
    if (!peer) {
      this.deps.logger.warn('Cannot delegate to unknown peer', { peerId });
      return null;
    }

    const message: A2AMessage = {
      id: uuidv7(),
      type: 'a2a:delegate',
      fromPeerId: 'self',
      toPeerId: peerId,
      payload: { task },
      timestamp: Date.now(),
    };

    const sent = await this.deps.transport.send(peer, message);
    if (!sent) {
      this.deps.logger.warn('Failed to delegate task to peer', {
        peerId,
        messageId: message.id,
      });
      return null;
    }

    await this.deps.storage.logMessage(message);

    await this.auditRecord('a2a_delegation_sent', {
      peerId,
      messageId: message.id,
      task,
    });

    return message;
  }

  // ── Capabilities ───────────────────────────────────────────────

  async queryCapabilities(peerId: string): Promise<Capability[]> {
    const peer = await this.deps.storage.getPeer(peerId);
    if (!peer) return [];

    // Send capability query message
    const queryMsg: A2AMessage = {
      id: uuidv7(),
      type: 'a2a:capability-query',
      fromPeerId: 'self',
      toPeerId: peerId,
      payload: {},
      timestamp: Date.now(),
    };

    const sent = await this.deps.transport.send(peer, queryMsg);
    if (!sent) {
      // Fall back to stored capabilities
      return this.deps.storage.getCapabilities(peerId);
    }

    await this.deps.storage.logMessage(queryMsg);

    // Return locally stored capabilities (live response would be handled
    // asynchronously via the receive endpoint)
    return this.deps.storage.getCapabilities(peerId);
  }

  getLocalCapabilities(): Capability[] {
    return [
      { name: 'chat', description: 'Conversational AI', version: '1.0' },
      { name: 'task-execution', description: 'Task management and execution', version: '1.0' },
      { name: 'memory', description: 'Long-term memory and recall', version: '1.0' },
    ];
  }

  // ── Message history ────────────────────────────────────────────

  async getMessageHistory(filter?: {
    peerId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ messages: A2AMessage[]; total: number }> {
    return this.deps.storage.listMessages({
      peerId: filter?.peerId,
      limit: filter?.limit,
      offset: filter?.offset,
    });
  }

  // ── Config ─────────────────────────────────────────────────────

  getConfig(): A2AConfig {
    return this.config;
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  async cleanup(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ── Private helpers ────────────────────────────────────────────

  private async runHeartbeatCycle(): Promise<void> {
    const peers = await this.deps.storage.listPeers();

    for (const peer of peers) {
      if (peer.status === 'offline') continue;

      const heartbeat: A2AMessage = {
        id: uuidv7(),
        type: 'a2a:heartbeat',
        fromPeerId: 'self',
        toPeerId: peer.id,
        payload: { timestamp: Date.now() },
        timestamp: Date.now(),
      };

      const ok = await this.deps.transport.send(peer, heartbeat);
      if (ok) {
        this.missedHeartbeats.set(peer.id, 0);
        if (peer.status !== 'online') {
          await this.deps.storage.updatePeer(peer.id, {
            status: 'online',
            lastSeen: Date.now(),
          });
        } else {
          await this.deps.storage.updatePeer(peer.id, {
            lastSeen: Date.now(),
          });
        }
      } else {
        const missed = (this.missedHeartbeats.get(peer.id) ?? 0) + 1;
        this.missedHeartbeats.set(peer.id, missed);

        if (missed >= MAX_MISSED_HEARTBEATS) {
          await this.deps.storage.updatePeer(peer.id, { status: 'offline' });
          this.deps.logger.warn('Peer marked offline after missed heartbeats', {
            peerId: peer.id,
            peerName: peer.name,
            missedCount: missed,
          });
        }
      }
    }
  }

  private async auditRecord(event: string, metadata: Record<string, unknown>): Promise<void> {
    try {
      await this.deps.auditChain.record({
        event,
        level: 'info',
        message: `A2A protocol: ${event}`,
        metadata,
      });
    } catch {
      this.deps.logger.warn('Failed to record A2A audit event', { event });
    }
  }
}
