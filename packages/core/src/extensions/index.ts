/**
 * Extension Lifecycle Hooks Module (Phase 6.4a)
 */

export { ExtensionStorage, type HookRecord } from './storage.js';
export { ExtensionManager, type ExtensionManagerDeps } from './manager.js';
export { discoverPlugins } from './discovery.js';
export { registerExtensionRoutes } from './extension-routes.js';
export type {
  HookPoint,
  HookSemantics,
  HookHandler,
  HookRegistration,
  HookContext,
  HookResult,
  WebhookConfig,
  ExtensionManifest,
} from './types.js';
