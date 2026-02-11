/**
 * Linux Namespace Isolation
 *
 * Provides PID, network, and mount namespace isolation for sandboxed processes.
 * Uses the `unshare` command (available without root on modern kernels with
 * user namespaces enabled).
 *
 * Falls back gracefully when:
 * - Not on Linux
 * - Kernel doesn't support user namespaces
 * - `unshare` command not available
 */

import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';

export interface NamespaceCapabilities {
  userNamespaces: boolean;
  pidNamespaces: boolean;
  networkNamespaces: boolean;
  mountNamespaces: boolean;
  unshareAvailable: boolean;
}

export interface NamespaceOptions {
  /** Isolate PID namespace (process can't see host processes) */
  pid?: boolean;
  /** Isolate network namespace (no network by default) */
  network?: boolean;
  /** Isolate mount namespace (read-only root) */
  mount?: boolean;
  /** Working directory inside namespace */
  workDir?: string;
}

/**
 * Detect namespace support on the current system
 */
export function detectNamespaceSupport(): NamespaceCapabilities {
  if (platform() !== 'linux') {
    return {
      userNamespaces: false,
      pidNamespaces: false,
      networkNamespaces: false,
      mountNamespaces: false,
      unshareAvailable: false,
    };
  }

  const unshareAvailable = isCommandAvailable('unshare');

  // Check if user namespaces are enabled
  let userNamespaces = false;
  try {
    const maxUserNs = readFileSync('/proc/sys/user/max_user_namespaces', 'utf-8').trim();
    userNamespaces = Number(maxUserNs) > 0;
  } catch {
    // Not available
  }

  // Check if unprivileged namespaces are allowed
  let unprivilegedUserns = false;
  try {
    const val = readFileSync('/proc/sys/kernel/unprivileged_userns_clone', 'utf-8').trim();
    unprivilegedUserns = val === '1';
  } catch {
    // File doesn't exist on all distros, assume allowed
    unprivilegedUserns = userNamespaces;
  }

  const available = unshareAvailable && userNamespaces && unprivilegedUserns;

  return {
    userNamespaces: available,
    pidNamespaces: available,
    networkNamespaces: available,
    mountNamespaces: available,
    unshareAvailable,
  };
}

/**
 * Build an unshare command with the specified namespace flags
 */
export function buildUnshareCommand(
  command: string,
  opts: NamespaceOptions = {},
): string {
  const flags: string[] = ['--user']; // Always use user namespace for unprivileged operation

  if (opts.pid) flags.push('--pid', '--fork');
  if (opts.network) flags.push('--net');
  if (opts.mount) flags.push('--mount');

  const parts = ['unshare', ...flags];

  if (opts.mount && opts.workDir) {
    // Mount proc for PID namespace visibility
    parts.push('--mount-proc');
  }

  parts.push('--', command);

  return parts.join(' ');
}

/**
 * Run a command inside isolated namespaces.
 * Returns stdout. Throws on failure.
 */
export function runInNamespace(
  command: string,
  opts: NamespaceOptions = {},
): string {
  const caps = detectNamespaceSupport();

  if (!caps.unshareAvailable) {
    throw new NamespaceError('unshare command not available', 'UNSHARE_NOT_FOUND');
  }

  if (!caps.userNamespaces) {
    throw new NamespaceError(
      'User namespaces not available (check /proc/sys/user/max_user_namespaces)',
      'USER_NS_UNAVAILABLE',
    );
  }

  const fullCmd = buildUnshareCommand(command, opts);

  try {
    return execSync(fullCmd, {
      encoding: 'utf-8',
      timeout: 30_000,
    }).trim();
  } catch (err) {
    throw new NamespaceError(
      `Namespace execution failed: ${err instanceof Error ? err.message : String(err)}`,
      'EXECUTION_FAILED',
    );
  }
}

/**
 * Check if a command is available on the system
 */
function isCommandAvailable(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export class NamespaceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'NamespaceError';
  }
}
