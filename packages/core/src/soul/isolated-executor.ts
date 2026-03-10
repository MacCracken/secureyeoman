/**
 * Isolated-VM executor — provides V8 isolate-level sandboxing for dynamic tool code.
 *
 * `isolated-vm` is an optional native dependency. When it is not available
 * (e.g., missing build tools in CI, unsupported platform), the caller should
 * fall back to `node:vm` which is NOT a security boundary.
 *
 * @module
 */

// ── Lazy singleton ────────────────────────────────────────────────────────────

let ivm: typeof import('isolated-vm') | null = null;
let ivmLoaded = false;

async function loadIvm(): Promise<typeof import('isolated-vm') | null> {
  if (ivmLoaded) return ivm;
  try {
    ivm = (await import('isolated-vm')).default ?? (await import('isolated-vm'));
    ivmLoaded = true;
  } catch {
    ivm = null;
    ivmLoaded = true;
  }
  return ivm;
}

// Eagerly kick off the import so subsequent calls are synchronous.
const _ready = loadIvm();

/** Resolves once the `isolated-vm` availability check has completed. */
export const ready: Promise<void> = _ready.then(() => {});

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns `true` if the `isolated-vm` native module was loaded successfully.
 * Must be called after module initialisation (safe in practice since
 * `loadIvm()` is kicked off at import time).
 */
export function isIsolatedVmAvailable(): boolean {
  return ivm !== null;
}

/**
 * Execute `code` inside a fresh V8 isolate with the given `sandbox` values
 * injected into its global scope.
 *
 * The isolate is memory-limited (128 MB) and the script run has a hard
 * `timeoutMs` deadline enforced by `isolated-vm` at the V8 level — this
 * cannot be bypassed by user code (unlike `Promise.race` in the main thread).
 *
 * @throws If `isolated-vm` is not available, or if execution fails / times out.
 */
export async function executeIsolated(
  code: string,
  sandbox: Record<string, unknown>,
  timeoutMs: number
): Promise<unknown> {
  const mod = await loadIvm();
  if (!mod) {
    throw new Error('isolated-vm is not available — cannot execute in isolate');
  }

  const isolate = new mod.Isolate({ memoryLimit: 128 });

  try {
    const context = await isolate.createContext();

    try {
      const jail = context.global;
      await jail.set('global', jail.derefInto());

      // Inject sandbox values as deep-copied references.
      for (const [key, val] of Object.entries(sandbox)) {
        try {
          await jail.set(key, new mod.ExternalCopy(val).copyInto());
        } catch {
          // Some values (functions, symbols) cannot be serialised into the
          // isolate.  Skip them silently — the sandbox already restricts the
          // available API surface, so missing keys are acceptable.
        }
      }

      const script = await isolate.compileScript(code);
      // `promise: true` automatically proxies isolate-side Promises back to
      // the host, which is needed because dynamic tool code is wrapped in an
      // async IIFE whose return value is a Promise.
      const result = await script.run(context, { timeout: timeoutMs, promise: true });

      return result;
    } finally {
      context.release();
    }
  } finally {
    isolate.dispose();
  }
}
