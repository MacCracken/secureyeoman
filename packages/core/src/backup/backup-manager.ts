/**
 * BackupManager — orchestrates pg_dump / pg_restore and manages backup metadata.
 */

import { promises as fs, createReadStream } from 'node:fs';
import type { ReadStream } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { BackupStorage, BackupRecord } from './backup-storage.js';
import { uuidv7 } from '../utils/crypto.js';
import type { SecureLogger } from '../logging/logger.js';

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
}

export interface BackupManagerDeps {
  storage: BackupStorage;
  dataDir: string;
  dbConfig: DbConfig;
  logger: SecureLogger;
}

const SAFE_ENV_KEYS = new Set([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'TERM', 'SHELL', 'TMPDIR', 'TZ', 'XDG_RUNTIME_DIR',
]);

function buildSafeEnv(): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      safe[key] = process.env[key];
    }
  }
  return safe;
}

function spawnAsync(
  cmd: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    const child = spawn(cmd, args, { env: opts.env });
    child.stdout?.on('data', (d: Buffer) => chunks.push(d));
    child.stderr?.on('data', (d: Buffer) => errChunks.push(d));
    child.on('close', (code) => {
      const stdout = Buffer.concat(chunks).toString();
      const stderr = Buffer.concat(errChunks).toString();
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${cmd} exited with code ${code}: ${stderr}`));
      }
    });
    child.on('error', reject);
  });
}

export class BackupManager {
  private readonly storage: BackupStorage;
  private readonly dataDir: string;
  private readonly dbConfig: DbConfig;
  private readonly logger: SecureLogger;

  constructor(deps: BackupManagerDeps) {
    this.storage = deps.storage;
    this.dataDir = deps.dataDir;
    this.dbConfig = deps.dbConfig;
    this.logger = deps.logger;
  }

  async createBackup(label: string, createdBy: string): Promise<BackupRecord> {
    const id = uuidv7();
    const backupDir = path.join(this.dataDir, 'backups');
    const filePath = path.join(backupDir, `backup-${id}.pgdump`);

    await fs.mkdir(backupDir, { recursive: true });

    const record = await this.storage.create({
      id,
      label,
      status: 'running',
      createdBy,
      createdAt: Date.now(),
    });

    // Spawn pg_dump non-blocking
    setImmediate(() => {
      void this._runPgDump(id, filePath);
    });

    return record;
  }

  private async _runPgDump(id: string, filePath: string): Promise<void> {
    try {
      const env: NodeJS.ProcessEnv = { ...buildSafeEnv() };
      if (this.dbConfig.password) {
        env['PGPASSWORD'] = this.dbConfig.password;
      }

      await spawnAsync('pg_dump', [
        '-h', this.dbConfig.host,
        '-p', String(this.dbConfig.port),
        '-U', this.dbConfig.user,
        '-d', this.dbConfig.database,
        '--format=custom',
        '--no-password',
        '-f', filePath,
      ], { env });

      const stat = await fs.stat(filePath);
      await this.storage.update(id, {
        status: 'completed',
        sizeBytes: stat.size,
        filePath,
        completedAt: Date.now(),
      });
      this.logger.info('Backup completed', { id, sizeBytes: stat.size });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.storage.update(id, { status: 'failed', error: msg });
      this.logger.error('Backup failed', { id, error: msg });
    }
  }

  async restoreBackup(id: string): Promise<void> {
    const rec = await this.storage.getById(id);
    if (!rec) throw new Error('Backup not found');
    if (!rec.filePath) throw new Error('Backup file path missing');
    if (rec.status !== 'completed') throw new Error('Backup is not in completed state');

    const env: NodeJS.ProcessEnv = { ...buildSafeEnv() };
    if (this.dbConfig.password) {
      env['PGPASSWORD'] = this.dbConfig.password;
    }

    await spawnAsync('pg_restore', [
      '-h', this.dbConfig.host,
      '-p', String(this.dbConfig.port),
      '-U', this.dbConfig.user,
      '-d', this.dbConfig.database,
      '--clean',
      '--if-exists',
      '--no-password',
      rec.filePath,
    ], { env });

    this.logger.info('Restore completed', { id });
  }

  async getDownloadStream(id: string): Promise<{ stream: ReadStream; sizeBytes: number }> {
    const rec = await this.storage.getById(id);
    if (!rec) throw new Error('Backup not found');
    if (!rec.filePath) throw new Error('Backup file not found');
    if (rec.status !== 'completed') throw new Error('Backup is not complete');
    return {
      stream: createReadStream(rec.filePath),
      sizeBytes: rec.sizeBytes ?? 0,
    };
  }

  async deleteBackup(id: string): Promise<void> {
    const rec = await this.storage.getById(id);
    if (!rec) throw new Error('Backup not found');
    if (rec.filePath) {
      await fs.rm(rec.filePath, { force: true });
    }
    await this.storage.delete(id);
  }

  async listBackups(limit = 50, offset = 0) {
    return this.storage.list(limit, offset);
  }

  async getBackup(id: string) {
    return this.storage.getById(id);
  }
}
