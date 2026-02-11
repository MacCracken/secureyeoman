/**
 * Spirit Storage — SQLite-backed storage for passions, inspirations, and pains.
 *
 * Follows the same patterns as SoulStorage:
 *   WAL mode, prepared statements, explicit close().
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  Passion, PassionCreate, PassionUpdate,
  Inspiration, InspirationCreate, InspirationUpdate,
  Pain, PainCreate, PainUpdate,
} from './types.js';
import { uuidv7 } from '../utils/crypto.js';

interface PassionRow {
  id: string;
  name: string;
  description: string;
  intensity: number;
  is_active: number;
  created_at: number;
  updated_at: number;
}

interface InspirationRow {
  id: string;
  source: string;
  description: string;
  impact: number;
  is_active: number;
  created_at: number;
  updated_at: number;
}

interface PainRow {
  id: string;
  trigger_name: string;
  description: string;
  severity: number;
  is_active: number;
  created_at: number;
  updated_at: number;
}

function rowToPassion(row: PassionRow): Passion {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    intensity: row.intensity,
    isActive: row.is_active === 1,
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
    isActive: row.is_active === 1,
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
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SpiritStorage {
  private db: Database.Database;

  constructor(opts: { dbPath?: string } = {}) {
    const dbPath = opts.dbPath ?? ':memory:';

    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS passions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        intensity REAL NOT NULL DEFAULT 0.5,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inspirations (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        impact REAL NOT NULL DEFAULT 0.5,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pains (
        id TEXT PRIMARY KEY,
        trigger_name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        severity REAL NOT NULL DEFAULT 0.5,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS spirit_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  // ── Passions ─────────────────────────────────────────────────

  createPassion(data: PassionCreate): Passion {
    const now = Date.now();
    const id = uuidv7();

    this.db
      .prepare(
        `INSERT INTO passions (id, name, description, intensity, is_active, created_at, updated_at)
         VALUES (@id, @name, @description, @intensity, @is_active, @created_at, @updated_at)`,
      )
      .run({
        id,
        name: data.name,
        description: data.description ?? '',
        intensity: data.intensity ?? 0.5,
        is_active: data.isActive !== false ? 1 : 0,
        created_at: now,
        updated_at: now,
      });

    const result = this.getPassion(id);
    if (!result) throw new Error(`Failed to retrieve passion after insert: ${id}`);
    return result;
  }

  getPassion(id: string): Passion | null {
    const row = this.db
      .prepare('SELECT * FROM passions WHERE id = ?')
      .get(id) as PassionRow | undefined;
    return row ? rowToPassion(row) : null;
  }

  updatePassion(id: string, data: PassionUpdate): Passion {
    const existing = this.getPassion(id);
    if (!existing) {
      throw new Error(`Passion not found: ${id}`);
    }

    const now = Date.now();
    this.db
      .prepare(
        `UPDATE passions SET
           name = @name,
           description = @description,
           intensity = @intensity,
           is_active = @is_active,
           updated_at = @updated_at
         WHERE id = @id`,
      )
      .run({
        id,
        name: data.name ?? existing.name,
        description: data.description ?? existing.description,
        intensity: data.intensity ?? existing.intensity,
        is_active: data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
        updated_at: now,
      });

    const result = this.getPassion(id);
    if (!result) throw new Error(`Failed to retrieve passion after update: ${id}`);
    return result;
  }

  deletePassion(id: string): boolean {
    const info = this.db
      .prepare('DELETE FROM passions WHERE id = ?')
      .run(id);
    return info.changes > 0;
  }

  listPassions(): Passion[] {
    const rows = this.db
      .prepare('SELECT * FROM passions ORDER BY intensity DESC, created_at DESC')
      .all() as PassionRow[];
    return rows.map(rowToPassion);
  }

  getActivePassions(): Passion[] {
    const rows = this.db
      .prepare('SELECT * FROM passions WHERE is_active = 1 ORDER BY intensity DESC, created_at DESC')
      .all() as PassionRow[];
    return rows.map(rowToPassion);
  }

  getPassionCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM passions')
      .get() as { count: number };
    return row.count;
  }

  // ── Inspirations ─────────────────────────────────────────────

  createInspiration(data: InspirationCreate): Inspiration {
    const now = Date.now();
    const id = uuidv7();

    this.db
      .prepare(
        `INSERT INTO inspirations (id, source, description, impact, is_active, created_at, updated_at)
         VALUES (@id, @source, @description, @impact, @is_active, @created_at, @updated_at)`,
      )
      .run({
        id,
        source: data.source,
        description: data.description ?? '',
        impact: data.impact ?? 0.5,
        is_active: data.isActive !== false ? 1 : 0,
        created_at: now,
        updated_at: now,
      });

    const result = this.getInspiration(id);
    if (!result) throw new Error(`Failed to retrieve inspiration after insert: ${id}`);
    return result;
  }

  getInspiration(id: string): Inspiration | null {
    const row = this.db
      .prepare('SELECT * FROM inspirations WHERE id = ?')
      .get(id) as InspirationRow | undefined;
    return row ? rowToInspiration(row) : null;
  }

  updateInspiration(id: string, data: InspirationUpdate): Inspiration {
    const existing = this.getInspiration(id);
    if (!existing) {
      throw new Error(`Inspiration not found: ${id}`);
    }

    const now = Date.now();
    this.db
      .prepare(
        `UPDATE inspirations SET
           source = @source,
           description = @description,
           impact = @impact,
           is_active = @is_active,
           updated_at = @updated_at
         WHERE id = @id`,
      )
      .run({
        id,
        source: data.source ?? existing.source,
        description: data.description ?? existing.description,
        impact: data.impact ?? existing.impact,
        is_active: data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
        updated_at: now,
      });

    const result = this.getInspiration(id);
    if (!result) throw new Error(`Failed to retrieve inspiration after update: ${id}`);
    return result;
  }

  deleteInspiration(id: string): boolean {
    const info = this.db
      .prepare('DELETE FROM inspirations WHERE id = ?')
      .run(id);
    return info.changes > 0;
  }

  listInspirations(): Inspiration[] {
    const rows = this.db
      .prepare('SELECT * FROM inspirations ORDER BY impact DESC, created_at DESC')
      .all() as InspirationRow[];
    return rows.map(rowToInspiration);
  }

  getActiveInspirations(): Inspiration[] {
    const rows = this.db
      .prepare('SELECT * FROM inspirations WHERE is_active = 1 ORDER BY impact DESC, created_at DESC')
      .all() as InspirationRow[];
    return rows.map(rowToInspiration);
  }

  getInspirationCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM inspirations')
      .get() as { count: number };
    return row.count;
  }

  // ── Pains ────────────────────────────────────────────────────

  createPain(data: PainCreate): Pain {
    const now = Date.now();
    const id = uuidv7();

    this.db
      .prepare(
        `INSERT INTO pains (id, trigger_name, description, severity, is_active, created_at, updated_at)
         VALUES (@id, @trigger_name, @description, @severity, @is_active, @created_at, @updated_at)`,
      )
      .run({
        id,
        trigger_name: data.trigger,
        description: data.description ?? '',
        severity: data.severity ?? 0.5,
        is_active: data.isActive !== false ? 1 : 0,
        created_at: now,
        updated_at: now,
      });

    const result = this.getPain(id);
    if (!result) throw new Error(`Failed to retrieve pain after insert: ${id}`);
    return result;
  }

  getPain(id: string): Pain | null {
    const row = this.db
      .prepare('SELECT * FROM pains WHERE id = ?')
      .get(id) as PainRow | undefined;
    return row ? rowToPain(row) : null;
  }

  updatePain(id: string, data: PainUpdate): Pain {
    const existing = this.getPain(id);
    if (!existing) {
      throw new Error(`Pain not found: ${id}`);
    }

    const now = Date.now();
    this.db
      .prepare(
        `UPDATE pains SET
           trigger_name = @trigger_name,
           description = @description,
           severity = @severity,
           is_active = @is_active,
           updated_at = @updated_at
         WHERE id = @id`,
      )
      .run({
        id,
        trigger_name: data.trigger ?? existing.trigger,
        description: data.description ?? existing.description,
        severity: data.severity ?? existing.severity,
        is_active: data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
        updated_at: now,
      });

    const result = this.getPain(id);
    if (!result) throw new Error(`Failed to retrieve pain after update: ${id}`);
    return result;
  }

  deletePain(id: string): boolean {
    const info = this.db
      .prepare('DELETE FROM pains WHERE id = ?')
      .run(id);
    return info.changes > 0;
  }

  listPains(): Pain[] {
    const rows = this.db
      .prepare('SELECT * FROM pains ORDER BY severity DESC, created_at DESC')
      .all() as PainRow[];
    return rows.map(rowToPain);
  }

  getActivePains(): Pain[] {
    const rows = this.db
      .prepare('SELECT * FROM pains WHERE is_active = 1 ORDER BY severity DESC, created_at DESC')
      .all() as PainRow[];
    return rows.map(rowToPain);
  }

  getPainCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM pains')
      .get() as { count: number };
    return row.count;
  }

  // ── Spirit Meta ──────────────────────────────────────────────

  getMeta(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM spirit_meta WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO spirit_meta (key, value, updated_at) VALUES (@key, @value, @updated_at)
         ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = @updated_at`,
      )
      .run({ key, value, updated_at: Date.now() });
  }

  close(): void {
    this.db.close();
  }
}
