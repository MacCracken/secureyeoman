/**
 * SemanticCache — vector-backed LLM response cache.
 *
 * get(): embed query -> cosine search > threshold -> return cached response.
 * set(): store embedding + response with TTL.
 * Periodic TTL eviction via cleanup().
 */

import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import { errorToString } from '../utils/errors.js';

export interface SemanticCacheConfig {
  enabled: boolean;
  similarityThreshold: number;
  ttlMs: number;
  maxEntries: number;
}

export interface SemanticCacheDeps {
  pool: Pool;
  logger: SecureLogger;
  config: SemanticCacheConfig;
  embed: (text: string) => Promise<number[]>;
}

export interface CachedResponse {
  content: string;
  provider: string;
  model: string;
  metadata?: Record<string, unknown>;
}

export interface SemanticCacheStats {
  totalEntries: number;
  hitCount: number;
  avgSimilarity: number;
}

export class SemanticCache {
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: SemanticCacheDeps) {}

  async get(query: string, provider: string, model: string): Promise<CachedResponse | null> {
    if (!this.deps.config.enabled) return null;

    try {
      const embedding = await this.deps.embed(query);
      const vectorStr = `[${embedding.join(',')}]`;

      const { rows } = await this.deps.pool.query<{
        response: Record<string, unknown>;
        similarity: number;
        id: string;
      }>(
        `SELECT id, response, 1 - (embedding <=> $1::vector) AS similarity
         FROM ai.semantic_cache
         WHERE provider = $2 AND model = $3 AND expires_at > NOW()
         ORDER BY embedding <=> $1::vector ASC
         LIMIT 1`,
        [vectorStr, provider, model]
      );

      if (rows.length === 0) return null;

      const row = rows[0]!;
      if (row.similarity < this.deps.config.similarityThreshold) return null;

      // Increment hit count
      await this.deps.pool.query(
        `UPDATE ai.semantic_cache SET hit_count = hit_count + 1 WHERE id = $1`,
        [row.id]
      );

      const response = row.response;
      return {
        content: (response.content as string) ?? '',
        provider: (response.provider as string) ?? provider,
        model: (response.model as string) ?? model,
        metadata: response.metadata as Record<string, unknown> | undefined,
      };
    } catch (err) {
      this.deps.logger.warn(
        {
          error: errorToString(err),
        },
        'Semantic cache get error'
      );
      return null;
    }
  }

  async set(
    query: string,
    provider: string,
    model: string,
    response: CachedResponse
  ): Promise<void> {
    if (!this.deps.config.enabled) return;

    try {
      const embedding = await this.deps.embed(query);
      const vectorStr = `[${embedding.join(',')}]`;
      const requestHash = createHash('sha256').update(query).digest('hex');
      const expiresAt = new Date(Date.now() + this.deps.config.ttlMs);

      // Check entry count and evict oldest if needed
      const { rows: countRows } = await this.deps.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ai.semantic_cache`
      );
      const count = parseInt(countRows[0]?.count ?? '0', 10);
      if (count >= this.deps.config.maxEntries) {
        await this.deps.pool.query(
          `DELETE FROM ai.semantic_cache WHERE id IN (
             SELECT id FROM ai.semantic_cache ORDER BY created_at ASC LIMIT $1
           )`,
          [Math.max(1, Math.floor(this.deps.config.maxEntries * 0.1))]
        );
      }

      await this.deps.pool.query(
        `INSERT INTO ai.semantic_cache
           (embedding, provider, model, request_hash, response, expires_at)
         VALUES ($1::vector, $2, $3, $4, $5, $6)`,
        [vectorStr, provider, model, requestHash, JSON.stringify(response), expiresAt]
      );
    } catch (err) {
      this.deps.logger.warn(
        {
          error: errorToString(err),
        },
        'Semantic cache set error'
      );
    }
  }

  async clear(): Promise<number> {
    const { rowCount } = await this.deps.pool.query(`DELETE FROM ai.semantic_cache`);
    return rowCount ?? 0;
  }

  async cleanup(): Promise<number> {
    const { rowCount } = await this.deps.pool.query(
      `DELETE FROM ai.semantic_cache WHERE expires_at < NOW()`
    );
    return rowCount ?? 0;
  }

  async getStats(): Promise<SemanticCacheStats> {
    const { rows } = await this.deps.pool.query<{
      total: string;
      hits: string;
    }>(
      `SELECT COUNT(*)::text AS total, COALESCE(SUM(hit_count), 0)::text AS hits
       FROM ai.semantic_cache WHERE expires_at > NOW()`
    );
    return {
      totalEntries: parseInt(rows[0]?.total ?? '0', 10),
      hitCount: parseInt(rows[0]?.hits ?? '0', 10),
      avgSimilarity: 0, // computed per-query, not tracked globally
    };
  }

  startCleanupInterval(intervalMs = 60_000): void {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(() => {
      void this.cleanup().catch((err: unknown) => {
        this.deps.logger.warn(
          {
            error: errorToString(err),
          },
          'Semantic cache cleanup error'
        );
      });
    }, intervalMs);
  }

  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
