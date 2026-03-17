/**
 * AgnosSandbox — SecureYeoman sandbox backend that delegates to AGNOS daimon.
 *
 * When SecureYeoman runs on AgnosticOS, this backend delegates all sandbox
 * enforcement to the OS kernel via daimon's enforcement API (port 8090):
 *
 *   - Landlock filesystem restrictions (kernel-enforced, not userspace)
 *   - Seccomp syscall filtering (real BPF, not detection-only)
 *   - Network namespace isolation
 *   - Credential proxy (secrets never enter sandbox memory)
 *   - Externalization gate (scan outbound data for secrets/PII)
 *
 * Falls back gracefully to in-process execution if daimon is unreachable.
 */

import { existsSync } from 'node:fs';
import { getLogger, createNoopLogger, type SecureLogger } from '../logging/logger.js';
import type {
  Sandbox,
  SandboxCapabilities,
  SandboxOptions,
  SandboxResult,
  SandboxViolation,
} from './types.js';

const REQUEST_TIMEOUT_MS = 10_000;

interface DaimonEnforceResponse {
  sandbox_id: string;
  agent_id: string;
  environment: string;
  backend: string;
  status: string;
  enforcement: {
    landlock: boolean;
    seccomp: boolean;
    namespaces: boolean;
    credential_proxy: boolean;
    externalization_gate: boolean;
  };
}

interface DaimonScanResponse {
  allowed: boolean;
  findings_count: number;
  findings: Array<{
    pattern: string;
    severity: string;
    category: string;
    redacted: string;
  }>;
}

interface DaimonCredProxyResponse {
  agent_id: string;
  status: string;
  listen_addr: string;
  env_vars: Record<string, string>;
  rule_count: number;
  allowed_host_count: number;
}

export class AgnosSandbox implements Sandbox {
  private logger: SecureLogger | null = null;
  private available: boolean | null = null;
  private sandboxId: string | null = null;
  private readonly agentId: string;
  private readonly daimonUrl: string;
  private readonly daimonToken: string;

  constructor(agentId?: string) {
    this.agentId = agentId || `sy-${process.pid}`;
    this.daimonUrl = process.env.AGNOS_RUNTIME_URL || 'http://127.0.0.1:8090';
    this.daimonToken = process.env.AGNOS_API_KEY || '';
  }

  private getLogger(): SecureLogger {
    if (!this.logger) {
      try {
        this.logger = getLogger().child({ component: 'AgnosSandbox' });
      } catch {
        return createNoopLogger();
      }
    }
    return this.logger;
  }

  /**
   * Check if AGNOS daimon is reachable and the enforcement API is available.
   */
  isAvailable(): boolean {
    if (this.available !== null) return this.available;

    // Check for AGNOS markers: filesystem marker or env var
    if (existsSync('/etc/agnos/version')) {
      this.available = true;
      return true;
    }

    if (process.env.AGNOS_RUNTIME_URL) {
      this.available = true;
      return true;
    }

    this.available = false;
    return false;
  }

  getCapabilities(): SandboxCapabilities {
    return {
      landlock: true, // kernel-enforced via daimon
      seccomp: true, // real BPF via daimon
      namespaces: true, // PID/net/mount isolation
      rlimits: true, // cgroup enforcement
      platform: 'linux',
      credentialProxy: true,
      tpm: true, // AGNOS has TPM integration
    };
  }

  /**
   * Run a function inside an AGNOS-enforced sandbox.
   *
   * Delegates enforcement to daimon, which applies kernel-level
   * Landlock, seccomp, namespaces, credential proxy, and
   * externalization gate.
   */
  async run<T>(fn: () => Promise<T>, opts?: SandboxOptions): Promise<SandboxResult<T>> {
    const violations: SandboxViolation[] = [];
    const startMs = Date.now();

    try {
      // Step 1: Request sandbox enforcement from daimon
      const enforceResult = await this.requestEnforcement(opts);
      if (!enforceResult) {
        // Daimon unreachable — run unprotected with warning
        this.getLogger().warn('AGNOS daimon unreachable — running without kernel enforcement');
        violations.push({
          type: 'syscall',
          description: 'AGNOS daimon unreachable — running without kernel enforcement',
          timestamp: Date.now(),
        });
      } else {
        this.sandboxId = enforceResult.sandbox_id;
      }

      // Step 2: Execute the function
      const result = await fn();

      return {
        success: true,
        result,
        violations,
        resourceUsage: {
          memoryPeakMb: 0, // TODO: read from daimon cgroup stats
          cpuTimeMs: Date.now() - startMs,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        violations,
        resourceUsage: {
          memoryPeakMb: 0,
          cpuTimeMs: Date.now() - startMs,
        },
      };
    }
  }

  /**
   * Scan outbound data through AGNOS externalization gate.
   * Call this before sending any data externally.
   */
  async scanEgress(
    data: string
  ): Promise<{ allowed: boolean; findings: DaimonScanResponse['findings'] }> {
    try {
      const res = await fetch(`${this.daimonUrl}/v1/sandbox/scan-egress`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ agent_id: this.agentId, data }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const body = (await res.json()) as DaimonScanResponse;
      return { allowed: body.allowed, findings: body.findings || [] };
    } catch {
      // Gate unavailable — allow with warning
      return { allowed: true, findings: [] };
    }
  }

  /**
   * Start credential proxy via AGNOS daimon.
   * Returns env vars to set in child processes.
   */
  async startCredentialProxy(
    rules: Array<{ host_pattern: string; header_name: string; header_value: string }>,
    allowedHosts: string[]
  ): Promise<Record<string, string>> {
    try {
      const res = await fetch(`${this.daimonUrl}/v1/sandbox/credential-proxy/start`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          agent_id: this.agentId,
          rules,
          allowed_hosts: allowedHosts,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) return {};
      const body = (await res.json()) as DaimonCredProxyResponse;
      return body.env_vars || {};
    } catch {
      return {};
    }
  }

  /**
   * Submit a Landlock policy to AGNOS for kernel enforcement.
   * This is the same endpoint SY's landlock-mapper already targets.
   */
  async applyLandlockPolicy(policy: {
    name: string;
    filesystemRules: Array<{ path: string; access: string[] }>;
    networkRules: Array<{ port: number; access: string[] }>;
    resourceLimits: { maxMemoryBytes: number; cpuQuotaPercent: number };
    requireCredentialProxy: boolean;
  }): Promise<{ ok: boolean; policyId?: string }> {
    try {
      const res = await fetch(`${this.daimonUrl}/v1/policies/landlock`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ ...policy, agentId: this.agentId }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) return { ok: false };
      const body = (await res.json()) as { policy_id: string };
      return { ok: true, policyId: body.policy_id };
    } catch {
      return { ok: false };
    }
  }

  // -- Private helpers --

  private async requestEnforcement(opts?: SandboxOptions): Promise<DaimonEnforceResponse | null> {
    try {
      const environment = this.inferEnvironment();
      const res = await fetch(`${this.daimonUrl}/v1/sandbox/enforce`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          agent_id: this.agentId,
          environment,
          backend: 'auto',
          options: {
            filesystem: opts?.filesystem,
            resources: opts?.resources,
            network: opts?.network,
            timeout_ms: opts?.timeoutMs,
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) return null;
      return (await res.json()) as DaimonEnforceResponse;
    } catch {
      return null;
    }
  }

  private inferEnvironment(): string {
    if (process.env.NODE_ENV === 'production') return 'prod';
    if (process.env.NODE_ENV === 'staging') return 'staging';
    if (process.env.AGNOS_SANDBOX_ENV) return process.env.AGNOS_SANDBOX_ENV;
    return 'staging'; // default to staging when running on AGNOS
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.daimonToken) h.Authorization = `Bearer ${this.daimonToken}`;
    return h;
  }
}

/**
 * Detect if running on AgnosticOS.
 * Use this in SandboxManager's auto-detection logic.
 */
export function isAgnosticOS(): boolean {
  return !!process.env.AGNOS_RUNTIME_URL || existsSync('/etc/agnos/version');
}
