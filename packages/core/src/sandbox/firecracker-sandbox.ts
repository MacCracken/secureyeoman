/**
 * FirecrackerSandbox — Firecracker microVM sandbox execution.
 *
 * Executes task functions inside a Firecracker microVM with KVM-based
 * hardware isolation. Uses the Firecracker REST API over Unix socket
 * for VM lifecycle and virtio-vsock for host↔guest communication.
 *
 * Falls back to in-process execution if Firecracker/KVM is not available.
 */

import { execFileSync, execFile } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getLogger, createNoopLogger, type SecureLogger } from '../logging/logger.js';
import type {
  Sandbox,
  SandboxCapabilities,
  SandboxOptions,
  SandboxResult,
  SandboxViolation,
} from './types.js';

export interface FirecrackerSandboxOptions {
  /** Path to firecracker binary. Default: auto-detect from PATH. */
  firecrackerPath?: string;
  /** Path to jailer binary. Default: auto-detect from PATH. When present, enables jailer hardening. */
  jailerPath?: string;
  /** Path to uncompressed Linux kernel (vmlinux). Required for execution. */
  kernelPath?: string;
  /** Path to root filesystem image (ext4). Required for execution. */
  rootfsPath?: string;
  /** Guest memory size in MB. Default: 128. */
  memorySizeMb?: number;
  /** Number of virtual CPUs. Default: 1. */
  vcpuCount?: number;
  /** Enable jailer (cgroup + seccomp + chroot hardening). Default: true if jailer binary available. */
  useJailer?: boolean;
  /** Enable network inside the microVM. Default: false. */
  enableNetwork?: boolean;
}

export class FirecrackerSandbox implements Sandbox {
  private logger: SecureLogger | null = null;
  private firecrackerBinary: string | null = null;
  private jailerBinary: string | null = null;
  private available: boolean | null = null;
  private readonly opts: FirecrackerSandboxOptions;

  constructor(opts?: FirecrackerSandboxOptions) {
    this.opts = opts ?? {};
  }

  private getLogger(): SecureLogger {
    if (!this.logger) {
      try {
        this.logger = getLogger().child({ component: 'FirecrackerSandbox' });
      } catch {
        return createNoopLogger();
      }
    }
    return this.logger;
  }

  /**
   * Detect the firecracker binary path.
   */
  private detectFirecracker(): string | null {
    if (this.firecrackerBinary !== null) return this.firecrackerBinary || null;

    const explicit = this.opts.firecrackerPath;
    if (explicit) {
      try {
        execFileSync(explicit, ['--version'], { stdio: 'pipe', timeout: 5000 });
        this.firecrackerBinary = explicit;
        return explicit;
      } catch {
        this.firecrackerBinary = '';
        return null;
      }
    }

    // Check via which
    try {
      const which = execFileSync('which', ['firecracker'], {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 5000,
      }).trim();
      if (which) {
        this.firecrackerBinary = which;
        return which;
      }
    } catch {
      // not in PATH
    }

    // Common install locations
    const candidates = [
      '/usr/local/bin/firecracker',
      '/usr/bin/firecracker',
      '/opt/firecracker/firecracker',
    ];
    for (const c of candidates) {
      try {
        execFileSync(c, ['--version'], { stdio: 'pipe', timeout: 5000 });
        this.firecrackerBinary = c;
        return c;
      } catch {
        continue;
      }
    }

    this.firecrackerBinary = '';
    return null;
  }

  /**
   * Detect the jailer binary path.
   */
  private detectJailer(): string | null {
    if (this.jailerBinary !== null) return this.jailerBinary || null;

    const explicit = this.opts.jailerPath;
    if (explicit) {
      try {
        execFileSync(explicit, ['--version'], { stdio: 'pipe', timeout: 5000 });
        this.jailerBinary = explicit;
        return explicit;
      } catch {
        this.jailerBinary = '';
        return null;
      }
    }

    try {
      const which = execFileSync('which', ['jailer'], {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 5000,
      }).trim();
      if (which) {
        this.jailerBinary = which;
        return which;
      }
    } catch {
      // not in PATH
    }

    const candidates = ['/usr/local/bin/jailer', '/usr/bin/jailer', '/opt/firecracker/jailer'];
    for (const c of candidates) {
      try {
        execFileSync(c, ['--version'], { stdio: 'pipe', timeout: 5000 });
        this.jailerBinary = c;
        return c;
      } catch {
        continue;
      }
    }

    this.jailerBinary = '';
    return null;
  }

  isAvailable(): boolean {
    if (this.available !== null) return this.available;

    if (process.platform !== 'linux') {
      this.available = false;
      return false;
    }

    // Check for KVM device, firecracker binary, and required assets
    const hasKvm = existsSync('/dev/kvm');
    const hasFirecracker = this.detectFirecracker() !== null;
    const hasKernel = !!this.opts.kernelPath && existsSync(this.opts.kernelPath);
    const hasRootfs = !!this.opts.rootfsPath && existsSync(this.opts.rootfsPath);

    this.available = hasKvm && hasFirecracker && hasKernel && hasRootfs;

    if (!this.available) {
      this.getLogger().debug(
        { hasKvm, hasFirecracker, hasKernel, hasRootfs },
        'Firecracker availability check'
      );
    }

    return this.available;
  }

  getCapabilities(): SandboxCapabilities {
    return {
      landlock: false,
      seccomp: false,
      namespaces: true,
      rlimits: true,
      platform: process.platform === 'linux' ? 'linux' : 'other',
      firecracker: this.isAvailable(),
    } as SandboxCapabilities & { firecracker: boolean };
  }

  async run<T>(fn: () => Promise<T>, opts?: SandboxOptions): Promise<SandboxResult<T>> {
    if (!this.isAvailable()) {
      this.getLogger().warn('Firecracker/KVM not available, executing without microVM isolation');
      return this.runFallback(fn, opts);
    }

    const startTime = Date.now();
    const violations: SandboxViolation[] = [];
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'sy-fc-'));
    const socketPath = path.join(tmpDir, 'firecracker.sock');

    try {
      // Write task script
      const taskScript = `
const fn = ${fn.toString()};
(async () => {
  try {
    const result = await fn();
    process.stdout.write(JSON.stringify({ success: true, result }));
  } catch (err) {
    process.stdout.write(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }));
  }
})();
`;
      const scriptPath = path.join(tmpDir, 'task.mjs');
      writeFileSync(scriptPath, taskScript);

      const timeoutMs = opts?.timeoutMs ?? 30000;
      const memorySizeMb = this.opts.memorySizeMb ?? 128;
      const vcpuCount = this.opts.vcpuCount ?? 1;

      // Build VM configuration
      const vmConfig = this.buildVmConfig(scriptPath, memorySizeMb, vcpuCount, opts);
      const configPath = path.join(tmpDir, 'vm-config.json');
      writeFileSync(configPath, JSON.stringify(vmConfig, null, 2));

      const firecrackerBin = this.detectFirecracker();
      if (!firecrackerBin) {
        this.getLogger().warn('Firecracker binary not found during execution');
        return this.runFallback(fn, opts);
      }

      const jailerBin = this.detectJailer();
      const useJailer = this.opts.useJailer !== false && jailerBin !== null;

      const args = useJailer
        ? this.buildJailerArgs(firecrackerBin, configPath, socketPath, tmpDir)
        : this.buildFirecrackerArgs(configPath);

      const binary = useJailer ? jailerBin! : firecrackerBin;

      const result = await new Promise<SandboxResult<T>>((resolve) => {
        let child: ReturnType<typeof execFile> | null = null;

        const timer = setTimeout(() => {
          // Kill the child process on timeout to avoid resource waste
          if (child?.pid) {
            try {
              process.kill(child.pid, 'SIGKILL');
            } catch {
              /* process may have already exited */
            }
          }
          resolve({
            success: false,
            error: new Error(`Firecracker execution timed out after ${timeoutMs}ms`),
            resourceUsage: { memoryPeakMb: 0, cpuTimeMs: timeoutMs },
            violations: [
              { type: 'resource', description: 'Execution timeout', timestamp: Date.now() },
            ],
          });
        }, timeoutMs);

        child = execFile(
          binary,
          args,
          {
            timeout: timeoutMs + 5000,
            maxBuffer: 10 * 1024 * 1024,
          },
          (err, stdout, stderr) => {
            clearTimeout(timer);
            const cpuTimeMs = Date.now() - startTime;

            if (stderr && (stderr.includes('DENIED') || stderr.includes('violation'))) {
              violations.push({
                type: 'syscall',
                description: stderr.trim(),
                timestamp: Date.now(),
              });
            }

            if (err) {
              resolve({
                success: false,
                error: new Error(err.message),
                resourceUsage: { memoryPeakMb: 0, cpuTimeMs },
                violations,
              });
              return;
            }

            try {
              const parsed = JSON.parse(stdout);
              resolve({
                success: parsed.success,
                result: parsed.success ? (parsed.result as T) : undefined,
                error: parsed.success
                  ? undefined
                  : new Error(parsed.error ?? 'Task failed in Firecracker microVM'),
                resourceUsage: { memoryPeakMb: 0, cpuTimeMs },
                violations,
              });
            } catch {
              resolve({
                success: false,
                error: new Error(`Failed to parse Firecracker output: ${stdout.slice(0, 200)}`),
                resourceUsage: { memoryPeakMb: 0, cpuTimeMs },
                violations,
              });
            }
          }
        );
      });

      return result;
    } finally {
      // Clean up socket and temp dir
      try {
        if (existsSync(socketPath)) unlinkSync(socketPath);
      } catch (e) {
        this.getLogger().debug({ error: String(e) }, 'Failed to remove socket');
      }
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {
        this.getLogger().debug({ error: String(e), tmpDir }, 'Failed to clean up temp dir');
        /* best effort */
      }
    }
  }

  /**
   * Build Firecracker VM configuration JSON.
   */
  private buildVmConfig(
    scriptPath: string,
    memorySizeMb: number,
    vcpuCount: number,
    opts?: SandboxOptions
  ): Record<string, unknown> {
    const networkEnabled = this.opts.enableNetwork && opts?.network?.allowed !== false;

    return {
      'boot-source': {
        kernel_image_path: this.opts.kernelPath,
        boot_args:
          'console=ttyS0 reboot=k panic=1 pci=off quiet loglevel=1 init=/sbin/overlay-init',
      },
      drives: [
        {
          drive_id: 'rootfs',
          path_on_host: this.opts.rootfsPath,
          is_root_device: true,
          is_read_only: true,
        },
        {
          drive_id: 'task',
          path_on_host: path.dirname(scriptPath),
          is_root_device: false,
          is_read_only: true,
        },
      ],
      'machine-config': {
        vcpu_count: vcpuCount,
        mem_size_mib: memorySizeMb,
        smt: false,
      },
      ...(networkEnabled
        ? {
            'network-interfaces': [
              {
                iface_id: 'eth0',
                guest_mac: 'AA:FC:00:00:00:01',
                host_dev_name: 'tap0',
              },
            ],
          }
        : {}),
    };
  }

  /**
   * Build Firecracker direct CLI arguments.
   */
  private buildFirecrackerArgs(configPath: string): string[] {
    return [
      '--no-api',
      '--config-file',
      configPath,
      '--log-path',
      '/dev/null',
      '--level',
      'Warning',
    ];
  }

  /**
   * Build jailer CLI arguments wrapping firecracker.
   */
  private buildJailerArgs(
    firecrackerPath: string,
    configPath: string,
    socketPath: string,
    tmpDir: string
  ): string[] {
    const vmId = path.basename(tmpDir).replace(/[^a-zA-Z0-9-]/g, '');
    return [
      '--id',
      vmId,
      '--exec-file',
      firecrackerPath,
      '--uid',
      String(process.getuid?.() ?? 0),
      '--gid',
      String(process.getgid?.() ?? 0),
      '--chroot-base-dir',
      tmpDir,
      '--',
      '--no-api',
      '--config-file',
      configPath,
    ];
  }

  /**
   * Fallback: run in-process with basic resource tracking when Firecracker is unavailable.
   */
  private async runFallback<T>(
    fn: () => Promise<T>,
    _opts?: SandboxOptions
  ): Promise<SandboxResult<T>> {
    const startTime = Date.now();
    const memBefore = process.memoryUsage().heapUsed;

    try {
      const result = await fn();
      const endTime = Date.now();
      const memAfter = process.memoryUsage().heapUsed;
      return {
        success: true,
        result,
        resourceUsage: {
          memoryPeakMb: Math.max(memBefore, memAfter) / 1024 / 1024,
          cpuTimeMs: endTime - startTime,
        },
        violations: [],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        resourceUsage: {
          memoryPeakMb: process.memoryUsage().heapUsed / 1024 / 1024,
          cpuTimeMs: Date.now() - startTime,
        },
        violations: [],
      };
    }
  }
}
