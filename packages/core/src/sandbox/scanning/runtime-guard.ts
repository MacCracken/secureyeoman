/**
 * Runtime Guard — Monitors sandbox runtime behavior (Phase 116-C)
 *
 * Guards: network (host allowlist), filesystem (sensitive path blocklist),
 * process (fork bomb detection), time anomaly (2x expected duration).
 */

import type { SandboxViolation } from '../types.js';

export interface RuntimeGuardConfig {
  /** Allowed outbound hosts. Empty = all blocked. */
  allowedHosts: string[];
  /** Sensitive paths that should never be accessed. */
  blockedPaths: string[];
  /** Maximum concurrent child processes. */
  maxProcesses: number;
  /** Expected max duration in ms. Violations flagged at 2x. */
  expectedDurationMs: number;
}

const DEFAULT_BLOCKED_PATHS = [
  '/etc/shadow',
  '/etc/sudoers',
  '/root/.ssh',
  '/proc/self/environ',
  '/dev/mem',
  '/dev/kmem',
];

const DEFAULT_CONFIG: RuntimeGuardConfig = {
  allowedHosts: [],
  blockedPaths: DEFAULT_BLOCKED_PATHS,
  maxProcesses: 10,
  expectedDurationMs: 30_000,
};

export class RuntimeGuard {
  private readonly config: RuntimeGuardConfig;

  constructor(config: Partial<RuntimeGuardConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  checkNetwork(host: string): SandboxViolation | null {
    if (this.config.allowedHosts.length === 0) {
      return {
        type: 'network',
        description: `Network access blocked: no hosts allowed (attempted: ${host})`,
        timestamp: Date.now(),
      };
    }
    if (!this.config.allowedHosts.includes(host)) {
      return {
        type: 'network',
        description: `Network access blocked: ${host} not in allowlist`,
        timestamp: Date.now(),
      };
    }
    return null;
  }

  checkFilesystem(path: string): SandboxViolation | null {
    const normalizedPath = path.replace(/\/+/g, '/');
    for (const blocked of this.config.blockedPaths) {
      if (normalizedPath.startsWith(blocked)) {
        return {
          type: 'filesystem',
          description: `Sensitive path access blocked: ${blocked}`,
          path: normalizedPath,
          timestamp: Date.now(),
        };
      }
    }
    return null;
  }

  checkProcessCount(count: number): SandboxViolation | null {
    if (count > this.config.maxProcesses) {
      return {
        type: 'resource',
        description: `Fork bomb detected: ${count} processes exceeds limit of ${this.config.maxProcesses}`,
        timestamp: Date.now(),
      };
    }
    return null;
  }

  checkDuration(actualMs: number): SandboxViolation | null {
    const threshold = this.config.expectedDurationMs * 2;
    if (actualMs > threshold) {
      return {
        type: 'resource',
        description: `Time anomaly: execution took ${actualMs}ms (expected max ${this.config.expectedDurationMs}ms)`,
        timestamp: Date.now(),
      };
    }
    return null;
  }
}

export interface RuntimeMonitorEvent {
  type: 'network' | 'filesystem' | 'process' | 'duration';
  violation: SandboxViolation;
  timestamp: number;
}

export class RuntimeMonitor {
  private readonly guard: RuntimeGuard;
  private readonly violations: RuntimeMonitorEvent[] = [];
  private readonly startTime: number;

  constructor(guard: RuntimeGuard) {
    this.guard = guard;
    this.startTime = Date.now();
  }

  onNetworkAccess(host: string): SandboxViolation | null {
    const v = this.guard.checkNetwork(host);
    if (v) this.violations.push({ type: 'network', violation: v, timestamp: Date.now() });
    return v;
  }

  onFileAccess(path: string): SandboxViolation | null {
    const v = this.guard.checkFilesystem(path);
    if (v) this.violations.push({ type: 'filesystem', violation: v, timestamp: Date.now() });
    return v;
  }

  onProcessSpawn(currentCount: number): SandboxViolation | null {
    const v = this.guard.checkProcessCount(currentCount);
    if (v) this.violations.push({ type: 'process', violation: v, timestamp: Date.now() });
    return v;
  }

  checkDuration(): SandboxViolation | null {
    const elapsed = Date.now() - this.startTime;
    const v = this.guard.checkDuration(elapsed);
    if (v) this.violations.push({ type: 'duration', violation: v, timestamp: Date.now() });
    return v;
  }

  getViolations(): RuntimeMonitorEvent[] {
    return [...this.violations];
  }

  hasViolations(): boolean {
    return this.violations.length > 0;
  }
}
