/**
 * DocumentManager — file ingestion pipeline for the Knowledge Base.
 *
 * Handles document-level ingestion (PDF, HTML, MD, TXT, URL, GitHub wiki),
 * chunking via the existing chunker, and indexing via BrainManager.learn().
 *
 * Phase 82 — Knowledge Base & RAG Platform
 */

import type { BrainManager } from './manager.js';
import type { BrainStorage } from './storage.js';
import type {
  KbDocument,
  DocumentFormat,
  DocumentVisibility,
  KnowledgeHealthStats,
  NotebookCorpus,
} from './types.js';
import type { SecureLogger } from '../logging/logger.js';
import { chunk } from './chunker.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DocumentManagerDeps {
  brainManager: BrainManager;
  storage: BrainStorage;
  logger: SecureLogger;
}

// ── DocumentManager ───────────────────────────────────────────────────────────

export class DocumentManager {
  private readonly brainManager: BrainManager;
  private readonly storage: BrainStorage;
  private readonly logger: SecureLogger;

  constructor(deps: DocumentManagerDeps) {
    this.brainManager = deps.brainManager;
    this.storage = deps.storage;
    this.logger = deps.logger;
  }

  /**
   * Ingest a file buffer into the knowledge base.
   */
  async ingestBuffer(
    buf: Buffer,
    filename: string,
    format: DocumentFormat,
    personalityId: string | null,
    visibility: DocumentVisibility,
    title?: string
  ): Promise<KbDocument> {
    const docTitle = title ?? filename;

    const doc = await this.storage.createDocument({
      personalityId,
      title: docTitle,
      filename,
      format,
      visibility,
      status: 'processing',
    });

    try {
      const text = await this.extractText(buf, format);
      await this.chunkAndLearn(doc.id, docTitle, text, personalityId);
      const chunks = chunk(text);
      return await this.storage.updateDocument(doc.id, {
        status: 'ready',
        chunkCount: Math.max(1, chunks.length),
        errorMessage: null,
      });
    } catch (err) {
      this.logger.warn('Document ingest failed', { docId: doc.id, error: String(err) });
      return await this.storage.updateDocument(doc.id, {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Ingest a URL: fetch HTML, strip tags, ingest as 'url' document.
   */
  async ingestUrl(
    url: string,
    personalityId: string | null,
    visibility: DocumentVisibility = 'private',
    _depth = 1
  ): Promise<KbDocument> {
    const doc = await this.storage.createDocument({
      personalityId,
      title: url,
      sourceUrl: url,
      format: 'url',
      visibility,
      status: 'processing',
    });

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'SecureYeoman/KnowledgeBase-Crawler' },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      const text = stripHtmlTags(html);

      await this.chunkAndLearn(doc.id, url, text, personalityId);
      const chunks = chunk(text);
      return await this.storage.updateDocument(doc.id, {
        status: 'ready',
        chunkCount: Math.max(1, chunks.length),
        errorMessage: null,
      });
    } catch (err) {
      this.logger.warn('URL ingest failed', { docId: doc.id, url, error: String(err) });
      return await this.storage.updateDocument(doc.id, {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Ingest raw text into the knowledge base.
   */
  async ingestText(
    text: string,
    title: string,
    personalityId: string | null,
    visibility: DocumentVisibility = 'private'
  ): Promise<KbDocument> {
    const doc = await this.storage.createDocument({
      personalityId,
      title,
      format: 'txt',
      visibility,
      status: 'processing',
    });

    try {
      await this.chunkAndLearn(doc.id, title, text, personalityId);
      const chunks = chunk(text);
      return await this.storage.updateDocument(doc.id, {
        status: 'ready',
        chunkCount: Math.max(1, chunks.length),
        errorMessage: null,
      });
    } catch (err) {
      this.logger.warn('Text ingest failed', { docId: doc.id, error: String(err) });
      return await this.storage.updateDocument(doc.id, {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Ingest all markdown files from a GitHub repository's wiki / default branch.
   */
  async ingestGithubWiki(
    owner: string,
    repo: string,
    personalityId: string | null,
    githubToken?: string
  ): Promise<KbDocument[]> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'SecureYeoman/KnowledgeBase',
    };
    const token = githubToken ?? process.env.GITHUB_TOKEN;
    if (token) headers.Authorization = `token ${token}`;

    // Fetch repository tree to find markdown files
    const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/`;
    const response = await fetch(contentsUrl, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`GitHub API ${response.status}: ${response.statusText}`);
    }

    const items = (await response.json()) as {
      name: string;
      path: string;
      type: string;
      download_url: string | null;
    }[];

    const mdFiles = items.filter(
      (item) => item.type === 'file' && item.name.toLowerCase().endsWith('.md')
    );

    if (mdFiles.length === 0) {
      this.logger.warn('No markdown files found in repository', { owner, repo });
      return [];
    }

    const results: KbDocument[] = [];

    for (const file of mdFiles) {
      if (!file.download_url) continue;
      try {
        const fileResponse = await fetch(file.download_url, {
          headers,
          signal: AbortSignal.timeout(15_000),
        });
        if (!fileResponse.ok) continue;
        const content = await fileResponse.text();
        const title = `${owner}/${repo}: ${file.name.replace(/\.md$/i, '')}`;
        const doc = await this.ingestText(content, title, personalityId, 'shared');
        results.push(doc);
      } catch (err) {
        this.logger.warn('Failed to ingest GitHub wiki file', {
          file: file.path,
          error: String(err),
        });
      }
    }

    return results;
  }

  /**
   * Delete a document and all associated knowledge chunks.
   */
  async deleteDocument(id: string): Promise<void> {
    await this.storage.deleteKnowledgeBySourcePrefix(`document:${id}:`);
    await this.storage.deleteDocument(id);
  }

  async listDocuments(opts?: {
    personalityId?: string;
    visibility?: string;
  }): Promise<KbDocument[]> {
    return this.storage.listDocuments(opts);
  }

  async getDocument(id: string): Promise<KbDocument | null> {
    return this.storage.getDocument(id);
  }

  async getKnowledgeHealthStats(personalityId?: string): Promise<KnowledgeHealthStats> {
    return this.storage.getKnowledgeHealthStats(personalityId);
  }

  /**
   * Build the notebook corpus for a personality — all document chunks loaded in order.
   *
   * @param personalityId  Scopes results; null/undefined = global/all.
   * @param tokenBudget    Token cap for budget check (default: Infinity — caller must compute).
   */
  async getNotebookCorpus(
    personalityId?: string | null,
    tokenBudget = Infinity
  ): Promise<NotebookCorpus> {
    const documents = await this.storage.getAllDocumentChunks(personalityId);
    const totalTokens = documents.reduce((s, d) => s + d.estimatedTokens, 0);
    return {
      documents,
      totalTokens,
      fitsInBudget: totalTokens <= tokenBudget,
      budget: tokenBudget,
    };
  }

  /**
   * Generate (or refresh) the Source Guide for a personality.
   *
   * The Source Guide is a compact metadata map stored as a special knowledge entry
   * (`source: 'source_guide', topic: '__source_guide__'`) so the AI always knows
   * what documents exist — even in RAG mode where full content is not loaded.
   *
   * Called automatically after every successful ingest.
   */
  async generateSourceGuide(personalityId: string | null): Promise<void> {
    try {
      const docs = await this.storage.listDocuments(
        personalityId !== null ? { personalityId } : undefined
      );
      const readyDocs = docs.filter((d) => d.status === 'ready');
      if (readyDocs.length === 0) return;

      const totalChunks = readyDocs.reduce((s, d) => s + d.chunkCount, 0);
      const lines = [
        `KNOWLEDGE BASE OVERVIEW — ${readyDocs.length} document${readyDocs.length !== 1 ? 's' : ''}, ${totalChunks} total chunks`,
        '',
      ];
      for (const doc of readyDocs) {
        const format = doc.format ? ` (${doc.format})` : '';
        lines.push(
          `- "${doc.title}"${format}: ${doc.chunkCount} chunk${doc.chunkCount !== 1 ? 's' : ''}`
        );
      }

      const guideText = lines.join('\n');
      const source = 'source_guide';

      // Upsert: delete old guide entry then re-create
      await this.storage.deleteKnowledgeBySourcePrefix(source);
      await this.brainManager.learn(
        '__source_guide__',
        guideText,
        source,
        1.0,
        personalityId ?? undefined
      );
    } catch (err) {
      this.logger.warn('Source guide generation failed', { error: String(err) });
    }
  }

  async logQuery(
    personalityId: string | null,
    query: string,
    resultsCount: number,
    topScore?: number
  ): Promise<void> {
    await this.storage.logKnowledgeQuery({
      personalityId,
      queryText: query,
      resultsCount,
      topScore,
    });
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async extractText(buf: Buffer, format: DocumentFormat): Promise<string> {
    switch (format) {
      case 'txt':
      case 'md':
        return buf.toString('utf-8');

      case 'html':
      case 'url': {
        const html = buf.toString('utf-8');
        return stripHtmlTags(html);
      }

      case 'pdf': {
        const pdfParse = await import('pdf-parse');
        const parsed = await pdfParse.default(buf);
        return parsed.text;
      }

      default:
        return buf.toString('utf-8');
    }
  }

  private async chunkAndLearn(
    docId: string,
    title: string,
    text: string,
    personalityId: string | null
  ): Promise<void> {
    // brain.knowledge has a default maxContentLength of 4096 chars.
    // Use 3200 chars (≈800 tokens) as the hard cap so every piece fits safely.
    const MAX_CHARS = 3200;

    const chunks = chunk(text);
    const effectiveChunks = chunks.length > 0 ? chunks : [{ index: 0, text, estimatedTokens: 0 }];

    let storeIdx = 0;
    for (const c of effectiveChunks) {
      // Sub-split any chunk whose text exceeds MAX_CHARS (can happen when the
      // entire text has no sentence or paragraph boundaries).
      const pieces =
        c.text.length > MAX_CHARS
          ? Array.from({ length: Math.ceil(c.text.length / MAX_CHARS) }, (_, i) =>
              c.text.slice(i * MAX_CHARS, (i + 1) * MAX_CHARS)
            )
          : [c.text];

      for (const piece of pieces) {
        const topic = `${title} [chunk ${storeIdx + 1}]`;
        const source = `document:${docId}:chunk${storeIdx}`;
        storeIdx++;

        try {
          await this.brainManager.learn(topic, piece, source, 0.9, personalityId ?? undefined);
        } catch (err) {
          // Log and continue — don't fail the whole ingest if one chunk fails
          this.logger.warn('Failed to learn chunk', {
            docId,
            chunk: storeIdx - 1,
            error: String(err),
          });
        }
      }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtmlTags(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
