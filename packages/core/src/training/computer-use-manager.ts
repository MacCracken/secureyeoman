/**
 * ComputerUseManager — stores and queries computer-use RL episodes.
 *
 * Episodes are (state, action, reward, done) tuples recorded by the Tauri
 * desktop client during computer-use skill execution. They can be exported
 * as JSONL for offline RL training.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ComputerUseEpisode {
  id: string;
  sessionId: string;
  skillName: string;
  stateEncoding: Record<string, unknown>;
  actionType: string;
  actionTarget: string;
  actionValue: string;
  reward: number;
  done: boolean;
  createdAt: string;
}

export interface ListEpisodesOptions {
  skillName?: string;
  sessionId?: string;
  limit?: number;
}

export interface SessionStats {
  totalEpisodes: number;
  successRate: number;
  avgReward: number;
}

export interface SkillStat {
  skillName: string;
  episodeCount: number;
  successRate: number;
  avgReward: number;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function rowToEpisode(row: Record<string, unknown>): ComputerUseEpisode {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    skillName: row.skill_name as string,
    stateEncoding: (row.state_encoding as Record<string, unknown>) ?? {},
    actionType: row.action_type as string,
    actionTarget: (row.action_target as string) ?? '',
    actionValue: (row.action_value as string) ?? '',
    reward: (row.reward as number) ?? 0,
    done: (row.done as boolean) ?? false,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? new Date().toISOString()),
  };
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class ComputerUseManager {
  constructor(
    private readonly pool: Pool,
    private readonly logger: SecureLogger
  ) {}

  /** Record a new episode. */
  async recordEpisode(
    ep: Omit<ComputerUseEpisode, 'id' | 'createdAt'>
  ): Promise<ComputerUseEpisode> {
    const id = randomUUID();
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO training.computer_use_episodes
         (id, session_id, skill_name, state_encoding, action_type,
          action_target, action_value, reward, done)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        id,
        ep.sessionId,
        ep.skillName,
        JSON.stringify(ep.stateEncoding),
        ep.actionType,
        ep.actionTarget,
        ep.actionValue,
        ep.reward,
        ep.done,
      ]
    );
    this.logger.debug('ComputerUseManager: episode recorded', { id, skillName: ep.skillName });
    return rowToEpisode(rows[0]!);
  }

  /** List episodes with optional filters. */
  async listEpisodes(opts: ListEpisodesOptions = {}): Promise<ComputerUseEpisode[]> {
    const { skillName, sessionId, limit = 100 } = opts;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (skillName) {
      conditions.push(`skill_name = $${idx++}`);
      params.push(skillName);
    }
    if (sessionId) {
      conditions.push(`session_id = $${idx++}`);
      params.push(sessionId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);

    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.computer_use_episodes
       ${where}
       ORDER BY created_at DESC
       LIMIT $${idx}`,
      params
    );
    return rows.map(rowToEpisode);
  }

  /** Get aggregate stats for a session. */
  async getSessionStats(sessionId: string): Promise<SessionStats> {
    const { rows } = await this.pool.query<{
      total: string;
      done_count: string;
      avg_reward: string | null;
    }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE done = true) AS done_count,
              AVG(reward) AS avg_reward
       FROM   training.computer_use_episodes
       WHERE  session_id = $1`,
      [sessionId]
    );
    const row = rows[0]!;
    const total = parseInt(row.total, 10);
    const doneCount = parseInt(row.done_count, 10);
    return {
      totalEpisodes: total,
      successRate: total > 0 ? doneCount / total : 0,
      avgReward: row.avg_reward != null ? parseFloat(row.avg_reward) : 0,
    };
  }

  /** Get per-skill breakdown across all episodes. */
  async getSkillBreakdown(): Promise<SkillStat[]> {
    const { rows } = await this.pool.query<{
      skill_name: string;
      cnt: string;
      done_count: string;
      avg_reward: string | null;
    }>(
      `SELECT skill_name,
              COUNT(*)                                           AS cnt,
              COUNT(*) FILTER (WHERE done = true)               AS done_count,
              AVG(reward)                                        AS avg_reward
       FROM   training.computer_use_episodes
       GROUP  BY skill_name
       ORDER  BY cnt DESC`
    );
    return rows.map((r) => {
      const cnt = parseInt(r.cnt, 10);
      const doneCount = parseInt(r.done_count, 10);
      return {
        skillName: r.skill_name,
        episodeCount: cnt,
        successRate: cnt > 0 ? doneCount / cnt : 0,
        avgReward: r.avg_reward != null ? parseFloat(r.avg_reward) : 0,
      };
    });
  }

  /** Delete a single episode by ID. */
  async deleteEpisode(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM training.computer_use_episodes WHERE id = $1`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Export episodes as JSONL for offline RL training.
   * Yields one JSON string per episode.
   */
  async *exportEpisodes(format: 'computer_use'): AsyncGenerator<string> {
    // Fetch in pages to avoid buffering everything in memory
    const PAGE = 200;
    let offset = 0;

    while (true) {
      const { rows } = await this.pool.query<Record<string, unknown>>(
        `SELECT * FROM training.computer_use_episodes
         ORDER BY created_at ASC
         LIMIT $1 OFFSET $2`,
        [PAGE, offset]
      );

      if (rows.length === 0) break;

      for (const row of rows) {
        const ep = rowToEpisode(row);
        yield JSON.stringify({
          format,
          id: ep.id,
          session_id: ep.sessionId,
          skill_name: ep.skillName,
          state: ep.stateEncoding,
          action: {
            type: ep.actionType,
            target: ep.actionTarget,
            value: ep.actionValue,
          },
          reward: ep.reward,
          done: ep.done,
          created_at: ep.createdAt,
        }) + '\n';
      }

      offset += rows.length;
      if (rows.length < PAGE) break;
    }
  }
}
