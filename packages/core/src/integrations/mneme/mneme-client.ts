/**
 * Mneme Client — HTTP client for the Mneme Knowledge Base REST API.
 *
 * Mneme is an AI-native personal knowledge base with semantic search,
 * auto-linking, and RAG over personal documents.
 * Default port: 3838.
 */

import type { SecureLogger } from '../../logging/logger.js';

export interface MnemeClientConfig {
  baseUrl: string; // e.g. http://127.0.0.1:3838
  timeoutMs?: number; // default 10000
}

// ── Response Types ──────────────────────────────────────────────────────────

export interface MnemeHealthResponse {
  status: string;
  version: string;
  notes_count: number;
  active_vault: string;
  semantic_available: boolean;
  vector_count: number;
  embedding_backend: string;
  embedding_dimension: number;
}

export interface MnemeNote {
  id: string;
  title: string;
  path: string;
  content_hash: string;
  created_at: string;
  updated_at: string;
  last_accessed: string;
  provenance: string;
  trust_override: number | null;
  content?: string;
  tags?: string[];
  backlinks?: MnemeBacklink[];
}

export interface MnemeBacklink {
  source_id: string;
  source_title: string;
}

export interface MnemeSearchResult {
  search_id: string;
  results: MnemeSearchHit[];
}

export interface MnemeSearchHit {
  note_id: string;
  title: string;
  path: string;
  snippet: string;
  score: number;
  source: string;
  trust: number;
}

export interface MnemeVault {
  id: string;
  name: string;
  path: string;
  description: string;
  search_weight: number;
  is_default: boolean;
  is_active: boolean;
}

export interface MnemeTag {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

// ── Client ──────────────────────────────────────────────────────────────────

export class MnemeClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly logger?: SecureLogger;

  constructor(config: MnemeClientConfig, logger?: SecureLogger) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.logger = logger;
  }

  // ── Health ──────────────────────────────────────────────────────────

  async health(): Promise<MnemeHealthResponse> {
    return this.get<MnemeHealthResponse>('/health');
  }

  // ── Notes CRUD ──────────────────────────────────────────────────────

  async listNotes(): Promise<MnemeNote[]> {
    return this.get<MnemeNote[]>('/v1/notes');
  }

  async getNote(id: string): Promise<MnemeNote> {
    return this.get<MnemeNote>(`/v1/notes/${encodeURIComponent(id)}`);
  }

  async createNote(opts: {
    title: string;
    content: string;
    tags?: string[];
  }): Promise<MnemeNote> {
    return this.post<MnemeNote>('/v1/notes', opts);
  }

  async updateNote(
    id: string,
    opts: { title?: string; content?: string; tags?: string[] },
  ): Promise<MnemeNote> {
    return this.put<MnemeNote>(`/v1/notes/${encodeURIComponent(id)}`, opts);
  }

  async deleteNote(id: string): Promise<void> {
    await this.del(`/v1/notes/${encodeURIComponent(id)}`);
  }

  // ── Search ──────────────────────────────────────────────────────────

  async search(query: string): Promise<MnemeSearchResult> {
    return this.get<MnemeSearchResult>(`/v1/search?q=${encodeURIComponent(query)}`);
  }

  async searchFeedback(searchId: string, noteId: string, relevant: boolean): Promise<void> {
    await this.post('/v1/search/feedback', {
      search_id: searchId,
      note_id: noteId,
      relevant,
    });
  }

  // ── Tags ────────────────────────────────────────────────────────────

  async listTags(): Promise<MnemeTag[]> {
    return this.get<MnemeTag[]>('/v1/tags');
  }

  // ── Vaults ──────────────────────────────────────────────────────────

  async listVaults(): Promise<MnemeVault[]> {
    return this.get<MnemeVault[]>('/v1/vaults');
  }

  async switchVault(vaultId: string): Promise<void> {
    await this.post(`/v1/vaults/${encodeURIComponent(vaultId)}/switch`, {});
  }

  // ── AI Features ─────────────────────────────────────────────────────

  async ragQuery(query: string): Promise<unknown> {
    return this.get(`/v1/ai/rag/query?q=${encodeURIComponent(query)}`);
  }

  async suggestLinks(noteId: string): Promise<unknown> {
    return this.get(`/v1/ai/suggest-links/${encodeURIComponent(noteId)}`);
  }

  async extractConcepts(noteId: string): Promise<unknown> {
    return this.get(`/v1/ai/concepts/${encodeURIComponent(noteId)}`);
  }

  // ── HTTP helpers ────────────────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Mneme API error (${resp.status}): ${text}`);
    }
    return resp.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Mneme API error (${resp.status}): ${text}`);
    }
    const contentType = resp.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return resp.json() as Promise<T>;
    }
    return undefined as T;
  }

  private async put<T>(path: string, body: unknown): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Mneme API error (${resp.status}): ${text}`);
    }
    return resp.json() as Promise<T>;
  }

  private async del(path: string): Promise<void> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Mneme API error (${resp.status}): ${text}`);
    }
  }
}
