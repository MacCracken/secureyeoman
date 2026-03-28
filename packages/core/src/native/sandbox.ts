/**
 * Sandbox Capabilities — TypeScript wrapper for the Rust NAPI bindings.
 *
 * Detects seccomp-bpf, Landlock LSM, cgroup v2, and namespace support.
 * Falls back to stub responses (all unavailable) when native module is absent.
 */

import { native } from './index.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SandboxCapabilities {
  seccomp_available: boolean;
  seccomp_mode: string;
  landlock_available: boolean;
  landlock_abi: number;
  cgroup_v2: boolean;
  namespaces_available: boolean;
}

// ── Detection ──────────────────────────────────────────────────────────────

export function detectCapabilities(): SandboxCapabilities {
  if (native?.sandboxDetectCapabilities) {
    return JSON.parse(native.sandboxDetectCapabilities()) as SandboxCapabilities;
  }
  return {
    seccomp_available: false,
    seccomp_mode: 'unsupported',
    landlock_available: false,
    landlock_abi: 0,
    cgroup_v2: false,
    namespaces_available: false,
  };
}

export function isSyscallAllowed(name: string): boolean {
  if (native?.sandboxIsSyscallAllowed) {
    return native.sandboxIsSyscallAllowed(name);
  }
  return false;
}

export function allowedSyscalls(): string[] {
  if (native?.sandboxAllowedSyscalls) {
    return native.sandboxAllowedSyscalls();
  }
  return [];
}

export function blockedSyscalls(): string[] {
  if (native?.sandboxBlockedSyscalls) {
    return native.sandboxBlockedSyscalls();
  }
  return [];
}

export function seccompMode(): string {
  if (native?.sandboxSeccompMode) {
    return native.sandboxSeccompMode();
  }
  return 'unsupported';
}

export function landlockAvailable(): boolean {
  if (native?.sandboxLandlockAvailable) {
    return native.sandboxLandlockAvailable();
  }
  return false;
}

export function landlockAbi(): number {
  if (native?.sandboxLandlockAbi) {
    return native.sandboxLandlockAbi();
  }
  return 0;
}

export function cgroupV2(): boolean {
  if (native?.sandboxCgroupV2) {
    return native.sandboxCgroupV2();
  }
  return false;
}

export function cgroupMemoryLimit(): number | null {
  if (native?.sandboxCgroupMemoryLimit) {
    return native.sandboxCgroupMemoryLimit();
  }
  return null;
}

export function cgroupMemoryCurrent(): number | null {
  if (native?.sandboxCgroupMemoryCurrent) {
    return native.sandboxCgroupMemoryCurrent();
  }
  return null;
}
