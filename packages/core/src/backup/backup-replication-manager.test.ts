/**
 * BackupReplicationManager tests — Phase 137
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockExecAsync,
  mockExistsSync,
  mockMkdirSync,
  mockStatSync,
  mockUnlinkSync,
  mockCopyFileSync,
  mockReaddirSync,
} = vi.hoisted(() => ({
  mockExecAsync: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
  mockExistsSync: vi.fn().mockReturnValue(true),
  mockMkdirSync: vi.fn(),
  mockStatSync: vi.fn().mockReturnValue({ size: 1024 }),
  mockUnlinkSync: vi.fn(),
  mockCopyFileSync: vi.fn(),
  mockReaddirSync: vi.fn().mockReturnValue([]),
}));

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));
vi.mock('node:util', () => ({
  promisify: () => mockExecAsync,
}));

vi.mock('node:fs', () => ({
  existsSync: (...args: any[]) => mockExistsSync(...args),
  mkdirSync: (...args: any[]) => mockMkdirSync(...args),
  statSync: (...args: any[]) => mockStatSync(...args),
  unlinkSync: (...args: any[]) => mockUnlinkSync(...args),
  copyFileSync: (...args: any[]) => mockCopyFileSync(...args),
  readdirSync: (...args: any[]) => mockReaddirSync(...args),
}));

vi.mock('../logging/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { BackupReplicationManager } from './backup-replication-manager.js';

const baseConfig = {
  enabled: true,
  provider: 'local' as const,
  endpoint: '',
  bucket: '/tmp/test-backups',
  prefix: 'secureyeoman-backups/',
  accessKeyEnv: 'BACKUP_ACCESS_KEY',
  secretKeyEnv: 'BACKUP_SECRET_KEY',
  region: '',
  schedule: '0 2 * * *',
  retentionCount: 30,
};

describe('BackupReplicationManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 1024 });
    mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
  });

  describe('constructor', () => {
    it('creates instance with config', () => {
      const mgr = new BackupReplicationManager(baseConfig);
      expect(mgr.isEnabled).toBe(true);
      expect(mgr.provider).toBe('local');
    });

    it('isEnabled returns false when disabled', () => {
      const mgr = new BackupReplicationManager({ ...baseConfig, enabled: false });
      expect(mgr.isEnabled).toBe(false);
    });
  });

  describe('createAndShipBackup', () => {
    it('creates backup and ships to local provider', async () => {
      const mgr = new BackupReplicationManager(baseConfig);
      const result = await mgr.createAndShipBackup('postgresql://localhost/test');

      expect(result.filename).toMatch(/^secureyeoman-backup-/);
      expect(result.provider).toBe('local');
      expect(result.sizeBytes).toBe(1024);
      expect(result.remotePath).toContain('secureyeoman-backups/');
      expect(mockExecAsync).toHaveBeenCalled();
      expect(mockCopyFileSync).toHaveBeenCalled();
    });

    it('creates tmp directory if needed', async () => {
      mockExistsSync.mockReturnValueOnce(false);
      const mgr = new BackupReplicationManager(baseConfig);
      await mgr.createAndShipBackup();
      expect(mockMkdirSync).toHaveBeenCalled();
    });

    it('ships to S3 when provider is s3', async () => {
      const mgr = new BackupReplicationManager({ ...baseConfig, provider: 's3', bucket: 'my-bucket' });
      await mgr.createAndShipBackup();
      const callArgs = mockExecAsync.mock.calls;
      // First call is pg_dump, second is aws s3 cp
      expect(callArgs.length).toBeGreaterThanOrEqual(2);
      expect(callArgs[1]?.[0]).toContain('aws s3 cp');
    });

    it('ships to Azure when provider is azure', async () => {
      const mgr = new BackupReplicationManager({ ...baseConfig, provider: 'azure', bucket: 'container' });
      await mgr.createAndShipBackup();
      const callArgs = mockExecAsync.mock.calls;
      expect(callArgs[1]?.[0]).toContain('az storage blob upload');
    });

    it('ships to GCS when provider is gcs', async () => {
      const mgr = new BackupReplicationManager({ ...baseConfig, provider: 'gcs', bucket: 'my-gcs-bucket' });
      await mgr.createAndShipBackup();
      const callArgs = mockExecAsync.mock.calls;
      expect(callArgs[1]?.[0]).toContain('gsutil cp');
    });
  });

  describe('getBackupHistory', () => {
    it('returns empty initially', () => {
      const mgr = new BackupReplicationManager(baseConfig);
      expect(mgr.getBackupHistory()).toEqual([]);
    });

    it('includes backups after creation', async () => {
      const mgr = new BackupReplicationManager(baseConfig);
      await mgr.createAndShipBackup();
      expect(mgr.getBackupHistory()).toHaveLength(1);
    });
  });

  describe('startSchedule / cleanup', () => {
    it('starts and stops schedule timer', async () => {
      const mgr = new BackupReplicationManager(baseConfig);
      mgr.startSchedule();
      await mgr.cleanup();
      // No error
    });

    it('does not start when disabled', () => {
      const mgr = new BackupReplicationManager({ ...baseConfig, enabled: false });
      mgr.startSchedule();
      // No timer started
    });
  });

  describe('retention enforcement', () => {
    it('removes old local backups beyond retention count', async () => {
      const files = Array.from({ length: 35 }, (_, i) =>
        `secureyeoman-backup-2026-03-${String(i + 1).padStart(2, '0')}.sql.gz`
      );
      mockReaddirSync.mockReturnValue(files);

      const mgr = new BackupReplicationManager({ ...baseConfig, retentionCount: 30 });
      await mgr.createAndShipBackup();

      // Should delete 5 oldest files (35 - 30)
      expect(mockUnlinkSync).toHaveBeenCalledTimes(5 + 1); // 5 retention + 1 temp cleanup
    });
  });
});
