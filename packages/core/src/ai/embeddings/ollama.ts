/**
 * Ollama Embedding Provider
 *
 * Uses Ollama's `/api/embed` endpoint (v0.1.26+) for local embedding generation.
 * Supports batch embedding via the `input` array parameter.
 *
 * Recommended models:
 *   - nomic-embed-text  (768 dims, general purpose, fast)
 *   - mxbai-embed-large (1024 dims, higher quality)
 *   - all-minilm        (384 dims, lightweight)
 */

import { BaseEmbeddingProvider, type EmbeddingProviderConfig } from './base.js';
import type { SecureLogger } from '../../logging/logger.js';

export interface OllamaEmbeddingConfig extends EmbeddingProviderConfig {
  model?: string;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'nomic-embed-text';

/** Known dimensions per model name (with and without tag). */
const DIMENSION_MAP: Record<string, number> = {
  'nomic-embed-text': 768,
  'nomic-embed-text:latest': 768,
  'mxbai-embed-large': 1024,
  'mxbai-embed-large:latest': 1024,
  'all-minilm': 384,
  'all-minilm:latest': 384,
  'snowflake-arctic-embed': 1024,
  'bge-m3': 1024,
};

export class OllamaEmbeddingProvider extends BaseEmbeddingProvider {
  readonly name: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: OllamaEmbeddingConfig = {}, logger?: SecureLogger) {
    super(config, logger);
    this.model = config.model ?? DEFAULT_MODEL;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.name = `ollama-embed:${this.model}`;
  }

  dimensions(): number {
    return DIMENSION_MAP[this.model] ?? 768;
  }

  protected async doEmbed(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama embedding error ${response.status}: ${err}`);
    }

    const data = (await response.json()) as { embeddings: number[][] };

    if (!Array.isArray(data.embeddings)) {
      throw new Error('Ollama embedding response missing embeddings array');
    }

    return data.embeddings;
  }
}
