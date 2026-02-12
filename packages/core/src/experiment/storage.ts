/**
 * Experiment Storage — SQLite persistence for A/B tests
 */

import Database from 'better-sqlite3';
import type { Experiment, ExperimentCreate } from '@friday/shared';
import { uuidv7 } from '../utils/crypto.js';

export class ExperimentStorage {
  private db: Database.Database;

  constructor(opts: { dbPath: string }) {
    this.db = new Database(opts.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS experiments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        status TEXT DEFAULT 'draft',
        variants TEXT DEFAULT '[]',
        results TEXT DEFAULT '[]',
        started_at INTEGER,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  create(data: ExperimentCreate): Experiment {
    const now = Date.now();
    const id = uuidv7();
    const exp: Experiment = {
      id, name: data.name, description: data.description ?? '', status: data.status ?? 'draft',
      variants: data.variants, results: [], startedAt: null, completedAt: null, createdAt: now, updatedAt: now,
    };
    this.db.prepare('INSERT INTO experiments (id, name, description, status, variants, results, started_at, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, exp.name, exp.description, exp.status, JSON.stringify(exp.variants), '[]', null, null, now, now
    );
    return exp;
  }

  get(id: string): Experiment | null {
    const row = this.db.prepare('SELECT * FROM experiments WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToExperiment(row) : null;
  }

  list(): Experiment[] {
    return (this.db.prepare('SELECT * FROM experiments ORDER BY created_at DESC').all() as Record<string, unknown>[]).map(r => this.rowToExperiment(r));
  }

  update(id: string, data: Partial<Experiment>): Experiment | null {
    const existing = this.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data, updatedAt: Date.now() };
    this.db.prepare('UPDATE experiments SET name = ?, description = ?, status = ?, variants = ?, results = ?, started_at = ?, completed_at = ?, updated_at = ? WHERE id = ?').run(
      updated.name, updated.description, updated.status, JSON.stringify(updated.variants), JSON.stringify(updated.results), updated.startedAt, updated.completedAt, updated.updatedAt, id
    );
    return updated;
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM experiments WHERE id = ?').run(id).changes > 0;
  }

  private rowToExperiment(row: Record<string, unknown>): Experiment {
    return {
      id: row.id as string, name: row.name as string, description: (row.description as string) ?? '',
      status: (row.status as Experiment['status']) ?? 'draft', variants: JSON.parse((row.variants as string) || '[]'),
      results: JSON.parse((row.results as string) || '[]'), startedAt: (row.started_at as number) ?? null,
      completedAt: (row.completed_at as number) ?? null, createdAt: row.created_at as number, updatedAt: row.updated_at as number,
    };
  }

  close(): void { this.db.close(); }
}
