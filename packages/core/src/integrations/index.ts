/**
 * Integration Module — Platform integrations and unified messaging.
 */

export { IntegrationStorage } from './storage.js';
export { IntegrationManager } from './manager.js';
export type { IntegrationManagerDeps, AutoReconnectConfig } from './manager.js';
export { MessageRouter } from './message-router.js';
export type { MessageRouterDeps } from './message-router.js';
export { ConversationManager } from './conversation.js';
export type { ConversationManagerOptions, ConversationContext } from './conversation.js';
export { registerIntegrationRoutes } from './integration-routes.js';
export type { IntegrationRoutesOptions } from './integration-routes.js';
export type {
  Integration,
  WebhookIntegration,
  PlatformAdapter,
  PlatformRateLimit,
  IntegrationDeps,
  IntegrationRegistryEntry,
} from './types.js';
export { DEFAULT_RATE_LIMITS } from './types.js';
