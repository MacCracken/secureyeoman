/**
 * ExtensionStorage — PostgreSQL-backed storage for extensions, hooks, and webhooks.
 *
 * Extends PgBaseStorage for query helpers and transaction support.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import type { ExtensionManifest, HookPoint, HookSemantics, WebhookConfig } from './types.js';

// ─── Row types ──────────────────────────────────────────────────────

interface ExtensionRow {
  id: string;
  name: string;
  version: string;
  hooks: string; // JSON text
  created_at: string;
  updated_at: string;
}

interface HookRow {
  id: string;
  extension_id: string;
  hook_point: string;
  semantics: string;
  priority: number;
  created_at: string;
}

interface WebhookRow {
  id: string;
  url: string;
  hook_points: string; // JSON text
  secret: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function extensionFromRow(row: ExtensionRow): ExtensionManifest {
  let hooks: ExtensionManifest['hooks'] = [];
  try {
    hooks = typeof row.hooks === 'string' ? JSON.parse(row.hooks) : row.hooks;
  } catch {
    hooks = [];
  }
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    hooks,
  };
}

export interface HookRecord {
  id: string;
  extensionId: string;
  hookPoint: string;
  semantics: string;
  priority: number;
  createdAt: number;
}

function hookFromRow(row: HookRow): HookRecord {
  return {
    id: row.id,
    extensionId: row.extension_id,
    hookPoint: row.hook_point,
    semantics: row.semantics,
    priority: row.priority,
    createdAt: new Date(row.created_at).getTime(),
  };
}

function webhookFromRow(row: WebhookRow): WebhookConfig {
  let hookPoints: HookPoint[] = [];
  try {
    hookPoints =
      typeof row.hook_points === 'string' ? JSON.parse(row.hook_points) : row.hook_points;
  } catch {
    hookPoints = [];
  }
  return {
    id: row.id,
    url: row.url,
    hookPoints,
    secret: row.secret ?? undefined,
    enabled: row.enabled,
  };
}

// ─── Storage ────────────────────────────────────────────────────────

export class ExtensionStorage extends PgBaseStorage {
  // ── Extension operations ─────────────────────────────────────

  async listExtensions(): Promise<ExtensionManifest[]> {
    const rows = await this.queryMany<ExtensionRow>(
      `SELECT * FROM extensions.manifests ORDER BY name ASC`
    );
    return rows.map(extensionFromRow);
  }

  async getExtension(id: string): Promise<ExtensionManifest | null> {
    const row = await this.queryOne<ExtensionRow>(
      `SELECT * FROM extensions.manifests WHERE id = $1`,
      [id]
    );
    return row ? extensionFromRow(row) : null;
  }

  async registerExtension(manifest: ExtensionManifest): Promise<ExtensionManifest> {
    const id = manifest.id || uuidv7();
    const row = await this.queryOne<ExtensionRow>(
      `INSERT INTO extensions.manifests (id, name, version, hooks)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         version = EXCLUDED.version,
         hooks = EXCLUDED.hooks,
         updated_at = now()
       RETURNING *`,
      [id, manifest.name, manifest.version, JSON.stringify(manifest.hooks)]
    );
    return extensionFromRow(row!);
  }

  async removeExtension(id: string): Promise<boolean> {
    const count = await this.execute(`DELETE FROM extensions.manifests WHERE id = $1`, [id]);
    return count > 0;
  }

  // ── Hook operations ──────────────────────────────────────────

  async listHooks(filter?: { extensionId?: string; hookPoint?: string }): Promise<HookRecord[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (filter?.extensionId) {
      conditions.push(`extension_id = $${paramIdx++}`);
      values.push(filter.extensionId);
    }
    if (filter?.hookPoint) {
      conditions.push(`hook_point = $${paramIdx++}`);
      values.push(filter.hookPoint);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await this.queryMany<HookRow>(
      `SELECT * FROM extensions.hooks ${where} ORDER BY priority ASC, created_at ASC`,
      values
    );
    return rows.map(hookFromRow);
  }

  async registerHook(data: {
    extensionId: string;
    hookPoint: string;
    semantics: string;
    priority: number;
  }): Promise<HookRecord> {
    const id = uuidv7();
    const row = await this.queryOne<HookRow>(
      `INSERT INTO extensions.hooks (id, extension_id, hook_point, semantics, priority)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, data.extensionId, data.hookPoint, data.semantics, data.priority]
    );
    return hookFromRow(row!);
  }

  async removeHook(id: string): Promise<boolean> {
    const count = await this.execute(`DELETE FROM extensions.hooks WHERE id = $1`, [id]);
    return count > 0;
  }

  // ── Webhook operations ───────────────────────────────────────

  async listWebhooks(): Promise<WebhookConfig[]> {
    const rows = await this.queryMany<WebhookRow>(
      `SELECT * FROM extensions.webhooks ORDER BY created_at ASC`
    );
    return rows.map(webhookFromRow);
  }

  async registerWebhook(config: Omit<WebhookConfig, 'id'>): Promise<WebhookConfig> {
    const id = uuidv7();
    const row = await this.queryOne<WebhookRow>(
      `INSERT INTO extensions.webhooks (id, url, hook_points, secret, enabled)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       RETURNING *`,
      [id, config.url, JSON.stringify(config.hookPoints), config.secret ?? null, config.enabled]
    );
    return webhookFromRow(row!);
  }

  async removeWebhook(id: string): Promise<boolean> {
    const count = await this.execute(`DELETE FROM extensions.webhooks WHERE id = $1`, [id]);
    return count > 0;
  }

  async updateWebhook(id: string, data: Partial<WebhookConfig>): Promise<WebhookConfig | null> {
    const existing = await this.queryOne<WebhookRow>(
      `SELECT * FROM extensions.webhooks WHERE id = $1`,
      [id]
    );
    if (!existing) return null;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (data.url !== undefined) {
      updates.push(`url = $${paramIdx++}`);
      values.push(data.url);
    }
    if (data.hookPoints !== undefined) {
      updates.push(`hook_points = $${paramIdx++}::jsonb`);
      values.push(JSON.stringify(data.hookPoints));
    }
    if (data.secret !== undefined) {
      updates.push(`secret = $${paramIdx++}`);
      values.push(data.secret);
    }
    if (data.enabled !== undefined) {
      updates.push(`enabled = $${paramIdx++}`);
      values.push(data.enabled);
    }

    if (updates.length === 0) return webhookFromRow(existing);

    updates.push('updated_at = now()');
    values.push(id);

    const row = await this.queryOne<WebhookRow>(
      `UPDATE extensions.webhooks SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );
    return row ? webhookFromRow(row) : null;
  }
}
