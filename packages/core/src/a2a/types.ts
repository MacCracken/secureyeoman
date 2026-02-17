/**
 * Agent-to-Agent Protocol Types (Phase 6.5)
 */

export type A2AMessageType =
  | 'a2a:discover' | 'a2a:announce' | 'a2a:delegate' | 'a2a:delegate-response'
  | 'a2a:capability-query' | 'a2a:capability-response' | 'a2a:heartbeat' | 'a2a:disconnect';

export type TrustLevel = 'untrusted' | 'verified' | 'trusted';
export type DiscoveryMethod = 'mdns' | 'manual' | 'hybrid';

export interface PeerAgent {
  id: string;
  name: string;
  url: string;
  publicKey: string;
  trustLevel: TrustLevel;
  capabilities: Capability[];
  lastSeen: number;
  status: 'online' | 'offline' | 'unknown';
}

export interface Capability {
  name: string;
  description: string;
  version: string;
}

export interface A2AMessage {
  id: string;
  type: A2AMessageType;
  fromPeerId: string;
  toPeerId: string;
  payload: unknown;
  timestamp: number;
}
