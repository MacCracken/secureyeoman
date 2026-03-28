/**
 * Daimon Client — HTTP client for the daimon agent orchestrator REST API.
 *
 * Daimon provides: per-agent memory (key-value), vector search (cosine similarity),
 * RAG pipeline (chunking + retrieval), MCP tool registry, task scheduling, and
 * federation. This client covers the brain-relevant subset: memory, vector, RAG.
 *
 * Default endpoint: http://127.0.0.1:8090
 */

import type { SecureLogger } from '../../logging/logger.js';

export interface DaimonClientConfig {
  /** Daimon REST API base URL. Default: http://127.0.0.1:8090 */
  baseUrl?: string;
  /** Optional API key for authenticated access. */
  apiKey?: string;
  /** Request timeout in ms. Default: 10000 */
  timeoutMs?: number;
}

export interface DaimonMemoryEntry {
  key: string;
  value: unknown;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface DaimonVectorEntry {
  id: string;
  score: number;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DaimonRagChunk {
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface DaimonRagContext {
  chunks: DaimonRagChunk[];
  formatted_context: string;
  total_tokens_estimate: number;
}

export interface DaimonHealthResponse {
  status: string;
  version: string;
}

export class DaimonClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly logger: SecureLogger;

  constructor(config: DaimonClientConfig, logger: SecureLogger) {
    this.baseUrl = (config.baseUrl ?? 'http://127.0.0.1:8090').replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.logger = logger.child({ component: 'DaimonClient' });
  }

  // ── Health ───────────────────────────────────────────────────────────────

  async health(): Promise<DaimonHealthResponse> {
    return this._fetch<DaimonHealthResponse>('GET', '/v1/health');
  }

  // ── Memory (per-agent key-value) ─────────────────────────────────────────

  async memorySet(agentId: string, key: string, value: unknown, tags?: string[]): Promise<void> {
    await this._fetch('POST', `/v1/memory/${encodeURIComponent(agentId)}`, {
      key,
      value,
      tags: tags ?? [],
    });
  }

  async memoryGet(agentId: string, key: string): Promise<DaimonMemoryEntry | null> {
    try {
      return await this._fetch<DaimonMemoryEntry>(
        'GET',
        `/v1/memory/${encodeURIComponent(agentId)}/${encodeURIComponent(key)}`
      );
    } catch (e) {
      if (e instanceof DaimonError && e.status === 404) return null;
      throw e;
    }
  }

  async memoryDelete(agentId: string, key: string): Promise<boolean> {
    try {
      await this._fetch(
        'DELETE',
        `/v1/memory/${encodeURIComponent(agentId)}/${encodeURIComponent(key)}`
      );
      return true;
    } catch (e) {
      if (e instanceof DaimonError && e.status === 404) return false;
      throw e;
    }
  }

  async memoryListKeys(agentId: string): Promise<string[]> {
    return this._fetch<string[]>('GET', `/v1/memory/${encodeURIComponent(agentId)}`);
  }

  async memoryListByTag(agentId: string, tag: string): Promise<string[]> {
    return this._fetch<string[]>(
      'GET',
      `/v1/memory/${encodeURIComponent(agentId)}?tag=${encodeURIComponent(tag)}`
    );
  }

  async memoryClear(agentId: string): Promise<number> {
    const result = await this._fetch<{ deleted: number }>(
      'DELETE',
      `/v1/memory/${encodeURIComponent(agentId)}`
    );
    return result.deleted;
  }

  // ── Vector Store ─────────────────────────────────────────────────────────

  async vectorInsert(
    entries: {
      id: string;
      embedding: number[];
      content: string;
      metadata?: Record<string, unknown>;
    }[]
  ): Promise<void> {
    await this._fetch('POST', '/v1/vector/insert', { entries });
  }

  async vectorSearch(
    query: number[],
    topK: number,
    threshold?: number
  ): Promise<DaimonVectorEntry[]> {
    return this._fetch<DaimonVectorEntry[]>('POST', '/v1/vector/search', {
      query,
      top_k: topK,
      min_score: threshold,
    });
  }

  async vectorRemove(id: string): Promise<boolean> {
    try {
      await this._fetch('DELETE', `/v1/vector/${encodeURIComponent(id)}`);
      return true;
    } catch (e) {
      if (e instanceof DaimonError && e.status === 404) return false;
      throw e;
    }
  }

  async vectorCount(): Promise<number> {
    const result = await this._fetch<{ count: number }>('GET', '/v1/vector/count');
    return result.count;
  }

  // ── RAG Pipeline ─────────────────────────────────────────────────────────

  async ragIngest(
    text: string,
    metadata?: Record<string, unknown>
  ): Promise<{ ingested: boolean; chunks?: number }> {
    return this._fetch<{ ingested: boolean; chunks?: number }>('POST', '/v1/rag/ingest', {
      text,
      metadata: metadata ?? {},
    });
  }

  async ragQuery(query: string, topK?: number): Promise<DaimonRagContext> {
    return this._fetch<DaimonRagContext>('POST', '/v1/rag/query', {
      query,
      top_k: topK ?? 5,
    });
  }

  // ── MCP Tools ────────────────────────────────────────────────────────────

  async mcpListTools(): Promise<{ name: string; description: string }[]> {
    const result = await this._fetch<{ tools: { name: string; description: string }[] }>(
      'GET',
      '/v1/mcp/tools'
    );
    return result.tools;
  }

  async mcpCallTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ content: { text: string }[]; is_error: boolean }> {
    return this._fetch('POST', '/v1/mcp/call', { name, arguments: args });
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async _fetch<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new DaimonError(
          `Daimon ${method} ${path} failed: HTTP ${response.status}`,
          response.status,
          text
        );
      }

      const text = await response.text();
      if (!text) return undefined as T;
      return JSON.parse(text) as T;
    } catch (e) {
      if (e instanceof DaimonError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.debug({ err: msg, method, path }, 'Daimon request failed');
      throw new DaimonError(`Daimon ${method} ${path}: ${msg}`, 0, '');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class DaimonError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string
  ) {
    super(message);
    this.name = 'DaimonError';
  }
}
