/**
 * Sandbox Types for SecureYeoman
 *
 * Defines the cross-platform sandbox abstraction layer (P2-010).
 * Implementations provide filesystem restrictions, resource limits,
 * and violation detection for task execution.
 */

export interface SandboxCapabilities {
  landlock: boolean;
  seccomp: boolean;
  namespaces: boolean;
  rlimits: boolean;
  platform: 'linux' | 'darwin' | 'win32' | 'other';
  credentialProxy?: boolean;
  sgx?: boolean;
  sev?: boolean;
  tpm?: boolean;
}

export interface SandboxOptions {
  filesystem?: {
    readPaths: string[];
    writePaths: string[];
    execPaths: string[];
  };
  resources?: {
    maxMemoryMb?: number;
    maxCpuPercent?: number;
    maxFileSizeMb?: number;
  };
  network?: {
    allowed: boolean;
    allowedHosts?: string[];
  };
  timeoutMs?: number;
}

export interface SandboxResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  resourceUsage?: {
    memoryPeakMb: number;
    cpuTimeMs: number;
  };
  violations: SandboxViolation[];
}

export interface SandboxViolation {
  type: 'filesystem' | 'network' | 'resource' | 'syscall' | 'scanning';
  description: string;
  path?: string;
  timestamp: number;
}

export interface Sandbox {
  run<T>(fn: () => Promise<T>, opts?: SandboxOptions): Promise<SandboxResult<T>>;
  getCapabilities(): SandboxCapabilities;
  isAvailable(): boolean;
}

/** Technology names with their relative isolation strength (higher = stronger). */
export const SANDBOX_STRENGTH: Record<string, number> = {
  firecracker: 90,
  sev: 85,
  sgx: 80,
  gvisor: 70,
  agnos: 65,
  landlock: 50,
  wasm: 40,
  darwin: 30,
  none: 0,
};

/** Detailed capability info for a single sandbox technology. */
export interface SandboxTechnologyStatus {
  technology: string;
  available: boolean;
  strength: number;
  missingPrerequisites: string[];
  installHint: string;
}

/** Health check result for the active sandbox. */
export interface SandboxHealthStatus {
  healthy: boolean;
  technology: string;
  lastChecked: string;
  checkDurationMs: number;
  error: string | null;
}
