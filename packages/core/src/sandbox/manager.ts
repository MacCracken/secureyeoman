/**
 * SandboxManager — Factory and lifecycle manager for sandbox instances.
 *
 * Detects platform capabilities, creates the appropriate Sandbox
 * implementation based on config and capabilities, and exposes
 * status information for health endpoints.
 */

import { getLogger, createNoopLogger, type SecureLogger } from '../logging/logger.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { Sandbox, SandboxCapabilities } from './types.js';
import { NoopSandbox } from './noop-sandbox.js';
import { LinuxSandbox } from './linux-sandbox.js';
import { DarwinSandbox } from './darwin-sandbox.js';
import {
  CredentialProxy,
  type CredentialProxyHandle,
  type CredentialRule,
} from './credential-proxy.js';

export interface SandboxManagerConfig {
  enabled: boolean;
  technology: 'auto' | 'seccomp' | 'landlock' | 'none';
  allowedReadPaths: string[];
  allowedWritePaths: string[];
  maxMemoryMb: number;
  maxCpuPercent: number;
  maxFileSizeMb: number;
  networkAllowed: boolean;
}

export interface SandboxManagerDeps {
  logger?: SecureLogger;
  auditChain?: AuditChain;
}

export class SandboxManager {
  private readonly config: SandboxManagerConfig;
  private readonly deps: SandboxManagerDeps;
  private sandbox: Sandbox | null = null;
  private capabilities: SandboxCapabilities | null = null;
  private logger: SecureLogger | null = null;
  private proxyHandle: CredentialProxyHandle | null = null;

  constructor(config: SandboxManagerConfig, deps: SandboxManagerDeps = {}) {
    this.config = config;
    this.deps = deps;
  }

  private getLogger(): SecureLogger {
    if (this.deps.logger) return this.deps.logger;
    if (!this.logger) {
      try {
        this.logger = getLogger().child({ component: 'SandboxManager' });
      } catch {
        return createNoopLogger();
      }
    }
    return this.logger;
  }

  /**
   * Detect platform sandbox capabilities.
   */
  detect(): SandboxCapabilities {
    if (this.capabilities) return this.capabilities;

    const platform = process.platform;
    const platformKey: SandboxCapabilities['platform'] =
      platform === 'linux'
        ? 'linux'
        : platform === 'darwin'
          ? 'darwin'
          : platform === 'win32'
            ? 'win32'
            : 'other';

    if (platformKey === 'linux') {
      const linux = new LinuxSandbox();
      this.capabilities = linux.getCapabilities();
    } else if (platformKey === 'darwin') {
      const darwin = new DarwinSandbox();
      this.capabilities = darwin.getCapabilities();
    } else {
      this.capabilities = {
        landlock: false,
        seccomp: false,
        namespaces: false,
        rlimits: false,
        platform: platformKey,
      };
    }

    this.getLogger().info('Sandbox capabilities detected', {
      ...this.capabilities,
    });

    return this.capabilities;
  }

  /**
   * Create the appropriate sandbox implementation based on config and capabilities.
   */
  createSandbox(): Sandbox {
    if (this.sandbox) return this.sandbox;

    if (!this.config.enabled || this.config.technology === 'none') {
      this.getLogger().info('Sandbox disabled by configuration');
      this.sandbox = new NoopSandbox();
      return this.sandbox;
    }

    const caps = this.detect();

    if (this.config.technology === 'auto') {
      if (caps.platform === 'linux') {
        const enforceLandlock = caps.landlock;
        this.getLogger().info(
          enforceLandlock
            ? 'Using Linux sandbox (Landlock V2 enforcement)'
            : 'Using Linux sandbox (soft enforcement)'
        );
        this.sandbox = new LinuxSandbox({ enforceLandlock });
        return this.sandbox;
      }
      if (caps.platform === 'darwin') {
        this.getLogger().info('Using macOS sandbox (sandbox-exec)');
        this.sandbox = new DarwinSandbox();
        return this.sandbox;
      }
      // No sandbox available for this platform
      this.getLogger().warn('No sandbox available for platform, falling back to NoopSandbox', {
        platform: caps.platform,
      });
      this.sandbox = new NoopSandbox();
      return this.sandbox;
    }

    if (this.config.technology === 'landlock') {
      if (caps.platform !== 'linux') {
        this.getLogger().warn('Landlock requested but not on Linux, falling back to NoopSandbox');
        this.sandbox = new NoopSandbox();
        return this.sandbox;
      }
      this.sandbox = new LinuxSandbox({ enforceLandlock: true });
      return this.sandbox;
    }

    // seccomp or other — not yet implemented, fall back
    this.getLogger().warn(
      'Requested sandbox technology not implemented, falling back to NoopSandbox',
      {
        technology: this.config.technology,
      }
    );
    this.sandbox = new NoopSandbox();
    return this.sandbox;
  }

  /**
   * Get sandbox capabilities.
   */
  getCapabilities(): SandboxCapabilities {
    return this.detect();
  }

  /**
   * Get the sandbox config.
   */
  getConfig(): SandboxManagerConfig {
    return this.config;
  }

  /**
   * Whether sandboxing is enabled in config.
   */
  isEnabled(): boolean {
    return this.config.enabled && this.config.technology !== 'none';
  }

  /**
   * Start the credential proxy with the given rules and allowed hosts.
   * Returns the proxy URL (e.g. `http://127.0.0.1:PORT`).
   * Calling startProxy() when one is already running replaces it.
   */
  async startProxy(credentials: CredentialRule[], allowedHosts: string[]): Promise<string> {
    if (this.proxyHandle) {
      await this.proxyHandle.stop().catch(() => undefined);
      this.proxyHandle = null;
    }

    const proxy = new CredentialProxy({ credentials, allowedHosts });
    this.proxyHandle = await proxy.start();

    this.getLogger().info('Credential proxy started', { url: this.proxyHandle.proxyUrl });
    return this.proxyHandle.proxyUrl;
  }

  /**
   * Stop the running credential proxy, if any.
   */
  async stopProxy(): Promise<void> {
    if (!this.proxyHandle) return;
    await this.proxyHandle.stop();
    this.proxyHandle = null;
    this.getLogger().info('Credential proxy stopped');
  }

  /**
   * Get status info for the /api/v1/sandbox/status endpoint.
   */
  getStatus(): {
    enabled: boolean;
    technology: string;
    capabilities: SandboxCapabilities;
    sandboxType: string;
    credentialProxyUrl: string | null;
  } {
    const sandbox = this.createSandbox();
    return {
      enabled: this.isEnabled(),
      technology: this.config.technology,
      capabilities: this.getCapabilities(),
      sandboxType: sandbox.constructor.name,
      credentialProxyUrl: this.proxyHandle?.proxyUrl ?? null,
    };
  }
}
