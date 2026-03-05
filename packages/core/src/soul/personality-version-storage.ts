/**
 * Personality Version Storage (Phase 114)
 *
 * CRUD operations for personality version snapshots stored in
 * soul.personality_versions.
 */

import type { PersonalityVersion } from '@secureyeoman/shared';
import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/id.js';

interface PersonalityVersionRow {
  id: string;
  personality_id: string;
  version_tag: string | null;
  snapshot: Record<string, unknown>;
  snapshot_md: string;
  diff_summary: string | null;
  changed_fields: string[];
  author: string;
  created_at: string; // bigint as string from pg
}

function rowToVersion(row: PersonalityVersionRow): PersonalityVersion {
  return {
    id: row.id,
    personalityId: row.personality_id,
    versionTag: row.version_tag,
    snapshot: row.snapshot,
    snapshotMd: row.snapshot_md,
    diffSummary: row.diff_summary,
    changedFields: row.changed_fields ?? [],
    author: row.author,
    createdAt: Number(row.created_at),
  };
}

export class PersonalityVersionStorage extends PgBaseStorage {
  async createVersion(data: {
    personalityId: string;
    versionTag?: string | null;
    snapshot: Record<string, unknown>;
    snapshotMd: string;
    diffSummary?: string | null;
    changedFields?: string[];
    author?: string;
  }): Promise<PersonalityVersion> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<PersonalityVersionRow>(
      `INSERT INTO soul.personality_versions
        (id, personality_id, version_tag, snapshot, snapshot_md, diff_summary, changed_fields, author, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        data.personalityId,
        data.versionTag ?? null,
        JSON.stringify(data.snapshot),
        data.snapshotMd,
        data.diffSummary ?? null,
        data.changedFields ?? [],
        data.author ?? 'system',
        now,
      ]
    );
    return rowToVersion(row!);
  }

  async listVersions(
    personalityId: string,
    opts?: { limit?: number; offset?: number }
  ): Promise<{ versions: PersonalityVersion[]; total: number }> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    const countRow = await this.queryOne<{ count: string }>(
      'SELECT count(*)::text AS count FROM soul.personality_versions WHERE personality_id = $1',
      [personalityId]
    );
    const total = Number(countRow?.count ?? 0);

    const rows = await this.queryMany<PersonalityVersionRow>(
      `SELECT * FROM soul.personality_versions
       WHERE personality_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [personalityId, limit, offset]
    );
    return { versions: rows.map(rowToVersion), total };
  }

  async getVersion(id: string): Promise<PersonalityVersion | null> {
    const row = await this.queryOne<PersonalityVersionRow>(
      'SELECT * FROM soul.personality_versions WHERE id = $1',
      [id]
    );
    return row ? rowToVersion(row) : null;
  }

  async getVersionByTag(personalityId: string, tag: string): Promise<PersonalityVersion | null> {
    const row = await this.queryOne<PersonalityVersionRow>(
      'SELECT * FROM soul.personality_versions WHERE personality_id = $1 AND version_tag = $2',
      [personalityId, tag]
    );
    return row ? rowToVersion(row) : null;
  }

  async getLatestVersion(personalityId: string): Promise<PersonalityVersion | null> {
    const row = await this.queryOne<PersonalityVersionRow>(
      `SELECT * FROM soul.personality_versions
       WHERE personality_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [personalityId]
    );
    return row ? rowToVersion(row) : null;
  }

  async getLatestTaggedVersion(personalityId: string): Promise<PersonalityVersion | null> {
    const row = await this.queryOne<PersonalityVersionRow>(
      `SELECT * FROM soul.personality_versions
       WHERE personality_id = $1 AND version_tag IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [personalityId]
    );
    return row ? rowToVersion(row) : null;
  }

  async tagVersion(id: string, tag: string): Promise<PersonalityVersion | null> {
    const row = await this.queryOne<PersonalityVersionRow>(
      'UPDATE soul.personality_versions SET version_tag = $2 WHERE id = $1 RETURNING *',
      [id, tag]
    );
    return row ? rowToVersion(row) : null;
  }

  async clearTag(id: string): Promise<PersonalityVersion | null> {
    const row = await this.queryOne<PersonalityVersionRow>(
      'UPDATE soul.personality_versions SET version_tag = NULL WHERE id = $1 RETURNING *',
      [id]
    );
    return row ? rowToVersion(row) : null;
  }

  async generateNextTag(personalityId: string): Promise<string> {
    const now = new Date();
    const baseTag = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;

    // Check if any version with this base tag exists
    const existing = await this.queryMany<{ version_tag: string }>(
      `SELECT version_tag FROM soul.personality_versions
       WHERE personality_id = $1 AND version_tag LIKE $2`,
      [personalityId, `${baseTag}%`]
    );

    if (existing.length === 0) return baseTag;

    // Find highest suffix
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

  async deleteVersionsForPersonality(personalityId: string): Promise<number> {
    return this.execute('DELETE FROM soul.personality_versions WHERE personality_id = $1', [
      personalityId,
    ]);
  }
}
