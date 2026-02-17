/**
 * Agent-to-Agent Protocol Module (Phase 6.5)
 */

export type {
  A2AMessageType,
  TrustLevel,
  DiscoveryMethod,
  PeerAgent,
  Capability,
  A2AMessage,
} from './types.js';
export { A2AStorage } from './storage.js';
export { A2AManager, type A2AManagerDeps } from './manager.js';
export { RemoteDelegationTransport } from './transport.js';
export { manualDiscover, mdnsDiscover } from './discovery.js';
export { registerA2ARoutes } from './a2a-routes.js';
