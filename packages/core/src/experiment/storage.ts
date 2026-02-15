/**
 * Experiment Storage — PostgreSQL persistence for A/B tests
 */

import type { Experiment, ExperimentCreate } from '@friday/shared';
import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';

export class ExperimentStorage extends PgBaseStorage {
  constructor() {
    super();
  }

  async create(data: ExperimentCreate): Promise<Experiment> {
    const now = Date.now();
    const id = uuidv7();
    const exp: Experiment = {
      id,
      name: data.name,
      description: data.description ?? '',
      status: data.status ?? 'draft',
      variants: data.variants,
      results: [],
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.execute(
      `INSERT INTO experiment.experiments
        (id, name, description, status, variants, results, started_at, completed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        exp.name,
        exp.description,
        exp.status,
        JSON.stringify(exp.variants),
        '[]',
        null,
        null,
        now,
        now,
      ],
    );
    return exp;
  }

  async get(id: string): Promise<Experiment | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM experiment.experiments WHERE id = $1',
      [id],
    );
    return row ? this.rowToExperiment(row) : null;
  }

  async list(): Promise<Experiment[]> {
    const rows = await this.queryMany<Record<string, unknown>>(
      'SELECT * FROM experiment.experiments ORDER BY created_at DESC',
    );
    return rows.map((r) => this.rowToExperiment(r));
  }

  async update(id: string, data: Partial<Experiment>): Promise<Experiment | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data, updatedAt: Date.now() };
    await this.execute(
      `UPDATE experiment.experiments
       SET name = $1, description = $2, status = $3, variants = $4, results = $5,
           started_at = $6, completed_at = $7, updated_at = $8
       WHERE id = $9`,
      [
        updated.name,
        updated.description,
        updated.status,
        JSON.stringify(updated.variants),
        JSON.stringify(updated.results),
        updated.startedAt,
        updated.completedAt,
        updated.updatedAt,
        id,
      ],
    );
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const changes = await this.execute(
      'DELETE FROM experiment.experiments WHERE id = $1',
      [id],
    );
    return changes > 0;
  }

  private rowToExperiment(row: Record<string, unknown>): Experiment {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) ?? '',
      status: (row.status as Experiment['status']) ?? 'draft',
      variants: row.variants as Experiment['variants'],
      results: row.results as Experiment['results'],
      startedAt: (row.started_at as number) ?? null,
      completedAt: (row.completed_at as number) ?? null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }
}
