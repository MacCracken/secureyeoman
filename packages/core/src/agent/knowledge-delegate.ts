/**
 * Knowledge Delegate — Forwards RAG/brain queries to a parent SY instance.
 *
 * Agents do not have a local vector store or BrainManager. When an agent
 * needs context (e.g. for personality grounding or memory recall), it
 * forwards the query to its parent via the A2A `brain:query` message type
 * or the parent's REST API.
 */

import type { SecureLogger } from '../logging/logger.js';

export interface KnowledgeDelegateConfig {
  /** Parent SY instance URL */
  parentUrl: string;
  /** Agent registration token for parent auth */
  registrationToken?: string;
  /** Timeout for knowledge queries in ms. Default: 15_000 */
  timeoutMs?: number;
}

export interface KnowledgeQueryOptions {
  /** Natural language query */
  query: string;
  /** Personality ID to scope the query */
  personalityId?: string;
  /** Maximum number of results */
  limit?: number;
  /** Memory types to search */
  types?: string[];
}

export interface KnowledgeResult {
  content: string;
  source: string;
  relevance: number;
  type: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeQueryResponse {
  results: KnowledgeResult[];
  totalFound: number;
  queryTimeMs: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export class KnowledgeDelegate {
  private readonly parentUrl: string;
  private readonly registrationToken?: string;
  private readonly timeoutMs: number;
  private readonly logger?: SecureLogger;

  constructor(config: KnowledgeDelegateConfig, logger?: SecureLogger) {
    this.parentUrl = config.parentUrl.replace(/\/$/, '');
    this.registrationToken = config.registrationToken;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.logger = logger?.child({ component: 'knowledge-delegate' });
  }

  /**
   * Query the parent's brain/RAG for relevant knowledge.
   * Falls back gracefully if the parent is unreachable.
   */
  async query(options: KnowledgeQueryOptions): Promise<KnowledgeQueryResponse> {
    const start = performance.now();

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.registrationToken) {
        headers.Authorization = `Bearer ${this.registrationToken}`;
      }

      const response = await fetch(`${this.parentUrl}/api/v1/brain/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: options.query,
          personalityId: options.personalityId,
          limit: options.limit ?? 10,
          types: options.types,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        this.logger?.debug({ status: response.status }, 'Knowledge query rejected by parent');
        return emptyResponse(performance.now() - start);
      }

      const data = (await response.json()) as {
        results?: KnowledgeResult[];
        totalFound?: number;
      };

      const elapsed = performance.now() - start;
      this.logger?.debug(
        { results: data.results?.length ?? 0, queryTimeMs: elapsed.toFixed(0) },
        'Knowledge query completed'
      );

      return {
        results: data.results ?? [],
        totalFound: data.totalFound ?? data.results?.length ?? 0,
        queryTimeMs: elapsed,
      };
    } catch (err) {
      const elapsed = performance.now() - start;
      this.logger?.warn(
        {
          error: err instanceof Error ? err.message : String(err),
          queryTimeMs: elapsed.toFixed(0),
        },
        'Knowledge query to parent failed'
      );
      return emptyResponse(elapsed);
    }
  }

  /**
   * Store a memory entry on the parent (e.g. from agent conversation).
   * Non-fatal — agents continue operating even if parent is unreachable.
   */
  async remember(data: {
    type: string;
    content: string;
    source: string;
    personalityId?: string;
    importance?: number;
  }): Promise<boolean> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.registrationToken) {
        headers.Authorization = `Bearer ${this.registrationToken}`;
      }

      const response = await fetch(`${this.parentUrl}/api/v1/brain/remember`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        this.logger?.debug({ status: response.status }, 'Remember request rejected by parent');
        return false;
      }

      this.logger?.debug({ type: data.type }, 'Memory stored on parent');
      return true;
    } catch (err) {
      this.logger?.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'Failed to store memory on parent'
      );
      return false;
    }
  }
}

function emptyResponse(queryTimeMs: number): KnowledgeQueryResponse {
  return { results: [], totalFound: 0, queryTimeMs };
}
