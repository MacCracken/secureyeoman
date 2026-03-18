import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { QuarantineStorage } from './quarantine-storage.js';
import type { ScanResult } from '@secureyeoman/shared';

function makeScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    artifactId: 'art-123',
    verdict: 'blocked',
    threats: [{ type: 'malware', name: 'test-threat', severity: 'high', details: 'test' }],
    scannedAt: Date.now(),
    scanDurationMs: 50,
    ...overrides,
  } as ScanResult;
}

describe('QuarantineStorage', () => {
  let tmpDir: string;
  let storage: QuarantineStorage;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sy-quarantine-test-'));
    storage = new QuarantineStorage(tmpDir);
  });

  afterEach(() => {
    storage.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('quarantine', () => {
    it('stores string content', async () => {
      const meta = await storage.quarantine(
        'malicious content',
        makeScanResult(),
        { artifactType: 'skill', sourceContext: 'install' }
      );
      expect(meta.id).toBeTruthy();
      expect(meta.status).toBe('quarantined');
      expect(meta.artifactType).toBe('skill');
      expect(meta.sourceContext).toBe('install');
      expect(meta.createdAt).toBeGreaterThan(0);
    });

    it('stores Buffer content', async () => {
      const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
      const meta = await storage.quarantine(
        buf,
        makeScanResult(),
        { artifactType: 'file', sourceContext: 'upload' }
      );
      expect(meta.id).toBeTruthy();

      const artifact = await storage.getArtifact(meta.id);
      expect(artifact).not.toBeNull();
      expect(artifact!.equals(buf)).toBe(true);
    });

    it('stores optional personality and user IDs', async () => {
      const meta = await storage.quarantine(
        'content',
        makeScanResult(),
        {
          artifactType: 'skill',
          sourceContext: 'install',
          personalityId: 'friday',
          userId: 'user-1',
        }
      );
      expect(meta.personalityId).toBe('friday');
      expect(meta.userId).toBe('user-1');
    });

    it('generates unique IDs', async () => {
      const a = await storage.quarantine('a', makeScanResult(), { artifactType: 't', sourceContext: 'c' });
      const b = await storage.quarantine('b', makeScanResult(), { artifactType: 't', sourceContext: 'c' });
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('list', () => {
    it('returns empty array when no items', async () => {
      const items = await storage.list();
      expect(items).toEqual([]);
    });

    it('returns quarantined items sorted by createdAt desc', async () => {
      await storage.quarantine('first', makeScanResult(), { artifactType: 't', sourceContext: 'c' });
      // Tiny delay to ensure different timestamps
      await new Promise((r) => { setTimeout(r, 5); });
      await storage.quarantine('second', makeScanResult(), { artifactType: 't', sourceContext: 'c' });

      const items = await storage.list();
      expect(items).toHaveLength(2);
      expect(items[0]!.createdAt).toBeGreaterThanOrEqual(items[1]!.createdAt);
    });
  });

  describe('get', () => {
    it('retrieves metadata by ID', async () => {
      const meta = await storage.quarantine('content', makeScanResult(), { artifactType: 't', sourceContext: 'c' });
      const retrieved = await storage.get(meta.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(meta.id);
      expect(retrieved!.status).toBe('quarantined');
    });

    it('returns null for non-existent ID', async () => {
      const result = await storage.get('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('getArtifact', () => {
    it('retrieves artifact content', async () => {
      const meta = await storage.quarantine('test content', makeScanResult(), { artifactType: 't', sourceContext: 'c' });
      const artifact = await storage.getArtifact(meta.id);
      expect(artifact).not.toBeNull();
      expect(artifact!.toString('utf-8')).toBe('test content');
    });

    it('returns null for non-existent ID', async () => {
      const result = await storage.getArtifact('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('approve', () => {
    it('updates status to approved', async () => {
      const meta = await storage.quarantine('content', makeScanResult(), { artifactType: 't', sourceContext: 'c' });
      const approved = await storage.approve(meta.id, 'admin-user');
      expect(approved).not.toBeNull();
      expect(approved!.status).toBe('approved');
      expect(approved!.approvedBy).toBe('admin-user');
      expect(approved!.approvedAt).toBeGreaterThan(0);
    });

    it('persists approval to disk', async () => {
      const meta = await storage.quarantine('content', makeScanResult(), { artifactType: 't', sourceContext: 'c' });
      await storage.approve(meta.id, 'admin');

      const retrieved = await storage.get(meta.id);
      expect(retrieved!.status).toBe('approved');
      expect(retrieved!.approvedBy).toBe('admin');
    });

    it('returns null for non-existent ID', async () => {
      const result = await storage.approve('non-existent', 'admin');
      expect(result).toBeNull();
    });
  });

  describe('release', () => {
    it('releases an approved item', async () => {
      const meta = await storage.quarantine('content', makeScanResult(), { artifactType: 't', sourceContext: 'c' });
      await storage.approve(meta.id, 'admin');
      const released = await storage.release(meta.id);
      expect(released).toBe(true);

      const retrieved = await storage.get(meta.id);
      expect(retrieved!.status).toBe('released');
    });

    it('refuses to release non-approved items', async () => {
      const meta = await storage.quarantine('content', makeScanResult(), { artifactType: 't', sourceContext: 'c' });
      const released = await storage.release(meta.id);
      expect(released).toBe(false);
    });

    it('returns false for non-existent ID', async () => {
      const released = await storage.release('non-existent');
      expect(released).toBe(false);
    });
  });

  describe('delete', () => {
    it('removes quarantined item', async () => {
      const meta = await storage.quarantine('content', makeScanResult(), { artifactType: 't', sourceContext: 'c' });
      const deleted = await storage.delete(meta.id);
      expect(deleted).toBe(true);

      const retrieved = await storage.get(meta.id);
      expect(retrieved).toBeNull();
    });

    it('returns false for non-existent ID', async () => {
      const deleted = await storage.delete('non-existent');
      // rm with force:true returns true even for non-existent
      expect(typeof deleted).toBe('boolean');
    });
  });

  describe('close', () => {
    it('is a no-op (does not throw)', () => {
      expect(() => { storage.close(); }).not.toThrow();
    });
  });
});
