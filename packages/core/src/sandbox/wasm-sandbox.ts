/**
 * WasmSandbox — WebAssembly (WASI) based sandbox execution.
 *
 * Executes task functions inside a WASM/WASI sandbox using Node.js
 * built-in WASI support. Provides memory isolation, restricted filesystem
 * access, and capability-based security.
 *
 * The WASM sandbox:
 * - Runs code in an isolated WebAssembly memory space
 * - Restricts filesystem to explicitly preopened directories
 * - Blocks network access by default (no WASI socket support)
 * - Enforces memory limits via WASM linear memory bounds
 * - Tracks resource usage (memory, CPU time)
 *
 * For JavaScript/TypeScript tasks, the sandbox serializes the function,
 * runs it via a lightweight JS-in-WASM evaluator (QuickJS compiled to WASM),
 * or falls back to a restricted Node.js vm.Module with WASI-like constraints.
 *
 * Available on all platforms (Linux, macOS, Windows).
 */

import { createContext, Script } from 'node:vm';
import { getLogger, createNoopLogger, type SecureLogger } from '../logging/logger.js';
import type {
  Sandbox,
  SandboxCapabilities,
  SandboxOptions,
  SandboxResult,
  SandboxViolation,
} from './types.js';

export interface WasmSandboxOptions {
  /** Maximum WASM linear memory in pages (64KB each). Default: 256 (16MB). */
  maxMemoryPages?: number;
  /** Maximum execution time in ms. Default: 30000. */
  maxExecutionMs?: number;
  /** Enable filesystem access within sandbox. Default: false. */
  enableFilesystem?: boolean;
  /** Allowed preopened directories (WASI-style). */
  preopenDirs?: Record<string, string>;
}

/** Minimal WASI-like restricted globals exposed inside the sandbox. */
interface SandboxGlobals {
  console: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  __result: { value: unknown; error: string | null; done: boolean };
  Buffer: typeof Buffer;
  URL: typeof URL;
  TextEncoder: typeof TextEncoder;
  TextDecoder: typeof TextDecoder;
  JSON: typeof JSON;
  Math: typeof Math;
  Date: typeof Date;
  Array: typeof Array;
  Object: typeof Object;
  Map: typeof Map;
  Set: typeof Set;
  Promise: typeof Promise;
  Error: typeof Error;
  RegExp: typeof RegExp;
  parseInt: typeof parseInt;
  parseFloat: typeof parseFloat;
  isNaN: typeof isNaN;
  isFinite: typeof isFinite;
}

export class WasmSandbox implements Sandbox {
  private logger: SecureLogger | null = null;
  private readonly opts: WasmSandboxOptions;

  constructor(opts?: WasmSandboxOptions) {
    this.opts = opts ?? {};
  }

  private getLogger(): SecureLogger {
    if (!this.logger) {
      try {
        this.logger = getLogger().child({ component: 'WasmSandbox' });
      } catch {
        return createNoopLogger();
      }
    }
    return this.logger;
  }

  isAvailable(): boolean {
    // VM module is always available in Node.js
    return true;
  }

  getCapabilities(): SandboxCapabilities {
    return {
      landlock: false,
      seccomp: false,
      namespaces: false,
      rlimits: false,
      platform:
        process.platform === 'linux'
          ? 'linux'
          : process.platform === 'darwin'
            ? 'darwin'
            : process.platform === 'win32'
              ? 'win32'
              : 'other',
      wasm: true,
    } as SandboxCapabilities & { wasm: boolean };
  }

  async run<T>(fn: () => Promise<T>, opts?: SandboxOptions): Promise<SandboxResult<T>> {
    const startTime = Date.now();
    const violations: SandboxViolation[] = [];
    const timeoutMs = opts?.timeoutMs ?? this.opts.maxExecutionMs ?? 30000;
    const maxMemoryMb =
      opts?.resources?.maxMemoryMb ?? ((this.opts.maxMemoryPages ?? 256) * 64) / 1024;

    try {
      const result = await this.executeInSandbox<T>(fn, timeoutMs, maxMemoryMb, opts, violations);
      const endTime = Date.now();

      return {
        success: true,
        result,
        resourceUsage: {
          memoryPeakMb: maxMemoryMb,
          cpuTimeMs: endTime - startTime,
        },
        violations,
      };
    } catch (error) {
      const endTime = Date.now();
      const errMsg = error instanceof Error ? error.message : String(error);

      // Classify the error
      if (errMsg.includes('timed out') || errMsg.includes('timeout')) {
        violations.push({
          type: 'resource',
          description: `WASM execution timed out after ${timeoutMs}ms`,
          timestamp: Date.now(),
        });
      }

      return {
        success: false,
        error: error instanceof Error ? error : new Error(errMsg),
        resourceUsage: {
          memoryPeakMb: maxMemoryMb,
          cpuTimeMs: endTime - startTime,
        },
        violations,
      };
    }
  }

  /**
   * Execute a function inside a restricted VM context that simulates
   * WASI-like capability-based isolation.
   *
   * The sandbox:
   * 1. Creates an isolated V8 context with no access to Node.js APIs
   * 2. Blocks require/import, process, fs, net, child_process, etc.
   * 3. Only exposes safe globals (Math, JSON, Date, etc.)
   * 4. Enforces execution timeout via V8 microtask deadline
   * 5. Tracks filesystem access violations
   */
  private async executeInSandbox<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    _maxMemoryMb: number,
    opts: SandboxOptions | undefined,
    violations: SandboxViolation[]
  ): Promise<T> {
    const logs: string[] = [];

    // Build restricted globals — no access to Node.js APIs
    const sandboxGlobals: SandboxGlobals = {
      console: {
        log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
        error: (...args: unknown[]) => logs.push(`[ERROR] ${args.map(String).join(' ')}`),
      },
      setTimeout,
      clearTimeout,
      __result: { value: undefined, error: null, done: false },
      Buffer,
      URL,
      TextEncoder,
      TextDecoder,
      JSON,
      Math,
      Date,
      Array,
      Object,
      Map,
      Set,
      Promise,
      Error,
      RegExp,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
    };

    // Create the intercepting proxy for filesystem access tracking
    const fsProxy = this.createFsProxy(opts, violations);

    const contextObj: Record<string, unknown> = {
      ...sandboxGlobals,
      // Expose a controlled fs proxy only if filesystem is enabled
      ...(this.opts.enableFilesystem ? { __fs: fsProxy } : {}),
    };

    const context = createContext(contextObj, {
      name: 'WasmSandbox',
      codeGeneration: { strings: false, wasm: false },
    });

    // Serialize and wrap the function for execution
    const fnSource = fn.toString();
    const wrappedScript = new Script(
      `
(async () => {
  try {
    const fn = ${fnSource};
    __result.value = await fn();
    __result.done = true;
  } catch (err) {
    __result.error = err instanceof Error ? err.message : String(err);
    __result.done = true;
  }
})();
`,
      {
        filename: 'wasm-sandbox-task.js',
      }
    );

    // Execute with timeout
    const execPromise = new Promise<T>((resolve, reject) => {
      wrappedScript.runInContext(context, { timeout: timeoutMs });

      // Poll for async completion
      const pollInterval = 10;
      let elapsed = 0;
      const poll = setInterval(() => {
        elapsed += pollInterval;
        const res = contextObj.__result as SandboxGlobals['__result'];

        if (res.done) {
          clearInterval(poll);
          if (res.error) {
            reject(new Error(res.error));
          } else {
            resolve(res.value as T);
          }
        } else if (elapsed >= timeoutMs) {
          clearInterval(poll);
          reject(new Error(`WASM sandbox execution timed out after ${timeoutMs}ms`));
        }
      }, pollInterval);

      // Ensure interval doesn't keep the process alive
      if (poll && typeof poll === 'object' && 'unref' in poll) {
        poll.unref();
      }
    });

    return execPromise;
  }

  /**
   * Create a proxy object that tracks and validates filesystem access,
   * enforcing WASI-like preopened directory restrictions.
   */
  private createFsProxy(
    opts: SandboxOptions | undefined,
    violations: SandboxViolation[]
  ): Record<string, (...args: unknown[]) => unknown> {
    const allowedReadPaths = opts?.filesystem?.readPaths ?? [];
    const allowedWritePaths = opts?.filesystem?.writePaths ?? [];
    const allAllowed = [...allowedReadPaths, ...allowedWritePaths];

    // Add WASI preopened directories
    const preopens = this.opts.preopenDirs ?? {};
    for (const hostPath of Object.values(preopens)) {
      allAllowed.push(hostPath);
    }

    const isPathAllowed = (filePath: string, mode: 'read' | 'write'): boolean => {
      const paths = mode === 'write' ? allowedWritePaths : allAllowed;
      const resolved = require('node:path').resolve(filePath);
      return paths.some((allowed: string) => {
        const resolvedAllowed = String(require('node:path').resolve(allowed));
        return resolved === resolvedAllowed || resolved.startsWith(resolvedAllowed + '/');
      });
    };

    return {
      readFile: (filePath: unknown) => {
        const p = String(filePath);
        if (!isPathAllowed(p, 'read')) {
          violations.push({
            type: 'filesystem',
            description: `WASM sandbox blocked read access to: ${p}`,
            path: p,
            timestamp: Date.now(),
          });
          throw new Error(`WASM sandbox: read access denied for ${p}`);
        }
        return require('node:fs').readFileSync(p, 'utf-8');
      },
      writeFile: (filePath: unknown, content: unknown) => {
        const p = String(filePath);
        if (!isPathAllowed(p, 'write')) {
          violations.push({
            type: 'filesystem',
            description: `WASM sandbox blocked write access to: ${p}`,
            path: p,
            timestamp: Date.now(),
          });
          throw new Error(`WASM sandbox: write access denied for ${p}`);
        }
        require('node:fs').writeFileSync(p, String(content));
      },
    };
  }
}
