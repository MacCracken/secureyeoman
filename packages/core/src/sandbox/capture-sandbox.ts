/**
 * Capture Sandbox Types
 *
 * Specialized sandbox configuration for screen capture processes.
 * Provides strict isolation with minimal privileges needed for capture.
 *
 * @see ADR 014: Screen Capture Security Architecture
 * @see ADR 017: Sandboxed Execution
 * @see NEXT_STEP_05: Sandboxing
 */

import type { CaptureResource, CaptureScope } from '../body/types.js';

export interface CaptureSandboxConfig {
  maxMemory: number;
  maxCpuPercent: number;
  maxDuration: number;
  allowedPaths: string[];
  writePaths: string[];
  blockedPaths: string[];
  allowNetwork: boolean;
  allowedHosts?: string[];
  syscallPolicy: 'strict' | 'minimal' | 'capture-only';
  displayAccess: 'none' | 'capture-only' | 'full';
  isolateProcesses: boolean;
  maxProcesses: number;
}

export const DEFAULT_CAPTURE_SANDBOX: CaptureSandboxConfig = {
  maxMemory: 512,
  maxCpuPercent: 50,
  maxDuration: 300,
  allowedPaths: [
    '/usr/lib',
    '/usr/lib64',
    '/System/Library',
    '/Library',
    '/lib',
    '/lib64',
    '/usr/share',
  ],
  writePaths: ['/tmp/capture-*', '/var/tmp/capture-*'],
  blockedPaths: [
    '/etc/passwd',
    '/etc/shadow',
    '/etc/group',
    '~/.ssh',
    '~/.gnupg',
    '~/.aws',
    '~/.kube',
  ],
  allowNetwork: false,
  syscallPolicy: 'capture-only',
  displayAccess: 'capture-only',
  isolateProcesses: true,
  maxProcesses: 4,
};

export interface CaptureSandboxOptions {
  config?: Partial<CaptureSandboxConfig>;
  scope?: CaptureScope;
}

export interface CaptureSandboxResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  resourceUsage?: {
    memoryPeakMb: number;
    cpuTimeMs: number;
  };
  violations: CaptureSandboxViolation[];
}

export interface CaptureSandboxViolation {
  type: 'filesystem' | 'network' | 'resource' | 'syscall' | 'time';
  description: string;
  path?: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface CaptureProcessHandle {
  pid: number;
  startTime: number;
  sandboxed: boolean;
}

export type CaptureSandboxEventType =
  | 'sandbox.initializing'
  | 'sandbox.ready'
  | 'sandbox.violation'
  | 'sandbox.timeout'
  | 'sandbox.terminated'
  | 'capture.started'
  | 'capture.completed'
  | 'capture.failed';

export interface CaptureSandboxEvent {
  type: CaptureSandboxEventType;
  timestamp: number;
  pid?: number;
  details?: Record<string, unknown>;
}
