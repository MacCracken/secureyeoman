/**
 * VoiceProfileStore — PostgreSQL-backed storage for voice profiles.
 *
 * Extends PgBaseStorage (same pattern as MultimodalStorage).
 */

import { PgBaseStorage } from '../../storage/pg-base.js';
import { uuidv7 } from '../../utils/crypto.js';
import type { VoiceProfile } from '@secureyeoman/shared';

// ─── Row type ──────────────────────────────────────────────────────

interface ProfileRow {
  id: string;
  name: string;
  provider: string;
  voice_id: string;
  settings: Record<string, unknown> | string;
  sample_audio_base64: string | null;
  created_by: string;
  created_at: string | number;
  updated_at: string | number;
}

// ─── Helpers ───────────────────────────────────────────────────────

function profileFromRow(row: ProfileRow): VoiceProfile {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    voiceId: row.voice_id,
    settings:
      typeof row.settings === 'string'
        ? (JSON.parse(row.settings) as Record<string, unknown>)
        : row.settings,
    sampleAudioBase64: row.sample_audio_base64 ?? undefined,
    createdBy: row.created_by,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

// ─── Create / Update input ─────────────────────────────────────────

export interface VoiceProfileCreate {
  name: string;
  provider: string;
  voiceId: string;
  settings?: Record<string, unknown>;
  sampleAudioBase64?: string;
  createdBy?: string;
}

export interface VoiceProfileUpdate {
  name?: string;
  provider?: string;
  voiceId?: string;
  settings?: Record<string, unknown>;
  sampleAudioBase64?: string | null;
}

// ─── Storage ───────────────────────────────────────────────────────

export class VoiceProfileStore extends PgBaseStorage {
  async create(input: VoiceProfileCreate): Promise<VoiceProfile> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<ProfileRow>(
      `INSERT INTO voice.profiles (id, name, provider, voice_id, settings, sample_audio_base64, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        input.name,
        input.provider,
        input.voiceId,
        JSON.stringify(input.settings ?? {}),
        input.sampleAudioBase64 ?? null,
        input.createdBy ?? 'admin',
        now,
        now,
      ]
    );
    return profileFromRow(row!);
  }

  async getById(id: string): Promise<VoiceProfile | null> {
    const row = await this.queryOne<ProfileRow>(
      `SELECT * FROM voice.profiles WHERE id = $1`,
      [id]
    );
    return row ? profileFromRow(row) : null;
  }

  async list(filter?: {
    provider?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ profiles: VoiceProfile[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (filter?.provider) {
      conditions.push(`provider = $${paramIdx++}`);
      values.push(filter.provider);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 200);
    const offset = Math.max(filter?.offset ?? 0, 0);

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM voice.profiles ${where}`,
      values
    );
    const total = parseInt(countResult?.count ?? '0', 10);

    const rows = await this.queryMany<ProfileRow>(
      `SELECT * FROM voice.profiles ${where} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      [...values, limit, offset]
    );

    return { profiles: rows.map(profileFromRow), total };
  }

  async update(id: string, input: VoiceProfileUpdate): Promise<VoiceProfile | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (input.name !== undefined) {
      setClauses.push(`name = $${paramIdx++}`);
      values.push(input.name);
    }
    if (input.provider !== undefined) {
      setClauses.push(`provider = $${paramIdx++}`);
      values.push(input.provider);
    }
    if (input.voiceId !== undefined) {
      setClauses.push(`voice_id = $${paramIdx++}`);
      values.push(input.voiceId);
    }
    if (input.settings !== undefined) {
      setClauses.push(`settings = $${paramIdx++}`);
      values.push(JSON.stringify(input.settings));
    }
    if (input.sampleAudioBase64 !== undefined) {
      setClauses.push(`sample_audio_base64 = $${paramIdx++}`);
      values.push(input.sampleAudioBase64);
    }

    if (setClauses.length === 0) {
      return this.getById(id);
    }

    setClauses.push(`updated_at = $${paramIdx++}`);
    values.push(Date.now());
    values.push(id);

    const row = await this.queryOne<ProfileRow>(
      `UPDATE voice.profiles SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );
    return row ? profileFromRow(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const count = await this.execute(
      `DELETE FROM voice.profiles WHERE id = $1`,
      [id]
    );
    return count > 0;
  }
}
