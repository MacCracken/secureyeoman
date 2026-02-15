/**
 * Spirit Storage — PostgreSQL-backed storage for passions, inspirations, and pains.
 *
 * Extends PgBaseStorage for shared pool access, async methods, and transactions.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import type {
  Passion, PassionCreate, PassionUpdate,
  Inspiration, InspirationCreate, InspirationUpdate,
  Pain, PainCreate, PainUpdate,
} from './types.js';
import { uuidv7 } from '../utils/crypto.js';

interface PassionRow {
  id: string;
  personality_id: string | null;
  name: string;
  description: string;
  intensity: number;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

interface InspirationRow {
  id: string;
  personality_id: string | null;
  source: string;
  description: string;
  impact: number;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

interface PainRow {
  id: string;
  personality_id: string | null;
  trigger_name: string;
  description: string;
  severity: number;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

function rowToPassion(row: PassionRow): Passion {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    intensity: row.intensity,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToInspiration(row: InspirationRow): Inspiration {
  return {
    id: row.id,
    source: row.source,
    description: row.description,
    impact: row.impact,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPain(row: PainRow): Pain {
  return {
    id: row.id,
    trigger: row.trigger_name,
    description: row.description,
    severity: row.severity,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SpiritStorage extends PgBaseStorage {
  // ── Passions ─────────────────────────────────────────────────

  async createPassion(data: PassionCreate, personalityId?: string): Promise<Passion> {
    const now = Date.now();
    const id = uuidv7();

    await this.query(
      `INSERT INTO spirit.passions (id, personality_id, name, description, intensity, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        personalityId ?? null,
        data.name,
        data.description ?? '',
        data.intensity ?? 0.5,
        data.isActive !== false,
        now,
        now,
      ],
    );

    const result = await this.getPassion(id);
    if (!result) throw new Error(`Failed to retrieve passion after insert: ${id}`);
    return result;
  }

  async getPassion(id: string): Promise<Passion | null> {
    const row = await this.queryOne<PassionRow>(
      'SELECT * FROM spirit.passions WHERE id = $1',
      [id],
    );
    return row ? rowToPassion(row) : null;
  }

  async updatePassion(id: string, data: PassionUpdate): Promise<Passion> {
    const existing = await this.getPassion(id);
    if (!existing) {
      throw new Error(`Passion not found: ${id}`);
    }

    const now = Date.now();
    await this.execute(
      `UPDATE spirit.passions SET
         name = $1,
         description = $2,
         intensity = $3,
         is_active = $4,
         updated_at = $5
       WHERE id = $6`,
      [
        data.name ?? existing.name,
        data.description ?? existing.description,
        data.intensity ?? existing.intensity,
        data.isActive !== undefined ? data.isActive : existing.isActive,
        now,
        id,
      ],
    );

    const result = await this.getPassion(id);
    if (!result) throw new Error(`Failed to retrieve passion after update: ${id}`);
    return result;
  }

  async deletePassion(id: string): Promise<boolean> {
    const count = await this.execute(
      'DELETE FROM spirit.passions WHERE id = $1',
      [id],
    );
    return count > 0;
  }

  async listPassions(personalityId?: string): Promise<Passion[]> {
    if (personalityId) {
      const rows = await this.queryMany<PassionRow>(
        'SELECT * FROM spirit.passions WHERE personality_id = $1 ORDER BY intensity DESC, created_at DESC',
        [personalityId],
      );
      return rows.map(rowToPassion);
    }
    const rows = await this.queryMany<PassionRow>(
      'SELECT * FROM spirit.passions ORDER BY intensity DESC, created_at DESC',
    );
    return rows.map(rowToPassion);
  }

  async getActivePassions(personalityId?: string): Promise<Passion[]> {
    if (personalityId) {
      const rows = await this.queryMany<PassionRow>(
        'SELECT * FROM spirit.passions WHERE is_active = true AND personality_id = $1 ORDER BY intensity DESC, created_at DESC',
        [personalityId],
      );
      return rows.map(rowToPassion);
    }
    const rows = await this.queryMany<PassionRow>(
      'SELECT * FROM spirit.passions WHERE is_active = true ORDER BY intensity DESC, created_at DESC',
    );
    return rows.map(rowToPassion);
  }

  async getPassionCount(): Promise<number> {
    const row = await this.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM spirit.passions',
    );
    return Number(row?.count ?? 0);
  }

  // ── Inspirations ─────────────────────────────────────────────

  async createInspiration(data: InspirationCreate, personalityId?: string): Promise<Inspiration> {
    const now = Date.now();
    const id = uuidv7();

    await this.query(
      `INSERT INTO spirit.inspirations (id, personality_id, source, description, impact, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        personalityId ?? null,
        data.source,
        data.description ?? '',
        data.impact ?? 0.5,
        data.isActive !== false,
        now,
        now,
      ],
    );

    const result = await this.getInspiration(id);
    if (!result) throw new Error(`Failed to retrieve inspiration after insert: ${id}`);
    return result;
  }

  async getInspiration(id: string): Promise<Inspiration | null> {
    const row = await this.queryOne<InspirationRow>(
      'SELECT * FROM spirit.inspirations WHERE id = $1',
      [id],
    );
    return row ? rowToInspiration(row) : null;
  }

  async updateInspiration(id: string, data: InspirationUpdate): Promise<Inspiration> {
    const existing = await this.getInspiration(id);
    if (!existing) {
      throw new Error(`Inspiration not found: ${id}`);
    }

    const now = Date.now();
    await this.execute(
      `UPDATE spirit.inspirations SET
         source = $1,
         description = $2,
         impact = $3,
         is_active = $4,
         updated_at = $5
       WHERE id = $6`,
      [
        data.source ?? existing.source,
        data.description ?? existing.description,
        data.impact ?? existing.impact,
        data.isActive !== undefined ? data.isActive : existing.isActive,
        now,
        id,
      ],
    );

    const result = await this.getInspiration(id);
    if (!result) throw new Error(`Failed to retrieve inspiration after update: ${id}`);
    return result;
  }

  async deleteInspiration(id: string): Promise<boolean> {
    const count = await this.execute(
      'DELETE FROM spirit.inspirations WHERE id = $1',
      [id],
    );
    return count > 0;
  }

  async listInspirations(personalityId?: string): Promise<Inspiration[]> {
    if (personalityId) {
      const rows = await this.queryMany<InspirationRow>(
        'SELECT * FROM spirit.inspirations WHERE personality_id = $1 ORDER BY impact DESC, created_at DESC',
        [personalityId],
      );
      return rows.map(rowToInspiration);
    }
    const rows = await this.queryMany<InspirationRow>(
      'SELECT * FROM spirit.inspirations ORDER BY impact DESC, created_at DESC',
    );
    return rows.map(rowToInspiration);
  }

  async getActiveInspirations(personalityId?: string): Promise<Inspiration[]> {
    if (personalityId) {
      const rows = await this.queryMany<InspirationRow>(
        'SELECT * FROM spirit.inspirations WHERE is_active = true AND personality_id = $1 ORDER BY impact DESC, created_at DESC',
        [personalityId],
      );
      return rows.map(rowToInspiration);
    }
    const rows = await this.queryMany<InspirationRow>(
      'SELECT * FROM spirit.inspirations WHERE is_active = true ORDER BY impact DESC, created_at DESC',
    );
    return rows.map(rowToInspiration);
  }

  async getInspirationCount(): Promise<number> {
    const row = await this.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM spirit.inspirations',
    );
    return Number(row?.count ?? 0);
  }

  // ── Pains ────────────────────────────────────────────────────

  async createPain(data: PainCreate, personalityId?: string): Promise<Pain> {
    const now = Date.now();
    const id = uuidv7();

    await this.query(
      `INSERT INTO spirit.pains (id, personality_id, trigger_name, description, severity, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        personalityId ?? null,
        data.trigger,
        data.description ?? '',
        data.severity ?? 0.5,
        data.isActive !== false,
        now,
        now,
      ],
    );

    const result = await this.getPain(id);
    if (!result) throw new Error(`Failed to retrieve pain after insert: ${id}`);
    return result;
  }

  async getPain(id: string): Promise<Pain | null> {
    const row = await this.queryOne<PainRow>(
      'SELECT * FROM spirit.pains WHERE id = $1',
      [id],
    );
    return row ? rowToPain(row) : null;
  }

  async updatePain(id: string, data: PainUpdate): Promise<Pain> {
    const existing = await this.getPain(id);
    if (!existing) {
      throw new Error(`Pain not found: ${id}`);
    }

    const now = Date.now();
    await this.execute(
      `UPDATE spirit.pains SET
         trigger_name = $1,
         description = $2,
         severity = $3,
         is_active = $4,
         updated_at = $5
       WHERE id = $6`,
      [
        data.trigger ?? existing.trigger,
        data.description ?? existing.description,
        data.severity ?? existing.severity,
        data.isActive !== undefined ? data.isActive : existing.isActive,
        now,
        id,
      ],
    );

    const result = await this.getPain(id);
    if (!result) throw new Error(`Failed to retrieve pain after update: ${id}`);
    return result;
  }

  async deletePain(id: string): Promise<boolean> {
    const count = await this.execute(
      'DELETE FROM spirit.pains WHERE id = $1',
      [id],
    );
    return count > 0;
  }

  async listPains(personalityId?: string): Promise<Pain[]> {
    if (personalityId) {
      const rows = await this.queryMany<PainRow>(
        'SELECT * FROM spirit.pains WHERE personality_id = $1 ORDER BY severity DESC, created_at DESC',
        [personalityId],
      );
      return rows.map(rowToPain);
    }
    const rows = await this.queryMany<PainRow>(
      'SELECT * FROM spirit.pains ORDER BY severity DESC, created_at DESC',
    );
    return rows.map(rowToPain);
  }

  async getActivePains(personalityId?: string): Promise<Pain[]> {
    if (personalityId) {
      const rows = await this.queryMany<PainRow>(
        'SELECT * FROM spirit.pains WHERE is_active = true AND personality_id = $1 ORDER BY severity DESC, created_at DESC',
        [personalityId],
      );
      return rows.map(rowToPain);
    }
    const rows = await this.queryMany<PainRow>(
      'SELECT * FROM spirit.pains WHERE is_active = true ORDER BY severity DESC, created_at DESC',
    );
    return rows.map(rowToPain);
  }

  async getPainCount(): Promise<number> {
    const row = await this.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM spirit.pains',
    );
    return Number(row?.count ?? 0);
  }

  // ── Spirit Meta ──────────────────────────────────────────────

  async getMeta(key: string): Promise<string | null> {
    const row = await this.queryOne<{ value: string }>(
      'SELECT value FROM spirit.meta WHERE key = $1',
      [key],
    );
    return row?.value ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.execute(
      `INSERT INTO spirit.meta (key, value, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = $3`,
      [key, value, Date.now()],
    );
  }
}
