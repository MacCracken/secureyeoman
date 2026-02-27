/**
 * BackupStorage — CRUD for admin.backups table.
 */

import { PgBaseStorage } from '../storage/pg-base.js';

export interface BackupRecord {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  sizeBytes: number | null;
  filePath: string | null;
  error: string | null;
  pgDumpVersion: string | null;
  createdBy: string | null;
  createdAt: number;
  completedAt: number | null;
}

interface BackupRow {
  id: string;
  label: string;
  status: string;
  size_bytes: string | null;
  file_path: string | null;
  error: string | null;
  pg_dump_version: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

function rowToRecord(row: BackupRow): BackupRecord {
  return {
    id: row.id,
    label: row.label,
    status: row.status as BackupRecord['status'],
    sizeBytes: row.size_bytes !== null ? Number(row.size_bytes) : null,
    filePath: row.file_path,
    error: row.error,
    pgDumpVersion: row.pg_dump_version,
    createdBy: row.created_by,
    createdAt: Number(row.created_at),
    completedAt: row.completed_at !== null ? Number(row.completed_at) : null,
  };
}

export class BackupStorage extends PgBaseStorage {
  async create(data: {
    id: string;
    label: string;
    status: string;
    createdBy: string | null;
    createdAt: number;
  }): Promise<BackupRecord> {
    const row = await this.queryOne<BackupRow>(
      `INSERT INTO admin.backups (id, label, status, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.id, data.label, data.status, data.createdBy, data.createdAt]
    );
    return rowToRecord(row!);
  }

  async update(
    id: string,
    patch: Partial<{
      status: string;
      sizeBytes: number;
      filePath: string;
      error: string;
      pgDumpVersion: string;
      completedAt: number;
    }>
  ): Promise<BackupRecord | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (patch.status !== undefined) { sets.push(`status = $${idx++}`); params.push(patch.status); }
    if (patch.sizeBytes !== undefined) { sets.push(`size_bytes = $${idx++}`); params.push(patch.sizeBytes); }
    if (patch.filePath !== undefined) { sets.push(`file_path = $${idx++}`); params.push(patch.filePath); }
    if (patch.error !== undefined) { sets.push(`error = $${idx++}`); params.push(patch.error); }
    if (patch.pgDumpVersion !== undefined) { sets.push(`pg_dump_version = $${idx++}`); params.push(patch.pgDumpVersion); }
    if (patch.completedAt !== undefined) { sets.push(`completed_at = $${idx++}`); params.push(patch.completedAt); }

    if (sets.length === 0) return this.getById(id);

    params.push(id);
    const row = await this.queryOne<BackupRow>(
      `UPDATE admin.backups SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return row ? rowToRecord(row) : null;
  }

  async list(limit = 50, offset = 0): Promise<{ records: BackupRecord[]; total: number }> {
    const rows = await this.queryMany<BackupRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count FROM admin.backups
       ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return {
      records: rows.map(rowToRecord),
      total: Number(rows[0]?.total_count ?? 0),
    };
  }

  async getById(id: string): Promise<BackupRecord | null> {
    const row = await this.queryOne<BackupRow>(
      'SELECT * FROM admin.backups WHERE id = $1',
      [id]
    );
    return row ? rowToRecord(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const n = await this.execute('DELETE FROM admin.backups WHERE id = $1', [id]);
    return n > 0;
  }
}
