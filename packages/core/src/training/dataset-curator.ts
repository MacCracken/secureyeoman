/**
 * DatasetCuratorManager — filtered, deduplicated dataset snapshots.
 *
 * Builds training datasets from conversation data with quality filtering,
 * token length bounds, deduplication, and tool-error exclusion.
 */

import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import type { CurationRules, CuratedDataset, CuratedDatasetPreview } from '@secureyeoman/shared';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface DatasetCuratorManagerDeps {
  pool: Pool;
  logger: SecureLogger;
}

export class DatasetCuratorManager {
  constructor(private readonly deps: DatasetCuratorManagerDeps) {}

  async previewDataset(rules: CurationRules): Promise<CuratedDatasetPreview> {
    const { rows } = await this.buildFilteredQuery(rules, true);
    const sampleCount = rows.length;
    const totalTokens = rows.reduce((sum, r) => sum + (Number(r.token_estimate) || 0), 0);
    return { sampleCount, totalTokens };
  }

  async commitDataset(
    name: string,
    personalityId: string | undefined,
    rules: CurationRules,
    outputDir: string
  ): Promise<CuratedDataset> {
    const { rows } = await this.buildFilteredQuery(rules, false);
    const sampleCount = rows.length;
    const totalTokens = rows.reduce((sum, r) => sum + (Number(r.token_estimate) || 0), 0);

    // Write JSONL file
    mkdirSync(outputDir, { recursive: true });
    const filename = `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.jsonl`;
    const filePath = join(outputDir, filename);

    const lines: string[] = [];
    for (const row of rows) {
      lines.push(
        JSON.stringify({
          conversation_id: row.conversation_id,
          messages: row.messages,
          quality_score: row.quality_score,
        })
      );
    }

    const content = lines.join('\n') + '\n';
    writeFileSync(filePath, content, 'utf-8');
    const datasetHash = createHash('sha256').update(content).digest('hex').slice(0, 16);

    const { rows: inserted } = await this.deps.pool.query<Record<string, unknown>>(
      `INSERT INTO training.curated_datasets
         (name, personality_id, rules, dataset_hash, sample_count, total_tokens, status, path)
       VALUES ($1, $2, $3, $4, $5, $6, 'committed', $7)
       RETURNING *`,
      [
        name,
        personalityId ?? null,
        JSON.stringify(rules),
        datasetHash,
        sampleCount,
        totalTokens,
        filePath,
      ]
    );

    return this.mapRow(inserted[0]!);
  }

  async listDatasets(opts?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<CuratedDataset[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(opts.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(opts?.limit ?? 100, 1000);
    const offset = opts?.offset ?? 0;

    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.curated_datasets ${where}
       ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    return rows.map((r) => this.mapRow(r));
  }

  async getDataset(id: string): Promise<CuratedDataset | null> {
    const { rows } = await this.deps.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.curated_datasets WHERE id = $1`,
      [id]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async deleteDataset(id: string): Promise<boolean> {
    const { rowCount } = await this.deps.pool.query(
      `DELETE FROM training.curated_datasets WHERE id = $1`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }

  private async buildFilteredQuery(
    rules: CurationRules,
    previewOnly: boolean
  ): Promise<{ rows: Record<string, unknown>[] }> {
    // Build a query that joins conversations with quality scores
    // and applies all curation rules
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (rules.qualityThreshold != null) {
      conditions.push(`COALESCE(cq.quality_score, 0.5) >= $${idx++}`);
      params.push(rules.qualityThreshold);
    }

    if (rules.personalityIds?.length) {
      conditions.push(`c.personality_id = ANY($${idx++})`);
      params.push(rules.personalityIds);
    }

    if (rules.fromTs) {
      conditions.push(`c.created_at >= $${idx++}`);
      params.push(rules.fromTs);
    }

    if (rules.toTs) {
      conditions.push(`c.created_at <= $${idx++}`);
      params.push(rules.toTs);
    }

    if (rules.excludeToolErrors) {
      conditions.push(`c.id NOT IN (
        SELECT DISTINCT conversation_id FROM chat.messages
        WHERE role = 'tool' AND content LIKE '%error%'
      )`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = rules.maxSamples ?? 10000;

    // Estimate tokens as char count / 4
    const sql = `
      SELECT
        c.id AS conversation_id,
        c.personality_id,
        COALESCE(cq.quality_score, 0.5) AS quality_score,
        COALESCE(
          (SELECT SUM(LENGTH(m.content)) / 4 FROM chat.messages m WHERE m.conversation_id = c.id),
          0
        ) AS token_estimate,
        ${
          previewOnly
            ? "'[]'::text"
            : `(
          SELECT json_agg(json_build_object('role', m.role, 'content', m.content) ORDER BY m.created_at)
          FROM chat.messages m WHERE m.conversation_id = c.id
        )`
        } AS messages
      FROM chat.conversations c
      LEFT JOIN training.conversation_quality cq ON cq.conversation_id = c.id
      ${where}
      HAVING COALESCE(
        (SELECT SUM(LENGTH(m2.content)) / 4 FROM chat.messages m2 WHERE m2.conversation_id = c.id),
        0
      ) BETWEEN $${idx++} AND $${idx++}
      ORDER BY COALESCE(cq.quality_score, 0.5) DESC
      LIMIT $${idx}
    `;

    params.push(rules.minTokens ?? 0, rules.maxTokens ?? 1000000, limit);

    const result = await this.deps.pool.query<Record<string, unknown>>(sql, params);
    return { rows: result.rows };
  }

  private mapRow(r: Record<string, unknown>): CuratedDataset {
    return {
      id: r.id as string,
      name: r.name as string,
      personalityId: (r.personality_id as string) ?? null,
      rules: (r.rules as CurationRules) ?? {},
      datasetHash: (r.dataset_hash as string) ?? '',
      sampleCount: Number(r.sample_count) || 0,
      totalTokens: Number(r.total_tokens) || 0,
      status: r.status as CuratedDataset['status'],
      path: (r.path as string) ?? null,
      createdAt:
        r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ''),
    };
  }
}
