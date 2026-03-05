import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QuarantineStorage } from './quarantine-storage.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { ScanResult } from '@secureyeoman/shared';

function makeScanResult(): ScanResult {
  return {
    artifactId: randomUUID(),
    verdict: 'quarantine',
    findings: [
      {
        id: randomUUID(),
        scanner: 'test-scanner',
        severity: 'high',
        category: 'test',
        message: 'Test finding',
      },
    ],
    worstSeverity: 'high',
    scanDurationMs: 10,
    scannerVersions: { 'test-scanner': '1.0.0' },
    scannedAt: Date.now(),
  };
}

describe('QuarantineStorage', () => {
  let tmpDir: string;
  let storage: QuarantineStorage;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'quarantine-test-'));
    storage = new QuarantineStorage(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('quarantines an artifact and returns metadata', async () => {
    const meta = await storage.quarantine('malicious content', makeScanResult(), {
      artifactType: 'text/javascript',
      sourceContext: 'sandbox.run',
    });
    expect(meta.id).toBeDefined();
    expect(meta.status).toBe('quarantined');
    expect(meta.artifactType).toBe('text/javascript');
    expect(meta.sourceContext).toBe('sandbox.run');
  });

  it('stores personality and user IDs', async () => {
    const meta = await storage.quarantine('content', makeScanResult(), {
      artifactType: 'text/plain',
      sourceContext: 'test',
      personalityId: 'p-123',
      userId: 'u-456',
    });
    expect(meta.personalityId).toBe('p-123');
    expect(meta.userId).toBe('u-456');
  });

  it('lists quarantined items', async () => {
    await storage.quarantine('content1', makeScanResult(), {
      artifactType: 'text/plain',
      sourceContext: 'test',
    });
    await storage.quarantine('content2', makeScanResult(), {
      artifactType: 'text/plain',
      sourceContext: 'test',
    });
    const items = await storage.list();
    expect(items.length).toBe(2);
  });

  it('gets a specific quarantine entry', async () => {
    const meta = await storage.quarantine('content', makeScanResult(), {
      artifactType: 'text/plain',
      sourceContext: 'test',
    });
    const entry = await storage.get(meta.id);
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe(meta.id);
  });

  it('returns null for non-existent entry', async () => {
    const entry = await storage.get('non-existent');
    expect(entry).toBeNull();
  });

  it('retrieves artifact content', async () => {
    const meta = await storage.quarantine('the content', makeScanResult(), {
      artifactType: 'text/plain',
      sourceContext: 'test',
    });
    const buf = await storage.getArtifact(meta.id);
    expect(buf).not.toBeNull();
    expect(buf!.toString('utf-8')).toBe('the content');
  });

  it('retrieves Buffer artifact content', async () => {
    const buf = Buffer.from([0x01, 0x02, 0x03]);
    const meta = await storage.quarantine(buf, makeScanResult(), {
      artifactType: 'application/octet-stream',
      sourceContext: 'test',
    });
    const retrieved = await storage.getArtifact(meta.id);
    expect(retrieved).toEqual(buf);
  });

  it('approves a quarantined entry', async () => {
    const meta = await storage.quarantine('content', makeScanResult(), {
      artifactType: 'text/plain',
      sourceContext: 'test',
    });
    const approved = await storage.approve(meta.id, 'admin@example.com');
    expect(approved).not.toBeNull();
    expect(approved!.status).toBe('approved');
    expect(approved!.approvedBy).toBe('admin@example.com');
    expect(approved!.approvedAt).toBeDefined();
  });

  it('releases an approved entry', async () => {
    const meta = await storage.quarantine('content', makeScanResult(), {
      artifactType: 'text/plain',
      sourceContext: 'test',
    });
    await storage.approve(meta.id, 'admin');
    const released = await storage.release(meta.id);
    expect(released).toBe(true);

    const entry = await storage.get(meta.id);
    expect(entry!.status).toBe('released');
  });

  it('refuses to release unapproved entry', async () => {
    const meta = await storage.quarantine('content', makeScanResult(), {
      artifactType: 'text/plain',
      sourceContext: 'test',
    });
    const released = await storage.release(meta.id);
    expect(released).toBe(false);
  });

  it('deletes a quarantined entry', async () => {
    const meta = await storage.quarantine('content', makeScanResult(), {
      artifactType: 'text/plain',
      sourceContext: 'test',
    });
    const deleted = await storage.delete(meta.id);
    expect(deleted).toBe(true);

    const entry = await storage.get(meta.id);
    expect(entry).toBeNull();
  });

  it('returns empty list when no quarantine directory exists', async () => {
    const freshStorage = new QuarantineStorage(join(tmpDir, 'nonexistent'));
    const items = await freshStorage.list();
    expect(items).toEqual([]);
  });

  it('returns null artifact for non-existent entry', async () => {
    const buf = await storage.getArtifact('nonexistent');
    expect(buf).toBeNull();
  });

  it('sorts list by createdAt descending', async () => {
    await storage.quarantine('first', makeScanResult(), {
      artifactType: 'text/plain',
      sourceContext: 'test',
    });
    // Small delay for timestamp difference
    await new Promise((r) => setTimeout(r, 10));
    await storage.quarantine('second', makeScanResult(), {
      artifactType: 'text/plain',
      sourceContext: 'test',
    });

    const items = await storage.list();
    expect(items[0].createdAt).toBeGreaterThanOrEqual(items[1].createdAt);
  });
});
