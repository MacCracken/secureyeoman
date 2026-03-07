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
    throw new Error(`Git URL protocol not allowed: ${parsed.protocol} (use https:// or file://)`);
  }
}

/**
 * Returns true if localPath exists and contains a valid git repository.
 */
async function isGitRepo(localPath: string, timeoutMs: number): Promise<boolean> {
  try {
    await execFileAsync('git', ['-C', localPath, 'rev-parse', '--git-dir'], { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

/**
 * Clone to a temp sibling directory then copy all contents into localPath.
 * Used when localPath exists but cannot be removed (e.g. it is a Docker volume
 * mount point). Cleans up the temp directory on success or failure.
 */
async function cloneIntoExisting(
  repoUrl: string,
  localPath: string,
  logger: SecureLogger,
  opts: { timeout: number }
): Promise<void> {
  const tmpPath = localPath + '.clone-tmp';
  // Clean up any leftover temp dir from a previous failed attempt
  if (fs.existsSync(tmpPath)) {
    fs.rmSync(tmpPath, { recursive: true, force: true });
  }
  try {
    logger.info({ repoUrl, tmpPath }, 'Git cloning community repo to temp path');
    await execFileAsync('git', ['clone', '--depth=1', repoUrl, tmpPath], opts);
    logger.info({ tmpPath, localPath }, 'Copying cloned repo into target path');
    fs.cpSync(tmpPath, localPath, { recursive: true, force: true });
  } finally {
    if (fs.existsSync(tmpPath)) {
      fs.rmSync(tmpPath, { recursive: true, force: true });
    }
  }
}

/**
 * Clone repo if localPath does not exist; pull if it is already a git repo.
 * If localPath exists but is not a git repo (e.g. a stale Docker volume mount),
 * clone to a temp sibling directory and copy the contents in — avoiding any
 * attempt to remove the mount point itself (which would fail with EBUSY).
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
    if (await isGitRepo(localPath, timeoutMs)) {
      logger.info({ localPath }, 'Git pulling community repo');
      await execFileAsync('git', ['-C', localPath, 'pull', '--ff-only'], opts);
    } else {
      logger.warn(
        'Community repo path exists but is not a git repository — cloning into existing directory',
        { localPath }
      );
      await cloneIntoExisting(repoUrl, localPath, logger, opts);
    }
  } else {
    logger.info({ repoUrl, localPath }, 'Git cloning community repo');
    await execFileAsync('git', ['clone', '--depth=1', repoUrl, localPath], opts);
  }
}
