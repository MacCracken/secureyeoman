/**
 * API Embedding Provider
 *
 * Uses OpenAI or Gemini embedding APIs via HTTP fetch.
 */

import { BaseEmbeddingProvider, type EmbeddingProviderConfig } from './base.js';
import type { SecureLogger } from '../../logging/logger.js';

export interface ApiEmbeddingConfig extends EmbeddingProviderConfig {
  provider?: 'openai' | 'gemini';
  model?: string;
  apiKey: string;
  baseUrl?: string;
}

const DIMENSION_MAP: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
  'models/text-embedding-004': 768,
};

export class ApiEmbeddingProvider extends BaseEmbeddingProvider {
  readonly name: string;
  private readonly provider: 'openai' | 'gemini';
  private readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: ApiEmbeddingConfig, logger?: SecureLogger) {
    super(config, logger);
    this.provider = config.provider ?? 'openai';
    this.model = config.model ?? (this.provider === 'openai' ? 'text-embedding-3-small' : 'models/text-embedding-004');
    this.apiKey = config.apiKey;
    this.name = `api-${this.provider}`;

    if (this.provider === 'openai') {
      this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
    } else {
      this.baseUrl = config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    }
  }

  dimensions(): number {
    return DIMENSION_MAP[this.model] ?? 1536;
  }

  protected async doEmbed(texts: string[]): Promise<number[][]> {
    if (this.provider === 'openai') {
      return this.embedOpenAI(texts);
    }
    return this.embedGemini(texts);
  }

  private async embedOpenAI(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: this.model,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI embedding API error ${response.status}: ${err}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // Sort by index to preserve order
    return data.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }

  private async embedGemini(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    // Gemini batch embedding
    const response = await fetch(
      `${this.baseUrl}/${this.model}:batchEmbedContents?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: this.model,
            content: { parts: [{ text }] },
          })),
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini embedding API error ${response.status}: ${err}`);
    }

    const data = await response.json() as {
      embeddings: Array<{ values: number[] }>;
    };

    for (const embedding of data.embeddings) {
      results.push(embedding.values);
    }

    return results;
  }
}
