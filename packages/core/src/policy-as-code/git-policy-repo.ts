/**
 * Git Policy Repository — reads policy bundles from a local git repo.
 *
 * Discovers bundles in the configured directory, reads policy files,
 * and provides git metadata (commit SHA, branch, diff).
 */

import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { promisify } from 'node:util';
import type { PolicyRepoConfig, PolicyLanguage, BundleMetadata } from '@secureyeoman/shared';

const execFileAsync = promisify(execFile);

export interface DiscoveredBundle {
  name: string;
  dir: string;
  metadata: BundleMetadata;
  files: { path: string; language: PolicyLanguage; source: string }[];
}

export interface GitInfo {
  commitSha: string;
  branch: string;
  shortSha: string;
}

export class GitPolicyRepo {
  private readonly repoPath: string;
  private readonly bundleDir: string;
  private readonly branch: string;

  constructor(config: PolicyRepoConfig) {
    this.repoPath = config.repoPath;
    this.bundleDir = config.bundleDir;
    this.branch = config.branch;
  }

  /** Get current git info (commit SHA, branch). */
  async getGitInfo(): Promise<GitInfo> {
    try {
      const [shaResult, branchResult] = await Promise.all([
        execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: this.repoPath }),
        execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: this.repoPath }),
      ]);
      const commitSha = shaResult.stdout.trim();
      return {
        commitSha,
        branch: branchResult.stdout.trim(),
        shortSha: commitSha.slice(0, 8),
      };
    } catch {
      return { commitSha: '', branch: this.branch, shortSha: '' };
    }
  }

  /** Pull latest changes from remote. */
  async pull(): Promise<{ updated: boolean; commitSha: string }> {
    const before = await this.getGitInfo();
    try {
      await execFileAsync('git', ['pull', '--ff-only', 'origin', this.branch], {
        cwd: this.repoPath,
      });
    } catch (err) {
      throw new Error(`Git pull failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
    const after = await this.getGitInfo();
    return { updated: before.commitSha !== after.commitSha, commitSha: after.commitSha };
  }

  /**
   * Discover all bundles in the configured bundle directory.
   * Each subdirectory is treated as a bundle. A bundle.json metadata
   * file is expected in each.
   */
  async discoverBundles(): Promise<DiscoveredBundle[]> {
    const bundlesRoot = join(this.repoPath, this.bundleDir);

    let entries: string[];
    try {
      entries = await readdir(bundlesRoot);
    } catch {
      return [];
    }

    const bundles: DiscoveredBundle[] = [];

    for (const entry of entries) {
      const bundlePath = join(bundlesRoot, entry);
      const s = await stat(bundlePath).catch(() => null);
      if (!s?.isDirectory()) continue;

      try {
        const bundle = await this.readBundle(entry, bundlePath);
        bundles.push(bundle);
      } catch {
        // Skip invalid bundles
      }
    }

    return bundles;
  }

  /** Read a single bundle from a directory. */
  private async readBundle(name: string, dir: string): Promise<DiscoveredBundle> {
    // Read metadata from bundle.json
    let metadata: BundleMetadata;
    try {
      const raw = await readFile(join(dir, 'bundle.json'), 'utf-8');
      const parsed = JSON.parse(raw);
      metadata = {
        name: parsed.name ?? name,
        version: parsed.version ?? '0.0.0',
        description: parsed.description ?? '',
        author: parsed.author ?? '',
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        enforcement: parsed.enforcement ?? 'warn',
      };
    } catch {
      metadata = {
        name,
        version: '0.0.0',
        description: '',
        author: '',
        tags: [],
        enforcement: 'warn',
      };
    }

    // Recursively discover policy files (.rego, .cel)
    const files = await this.discoverFiles(dir, dir);

    return { name, dir, metadata, files };
  }

  /** Recursively discover policy files in a directory. */
  private async discoverFiles(
    rootDir: string,
    currentDir: string
  ): Promise<{ path: string; language: PolicyLanguage; source: string }[]> {
    const entries = await readdir(currentDir);
    const files: { path: string; language: PolicyLanguage; source: string }[] = [];

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const s = await stat(fullPath).catch(() => null);
      if (!s) continue;

      if (s.isDirectory()) {
        const subFiles = await this.discoverFiles(rootDir, fullPath);
        files.push(...subFiles);
        continue;
      }

      const ext = extname(entry).toLowerCase();
      let language: PolicyLanguage | null = null;
      if (ext === '.rego') language = 'rego';
      else if (ext === '.cel') language = 'cel';

      if (language) {
        const source = await readFile(fullPath, 'utf-8');
        const relPath = relative(rootDir, fullPath);
        files.push({ path: relPath, language, source });
      }
    }

    return files;
  }

  /** Get diff between two commits. */
  async getDiff(fromSha: string, toSha: string): Promise<string> {
    try {
      const result = await execFileAsync(
        'git',
        ['diff', '--stat', fromSha, toSha, '--', this.bundleDir],
        { cwd: this.repoPath }
      );
      return result.stdout;
    } catch {
      return '';
    }
  }
}
