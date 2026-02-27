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
        (s as any).pipe = (dest: any) => { process.nextTick(() => s.emit('end')); return dest; };
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
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/backups', payload: { label: 'test' } });
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
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/backups/backup-001/restore', payload: { confirm: 'wrong' } });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/admin/backups/:id/restore succeeds with correct confirm', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/backups/backup-001/restore', payload: { confirm: 'RESTORE' } });
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
});
