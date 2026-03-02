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

    it('should skip files that do not match rotated timestamp pattern', () => {
      const rotator = new LogRotator({ retentionDays: 1 });

      // Create a regular file that does NOT have a timestamp suffix
      const regularFile = join(tmpDir, 'app.log');
      writeFileSync(regularFile, 'current');
      const oldDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      utimesSync(regularFile, oldDate, oldDate);

      // Create a file with a non-matching name pattern
      const otherFile = join(tmpDir, 'notes.txt');
      writeFileSync(otherFile, 'random');
      utimesSync(otherFile, oldDate, oldDate);

      const removed = rotator.cleanup(tmpDir);
      expect(removed).toBe(0);
      expect(existsSync(regularFile)).toBe(true);
      expect(existsSync(otherFile)).toBe(true);
    });

    it('does not remove rotated files within retention window', () => {
      const rotator = new LogRotator({ retentionDays: 30 });

      // Create a rotated file that is recent (should NOT be removed)
      const recentRotated = join(tmpDir, 'app.log.2026-03-01T10-30-00-000Z');
      writeFileSync(recentRotated, 'data');
      // It was just created, so mtime is now, well within 30 days

      const removed = rotator.cleanup(tmpDir);
      expect(removed).toBe(0);
      expect(existsSync(recentRotated)).toBe(true);
    });

    it('handles compressed (.gz) rotated files', () => {
      const rotator = new LogRotator({ retentionDays: 7 });

      const oldGz = join(tmpDir, 'app.log.2024-06-15T12-00-00-000Z.gz');
      writeFileSync(oldGz, 'compressed');
      const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      utimesSync(oldGz, oldDate, oldDate);

      const removed = rotator.cleanup(tmpDir);
      expect(removed).toBe(1);
      expect(existsSync(oldGz)).toBe(false);
    });

    it('handles multiple old rotated files', () => {
      const rotator = new LogRotator({ retentionDays: 1 });
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      const file1 = join(tmpDir, 'app.log.2024-01-01T00-00-00-000Z');
      const file2 = join(tmpDir, 'app.log.2024-01-02T00-00-00-000Z');
      const file3 = join(tmpDir, 'app.log.2024-01-03T00-00-00-000Z');
      writeFileSync(file1, 'old1');
      writeFileSync(file2, 'old2');
      writeFileSync(file3, 'old3');
      utimesSync(file1, oldDate, oldDate);
      utimesSync(file2, oldDate, oldDate);
      utimesSync(file3, oldDate, oldDate);

      const removed = rotator.cleanup(tmpDir);
      expect(removed).toBe(3);
    });
  });

  describe('constructor defaults', () => {
    it('uses sensible defaults when no config is provided', () => {
      const rotator = new LogRotator();
      // We cannot inspect private config directly, but we can verify behavior:
      // A small fresh file should not need rotation (default maxSizeBytes=50MB, maxAgeDays=1)
      const filePath = join(tmpDir, 'default.log');
      writeFileSync(filePath, 'small');
      expect(rotator.needsRotation(filePath)).toBe(false);
    });

    it('accepts partial config, using defaults for omitted fields', () => {
      const rotator = new LogRotator({ maxSizeBytes: 10 });
      const filePath = join(tmpDir, 'partial.log');
      writeFileSync(filePath, 'this is bigger than 10 bytes');
      expect(rotator.needsRotation(filePath)).toBe(true);
    });
  });

  describe('needsRotation — edge cases', () => {
    it('returns true when file size equals maxSizeBytes exactly', () => {
      const rotator = new LogRotator({ maxSizeBytes: 5, maxAgeDays: 999 });
      const filePath = join(tmpDir, 'exact.log');
      writeFileSync(filePath, '12345'); // exactly 5 bytes
      expect(rotator.needsRotation(filePath)).toBe(true);
    });

    it('returns false when file size is one byte below threshold', () => {
      const rotator = new LogRotator({ maxSizeBytes: 10, maxAgeDays: 999 });
      const filePath = join(tmpDir, 'below.log');
      writeFileSync(filePath, '123456789'); // 9 bytes, below 10
      expect(rotator.needsRotation(filePath)).toBe(false);
    });
  });

  describe('rotate — timestamp format', () => {
    it('rotated file path contains an ISO-like timestamp', async () => {
      const rotator = new LogRotator({ compressRotated: false });
      const filePath = join(tmpDir, 'ts.log');
      writeFileSync(filePath, 'data');

      const rotatedPath = await rotator.rotate(filePath);
      // Should match pattern like ts.log.2026-03-01T...
      expect(rotatedPath).toMatch(/ts\.log\.\d{4}-\d{2}-\d{2}T/);
    });
  });
});
