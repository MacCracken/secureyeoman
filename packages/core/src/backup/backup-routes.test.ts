import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerBackupRoutes } from './backup-routes.js';
import type { BackupRecord } from './backup-storage.js';

const MOCK_BACKUP: BackupRecord = {
  id: 'backup-001',
  label: 'test',
  status: 'completed',
  sizeBytes: 1024,
  filePath: '/data/backup-001.pgdump',
  error: null,
  pgDumpVersion: null,
  createdBy: 'admin',
  createdAt: 1000,
  completedAt: 2000,
};

function makeMockManager() {
  return {
    createBackup: vi.fn().mockResolvedValue({ ...MOCK_BACKUP, status: 'running' }),
    listBackups: vi.fn().mockResolvedValue({ records: [MOCK_BACKUP], total: 1 }),
    getBackup: vi.fn().mockResolvedValue(MOCK_BACKUP),
    getDownloadStream: vi.fn().mockResolvedValue({
      stream: (() => {
        const { EventEmitter } = require('node:events');
        const s = new EventEmitter();
        (s as any).pipe = (dest: any) => {
          process.nextTick(() => s.emit('end'));
          return dest;
        };
        return s;
      })(),
      sizeBytes: 1024,
    }),
    restoreBackup: vi.fn().mockResolvedValue(undefined),
    deleteBackup: vi.fn().mockResolvedValue(undefined),
  };
}

async function buildApp(mgr: ReturnType<typeof makeMockManager>) {
  const app = Fastify({ logger: false });
  registerBackupRoutes(app, { backupManager: mgr as any });
  await app.ready();
  return app;
}

describe('Backup Routes', () => {
  let manager: ReturnType<typeof makeMockManager>;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    manager = makeMockManager();
    app = await buildApp(manager);
  });

  it('POST /api/v1/admin/backups creates a backup', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/backups',
      payload: { label: 'test' },
    });
    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.backup.status).toBe('running');
    expect(manager.createBackup).toHaveBeenCalledOnce();
  });

  it('GET /api/v1/admin/backups lists backups', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/backups' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.backups).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('GET /api/v1/admin/backups/:id gets single backup', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/backups/backup-001' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.backup.id).toBe('backup-001');
  });

  it('GET /api/v1/admin/backups/:id returns 404 for missing', async () => {
    manager.getBackup.mockResolvedValue(null);
    app = await buildApp(manager);
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/backups/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/v1/admin/backups/:id/restore requires RESTORE confirmation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/backups/backup-001/restore',
      payload: { confirm: 'wrong' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/admin/backups/:id/restore succeeds with correct confirm', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/backups/backup-001/restore',
      payload: { confirm: 'RESTORE' },
    });
    expect(res.statusCode).toBe(200);
    expect(manager.restoreBackup).toHaveBeenCalledWith('backup-001');
  });

  it('DELETE /api/v1/admin/backups/:id deletes backup', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/admin/backups/backup-001' });
    expect(res.statusCode).toBe(204);
    expect(manager.deleteBackup).toHaveBeenCalledWith('backup-001');
  });

  it('DELETE /api/v1/admin/backups/:id returns 404 when not found', async () => {
    manager.deleteBackup.mockRejectedValue(new Error('Backup not found'));
    app = await buildApp(manager);
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/admin/backups/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  // ── Additional branch coverage tests ────────────────────────────────────────

  describe('POST /api/v1/admin/backups — error handling', () => {
    it('returns 500 when createBackup throws', async () => {
      manager.createBackup.mockRejectedValue(new Error('pg_dump failed'));
      app = await buildApp(manager);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/backups',
        payload: { label: 'fail' },
      });
      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.body);
      expect(body.message).toBe('An internal error occurred');
    });

    it('uses empty label when no label is provided', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/backups',
        payload: {},
      });
      expect(res.statusCode).toBe(202);
      expect(manager.createBackup).toHaveBeenCalledWith('', 'unknown');
    });

    it('extracts userId from authUser when present', async () => {
      const authedApp = Fastify({ logger: false });
      // Add a preHandler hook that simulates auth
      authedApp.addHook('preHandler', async (req) => {
        (req as any).authUser = { userId: 'admin-user-42' };
      });
      registerBackupRoutes(authedApp, { backupManager: manager as any });
      await authedApp.ready();

      const res = await authedApp.inject({
        method: 'POST',
        url: '/api/v1/admin/backups',
        payload: { label: 'from-admin' },
      });
      expect(res.statusCode).toBe(202);
      expect(manager.createBackup).toHaveBeenCalledWith('from-admin', 'admin-user-42');
    });

    it('returns 500 with sanitized message when createBackup throws non-Error', async () => {
      manager.createBackup.mockRejectedValue('plain string error');
      app = await buildApp(manager);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/backups',
        payload: {},
      });
      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.body);
      expect(body.message).toBe('An internal error occurred');
    });
  });

  describe('GET /api/v1/admin/backups — query parameters', () => {
    it('respects limit and offset query parameters', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/backups?limit=10&offset=5',
      });
      expect(res.statusCode).toBe(200);
      expect(manager.listBackups).toHaveBeenCalledWith(10, 5);
      const body = JSON.parse(res.body);
      expect(body.limit).toBe(10);
      expect(body.offset).toBe(5);
    });

    it('clamps limit to 200 maximum', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/backups?limit=999',
      });
      expect(res.statusCode).toBe(200);
      expect(manager.listBackups).toHaveBeenCalledWith(200, 0);
      const body = JSON.parse(res.body);
      expect(body.limit).toBe(200);
    });

    it('uses default limit=50, offset=0 when not specified', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/backups',
      });
      expect(res.statusCode).toBe(200);
      expect(manager.listBackups).toHaveBeenCalledWith(50, 0);
    });

    it('returns 500 when listBackups throws', async () => {
      manager.listBackups.mockRejectedValue(new Error('DB connection lost'));
      app = await buildApp(manager);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/backups',
      });
      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.body);
      expect(body.message).toBe('An internal error occurred');
    });
  });

  describe('GET /api/v1/admin/backups/:id/download', () => {
    it('returns 404 when getDownloadStream throws and headers not yet sent', async () => {
      manager.getDownloadStream.mockRejectedValue(new Error('File not found on disk'));
      app = await buildApp(manager);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/backups/backup-001/download',
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.message).toBe('File not found on disk');
    });

    it('returns 404 with "Unknown error" when getDownloadStream throws non-Error', async () => {
      manager.getDownloadStream.mockRejectedValue('string error');
      app = await buildApp(manager);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/backups/backup-001/download',
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.message).toBe('Unknown error');
    });

    it('calls getDownloadStream with correct id param', async () => {
      // The default mock will emit 'end' promptly via the pipe mock,
      // but Fastify inject may not fully support raw stream piping.
      // We just verify the manager was called with the right id.
      manager.getDownloadStream.mockRejectedValue(new Error('not found'));
      app = await buildApp(manager);
      await app.inject({
        method: 'GET',
        url: '/api/v1/admin/backups/my-backup-id/download',
      });
      expect(manager.getDownloadStream).toHaveBeenCalledWith('my-backup-id');
    });
  });

  describe('POST /api/v1/admin/backups/:id/restore — error handling', () => {
    it('returns 400 when confirm is missing entirely', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/backups/backup-001/restore',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain('Confirmation required');
    });

    it('returns 500 when restoreBackup throws', async () => {
      manager.restoreBackup.mockRejectedValue(new Error('Restore failed: corrupt dump'));
      app = await buildApp(manager);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/backups/backup-001/restore',
        payload: { confirm: 'RESTORE' },
      });
      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.body);
      expect(body.message).toBe('An internal error occurred');
    });
  });

  describe('DELETE /api/v1/admin/backups/:id — error branch', () => {
    it('returns 500 for generic (non-not-found) delete errors', async () => {
      manager.deleteBackup.mockRejectedValue(new Error('Permission denied'));
      app = await buildApp(manager);
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/admin/backups/backup-001',
      });
      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.body);
      expect(body.message).toBe('An internal error occurred');
    });

    it('returns 500 with sanitized message for non-Error thrown value', async () => {
      manager.deleteBackup.mockRejectedValue(42);
      app = await buildApp(manager);
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/admin/backups/backup-001',
      });
      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.body);
      expect(body.message).toBe('An internal error occurred');
    });
  });
});
