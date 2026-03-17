/**
 * SandboxManager — Factory and lifecycle manager for sandbox instances.
 *
 * Detects platform capabilities, creates the appropriate Sandbox
 * implementation based on config and capabilities, and exposes
 * status information for health endpoints.
 */

import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { getLogger, createNoopLogger, type SecureLogger } from '../logging/logger.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { Sandbox, SandboxCapabilities, SandboxTechnologyStatus, SandboxHealthStatus } from './types.js';
import { SANDBOX_STRENGTH } from './types.js';
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
   *
   * Ranks technologies by isolation strength and selects the strongest available:
   * Firecracker > SEV > SGX > gVisor > AGNOS > Landlock > WASM > Darwin > Noop
   */
  private resolveAuto(caps: SandboxCapabilities): Sandbox {
    // Build candidates in strength order
    const candidates: { label: string; strength: number; create: () => Sandbox }[] = [];

    if (caps.platform === 'linux') {
      candidates.push({
        label: 'Firecracker microVM',
        strength: SANDBOX_STRENGTH.firecracker ?? 90,
        create: () => new FirecrackerSandbox(this.config.firecracker),
      });
      candidates.push({
        label: 'SEV-SNP (QEMU)',
        strength: SANDBOX_STRENGTH.sev ?? 85,
        create: () => new SevSandbox(),
      });
      candidates.push({
        label: 'SGX (Gramine)',
        strength: SANDBOX_STRENGTH.sgx ?? 80,
        create: () => new SgxSandbox(),
      });
      candidates.push({
        label: 'gVisor (runsc)',
        strength: SANDBOX_STRENGTH.gvisor ?? 70,
        create: () => new GVisorSandbox(),
      });

      if (isAgnosticOS()) {
        candidates.push({
          label: 'AGNOS kernel sandbox',
          strength: SANDBOX_STRENGTH.agnos ?? 65,
          create: () => new AgnosSandbox(),
        });
      }

      candidates.push({
        label: caps.landlock ? 'Linux (Landlock V2)' : 'Linux (soft enforcement)',
        strength: SANDBOX_STRENGTH.landlock ?? 50,
        create: () => new LinuxSandbox({ enforceLandlock: caps.landlock }),
      });

      candidates.push({
        label: 'WASM isolate',
        strength: SANDBOX_STRENGTH.wasm ?? 40,
        create: () => new WasmSandbox(),
      });
    } else if (caps.platform === 'darwin') {
      candidates.push({
        label: 'macOS sandbox-exec',
        strength: SANDBOX_STRENGTH.darwin ?? 30,
        create: () => new DarwinSandbox(),
      });
      candidates.push({
        label: 'WASM isolate',
        strength: SANDBOX_STRENGTH.wasm ?? 40,
        create: () => new WasmSandbox(),
      });
    }

    // Sort by strength descending, try each
    candidates.sort((a, b) => b.strength - a.strength);

    for (const candidate of candidates) {
      const instance = candidate.create();
      if (instance.isAvailable()) {
        this.getLogger().info(
          { technology: candidate.label, strength: candidate.strength },
          `Auto-selected sandbox: ${candidate.label} (strength ${candidate.strength})`
        );
        return instance;
      }
    }

    this.getLogger().warn(
      { platform: caps.platform },
      'No sandbox available for platform, falling back to NoopSandbox'
    );
    return new NoopSandbox();
  }

  /**
   * Create a sandbox for a specific task, potentially overriding the global technology.
   * Returns a one-off sandbox instance without caching it.
   */
  createSandboxForTask(technology?: SandboxManagerConfig['technology']): Sandbox {
    if (!technology || technology === this.config.technology) {
      return this.createSandbox();
    }

    // Create a temporary manager with the override
    const overrideConfig = { ...this.config, technology };
    const tempManager = new SandboxManager(overrideConfig, this.deps);
    return tempManager.createSandbox();
  }

  /**
   * Probe all sandbox technologies and return detailed availability info.
   * Used by `GET /api/v1/sandbox/capabilities`.
   */
  probeCapabilities(): SandboxTechnologyStatus[] {
    const caps = this.detect();
    const results: SandboxTechnologyStatus[] = [];

    const technologies: {
      name: string;
      create: () => Sandbox;
      prerequisites: () => { missing: string[]; hint: string };
    }[] = [
      {
        name: 'firecracker',
        create: () => new FirecrackerSandbox(this.config.firecracker),
        prerequisites: () => {
          const missing: string[] = [];
          if (caps.platform !== 'linux') missing.push('Linux OS');
          if (!existsSync('/dev/kvm')) missing.push('/dev/kvm (KVM kernel module)');
          if (!this.config.firecracker?.kernelPath) missing.push('kernelPath config');
          if (!this.config.firecracker?.rootfsPath) missing.push('rootfsPath config');
          return {
            missing,
            hint: missing.length
              ? 'Run scripts/build-firecracker-rootfs.sh to build kernel + rootfs'
              : '',
          };
        },
      },
      {
        name: 'gvisor',
        create: () => new GVisorSandbox(),
        prerequisites: () => {
          const missing: string[] = [];
          if (caps.platform !== 'linux') missing.push('Linux OS');
          try { execFileSync('which', ['runsc'], { stdio: 'pipe', timeout: 3000 }); } catch { missing.push('runsc binary (gVisor)'); }
          return { missing, hint: missing.length ? 'Install gVisor: https://gvisor.dev/docs/user_guide/install/' : '' };
        },
      },
      {
        name: 'sgx',
        create: () => new SgxSandbox(),
        prerequisites: () => {
          const missing: string[] = [];
          if (caps.platform !== 'linux') missing.push('Linux OS');
          if (!caps.sgx) missing.push('SGX-capable CPU');
          try { execFileSync('which', ['gramine-sgx'], { stdio: 'pipe', timeout: 3000 }); } catch { missing.push('gramine-sgx binary'); }
          return { missing, hint: missing.length ? 'Install Gramine: https://gramine.readthedocs.io/' : '' };
        },
      },
      {
        name: 'sev',
        create: () => new SevSandbox(),
        prerequisites: () => {
          const missing: string[] = [];
          if (caps.platform !== 'linux') missing.push('Linux OS');
          if (!caps.sev) missing.push('AMD SEV-capable CPU');
          return { missing, hint: '' };
        },
      },
      {
        name: 'landlock',
        create: () => new LinuxSandbox({ enforceLandlock: true }),
        prerequisites: () => {
          const missing: string[] = [];
          if (caps.platform !== 'linux') missing.push('Linux OS');
          if (!caps.landlock) missing.push('Kernel 5.13+ with Landlock V2');
          return { missing, hint: '' };
        },
      },
      {
        name: 'wasm',
        create: () => new WasmSandbox(),
        prerequisites: () => ({ missing: [], hint: '' }),
      },
    ];

    for (const tech of technologies) {
      const instance = tech.create();
      const prereqs = tech.prerequisites();
      results.push({
        technology: tech.name,
        available: instance.isAvailable(),
        strength: SANDBOX_STRENGTH[tech.name] ?? 0,
        missingPrerequisites: prereqs.missing,
        installHint: prereqs.hint,
      });
    }

    return results.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Perform a health check on the active sandbox technology.
   * Attempts a minimal execution to verify the sandbox is functional.
   */
  async healthCheck(): Promise<SandboxHealthStatus> {
    const start = Date.now();
    const sandbox = this.createSandbox();
    const technology = sandbox.constructor.name;

    try {
      const result = await sandbox.run(async () => 'health-ok', { timeoutMs: 10000 });
      const durationMs = Date.now() - start;

      return {
        healthy: result.success && result.result === 'health-ok',
        technology,
        lastChecked: new Date().toISOString(),
        checkDurationMs: durationMs,
        error: result.success ? null : (result.error?.message ?? 'Unknown error'),
      };
    } catch (error) {
      return {
        healthy: false,
        technology,
        lastChecked: new Date().toISOString(),
        checkDurationMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Switch sandbox technology without restart.
   * Invalidates the cached sandbox instance so the next createSandbox() uses the new technology.
   */
  switchTechnology(technology: SandboxManagerConfig['technology']): void {
    this.getLogger().info(
      { from: this.config.technology, to: technology },
      'Switching sandbox technology'
    );
    (this.config as { technology: string }).technology = technology;
    this.sandbox = null;
    this.capabilities = null;
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
      const envVars = await this.sandbox.startCredentialProxy(
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
      await this.proxyHandle.stop().catch((err: unknown) => {
        this.getLogger().warn({ error: String(err) }, 'Failed to stop previous credential proxy');
      });
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
    strength: number;
  } {
    const sandbox = this.createSandbox();
    const techName = this.config.technology === 'auto'
      ? sandbox.constructor.name.replace('Sandbox', '').toLowerCase()
      : this.config.technology;
    return {
      enabled: this.isEnabled(),
      technology: this.config.technology,
      capabilities: this.getCapabilities(),
      sandboxType: sandbox.constructor.name,
      credentialProxyUrl: this.proxyHandle?.proxyUrl ?? null,
      strength: SANDBOX_STRENGTH[techName] ?? 0,
    };
  }
}
