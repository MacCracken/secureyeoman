export type {
  Sandbox,
  SandboxCapabilities,
  SandboxOptions,
  SandboxResult,
  SandboxViolation,
} from './types.js';

export { NoopSandbox } from './noop-sandbox.js';
export { LinuxSandbox } from './linux-sandbox.js';
export { DarwinSandbox } from './darwin-sandbox.js';
export { SandboxManager, type SandboxManagerConfig, type SandboxManagerDeps } from './manager.js';

export { LinuxCaptureSandbox } from './linux-capture-sandbox.js';
export { DarwinCaptureSandbox } from './darwin-capture-sandbox.js';

export {
  type CaptureSandboxConfig,
  type CaptureSandboxResult,
  type CaptureSandboxViolation,
  type CaptureProcessHandle,
  type CaptureSandboxEventType,
  type CaptureSandboxEvent,
  DEFAULT_CAPTURE_SANDBOX,
} from './capture-sandbox.js';

export {
  SandboxMonitor,
  getSandboxMonitor,
  resetSandboxMonitor,
  type IntegrityCheckResult,
  type IntegrityReport,
} from './monitor.js';

export {
  CredentialProxy,
  type CredentialProxyHandle,
  type CredentialRule,
  type CredentialProxyConfig,
} from './credential-proxy.js';
