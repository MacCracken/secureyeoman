/**
 * Workflow Version Storage (Phase 114)
 *
 * CRUD operations for workflow version snapshots stored in
 * workflow.versions.
 */

import type { WorkflowVersion } from '@secureyeoman/shared';
import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/id.js';

interface WorkflowVersionRow {
  id: string;
  workflow_id: string;
  version_tag: string | null;
  snapshot: Record<string, unknown>;
  diff_summary: string | null;
  changed_fields: string[];
  author: string;
  created_at: string; // bigint as string from pg
}

function rowToVersion(row: WorkflowVersionRow): WorkflowVersion {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    versionTag: row.version_tag,
    snapshot: row.snapshot,
    diffSummary: row.diff_summary,
    changedFields: row.changed_fields ?? [],
    author: row.author,
    createdAt: Number(row.created_at),
  };
}

export class WorkflowVersionStorage extends PgBaseStorage {
  async createVersion(data: {
    workflowId: string;
    versionTag?: string | null;
    snapshot: Record<string, unknown>;
    diffSummary?: string | null;
    changedFields?: string[];
    author?: string;
  }): Promise<WorkflowVersion> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<WorkflowVersionRow>(
      `INSERT INTO workflow.versions
        (id, workflow_id, version_tag, snapshot, diff_summary, changed_fields, author, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        data.workflowId,
        data.versionTag ?? null,
        JSON.stringify(data.snapshot),
        data.diffSummary ?? null,
        data.changedFields ?? [],
        data.author ?? 'system',
        now,
      ]
    );
    return rowToVersion(row!);
  }

  async listVersions(
    workflowId: string,
    opts?: { limit?: number; offset?: number }
  ): Promise<{ versions: WorkflowVersion[]; total: number }> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    const countRow = await this.queryOne<{ count: string }>(
      'SELECT count(*)::text AS count FROM workflow.versions WHERE workflow_id = $1',
      [workflowId]
    );
    const total = Number(countRow?.count ?? 0);

    const rows = await this.queryMany<WorkflowVersionRow>(
      `SELECT * FROM workflow.versions
       WHERE workflow_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [workflowId, limit, offset]
    );
    return { versions: rows.map(rowToVersion), total };
  }

  async getVersion(id: string): Promise<WorkflowVersion | null> {
    const row = await this.queryOne<WorkflowVersionRow>(
      'SELECT * FROM workflow.versions WHERE id = $1',
      [id]
    );
    return row ? rowToVersion(row) : null;
  }

  async getVersionByTag(workflowId: string, tag: string): Promise<WorkflowVersion | null> {
    const row = await this.queryOne<WorkflowVersionRow>(
      'SELECT * FROM workflow.versions WHERE workflow_id = $1 AND version_tag = $2',
      [workflowId, tag]
    );
    return row ? rowToVersion(row) : null;
  }

  async getLatestVersion(workflowId: string): Promise<WorkflowVersion | null> {
    const row = await this.queryOne<WorkflowVersionRow>(
      `SELECT * FROM workflow.versions
       WHERE workflow_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [workflowId]
    );
    return row ? rowToVersion(row) : null;
  }

  async getLatestTaggedVersion(workflowId: string): Promise<WorkflowVersion | null> {
    const row = await this.queryOne<WorkflowVersionRow>(
      `SELECT * FROM workflow.versions
       WHERE workflow_id = $1 AND version_tag IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [workflowId]
    );
    return row ? rowToVersion(row) : null;
  }

  async tagVersion(id: string, tag: string): Promise<WorkflowVersion | null> {
    const row = await this.queryOne<WorkflowVersionRow>(
      'UPDATE workflow.versions SET version_tag = $2 WHERE id = $1 RETURNING *',
      [id, tag]
    );
    return row ? rowToVersion(row) : null;
  }

  async generateNextTag(workflowId: string): Promise<string> {
    const now = new Date();
    const baseTag = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;

    const existing = await this.queryMany<{ version_tag: string }>(
      `SELECT version_tag FROM workflow.versions
       WHERE workflow_id = $1 AND version_tag LIKE $2`,
      [workflowId, `${baseTag}%`]
    );

    if (existing.length === 0) return baseTag;

    let maxSuffix = 0;
    for (const row of existing) {
      if (row.version_tag === baseTag) {
        maxSuffix = Math.max(maxSuffix, 1);
      } else {
        const match = /-(\d+)$/.exec(row.version_tag);
        if (match) {
          maxSuffix = Math.max(maxSuffix, Number(match[1]) + 1);
        }
      }
    }
    return maxSuffix === 0 ? baseTag : `${baseTag}-${maxSuffix}`;
  }

  async deleteVersionsForWorkflow(workflowId: string): Promise<number> {
    return this.execute('DELETE FROM workflow.versions WHERE workflow_id = $1', [workflowId]);
  }
}
