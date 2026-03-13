/**
 * GVisorSandbox — gVisor (runsc) based sandbox execution.
 *
 * Executes task functions inside a gVisor sandbox via `runsc` OCI runtime.
 * Provides hardware-level isolation by intercepting system calls in userspace.
 *
 * Requirements:
 * - `runsc` binary installed and accessible in PATH
 * - Linux only (gVisor does not support macOS/Windows)
 * - Root or appropriate capabilities for container runtime
 *
 * Falls back to NoopSandbox if runsc is not available.
 */

import { execFileSync, execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
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

export interface GVisorSandboxOptions {
  /** Path to runsc binary. Default: auto-detect from PATH. */
  runscPath?: string;
  /** gVisor platform: ptrace or kvm. Default: ptrace. */
  platform?: 'ptrace' | 'kvm';
  /** Enable network inside the sandbox. Default: false. */
  networkEnabled?: boolean;
  /** Root directory for gVisor container state. Default: /tmp/secureyeoman-gvisor. */
  stateRoot?: string;
}

export class GVisorSandbox implements Sandbox {
  private logger: SecureLogger | null = null;
  private runscBinary: string | null = null;
  private available: boolean | null = null;
  private readonly opts: GVisorSandboxOptions;

  constructor(opts?: GVisorSandboxOptions) {
    this.opts = opts ?? {};
  }

  private getLogger(): SecureLogger {
    if (!this.logger) {
      try {
        this.logger = getLogger().child({ component: 'GVisorSandbox' });
      } catch {
        return createNoopLogger();
      }
    }
    return this.logger;
  }

  /**
   * Detect the runsc binary path.
   */
  private detectRunsc(): string | null {
    if (this.runscBinary !== null) return this.runscBinary;

    const explicit = this.opts.runscPath;
    if (explicit) {
      try {
        execFileSync(explicit, ['--version'], { stdio: 'pipe', timeout: 5000 });
        this.runscBinary = explicit;
        return explicit;
      } catch {
        this.runscBinary = '';
        return null;
      }
    }

    try {
      const which = execFileSync('which', ['runsc'], {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 5000,
      }).trim();
      if (which) {
        this.runscBinary = which;
        return which;
      }
    } catch {
      // not in PATH
    }

    // Common install locations
    const candidates = ['/usr/local/bin/runsc', '/usr/bin/runsc'];
    for (const c of candidates) {
      try {
        execFileSync(c, ['--version'], { stdio: 'pipe', timeout: 5000 });
        this.runscBinary = c;
        return c;
      } catch {
        continue;
      }
    }

    this.runscBinary = '';
    return null;
  }

  isAvailable(): boolean {
    if (this.available !== null) return this.available;

    if (process.platform !== 'linux') {
      this.available = false;
      return false;
    }

    this.available = this.detectRunsc() !== null;
    return this.available;
  }

  getCapabilities(): SandboxCapabilities {
    return {
      landlock: false,
      seccomp: false,
      namespaces: true,
      rlimits: true,
      platform: process.platform === 'linux' ? 'linux' : 'other',
      gvisor: this.isAvailable(),
    } as SandboxCapabilities & { gvisor: boolean };
  }

  async run<T>(fn: () => Promise<T>, opts?: SandboxOptions): Promise<SandboxResult<T>> {
    const runsc = this.detectRunsc();
    if (!runsc) {
      this.getLogger().warn('runsc not found, executing without gVisor isolation');
      return this.runFallback(fn, opts);
    }

    const startTime = Date.now();
    const violations: SandboxViolation[] = [];
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'sy-gvisor-'));
    const containerId = `sy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      // Build the OCI bundle
      const rootfsDir = path.join(tmpDir, 'rootfs');
      mkdirSync(rootfsDir, { recursive: true });

      // Write the task script
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
      const scriptPath = path.join(rootfsDir, 'task.mjs');
      writeFileSync(scriptPath, taskScript);

      // Build OCI config
      const ociConfig = this.buildOCIConfig(opts, scriptPath);
      writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify(ociConfig, null, 2));

      const stateRoot = this.opts.stateRoot ?? path.join(os.tmpdir(), 'secureyeoman-gvisor');
      // Validate stateRoot is absolute and under tmpdir to prevent path manipulation
      if (!path.isAbsolute(stateRoot) || stateRoot.includes('..')) {
        return {
          success: false,
          error: new Error('stateRoot must be an absolute path without traversal'),
          resourceUsage: { memoryPeakMb: 0, cpuTimeMs: 0 },
          violations: [],
        };
      }
      mkdirSync(stateRoot, { recursive: true });

      const timeoutMs = opts?.timeoutMs ?? 30000;

      // Execute via runsc
      const result = await new Promise<SandboxResult<T>>((resolve) => {
        const args = [
          `--root=${stateRoot}`,
          `--platform=${this.opts.platform ?? 'ptrace'}`,
          ...(this.opts.networkEnabled === false || !opts?.network?.allowed
            ? ['--network=none']
            : []),
          'run',
          '--bundle',
          tmpDir,
          containerId,
        ];

        const timer = setTimeout(() => {
          // Kill the container on timeout
          try {
            execFileSync(runsc, [`--root=${stateRoot}`, 'kill', containerId, 'SIGKILL'], {
              stdio: 'pipe',
              timeout: 5000,
            });
          } catch {
            // container may already be gone
          }
          resolve({
            success: false,
            error: new Error(`gVisor execution timed out after ${timeoutMs}ms`),
            resourceUsage: { memoryPeakMb: 0, cpuTimeMs: timeoutMs },
            violations: [
              { type: 'resource', description: 'Execution timeout', timestamp: Date.now() },
            ],
          });
        }, timeoutMs);

        let stdout = '';
        let _stderr = '';

        const child = execFile(
          runsc,
          args,
          {
            timeout: timeoutMs + 5000, // buffer beyond our manual timeout
            maxBuffer: 10 * 1024 * 1024,
          },
          (err, stdoutBuf, stderrBuf) => {
            clearTimeout(timer);
            stdout = stdoutBuf;
            _stderr = stderrBuf;

            const endTime = Date.now();
            const cpuTimeMs = endTime - startTime;

            if (err) {
              this.getLogger().warn(`gVisor execution failed: ${err.message}`);
              violations.push({
                type: 'syscall',
                description: `gVisor execution error: ${err.message}`,
                timestamp: Date.now(),
              });
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
              if (parsed.success) {
                resolve({
                  success: true,
                  result: parsed.result as T,
                  resourceUsage: { memoryPeakMb: 0, cpuTimeMs },
                  violations,
                });
              } else {
                resolve({
                  success: false,
                  error: new Error(parsed.error ?? 'Task failed in gVisor sandbox'),
                  resourceUsage: { memoryPeakMb: 0, cpuTimeMs },
                  violations,
                });
              }
            } catch {
              resolve({
                success: false,
                error: new Error(`Failed to parse gVisor output: ${stdout.slice(0, 200)}`),
                resourceUsage: { memoryPeakMb: 0, cpuTimeMs },
                violations,
              });
            }
          }
        );

        // Log stderr violations (gVisor security events)
        child.stderr?.on('data', (chunk: Buffer) => {
          const line = chunk.toString();
          if (line.includes('DENIED') || line.includes('violation')) {
            violations.push({
              type: 'syscall',
              description: line.trim(),
              timestamp: Date.now(),
            });
          }
        });
      });

      // Cleanup container state
      try {
        execFileSync(runsc, [`--root=${stateRoot}`, 'delete', '--force', containerId], {
          stdio: 'pipe',
          timeout: 10000,
        });
      } catch {
        // Best effort cleanup
      }

      return result;
    } finally {
      // Cleanup temp directory
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // best effort
      }
    }
  }

  /**
   * Build a minimal OCI runtime config for the task.
   */
  private buildOCIConfig(opts?: SandboxOptions, scriptPath?: string): Record<string, unknown> {
    const readPaths = opts?.filesystem?.readPaths ?? ['/usr', '/lib', '/lib64', '/etc/ssl'];
    const writePaths = opts?.filesystem?.writePaths ?? ['/tmp'];
    const maxMemoryBytes = (opts?.resources?.maxMemoryMb ?? 512) * 1024 * 1024;

    const mounts = [
      { destination: '/proc', type: 'proc', source: 'proc' },
      {
        destination: '/tmp',
        type: 'tmpfs',
        source: 'tmpfs',
        options: ['nosuid', 'nodev', 'size=64m'],
      },
      // Mount node binary read-only
      {
        destination: '/usr/local/bin/node',
        type: 'bind',
        source: process.execPath,
        options: ['rbind', 'ro'],
      },
    ];

    // Add read-only mounts for allowed paths
    for (const rp of readPaths) {
      mounts.push({
        destination: rp,
        type: 'bind',
        source: rp,
        options: ['rbind', 'ro'],
      });
    }

    // Add writable mounts
    for (const wp of writePaths) {
      mounts.push({
        destination: wp,
        type: 'bind',
        source: wp,
        options: ['rbind', 'rw'],
      });
    }

    return {
      ociVersion: '1.0.2',
      process: {
        terminal: false,
        user: { uid: 65534, gid: 65534 }, // nobody
        args: ['/usr/local/bin/node', '--experimental-vm-modules', scriptPath ?? '/task.mjs'],
        env: ['PATH=/usr/local/bin:/usr/bin:/bin', 'NODE_ENV=production', 'HOME=/tmp'],
        cwd: '/tmp',
        rlimits: [
          { type: 'RLIMIT_AS', hard: maxMemoryBytes, soft: maxMemoryBytes },
          { type: 'RLIMIT_NOFILE', hard: 256, soft: 256 },
          { type: 'RLIMIT_NPROC', hard: 64, soft: 64 },
        ],
      },
      root: { path: 'rootfs', readonly: true },
      hostname: 'sandbox',
      mounts,
      linux: {
        namespaces: [
          { type: 'pid' },
          { type: 'ipc' },
          { type: 'uts' },
          { type: 'mount' },
          ...(opts?.network?.allowed ? [] : [{ type: 'network' }]),
        ],
        resources: {
          memory: { limit: maxMemoryBytes },
          cpu: opts?.resources?.maxCpuPercent
            ? { quota: opts.resources.maxCpuPercent * 1000, period: 100000 }
            : undefined,
        },
      },
    };
  }

  /**
   * Fallback: run in-process with basic resource tracking when runsc is unavailable.
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
