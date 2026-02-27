/**
 * TenantStorage — CRUD for auth.tenants table.
 * All methods use bypassRls since tenant registry itself is cross-tenant.
 */

import { PgBaseStorage } from '../storage/pg-base.js';

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  plan: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: TenantRow): TenantRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    metadata: typeof row.metadata === 'object' && row.metadata !== null
      ? (row.metadata as Record<string, unknown>)
      : {},
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export class TenantStorage extends PgBaseStorage {
  async create(data: {
    id: string;
    name: string;
    slug: string;
    plan?: string;
    metadata?: Record<string, unknown>;
  }): Promise<TenantRecord> {
    const now = Date.now();
    const row = await this.queryOne<TenantRow>(
      `INSERT INTO auth.tenants (id, name, slug, plan, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.id,
        data.name,
        data.slug,
        data.plan ?? 'free',
        JSON.stringify(data.metadata ?? {}),
        now,
        now,
      ]
    );
    return rowToRecord(row!);
  }

  async list(limit = 50, offset = 0): Promise<{ records: TenantRecord[]; total: number }> {
    const rows = await this.queryMany<TenantRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count FROM auth.tenants
       ORDER BY created_at ASC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return {
      records: rows.map(rowToRecord),
      total: Number(rows[0]?.total_count ?? 0),
    };
  }

  async getById(id: string): Promise<TenantRecord | null> {
    const row = await this.queryOne<TenantRow>(
      'SELECT * FROM auth.tenants WHERE id = $1',
      [id]
    );
    return row ? rowToRecord(row) : null;
  }

  async getBySlug(slug: string): Promise<TenantRecord | null> {
    const row = await this.queryOne<TenantRow>(
      'SELECT * FROM auth.tenants WHERE slug = $1',
      [slug]
    );
    return row ? rowToRecord(row) : null;
  }

  async update(
    id: string,
    patch: Partial<{ name: string; plan: string; metadata: Record<string, unknown> }>
  ): Promise<TenantRecord | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (patch.name !== undefined) { sets.push(`name = $${idx++}`); params.push(patch.name); }
    if (patch.plan !== undefined) { sets.push(`plan = $${idx++}`); params.push(patch.plan); }
    if (patch.metadata !== undefined) { sets.push(`metadata = $${idx++}`); params.push(JSON.stringify(patch.metadata)); }
    sets.push(`updated_at = $${idx++}`);
    params.push(Date.now());
    params.push(id);

    const row = await this.queryOne<TenantRow>(
      `UPDATE auth.tenants SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return row ? rowToRecord(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const n = await this.execute('DELETE FROM auth.tenants WHERE id = $1', [id]);
    return n > 0;
  }
}
