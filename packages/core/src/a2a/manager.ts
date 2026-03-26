/**
 * A2AManager — Manages peer-to-peer agent communication.
 *
 * Handles discovery, heartbeats, trust levels, delegation, and capability
 * queries across the A2A mesh network.
 *
 * Heartbeat tracking is backed by majra's ConcurrentHeartbeatTracker with
 * Online → Suspect → Offline FSM (30s suspect, 90s offline).
 */

import type { A2AConfig } from '@secureyeoman/shared';
import type { AuditChain } from '../logging/audit-chain.js';
import type { SecureLogger } from '../logging/logger.js';
import { A2AStorage } from './storage.js';
import { RemoteDelegationTransport } from './transport.js';
import { manualDiscover, mdnsDiscover } from './discovery.js';
import type { PeerAgent, Capability, A2AMessage, TrustLevel } from './types.js';
import { uuidv7 } from '../utils/crypto.js';
import { assertPublicUrl } from '../utils/ssrf-guard.js';
import * as majra from '../native/majra.js';

export interface A2AManagerDeps {
  storage: A2AStorage;
  transport: RemoteDelegationTransport;
  logger: SecureLogger;
  auditChain: AuditChain;
}

/** Heartbeat interval in milliseconds. */
const HEARTBEAT_INTERVAL_MS = 60_000;

export class A2AManager {
  private readonly config: A2AConfig;
  private readonly deps: A2AManagerDeps;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(config: A2AConfig, deps: A2AManagerDeps) {
    this.config = config;
    this.deps = deps;
  }

  async initialize(): Promise<void> {
    // Load known peers from storage and register in majra heartbeat tracker
    const { peers } = await this.deps.storage.listPeers();
    for (const peer of peers) {
      majra.heartbeatRegister(peer.id, { name: peer.name, url: peer.url });
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

    this.deps.logger.debug(
      {
        peerCount: peers.length,
        discoveryMethod: this.config.discoveryMethod,
      },
      'A2AManager initialized'
    );
  }

  // ── Peer management ────────────────────────────────────────────

  async addPeer(url: string, name?: string): Promise<PeerAgent> {
    // SSRF guard: only allow public, non-private peer URLs
    assertPublicUrl(url, 'Peer URL');
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
      majra.heartbeatRegister(peer.id, { name: peer.name, url: peer.url });

      await this.auditRecord('a2a_peer_added', {
        peerId: peer.id,
        peerName: peer.name,
        url: peer.url,
      });

      return (await this.deps.storage.getPeer(peer.id)) ?? peer;
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
    majra.heartbeatRegister(peer.id, { name: peer.name, url: peer.url });

    await this.auditRecord('a2a_peer_added', {
      peerId: peer.id,
      peerName: peer.name,
      url: peer.url,
      stub: true,
    });

    return peer;
  }

  /**
   * Register a pre-configured local peer (e.g. Agnostic running at 127.0.0.1) without
   * going through the SSRF guard.  Only call this for services whose URL is read from
   * trusted configuration — never for user-supplied URLs.
   */
  async addTrustedLocalPeer(params: {
    id?: string;
    name: string;
    url: string;
  }): Promise<PeerAgent> {
    const id = params.id ?? uuidv7();
    const peer = await this.deps.storage.addPeer({
      id,
      name: params.name,
      url: params.url,
      publicKey: '',
      trustLevel: 'trusted',
      status: 'unknown',
    });
    majra.heartbeatRegister(peer.id, { name: peer.name, url: peer.url });

    await this.auditRecord('a2a_local_peer_registered', {
      peerId: peer.id,
      peerName: peer.name,
      url: peer.url,
    });

    return (await this.deps.storage.getPeer(peer.id)) ?? peer;
  }

  async removePeer(id: string): Promise<boolean> {
    const removed = await this.deps.storage.removePeer(id);
    if (removed) {
      majra.heartbeatDeregister(id);
      await this.auditRecord('a2a_peer_removed', { peerId: id });
    }
    return removed;
  }

  async listPeers(filter?: {
    status?: string;
    trustLevel?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ peers: PeerAgent[]; total: number }> {
    return this.deps.storage.listPeers(filter);
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
        majra.heartbeatRegister(peer.id, { name: peer.name, url: peer.url });
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
        majra.heartbeatRegister(peer.id, { name: peer.name, url: peer.url });
        const fullPeer = await this.deps.storage.getPeer(peer.id);
        if (fullPeer) newPeers.push(fullPeer);
      }
    }

    this.deps.logger.info(
      {
        method: this.config.discoveryMethod,
        newPeersFound: newPeers.length,
      },
      'A2A discovery completed'
    );

    return newPeers;
  }

  // ── Delegation ─────────────────────────────────────────────────

  async delegate(peerId: string, task: string): Promise<A2AMessage | null> {
    const peer = await this.deps.storage.getPeer(peerId);
    if (!peer) {
      this.deps.logger.warn({ peerId }, 'Cannot delegate to unknown peer');
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
      this.deps.logger.warn(
        {
          peerId,
          messageId: message.id,
        },
        'Failed to delegate task to peer'
      );
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
      {
        name: 'video-streaming',
        description: 'Real-time video streaming intake and vision analysis',
        version: '1.0',
      },
      {
        name: 'sub-agent-delegation',
        description: 'Delegate tasks to specialized sub-agents',
        version: '1.0',
      },
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
    const { peers } = await this.deps.storage.listPeers();

    for (const peer of peers) {
      if (peer.status === 'offline') continue;

      const heartbeatMsg: A2AMessage = {
        id: uuidv7(),
        type: 'a2a:heartbeat',
        fromPeerId: 'self',
        toPeerId: peer.id,
        payload: { timestamp: Date.now() },
        timestamp: Date.now(),
      };

      const ok = await this.deps.transport.send(peer, heartbeatMsg);
      if (ok) {
        // Record successful heartbeat in majra tracker
        majra.heartbeat(peer.id);
        await this.deps.storage.updatePeer(peer.id, {
          status: 'online',
          lastSeen: Date.now(),
        });
      }
    }

    // Run majra status sweep — transitions nodes through Online→Suspect→Offline
    const transitions = majra.heartbeatUpdate();
    for (const { id, status } of transitions) {
      // SY peer status: 'online' | 'offline' | 'unknown'
      // majra suspect maps to 'online' (not yet fully offline)
      const peerStatus = status === 'offline' ? 'offline' : 'online';
      await this.deps.storage.updatePeer(id, { status: peerStatus });

      if (status === 'suspect') {
        this.deps.logger.debug({ peerId: id }, 'Peer suspect — missed heartbeat window');
      } else if (status === 'offline') {
        this.deps.logger.warn({ peerId: id }, 'Peer transitioned to offline');
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
      this.deps.logger.warn({ event }, 'Failed to record A2A audit event');
    }
  }
}
