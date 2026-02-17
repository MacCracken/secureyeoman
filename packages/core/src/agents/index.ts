/**
 * Sub-Agent Delegation Module (Phase 6.3)
 */

export { SubAgentStorage, type DelegationRecord, type DelegationMessageRecord } from './storage.js';
export { SubAgentManager, type SubAgentManagerDeps } from './manager.js';
export { BUILTIN_PROFILES } from './profiles.js';
export { DELEGATION_TOOLS, getDelegationTools } from './tools.js';
export { registerAgentRoutes } from './agent-routes.js';
