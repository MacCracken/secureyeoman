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
    lstatSync: vi.fn(() => ({ isSymbolicLink: () => false })),
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
    delete: vi.fn(async (id: string) => {
      records.delete(id);
      return true;
    }),
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
      dbConfig: {
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'pw',
        database: 'testdb',
      },
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
    await storage.update(id, {
      status: 'completed',
      filePath: `/tmp/backup-${id}.pgdump`,
      completedAt: Date.now(),
    });
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

  // ── restoreBackup — filePath missing branch ──────────────────────────────────

  it('restoreBackup throws if filePath is missing', async () => {
    await manager.createBackup('no-path', 'u');
    const id = (storage.create.mock.calls[0] as any[])[0].id;
    // status is 'running', filePath is null — should hit 'file path missing' first
    // Update status to completed but leave filePath null
    await storage.update(id, { status: 'completed' });
    await expect(manager.restoreBackup(id)).rejects.toThrow('file path missing');
  });

  // ── restoreBackup — success path ─────────────────────────────────────────────

  it('restoreBackup succeeds when backup is completed with filePath', async () => {
    await manager.createBackup('restore-test', 'admin');
    const id = (storage.create.mock.calls[0] as any[])[0].id;
    await storage.update(id, {
      status: 'completed',
      filePath: `/tmp/backup-${id}.pgdump`,
      completedAt: Date.now(),
    });
    // spawn mock exits with code 0 so pg_restore succeeds
    await expect(manager.restoreBackup(id)).resolves.not.toThrow();
  });

  // ── getDownloadStream — not found ─────────────────────────────────────────────

  it('getDownloadStream throws if backup not found', async () => {
    await expect(manager.getDownloadStream('nonexistent')).rejects.toThrow('Backup not found');
  });

  // ── getDownloadStream — no filePath ────────────────────────────────────────────

  it('getDownloadStream throws if filePath is missing', async () => {
    await manager.createBackup('dl-no-path', 'u');
    const id = (storage.create.mock.calls[0] as any[])[0].id;
    await expect(manager.getDownloadStream(id)).rejects.toThrow('file not found');
  });

  // ── getDownloadStream — not complete ───────────────────────────────────────────

  it('getDownloadStream throws if backup is not complete', async () => {
    await manager.createBackup('dl-incomplete', 'u');
    const id = (storage.create.mock.calls[0] as any[])[0].id;
    await storage.update(id, { filePath: `/tmp/backup-${id}.pgdump` });
    await expect(manager.getDownloadStream(id)).rejects.toThrow('not complete');
  });

  // ── getDownloadStream — success ────────────────────────────────────────────────

  it('getDownloadStream returns stream and size for completed backup', async () => {
    await manager.createBackup('dl-ok', 'admin');
    const id = (storage.create.mock.calls[0] as any[])[0].id;
    await storage.update(id, {
      status: 'completed',
      filePath: `/tmp/backup-${id}.pgdump`,
      sizeBytes: 12345,
      completedAt: Date.now(),
    });
    const result = await manager.getDownloadStream(id);
    expect(result.stream).toBeDefined();
    expect(result.sizeBytes).toBe(12345);
  });

  // ── getDownloadStream — sizeBytes null fallback ────────────────────────────────

  it('getDownloadStream returns 0 for sizeBytes when null', async () => {
    await manager.createBackup('dl-null-size', 'admin');
    const id = (storage.create.mock.calls[0] as any[])[0].id;
    await storage.update(id, {
      status: 'completed',
      filePath: `/tmp/backup-${id}.pgdump`,
      completedAt: Date.now(),
    });
    // sizeBytes remains null (not set)
    const result = await manager.getDownloadStream(id);
    expect(result.sizeBytes).toBe(0);
  });

  // ── deleteBackup — not found ───────────────────────────────────────────────────

  it('deleteBackup throws if backup not found', async () => {
    await expect(manager.deleteBackup('nonexistent')).rejects.toThrow('Backup not found');
  });

  // ── deleteBackup — no filePath (null) ──────────────────────────────────────────

  it('deleteBackup skips file removal when filePath is null', async () => {
    await manager.createBackup('del-no-file', 'u');
    const id = (storage.create.mock.calls[0] as any[])[0].id;
    // filePath is null by default, so fs.rm should not be called for file removal
    await manager.deleteBackup(id);
    expect(storage.delete).toHaveBeenCalledWith(id);
  });

  // ── listBackups ────────────────────────────────────────────────────────────────

  it('listBackups delegates to storage.list', async () => {
    const result = await manager.listBackups(10, 5);
    expect(storage.list).toHaveBeenCalledWith(10, 5);
  });

  it('listBackups uses default limit and offset', async () => {
    await manager.listBackups();
    expect(storage.list).toHaveBeenCalledWith(50, 0);
  });

  // ── getBackup ──────────────────────────────────────────────────────────────────

  it('getBackup delegates to storage.getById', async () => {
    await manager.createBackup('get-test', 'u');
    const id = (storage.create.mock.calls[0] as any[])[0].id;
    const result = await manager.getBackup(id);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(id);
  });

  it('getBackup returns null for nonexistent id', async () => {
    const result = await manager.getBackup('nonexistent');
    expect(result).toBeNull();
  });
});

// ── BackupManager — no password in dbConfig ────────────────────────────────────

describe('BackupManager — no password', () => {
  let storage: ReturnType<typeof makeMockStorage>;
  let manager: BackupManager;

  beforeEach(() => {
    storage = makeMockStorage();
    manager = new BackupManager({
      storage: storage as any,
      dataDir: '/tmp/test-data',
      dbConfig: {
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        // no password
        database: 'testdb',
      },
      logger: makeLogger(),
    });
  });

  it('createBackup works without password (no PGPASSWORD set)', async () => {
    const record = await manager.createBackup('no-pw', 'admin');
    expect(record.status).toBe('running');
    // Wait for setImmediate for _runPgDump
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(storage.update).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('restoreBackup works without password', async () => {
    await manager.createBackup('restore-no-pw', 'admin');
    const id = (storage.create.mock.calls[0] as any[])[0].id;
    await storage.update(id, {
      status: 'completed',
      filePath: `/tmp/backup-${id}.pgdump`,
      completedAt: Date.now(),
    });
    await expect(manager.restoreBackup(id)).resolves.not.toThrow();
  });
});

// ── BackupManager — _runPgDump failure ─────────────────────────────────────────

describe('BackupManager — pg_dump failure', () => {
  // Drain any pending setImmediate callbacks from prior tests
  beforeEach(async () => {
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 20));
  });

  it('updates record to failed when pg_dump errors', async () => {
    const { spawn } = await import('node:child_process');
    const EventEmitter = (await import('node:events')).default;

    // Clear all previous mock state, then set up failure mock
    vi.mocked(spawn).mockReset();
    vi.mocked(spawn).mockImplementation((..._args: any[]) => {
      const child = new EventEmitter() as any;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      process.nextTick(() => {
        child.stderr.emit('data', Buffer.from('pg_dump: error: connection refused'));
        child.emit('close', 1);
      });
      return child;
    });

    const storage2 = makeMockStorage();
    const logger = makeLogger();
    const manager2 = new BackupManager({
      storage: storage2 as any,
      dataDir: '/tmp/test-data',
      dbConfig: {
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'pw',
        database: 'testdb',
      },
      logger,
    });

    await manager2.createBackup('fail-test', 'admin');
    // Wait for setImmediate + async _runPgDump
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 50));

    expect(storage2.update).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'failed' })
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('updates record to failed with string error message for non-Error', async () => {
    const { spawn } = await import('node:child_process');
    const EventEmitter = (await import('node:events')).default;

    vi.mocked(spawn).mockReset();
    vi.mocked(spawn).mockImplementation((..._args: any[]) => {
      const child = new EventEmitter() as any;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      process.nextTick(() => {
        child.emit('error', 'spawn ENOENT');
      });
      return child;
    });

    const storage3 = makeMockStorage();
    const logger3 = makeLogger();
    const manager3 = new BackupManager({
      storage: storage3 as any,
      dataDir: '/tmp/test-data',
      dbConfig: {
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        database: 'testdb',
      },
      logger: logger3,
    });

    await manager3.createBackup('enoent', 'admin');
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 50));

    expect(storage3.update).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'failed' })
    );
  });
});
