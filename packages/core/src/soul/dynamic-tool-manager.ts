/**
 * DynamicToolManager — Runtime registration and execution of AI-generated tools.
 *
 * Security model (three layers, all must pass):
 *   1. Global kill-switch  — SecurityConfig.allowDynamicTools must be true
 *   2. Sandbox enforcement — SecurityConfig.sandboxDynamicTools wraps execution in
 *                            SandboxManager (OS-level Landlock/seccomp on Linux)
 *   3. Per-personality opt-in — CreationConfig.allowDynamicTools gates injection of
 *                               the `register_dynamic_tool` creation tool (handled
 *                               separately in creation-tools.ts / getCreationTools)
 *
 * Execution safety:
 *   - Implementation code runs inside a Node.js vm context with a restricted sandbox
 *     (no `require`, `process`, `global`, `__dirname`, constructor-escape patterns, etc.)
 *   - Static forbidden-pattern analysis before compilation
 *   - Hard 10-second execution timeout via Promise.race
 *   - Optional SandboxManager wrapping for OS-level resource limits
 *
 * NOTE: When `isolated-vm` is available (optional native dependency), code is
 * executed inside a true V8 isolate with memory and CPU limits enforced at the
 * engine level.  When it is NOT available, execution falls back to Node.js
 * `vm.runInNewContext` which is NOT a fully isolated security boundary.
 * This feature must remain disabled by default and requires explicit operator opt-in
 * via both the global policy toggle and the per-personality CreationConfig toggle.
 */

import vm from 'node:vm';
import type { Tool } from '@secureyeoman/shared';
import { executeIsolated, isIsolatedVmAvailable } from './isolated-executor.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { SecureLogger } from '../logging/logger.js';
import type { SandboxManager } from '../sandbox/manager.js';
import {
  DynamicToolStorage,
  type DynamicTool,
  type DynamicToolCreate,
} from './dynamic-tool-storage.js';
import { errorToString } from '../utils/errors.js';

// ── Constants ────────────────────────────────────────────────────────────────

/** Maximum implementation code length (16 KB). */
const MAX_IMPLEMENTATION_BYTES = 16_384;

/** Execution timeout — hard cap for async tool implementations. */
const EXECUTION_TIMEOUT_MS = 10_000;

/** VM compilation timeout — guards against infinite-loop code at parse time. */
const COMPILE_TIMEOUT_MS = 2_000;

/** Valid tool name: starts with a lowercase letter, then letters/digits/underscores. */
const VALID_NAME_RE = /^[a-z][a-z0-9_]{0,99}$/;

/**
 * Patterns forbidden in dynamic tool implementations.
 * These cover the most common Node.js VM-escape and privilege-escalation techniques.
 */
const FORBIDDEN_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\brequire\s*\(/, label: 'require()' },
  { pattern: /\bimport\s*\(/, label: 'dynamic import()' },
  { pattern: /\bprocess\b/, label: 'process' },
  { pattern: /\b__dirname\b/, label: '__dirname' },
  { pattern: /\b__filename\b/, label: '__filename' },
  { pattern: /\bglobalThis\b/, label: 'globalThis' },
  { pattern: /\bBuffer\b/, label: 'Buffer' },
  { pattern: /\.constructor\s*\.constructor/, label: 'constructor chain escape' },
  { pattern: /\beval\s*\(/, label: 'eval()' },
  { pattern: /\bnew\s+Function\s*\(/, label: 'new Function()' },
  { pattern: /\bsetTimeout\s*\(/, label: 'setTimeout()' },
  { pattern: /\bsetInterval\s*\(/, label: 'setInterval()' },
  { pattern: /\bqueueMicrotask\s*\(/, label: 'queueMicrotask()' },
];

// ── Types ────────────────────────────────────────────────────────────────────

/** Subset of SecurityConfig read at execution time (supports live runtime updates). */
interface SecurityPolicy {
  allowDynamicTools: boolean;
  sandboxDynamicTools?: boolean;
}

export interface DynamicToolManagerDeps {
  logger: SecureLogger;
  auditChain?: AuditChain;
  sandboxManager?: SandboxManager;
  /** Override the hard execution timeout (ms). Defaults to 10 000 ms. */
  executionTimeoutMs?: number;
}

type CompiledFn = (args: Record<string, unknown>) => Promise<unknown>;

interface RegistryEntry {
  tool: DynamicTool;
  fn: CompiledFn;
}

// ── Manager ──────────────────────────────────────────────────────────────────

export class DynamicToolManager {
  private readonly registry = new Map<string, RegistryEntry>();
  private readonly executionTimeoutMs: number;

  /**
   * @param storage       Persistent storage for dynamic tools.
   * @param policyRef     Reference to the live SecurityConfig object.
   *                      Properties are read at call time so runtime policy
   *                      updates (sandboxDynamicTools toggled via the UI)
   *                      take effect immediately without restart.
   * @param deps          Logger, audit chain, and optional sandbox manager.
   *                      Pass `executionTimeoutMs` to override the default 10 s cap.
   */
  constructor(
    private readonly storage: DynamicToolStorage,
    private readonly policyRef: SecurityPolicy,
    private readonly deps: DynamicToolManagerDeps
  ) {
    this.executionTimeoutMs = deps.executionTimeoutMs ?? EXECUTION_TIMEOUT_MS;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /** Load persisted tools into the in-memory registry. Called once on startup. */
  async initialize(): Promise<void> {
    const tools = await this.storage.listTools();
    for (const tool of tools) {
      try {
        const fn = this.compile(tool.implementation);
        this.registry.set(tool.name, { tool, fn });
      } catch (err) {
        this.deps.logger.warn(
          {
            name: tool.name,
            error: errorToString(err),
          },
          'Failed to compile dynamic tool on startup — skipping'
        );
      }
    }
    this.deps.logger.debug(
      {
        toolCount: this.registry.size,
      },
      'DynamicToolManager initialized'
    );
  }

  // ── Registration ─────────────────────────────────────────────────────────

  /**
   * Register (or re-register) a dynamic tool.
   *
   * Validation sequence:
   *   1. Global allowDynamicTools policy check
   *   2. Name format validation
   *   3. Implementation length cap
   *   4. Forbidden-pattern static analysis
   *   5. VM compilation (catches syntax errors)
   *   6. Persistence to DB (upsert by name)
   *   7. In-memory registry update
   */
  async register(params: {
    name: string;
    description: string;
    parametersSchema: Record<string, unknown>;
    implementation: string;
    personalityId?: string | null;
    createdBy?: string;
  }): Promise<DynamicTool> {
    if (!this.policyRef.allowDynamicTools) {
      throw new Error(
        'Dynamic tool creation is disabled by security policy. ' +
          'Enable it in Settings → Security → Dynamic Tool Creation.'
      );
    }

    // 1. Name validation
    if (!VALID_NAME_RE.test(params.name)) {
      throw new Error(
        `Invalid tool name "${params.name}". ` +
          'Must start with a lowercase letter and contain only lowercase letters, digits, and underscores (max 100 chars).'
      );
    }

    // 2. Implementation length
    if (params.implementation.length > MAX_IMPLEMENTATION_BYTES) {
      throw new Error(
        `Implementation code too large (${params.implementation.length} bytes). ` +
          `Maximum allowed: ${MAX_IMPLEMENTATION_BYTES} bytes.`
      );
    }

    // 3. Forbidden pattern static analysis
    this.validateImplementation(params.implementation);

    // 4. Compilation — catches syntax errors before we touch the DB
    const fn = this.compile(params.implementation);

    // 5. Persist
    const toolData: DynamicToolCreate = {
      name: params.name,
      description: params.description,
      parametersSchema: params.parametersSchema,
      implementation: params.implementation,
      personalityId: params.personalityId ?? null,
      createdBy: params.createdBy ?? 'ai',
    };
    const tool = await this.storage.upsertTool(toolData);

    // 6. Update in-memory registry
    this.registry.set(tool.name, { tool, fn });

    this.deps.logger.info({ name: tool.name, id: tool.id }, 'Dynamic tool registered');

    void this.deps.auditChain?.record({
      event: 'dynamic_tool_registered',
      level: 'info',
      message: `Dynamic tool registered: ${tool.name}`,
      metadata: {
        toolId: tool.id,
        name: tool.name,
        personalityId: tool.personalityId,
      },
    });

    return tool;
  }

  // ── Execution ─────────────────────────────────────────────────────────────

  /**
   * Execute a registered dynamic tool by name.
   *
   * When sandboxDynamicTools is true and a SandboxManager is available,
   * execution is wrapped in sandbox.run() which applies OS-level resource
   * limits (memory, CPU) and filesystem restrictions via Landlock (Linux)
   * or sandbox-exec (macOS).
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ output: unknown; isError: boolean }> {
    const entry = this.registry.get(toolName);
    if (!entry) {
      return {
        output: { error: `Dynamic tool "${toolName}" is not registered.` },
        isError: true,
      };
    }

    const sandboxEnabled =
      (this.policyRef.sandboxDynamicTools ?? true) && !!this.deps.sandboxManager;

    try {
      let result: unknown;

      if (sandboxEnabled) {
        const sandbox = this.deps.sandboxManager!.createSandbox();
        const sandboxResult = await sandbox.run(() => this.runWithTimeout(entry.fn, args), {
          resources: {
            maxMemoryMb: 64,
            maxCpuPercent: 25,
            maxFileSizeMb: 1,
          },
          network: { allowed: false },
          timeoutMs: this.executionTimeoutMs,
        });
        if (!sandboxResult.success) {
          return {
            output: {
              error: sandboxResult.error?.message ?? 'Sandboxed execution failed',
            },
            isError: true,
          };
        }
        result = sandboxResult.result;
      } else {
        result = await this.runWithTimeout(entry.fn, args);
      }

      void this.deps.auditChain?.record({
        event: 'dynamic_tool_executed',
        level: 'info',
        message: `Dynamic tool executed: ${toolName}`,
        metadata: { name: toolName, sandboxed: sandboxEnabled },
      });

      return { output: result, isError: false };
    } catch (err) {
      const raw = errorToString(err);
      return {
        output: {
          error: `Dynamic tool "${toolName}" implementation error: ${raw}. Check the tool's implementation code for undefined variables or logic errors.`,
        },
        isError: true,
      };
    }
  }

  // ── Registry queries ─────────────────────────────────────────────────────

  /** Returns true if a tool with the given name is registered in the live registry. */
  has(toolName: string): boolean {
    return this.registry.has(toolName);
  }

  /**
   * Return Tool schemas for all registered dynamic tools.
   * Injected into the AI context by SoulManager.getActiveTools() when
   * allowDynamicTools is enabled, making them callable alongside skill tools.
   */
  getSchemas(): Tool[] {
    return Array.from(this.registry.values()).map(({ tool }) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parametersSchema,
    }));
  }

  /** List all registered tools (metadata only, no implementation code). */
  listTools(): Omit<DynamicTool, 'implementation'>[] {
    return Array.from(this.registry.values()).map(({ tool }) => {
      const { implementation: _impl, ...rest } = tool;
      return rest;
    });
  }

  /** Delete a tool from both the DB and the in-memory registry. */
  async deleteByName(name: string): Promise<boolean> {
    const deleted = await this.storage.deleteTool(name);
    if (deleted) {
      this.registry.delete(name);
      this.deps.logger.info({ name }, 'Dynamic tool deleted');
      void this.deps.auditChain?.record({
        event: 'dynamic_tool_deleted',
        level: 'info',
        message: `Dynamic tool deleted: ${name}`,
        metadata: { name },
      });
    }
    return deleted;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /** Static forbidden-pattern analysis. Throws on the first forbidden pattern found. */
  private validateImplementation(code: string): void {
    for (const { pattern, label } of FORBIDDEN_PATTERNS) {
      if (pattern.test(code)) {
        throw new Error(
          `Implementation contains a forbidden pattern: "${label}". ` +
            'Dynamic tool implementations may not access system resources. ' +
            'Use pure data-transformation logic only.'
        );
      }
    }
  }

  /**
   * Build the restricted sandbox object used by both isolated-vm and vm fallback.
   *
   * Deliberately omits: process, require, global, Buffer, __dirname,
   * __filename, setImmediate, etc.
   */
  private buildSandbox(): Record<string, unknown> {
    const sandbox = Object.create(null) as Record<string, unknown>;
    Object.assign(sandbox, {
      // JSON (safe subset)
      JSON: {
        parse: (s: string) => JSON.parse(s),
        stringify: (v: unknown, r?: unknown, s?: unknown) =>
          JSON.stringify(v, r as Parameters<typeof JSON.stringify>[1], s as number | string),
      },
      // Math / numeric
      Math,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      Number,
      // Type constructors
      String,
      Boolean,
      Array,
      // Object (safe subset — no Object.defineProperty, no prototype manipulation)
      Object: {
        keys: Object.keys.bind(Object),
        values: Object.values.bind(Object),
        entries: Object.entries.bind(Object),
        assign: Object.assign.bind(Object),
        freeze: Object.freeze.bind(Object),
        fromEntries: Object.fromEntries.bind(Object),
        is: Object.is.bind(Object),
        create: (proto: null) => {
          if (proto !== null) throw new TypeError('Object.create: only null prototype allowed');
          return Object.create(null);
        },
      },
      // Collections
      Set,
      Map,
      // Date (read-only access is fine)
      Date,
      // RegExp, Symbol, Error types
      RegExp,
      Symbol,
      Error,
      TypeError,
      RangeError,
      ReferenceError,
      SyntaxError,
      // Promise (needed for async/await support)
      Promise,
      // Limited console — routes to the structured logger, not stdout
      console: {
        log: (...args: unknown[]) => {
          this.deps.logger.debug({ args: args.map(String) }, '[dynamic-tool]');
        },
        warn: (...args: unknown[]) => {
          this.deps.logger.warn({ args: args.map(String) }, '[dynamic-tool]');
        },
        error: (...args: unknown[]) => {
          this.deps.logger.error({ args: args.map(String) }, '[dynamic-tool]');
        },
      },
    });
    return sandbox;
  }

  /**
   * Compile implementation code into an async callable.
   *
   * The code is wrapped in:
   *   (async function _dynamicTool(args) { <implementation> })
   *
   * When `isolated-vm` is available, the returned function will execute the
   * code inside a fresh V8 isolate on each invocation (true security boundary).
   * Otherwise, the code is compiled in a `node:vm` context (defence-in-depth
   * only, not a security boundary — prototype chain escapes are possible).
   */
  private compile(implementation: string): CompiledFn {
    const wrappedCode = `(async function _dynamicTool(args) {\n${implementation}\n})`;

    // Validate syntax eagerly regardless of execution backend.  This catches
    // syntax errors at registration time rather than deferring them to the
    // first invocation.
    try {
      new vm.Script(wrappedCode, { filename: 'dynamic-tool-syntax-check' });
    } catch (err) {
      throw new Error(`Syntax error in dynamic tool implementation: ${errorToString(err)}`);
    }

    if (isIsolatedVmAvailable()) {
      this.deps.logger.debug('Compiling dynamic tool with isolated-vm (V8 isolate)');

      // With isolated-vm the code is compiled + executed per-call inside a
      // disposable isolate, so we return a thin wrapper here.
      //
      // The V8 isolate already has all standard built-ins (Math, JSON, Array,
      // Date, etc.) available natively — we only need to inject the `args`
      // object.  Function-valued sandbox entries (console, custom Object
      // methods) cannot be serialised into the isolate, but the isolate's
      // own globals are a safe, locked-down superset of our whitelist.
      return async (args: Record<string, unknown>) => {
        // Wrap the result in JSON.stringify so that complex return values
        // (objects, arrays) are serialised to a transferable string, then
        // parse it back on the host side.  We use an async IIFE wrapper so
        // that `await` inside the tool implementation works correctly.
        const callCode = `(async () => JSON.stringify(await (${wrappedCode})(args)))()`;
        const sandbox: Record<string, unknown> = { args };
        const raw = await executeIsolated(callCode, sandbox, this.executionTimeoutMs);
        if (typeof raw === 'string') {
          try {
            return JSON.parse(raw);
          } catch {
            return raw;
          }
        }
        return raw;
      };
    }

    // ── Fallback: node:vm (NOT a security boundary) ───────────────────────
    this.deps.logger.debug(
      'Compiling dynamic tool with node:vm (fallback — not a security boundary)'
    );

    const sandbox = this.buildSandbox();
    const context = vm.createContext(sandbox);

    // Block prototype chain escapes (e.g., this.constructor.constructor('return process')())
    Object.defineProperty(context, 'constructor', { value: undefined, writable: false });

    // runInNewContext with a short compilation timeout to catch infinite loops
    // at parse/compile time.  This does NOT time out the async execution —
    // that is handled by runWithTimeout().
    const fn = vm.runInNewContext(wrappedCode, context, {
      filename: 'dynamic-tool',
      timeout: COMPILE_TIMEOUT_MS,
      displayErrors: false,
    });

    return fn as CompiledFn;
  }

  /** Run the compiled function with a hard execution timeout. */
  private async runWithTimeout(fn: CompiledFn, args: Record<string, unknown>): Promise<unknown> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => {
        reject(new Error(`Dynamic tool execution timed out after ${this.executionTimeoutMs}ms`));
      }, this.executionTimeoutMs)
    );
    return Promise.race([fn(args), timeout]);
  }
}
