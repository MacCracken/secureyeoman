/**
 * Git fetch utility for community skill sync.
 *
 * Security notes:
 * - Only https:// and file:// URLs are permitted (validateGitUrl enforces this).
 * - execFile (not exec) is used to prevent shell injection — arguments are
 *   passed as an array, never concatenated into a shell string.
 * - Operations are bounded by a configurable timeout (default 60 s).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import type { SecureLogger } from '../logging/logger.js';

const execFileAsync = promisify(execFile);

/** Only https:// (remote) and file:// (local dev) are allowed. */
export function validateGitUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid git URL: ${url}`);
  }
  if (!['https:', 'file:'].includes(parsed.protocol)) {
    throw new Error(
      `Git URL protocol not allowed: ${parsed.protocol} (use https:// or file://)`
    );
  }
}

/**
 * Clone repo if localPath does not exist; otherwise git pull --ff-only.
 * Uses execFile (not exec) to prevent shell injection.
 */
export async function gitCloneOrPull(
  repoUrl: string,
  localPath: string,
  logger: SecureLogger,
  timeoutMs = 60_000
): Promise<void> {
  validateGitUrl(repoUrl);
  const opts = { timeout: timeoutMs };
  if (fs.existsSync(localPath)) {
    logger.info('Git pulling community repo', { localPath });
    await execFileAsync('git', ['-C', localPath, 'pull', '--ff-only'], opts);
  } else {
    logger.info('Git cloning community repo', { repoUrl, localPath });
    await execFileAsync('git', ['clone', '--depth=1', repoUrl, localPath], opts);
  }
}
