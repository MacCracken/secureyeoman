/**
 * Log Rotation Manager
 *
 * Rotates JSONL log files when they exceed size or age thresholds.
 * Optionally compresses rotated files with gzip and cleans up
 * files older than a configurable retention period.
 */

import {
  statSync,
  renameSync,
  readdirSync,
  unlinkSync,
  createReadStream,
  createWriteStream,
} from 'node:fs';
import { join, basename } from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

export interface LogRotationConfig {
  /** Maximum file size in bytes before rotation (default 50 MB). */
  maxSizeBytes?: number;
  /** Maximum age in days before rotation (default 1). */
  maxAgeDays?: number;
  /** How many days to keep rotated files (default 30). */
  retentionDays?: number;
  /** Whether to gzip rotated files (default false). */
  compressRotated?: boolean;
}

const DEFAULTS: Required<LogRotationConfig> = {
  maxSizeBytes: 50 * 1024 * 1024,
  maxAgeDays: 1,
  retentionDays: 30,
  compressRotated: false,
};

export class LogRotator {
  private readonly config: Required<LogRotationConfig>;

  constructor(config: LogRotationConfig = {}) {
    this.config = { ...DEFAULTS, ...config };
  }

  /**
   * Check whether the file at `filePath` needs rotation based on
   * size and age thresholds.  Returns false if the file does not exist.
   */
  needsRotation(filePath: string): boolean {
    let stat;
    try {
      stat = statSync(filePath);
    } catch {
      return false;
    }

    if (stat.size >= this.config.maxSizeBytes) {
      return true;
    }

    const ageMs = Date.now() - stat.mtimeMs;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays >= this.config.maxAgeDays) {
      return true;
    }

    return false;
  }

  /**
   * Rotate the file by renaming it with a timestamp suffix.
   * If `compressRotated` is enabled the renamed file is then gzipped
   * and the uncompressed copy is removed.
   *
   * Returns the path of the rotated (possibly compressed) file.
   */
  async rotate(filePath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedPath = `${filePath}.${timestamp}`;

    renameSync(filePath, rotatedPath);

    if (this.config.compressRotated) {
      const gzPath = `${rotatedPath}.gz`;
      await pipeline(
        createReadStream(rotatedPath),
        createGzip(),
        createWriteStream(gzPath),
      );
      unlinkSync(rotatedPath);
      return gzPath;
    }

    return rotatedPath;
  }

  /**
   * Remove rotated log files in `directory` that are older than
   * `retentionDays`.  Only considers files whose names contain a
   * timestamp pattern typical of rotated logs.
   */
  cleanup(directory: string): number {
    const cutoff = Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000;
    let removed = 0;

    let entries: string[];
    try {
      entries = readdirSync(directory);
    } catch {
      return 0;
    }

    for (const name of entries) {
      // Match rotated file pattern: anything with an ISO-ish timestamp suffix
      if (!/\.\d{4}-\d{2}-\d{2}T/.test(name)) {
        continue;
      }

      const fullPath = join(directory, name);
      try {
        const stat = statSync(fullPath);
        if (stat.mtimeMs < cutoff) {
          unlinkSync(fullPath);
          removed++;
        }
      } catch {
        // File may have been removed concurrently; ignore.
      }
    }

    return removed;
  }
}
