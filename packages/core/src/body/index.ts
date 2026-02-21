/**
 * Body Module — Vital Signs, Heart & Physical Interfaces
 *
 * In Our Image: No-Thing-Ness → The One → The Plurality → Soul → Spirit → Brain → Body → Heart
 *
 * The Body module owns the agent's physical form and capabilities.
 * The Heart is a subfunction of Body, managing vital signs via the HeartbeatManager.
 */

export { HeartbeatManager, type HeartbeatResult, type HeartbeatCheckResult } from './heartbeat.js';
export {
  HeartbeatLogStorage,
  type HeartbeatLogEntry,
  type HeartbeatLogFilter,
} from './heartbeat-log-storage.js';
export { HeartManager } from './heart.js';
export type { BodyConfig } from './types.js';

// Capture permissions (NEXT_STEP_01)
export type {
  CaptureResource,
  CaptureAction,
  CaptureScope,
  BodyCapability,
  BodyCapabilityStatus,
} from './types.js';

export {
  checkCapturePermission,
  requireCapturePermission,
  requireCapturePermissionMiddleware,
  clearCapturePermissionCache,
  getCaptureCacheStats,
  type CapturePermissionContext,
  type CapturePermissionResult,
} from './capture-permissions.js';

// Capture consent (NEXT_STEP_02)
export type {
  CaptureConsent,
  ConsentStatus,
  ConsentConfig,
  ConsentGrantResult,
  ConsentStorage,
  ConsentKeyPair,
  ConsentEvent,
} from './consent.js';

export { DEFAULT_CONSENT_CONFIG } from './consent.js';

export {
  ConsentManager,
  InMemoryConsentStorage,
  initializeConsentManager,
  getConsentManager,
  resetConsentManager,
  type ConsentManagerOptions,
} from './consent-manager.js';

// Capture scope validation (NEXT_STEP_03)
export type {
  CaptureTarget,
  CaptureTargetType,
  ScreenRegion,
  CaptureDuration,
  CaptureResolution,
  CompressionLevel,
  CaptureFormat,
  CaptureQuality,
  CaptureFilters,
  CaptureRestrictions,
  SimpleCaptureScope,
  WindowInfo,
  DisplayInfo,
  ApplicationInfo,
} from './types.js';

export { toSimpleScope } from './types.js';

export {
  ScopeValidator,
  ScopeValidationError,
  initializeScopeValidator,
  getScopeValidator,
  resetScopeValidator,
  DEFAULT_ROLE_LIMITS,
  type ValidationResult,
  type RoleScopeLimits,
  type ScopeValidationOptions,
} from './scope-validator.js';

// Capture sandbox (NEXT_STEP_05)
export {
  CaptureProcess,
  createCaptureProcess,
  type CaptureProcessConfig,
  type CaptureProcessStatus,
} from './capture-process.js';

export {
  SecureIPC,
  MessageChannel,
  initializeCaptureIPC,
  getCaptureIPC,
  resetCaptureIPC,
  type IPCMessage,
  type SecureIPCConfig,
} from './capture-ipc.js';

// Platform permissions (NEXT_STEP_06)
export type {
  CapturePermissionType,
  PermissionState,
  PermissionStatus,
  PlatformPermissionManager,
} from './platform-permissions.js';

export {
  getPlatformPermissionManager,
  setPlatformPermissionManager,
  resetPlatformPermissionManager,
  formatPermissionName,
  getPermissionIcon,
} from './platform-permissions.js';

// Permission orchestrator
export {
  PermissionOrchestrator,
  getPermissionOrchestrator,
  setPermissionOrchestrator,
  resetPermissionOrchestrator,
  type PermissionDeniedReason,
  type CaptureContext,
  type PermissionResult,
} from './permission-orchestrator.js';

// Permission edge cases
export {
  PermissionEdgeCaseHandler,
  getPermissionEdgeCaseHandler,
  resetPermissionEdgeCaseHandler,
  type PermissionEvent,
  type PermissionEventHandler,
} from './permission-edge-cases.js';
