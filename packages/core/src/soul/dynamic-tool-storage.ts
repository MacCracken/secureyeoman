/**
 * DynamicToolStorage — PostgreSQL-backed persistence for AI-generated dynamic tools.
 *
 * Each row stores the tool's name, description, JSON-Schema parameters, and the
 * JavaScript implementation code that is compiled at load time.  Rows are keyed
 * by `name` (UNIQUE) so re-registering a tool with the same name performs an
 * upsert (update in place).
 *
 * Table: soul.dynamic_tools
 * Gated by: SecurityConfig.allowDynamicTools (global) +
 *           CreationConfig.allowDynamicTools (per-personality)
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';

// ── Row type ─────────────────────────────────────────────────────────────────

interface DynamicToolRow {
  id: string;
  name: string;
  description: string;
  parameters_schema: Record<string, unknown>;
  implementation: string;
  personality_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ── Public types ─────────────────────────────────────────────────────────────

export interface DynamicTool {
  id: string;
  name: string;
  description: string;
  parametersSchema: Record<string, unknown>;
  implementation: string;
  personalityId: string | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type DynamicToolCreate = Omit<DynamicTool, 'id' | 'createdAt' | 'updatedAt'>;

// ── Helper ───────────────────────────────────────────────────────────────────

function toolFromRow(row: DynamicToolRow): DynamicTool {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    parametersSchema: row.parameters_schema ?? {},
    implementation: row.implementation,
    personalityId: row.personality_id,
    createdBy: row.created_by,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

// ── Storage ──────────────────────────────────────────────────────────────────

export class DynamicToolStorage extends PgBaseStorage {
  /**
   * Create the soul.dynamic_tools table if it doesn't exist yet.
   * Called during DynamicToolManager.initialize() so no migration is required.
   */
  async ensureTables(): Promise<void> {
    await this.query(`
      CREATE TABLE IF NOT EXISTS soul.dynamic_tools (
        id           TEXT    PRIMARY KEY,
        name         TEXT    UNIQUE NOT NULL,
        description  TEXT    NOT NULL DEFAULT '',
        parameters_schema JSONB NOT NULL DEFAULT '{}',
        implementation TEXT  NOT NULL DEFAULT '',
        personality_id TEXT  NULL,
        created_by   TEXT    NOT NULL DEFAULT 'ai',
        created_at   BIGINT  NOT NULL,
        updated_at   BIGINT  NOT NULL
      )
    `);
  }

  /** Upsert a dynamic tool by name.  Re-registering the same name updates description,
   *  parameters_schema, and implementation while preserving the original id. */
  async upsertTool(data: DynamicToolCreate): Promise<DynamicTool> {
    const now = Date.now();
    const id = uuidv7();
    const row = await this.queryOne<DynamicToolRow>(
      `INSERT INTO soul.dynamic_tools
         (id, name, description, parameters_schema, implementation, personality_id, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       ON CONFLICT (name) DO UPDATE
         SET description       = EXCLUDED.description,
             parameters_schema = EXCLUDED.parameters_schema,
             implementation    = EXCLUDED.implementation,
             updated_at        = EXCLUDED.updated_at
       RETURNING *`,
      [
        id,
        data.name,
        data.description,
        JSON.stringify(data.parametersSchema),
        data.implementation,
        data.personalityId,
        data.createdBy,
        now,
      ]
    );
    if (!row) throw new Error('Failed to upsert dynamic tool');
    return toolFromRow(row);
  }

  /** List all registered dynamic tools ordered by creation time. */
  async listTools(): Promise<DynamicTool[]> {
    const rows = await this.queryMany<DynamicToolRow>(
      'SELECT * FROM soul.dynamic_tools ORDER BY created_at ASC'
    );
    return rows.map(toolFromRow);
  }

  /** Get a single tool by name. Returns null if not found. */
  async getTool(name: string): Promise<DynamicTool | null> {
    const row = await this.queryOne<DynamicToolRow>(
      'SELECT * FROM soul.dynamic_tools WHERE name = $1',
      [name]
    );
    return row ? toolFromRow(row) : null;
  }

  /** Delete a tool by name.  Returns true if a row was deleted. */
  async deleteTool(name: string): Promise<boolean> {
    const count = await this.execute('DELETE FROM soul.dynamic_tools WHERE name = $1', [name]);
    return count > 0;
  }
}
