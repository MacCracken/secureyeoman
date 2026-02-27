import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BackupRecord } from './backup-storage.js';

// Mock child_process.spawn
vi.mock('node:child_process', () => {
  const EventEmitter = require('node:events');
  function makeMockSpawn(exitCode: number = 0) {
    return vi.fn(() => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      process.nextTick(() => child.emit('close', exitCode));
      return child;
    });
  }
  return { spawn: makeMockSpawn(0) };
});

// Mock fs promises
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: vi.fn().mockResolvedValue(undefined),
      stat: vi.fn().mockResolvedValue({ size: 98765 }),
      rm: vi.fn().mockResolvedValue(undefined),
    },
    createReadStream: vi.fn(() => {
      const { EventEmitter } = require('node:events');
      const stream = new EventEmitter();
      (stream as any).pipe = vi.fn();
      return stream;
    }),
  };
});

import { BackupManager } from './backup-manager.js';

function makeMockStorage() {
  const records = new Map<string, BackupRecord>();
  return {
    create: vi.fn(async (data: any) => {
      const rec: BackupRecord = {
        id: data.id,
        label: data.label,
        status: data.status,
        sizeBytes: null,
        filePath: null,
        error: null,
        pgDumpVersion: null,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        completedAt: null,
      };
      records.set(data.id, rec);
      return rec;
    }),
    update: vi.fn(async (id: string, patch: any) => {
      const rec = records.get(id);
      if (!rec) return null;
      if (patch.status !== undefined) rec.status = patch.status;
      if (patch.sizeBytes !== undefined) rec.sizeBytes = patch.sizeBytes;
      if (patch.filePath !== undefined) rec.filePath = patch.filePath;
      if (patch.error !== undefined) rec.error = patch.error;
      if (patch.completedAt !== undefined) rec.completedAt = patch.completedAt;
      records.set(id, rec);
      return rec;
    }),
    list: vi.fn(async () => ({ records: Array.from(records.values()), total: records.size })),
    getById: vi.fn(async (id: string) => records.get(id) ?? null),
    delete: vi.fn(async (id: string) => { records.delete(id); return true; }),
  };
}

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
}

describe('BackupManager', () => {
  let storage: ReturnType<typeof makeMockStorage>;
  let manager: BackupManager;

  beforeEach(() => {
    storage = makeMockStorage();
    manager = new BackupManager({
      storage: storage as any,
      dataDir: '/tmp/test-data',
      dbConfig: { host: 'localhost', port: 5432, user: 'postgres', password: 'pw', database: 'testdb' },
      logger: makeLogger(),
    });
  });

  it('createBackup creates a record with status running', async () => {
    const record = await manager.createBackup('my label', 'admin');
    expect(record.status).toBe('running');
    expect(record.label).toBe('my label');
    expect(storage.create).toHaveBeenCalledOnce();
  });

  it('createBackup eventually updates status to completed', async () => {
    await manager.createBackup('test', 'admin');
    // Wait for setImmediate callback
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(storage.update).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'completed', sizeBytes: 98765 })
    );
  });

  it('deleteBackup removes file and record', async () => {
    await manager.createBackup('del', 'u');
    const id = (storage.create.mock.calls[0] as any[])[0].id;
    // Set completed state with file path
    await storage.update(id, { status: 'completed', filePath: `/tmp/backup-${id}.pgdump`, completedAt: Date.now() });
    await manager.deleteBackup(id);
    expect(storage.delete).toHaveBeenCalledWith(id);
  });

  it('restoreBackup throws if backup not found', async () => {
    await expect(manager.restoreBackup('nonexistent')).rejects.toThrow('Backup not found');
  });

  it('restoreBackup throws if backup not completed', async () => {
    await manager.createBackup('r', 'u');
    const id = (storage.create.mock.calls[0] as any[])[0].id;
    // Set a filePath so the status check is reached
    await storage.update(id, { filePath: `/tmp/backup-${id}.pgdump` });
    await expect(manager.restoreBackup(id)).rejects.toThrow('not in completed state');
  });
});
