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
import { GVisorSandbox } from './gvisor-sandbox.js';
import { WasmSandbox } from './wasm-sandbox.js';
import { SgxSandbox } from './sgx-sandbox.js';
import { SevSandbox } from './sev-sandbox.js';
import { FirecrackerSandbox } from './firecracker-sandbox.js';
import { AgnosSandbox, isAgnosticOS } from './agnos-sandbox.js';
import {
  CredentialProxy,
  type CredentialProxyHandle,
  type CredentialRule,
} from './credential-proxy.js';

export interface SandboxManagerConfig {
  enabled: boolean;
  technology:
    | 'auto'
    | 'seccomp'
    | 'landlock'
    | 'gvisor'
    | 'wasm'
    | 'sgx'
    | 'sev'
    | 'firecracker'
    | 'agnos'
    | 'none';
  allowedReadPaths: string[];
  allowedWritePaths: string[];
  maxMemoryMb: number;
  maxCpuPercent: number;
  maxFileSizeMb: number;
  networkAllowed: boolean;
  /** Firecracker-specific options. Passed to FirecrackerSandbox constructor. */
  firecracker?: {
    firecrackerPath?: string;
    jailerPath?: string;
    kernelPath?: string;
    rootfsPath?: string;
    memorySizeMb?: number;
    vcpuCount?: number;
    useJailer?: boolean;
    enableNetwork?: boolean;
  };
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

    this.getLogger().info(
      {
        ...this.capabilities,
      },
      'Sandbox capabilities detected'
    );

    return this.capabilities;
  }

  /**
   * Try to use a sandbox instance, logging success or falling back to NoopSandbox.
   * Returns the sandbox if available, or null to continue trying other options.
   */
  private tryBackend(instance: Sandbox, label: string): Sandbox | null {
    if (instance.isAvailable()) {
      this.getLogger().info(`Using ${label}`);
      return instance;
    }
    this.getLogger().warn(`${label} requested but not available, falling back to NoopSandbox`);
    return null;
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

    this.sandbox = this.resolveBackend();
    return this.sandbox;
  }

  /**
   * Resolve the sandbox backend based on config technology and platform capabilities.
   */
  private resolveBackend(): Sandbox {
    const tech = this.config.technology;
    const caps = this.detect();

    // Explicit technology selection
    switch (tech) {
      case 'agnos':
        return (
          this.tryBackend(new AgnosSandbox(), 'AGNOS kernel sandbox (daimon)') ?? new NoopSandbox()
        );

      case 'landlock':
        if (caps.platform !== 'linux') {
          this.getLogger().warn('Landlock requested but not on Linux, falling back to NoopSandbox');
          return new NoopSandbox();
        }
        return new LinuxSandbox({ enforceLandlock: true });

      case 'gvisor':
        return this.tryBackend(new GVisorSandbox(), 'gVisor (runsc) sandbox') ?? new NoopSandbox();

      case 'wasm':
        this.getLogger().info('Using WASM sandbox (isolated VM context)');
        return new WasmSandbox();

      case 'sgx':
        return this.tryBackend(new SgxSandbox(), 'SGX (Gramine-SGX) sandbox') ?? new NoopSandbox();

      case 'sev':
        return this.tryBackend(new SevSandbox(), 'SEV-SNP (QEMU) sandbox') ?? new NoopSandbox();

      case 'firecracker':
        return (
          this.tryBackend(
            new FirecrackerSandbox(this.config.firecracker),
            'Firecracker microVM sandbox'
          ) ?? new NoopSandbox()
        );

      case 'auto':
        return this.resolveAuto(caps);

      default:
        // seccomp or other — not yet implemented
        this.getLogger().warn(
          { technology: tech },
          'Requested sandbox technology not implemented, falling back to NoopSandbox'
        );
        return new NoopSandbox();
    }
  }

  /**
   * Auto-detect the best available sandbox for the current platform.
   */
  private resolveAuto(caps: SandboxCapabilities): Sandbox {
    // Prefer AGNOS kernel enforcement when running on AgnosticOS
    if (isAgnosticOS()) {
      const agnos = this.tryBackend(new AgnosSandbox(), 'AgnosticOS kernel sandbox (daimon)');
      if (agnos) return agnos;
    }

    if (caps.platform === 'linux') {
      this.getLogger().info(
        caps.landlock
          ? 'Using Linux sandbox (Landlock V2 enforcement)'
          : 'Using Linux sandbox (soft enforcement)'
      );
      return new LinuxSandbox({ enforceLandlock: caps.landlock });
    }

    if (caps.platform === 'darwin') {
      this.getLogger().info('Using macOS sandbox (sandbox-exec)');
      return new DarwinSandbox();
    }

    this.getLogger().warn(
      { platform: caps.platform },
      'No sandbox available for platform, falling back to NoopSandbox'
    );
    return new NoopSandbox();
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
    // On AGNOS, delegate to daimon's credential proxy
    if (this.sandbox instanceof AgnosSandbox) {
      const envVars = await (this.sandbox as AgnosSandbox).startCredentialProxy(
        credentials.map((c) => ({
          host_pattern: c.host,
          header_name: c.headerName,
          header_value: c.headerValue,
        })),
        allowedHosts
      );
      if (envVars.http_proxy) {
        this.getLogger().info(
          { url: envVars.http_proxy },
          'Credential proxy started via AGNOS daimon'
        );
        return envVars.http_proxy;
      }
      // Fall through to local proxy if AGNOS proxy failed
      this.getLogger().warn('AGNOS credential proxy unavailable, falling back to local proxy');
    }

    if (this.proxyHandle) {
      await this.proxyHandle.stop().catch(() => undefined);
      this.proxyHandle = null;
    }

    const proxy = new CredentialProxy({ credentials, allowedHosts });
    this.proxyHandle = await proxy.start();

    this.getLogger().info({ url: this.proxyHandle.proxyUrl }, 'Credential proxy started');
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
