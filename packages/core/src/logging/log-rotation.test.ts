import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  utimesSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LogRotator } from './log-rotation.js';

describe('LogRotator', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'log-rotation-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('needsRotation', () => {
    it('should return true when file exceeds maxSizeBytes', () => {
      const rotator = new LogRotator({ maxSizeBytes: 100, maxAgeDays: 999 });
      const filePath = join(tmpDir, 'big.log');
      writeFileSync(filePath, 'x'.repeat(200));

      expect(rotator.needsRotation(filePath)).toBe(true);
    });

    it('should return true when file exceeds maxAgeDays', () => {
      const rotator = new LogRotator({ maxSizeBytes: 999_999, maxAgeDays: 1 });
      const filePath = join(tmpDir, 'old.log');
      writeFileSync(filePath, 'data');

      // Back-date the file by 2 days
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      utimesSync(filePath, twoDaysAgo, twoDaysAgo);

      expect(rotator.needsRotation(filePath)).toBe(true);
    });

    it('should return false when file is within thresholds', () => {
      const rotator = new LogRotator({ maxSizeBytes: 999_999, maxAgeDays: 999 });
      const filePath = join(tmpDir, 'small.log');
      writeFileSync(filePath, 'small');

      expect(rotator.needsRotation(filePath)).toBe(false);
    });

    it('should return false for non-existent file', () => {
      const rotator = new LogRotator();
      expect(rotator.needsRotation(join(tmpDir, 'nope.log'))).toBe(false);
    });
  });

  describe('rotate', () => {
    it('should rename the file with a timestamp suffix', async () => {
      const rotator = new LogRotator({ compressRotated: false });
      const filePath = join(tmpDir, 'app.log');
      writeFileSync(filePath, 'original content');

      const rotatedPath = await rotator.rotate(filePath);

      expect(existsSync(filePath)).toBe(false);
      expect(existsSync(rotatedPath)).toBe(true);
      expect(rotatedPath).toContain('app.log.');
      expect(readFileSync(rotatedPath, 'utf-8')).toBe('original content');
    });

    it('should compress rotated file when compressRotated is true', async () => {
      const rotator = new LogRotator({ compressRotated: true });
      const filePath = join(tmpDir, 'compress.log');
      writeFileSync(filePath, 'compress me');

      const rotatedPath = await rotator.rotate(filePath);

      expect(rotatedPath).toMatch(/\.gz$/);
      expect(existsSync(rotatedPath)).toBe(true);
      expect(existsSync(filePath)).toBe(false);
      // The gz file should be non-empty
      expect(statSync(rotatedPath).size).toBeGreaterThan(0);
    });
  });

  describe('cleanup', () => {
    it('should remove rotated files older than retentionDays', () => {
      const rotator = new LogRotator({ retentionDays: 7 });

      // Create a file that looks like a rotated log with an old mtime
      const oldFile = join(tmpDir, 'app.log.2024-01-01T00-00-00-000Z');
      writeFileSync(oldFile, 'old');
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      utimesSync(oldFile, tenDaysAgo, tenDaysAgo);

      // Create a recent rotated file
      const recentFile = join(tmpDir, 'app.log.2025-06-01T12-00-00-000Z');
      writeFileSync(recentFile, 'recent');

      const removed = rotator.cleanup(tmpDir);

      expect(removed).toBe(1);
      expect(existsSync(oldFile)).toBe(false);
      expect(existsSync(recentFile)).toBe(true);
    });

    it('should return 0 for a non-existent directory', () => {
      const rotator = new LogRotator();
      expect(rotator.cleanup(join(tmpDir, 'nope'))).toBe(0);
    });
  });
});
