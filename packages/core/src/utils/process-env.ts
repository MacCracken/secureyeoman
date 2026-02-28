/**
 * Process environment utilities for safe child-process spawning.
 *
 * Security: never forward the full `process.env` to child processes — it may
 * contain API keys, DB passwords, and other secrets that can be exfiltrated
 * via crash reports, logging, or environment dumps.
 */

/** Non-secret env vars needed for shell operation that are safe to forward. */
const SAFE_ENV_KEYS = new Set([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'SHELL',
  'TMPDIR',
  'TZ',
  'XDG_RUNTIME_DIR',
]);

/**
 * Build a minimal environment suitable for child-process spawning.
 * Picks only the keys in {@link SAFE_ENV_KEYS} from `process.env`, then
 * hard-codes PATH to a known-safe value to prevent PATH-injection attacks.
 */
export function buildSafeEnv(): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      safe[key] = process.env[key];
    }
  }
  // Always use a hardcoded safe PATH even if the env one was overridden.
  safe.PATH = '/usr/local/bin:/usr/bin:/bin';
  return safe;
}
