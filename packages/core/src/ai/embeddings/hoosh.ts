/**
 * Hoosh Embedding Provider
 *
 * Generates text embeddings via the hoosh gateway's OpenAI-compatible
 * /v1/embeddings endpoint.
 */

import { BaseEmbeddingProvider, type EmbeddingProviderConfig } from './base.js';
import type { SecureLogger } from '../../logging/logger.js';

export interface HooshEmbeddingConfig extends EmbeddingProviderConfig {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  dimensions?: number;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:8088';
const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_DIMENSIONS = 1536;

const DIMENSION_MAP: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
  'nomic-embed-text': 768,
};

export class HooshEmbeddingProvider extends BaseEmbeddingProvider {
  readonly name = 'hoosh';
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly dims: number;

  constructor(config: HooshEmbeddingConfig = {}, logger?: SecureLogger) {
    super(config, logger);
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.model = config.model ?? DEFAULT_MODEL;
    this.apiKey = config.apiKey;
    this.dims = config.dimensions ?? DIMENSION_MAP[this.model] ?? DEFAULT_DIMENSIONS;
  }

  dimensions(): number {
    return this.dims;
  }

  protected async doEmbed(texts: string[]): Promise<number[][]> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ input: texts, model: this.model }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Hoosh embeddings failed: HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      data: { index: number; embedding: number[] }[];
    };

    // Sort by index to preserve input order
    return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}
