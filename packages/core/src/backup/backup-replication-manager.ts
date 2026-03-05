/**
 * Backup Replication Manager — Ships PostgreSQL backups to remote storage.
 *
 * Supports S3-compatible (AWS S3, MinIO), Azure Blob, GCS, and local filesystem.
 * Manages backup scheduling, retention, and point-in-time recovery metadata.
 */

import { exec } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, unlinkSync, statSync, copyFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { promisify } from 'node:util';
import { getLogger } from '../logging/logger.js';
import type { BackupReplicationConfig } from '@secureyeoman/shared';

const execAsync = promisify(exec);

export interface BackupInfo {
  filename: string;
  provider: string;
  sizeBytes: number;
  createdAt: number;
  remotePath: string;
}

export class BackupReplicationManager {
  private readonly config: BackupReplicationConfig;
  private scheduleTimer: NodeJS.Timeout | null = null;
  private readonly backupHistory: BackupInfo[] = [];

  constructor(config: BackupReplicationConfig) {
    this.config = config;
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  get provider(): string {
    return this.config.provider;
  }

  /** Create a pg_dump backup and ship to remote storage. */
  async createAndShipBackup(dbConnectionString?: string): Promise<BackupInfo> {
    const logger = getLogger();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `secureyeoman-backup-${timestamp}.sql.gz`;
    const tmpDir = '/tmp/secureyeoman-backups';

    if (!existsSync(tmpDir)) {
      mkdirSync(tmpDir, { recursive: true });
    }

    const localPath = join(tmpDir, filename);
    const connStr = dbConnectionString ?? this.buildConnectionString();

    // Create compressed dump
    logger.info('Creating database backup', { filename });
    await execAsync(`pg_dump "${connStr}" | gzip > "${localPath}"`, { timeout: 300_000 });

    const stats = statSync(localPath);
    const remotePath = `${this.config.prefix}${filename}`;

    // Ship to provider
    await this.shipToProvider(localPath, remotePath);

    // Cleanup local temp file
    try {
      unlinkSync(localPath);
    } catch {
      /* ignore */
    }

    const info: BackupInfo = {
      filename,
      provider: this.config.provider,
      sizeBytes: stats.size,
      createdAt: Date.now(),
      remotePath,
    };

    this.backupHistory.push(info);
    logger.info('Backup shipped successfully', {
      filename,
      provider: this.config.provider,
      sizeBytes: stats.size,
    });

    // Enforce retention
    await this.enforceRetention();

    return info;
  }

  /** Ship a local file to the configured remote provider. */
  private async shipToProvider(localPath: string, remotePath: string): Promise<void> {
    switch (this.config.provider) {
      case 's3':
        await this.shipToS3(localPath, remotePath);
        break;
      case 'azure':
        await this.shipToAzure(localPath, remotePath);
        break;
      case 'gcs':
        await this.shipToGcs(localPath, remotePath);
        break;
      case 'local':
        await this.shipToLocal(localPath, remotePath);
        break;
      default:
        throw new Error(`Unsupported backup provider: ${this.config.provider}`);
    }
  }

  private async shipToS3(localPath: string, remotePath: string): Promise<void> {
    const accessKey = process.env[this.config.accessKeyEnv] ?? '';
    const secretKey = process.env[this.config.secretKeyEnv] ?? '';
    const endpoint = this.config.endpoint ? `--endpoint-url ${this.config.endpoint}` : '';
    const region = this.config.region ? `--region ${this.config.region}` : '';

    const env = { ...process.env, AWS_ACCESS_KEY_ID: accessKey, AWS_SECRET_ACCESS_KEY: secretKey };
    await execAsync(
      `aws s3 cp "${localPath}" "s3://${this.config.bucket}/${remotePath}" ${endpoint} ${region}`,
      { env, timeout: 120_000 }
    );
  }

  private async shipToAzure(localPath: string, remotePath: string): Promise<void> {
    const accessKey = process.env[this.config.accessKeyEnv] ?? '';
    await execAsync(
      `az storage blob upload --account-key "${accessKey}" --container-name "${this.config.bucket}" --name "${remotePath}" --file "${localPath}" --overwrite`,
      { timeout: 120_000 }
    );
  }

  private async shipToGcs(localPath: string, remotePath: string): Promise<void> {
    await execAsync(`gsutil cp "${localPath}" "gs://${this.config.bucket}/${remotePath}"`, {
      timeout: 120_000,
    });
  }

  private async shipToLocal(localPath: string, remotePath: string): Promise<void> {
    const destDir = this.config.bucket || '/var/backups/secureyeoman';
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }
    const destPath = join(destDir, basename(remotePath));
    copyFileSync(localPath, destPath);
  }

  /** Remove old backups beyond retention count. */
  private async enforceRetention(): Promise<void> {
    if (this.config.provider === 'local') {
      const destDir = this.config.bucket || '/var/backups/secureyeoman';
      if (!existsSync(destDir)) return;

      const files = readdirSync(destDir)
        .filter((f) => f.startsWith('secureyeoman-backup-'))
        .sort()
        .reverse();

      for (const file of files.slice(this.config.retentionCount)) {
        try {
          unlinkSync(join(destDir, file));
          getLogger().info('Removed old backup', { file });
        } catch {
          /* ignore */
        }
      }
    }
    // For cloud providers, retention is typically handled by lifecycle policies.
    // Log a warning if history exceeds retention as a reminder.
    if (this.backupHistory.length > this.config.retentionCount) {
      getLogger().info(
        'Backup history exceeds retention count — consider configuring lifecycle policies on your storage provider',
        {
          historyCount: this.backupHistory.length,
          retentionCount: this.config.retentionCount,
        }
      );
    }
  }

  /** Get backup history (in-memory). */
  getBackupHistory(): BackupInfo[] {
    return [...this.backupHistory];
  }

  /** Start scheduled backups based on cron schedule. */
  startSchedule(): void {
    if (!this.isEnabled) return;
    // Simple interval-based schedule (production would use cron parser).
    // Default daily at 2 AM = 24h interval.
    const intervalMs = 24 * 60 * 60 * 1000;
    this.scheduleTimer = setInterval(() => {
      void this.createAndShipBackup().catch((err: unknown) => {
        getLogger().error('Scheduled backup failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, intervalMs);
    getLogger().info('Backup schedule started', {
      schedule: this.config.schedule,
      provider: this.config.provider,
    });
  }

  async cleanup(): Promise<void> {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
    }
  }

  private buildConnectionString(): string {
    // Rely on standard PG env vars (PGHOST, PGPORT, etc.) or DATABASE_URL
    return process.env.DATABASE_URL ?? 'postgresql://localhost:5432/secureyeoman';
  }
}
