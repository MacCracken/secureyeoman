/**
 * Context-Dependent Retrieval — Embedding Fusion (Phase 125-A)
 *
 * Implements Tulving's encoding specificity principle: retrieval is best
 * when the search context matches the encoding context.
 *
 * Fuses the query embedding with a conversation context embedding using
 * linear interpolation: searchVec = λ·queryEmb + (1−λ)·contextEmb
 *
 * This biases retrieval toward memories that were encoded in a similar
 * conversational context, not just those that match the literal query.
 */

import type { EmbeddingProvider } from '../ai/embeddings/types.js';

export interface ContextRetrievalConfig {
  /** Weight for the query embedding vs context (0 = pure context, 1 = pure query). Default 0.7 */
  queryWeight: number;
  /** Maximum conversation messages to include in context window. Default 5 */
  contextWindowSize: number;
  /** Minimum messages required before applying context fusion. Default 2 */
  minContextMessages: number;
}

export const DEFAULT_CONTEXT_RETRIEVAL_CONFIG: ContextRetrievalConfig = {
  queryWeight: 0.7,
  contextWindowSize: 5,
  minContextMessages: 2,
};

/**
 * Fuse a query embedding with a context embedding using linear interpolation.
 *
 * searchVec = λ·query + (1−λ)·context
 *
 * Both vectors must have the same dimensionality. The result is L2-normalized.
 */
export function fuseEmbeddings(
  queryEmbedding: number[],
  contextEmbedding: number[],
  queryWeight: number
): number[] {
  const lambda = Math.max(0, Math.min(1, queryWeight));
  const dim = Math.min(queryEmbedding.length, contextEmbedding.length);
  if (dim === 0) return [];
  const fused = new Array<number>(dim);

  for (let i = 0; i < dim; i++) {
    fused[i] = lambda * queryEmbedding[i]! + (1 - lambda) * contextEmbedding[i]!;
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    norm += fused[i]! * fused[i]!;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      fused[i] = fused[i]! / norm;
    }
  }

  return fused;
}

/**
 * Compute a centroid embedding from a list of embeddings (simple mean).
 * Returns null if the list is empty.
 */
export function computeCentroid(embeddings: number[][]): number[] | null {
  if (embeddings.length === 0) return null;

  const dim = embeddings[0]!.length;
  const centroid = new Array<number>(dim).fill(0);

  for (const emb of embeddings) {
    const len = Math.min(dim, emb.length);
    for (let i = 0; i < len; i++) {
      centroid[i]! += emb[i]!;
    }
  }

  const n = embeddings.length;
  for (let i = 0; i < dim; i++) {
    centroid[i] = centroid[i]! / n;
  }

  return centroid;
}

/**
 * ContextRetriever manages a rolling window of recent message embeddings
 * and produces context-fused search vectors for improved retrieval.
 */
export class ContextRetriever {
  private readonly config: ContextRetrievalConfig;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly contextWindow: number[][] = [];

  constructor(embeddingProvider: EmbeddingProvider, config?: Partial<ContextRetrievalConfig>) {
    this.embeddingProvider = embeddingProvider;
    this.config = { ...DEFAULT_CONTEXT_RETRIEVAL_CONFIG, ...config };
  }

  /**
   * Add a message to the context window. Call this for each user/assistant
   * message in the conversation to build context awareness.
   */
  async addMessage(text: string): Promise<void> {
    const [embedding] = await this.embeddingProvider.embed([text]);
    if (!embedding) return;

    this.contextWindow.push(embedding);

    // Trim to max window size
    while (this.contextWindow.length > this.config.contextWindowSize) {
      this.contextWindow.shift();
    }
  }

  /**
   * Add a pre-computed embedding to the context window.
   */
  addEmbedding(embedding: number[]): void {
    this.contextWindow.push(embedding);
    while (this.contextWindow.length > this.config.contextWindowSize) {
      this.contextWindow.shift();
    }
  }

  /**
   * Produce a context-fused search vector for the given query.
   *
   * If there aren't enough context messages, returns the raw query embedding.
   * Otherwise fuses query with the context centroid.
   */
  async getSearchVector(query: string): Promise<number[]> {
    const [queryEmbedding] = await this.embeddingProvider.embed([query]);
    if (!queryEmbedding) {
      throw new Error('Failed to generate query embedding');
    }

    if (this.contextWindow.length < this.config.minContextMessages) {
      return queryEmbedding;
    }

    const contextCentroid = computeCentroid(this.contextWindow);
    if (!contextCentroid) {
      return queryEmbedding;
    }

    return fuseEmbeddings(queryEmbedding, contextCentroid, this.config.queryWeight);
  }

  /**
   * Get the current context centroid, or null if insufficient context.
   */
  getContextCentroid(): number[] | null {
    if (this.contextWindow.length < this.config.minContextMessages) {
      return null;
    }
    return computeCentroid(this.contextWindow);
  }

  /** Clear the context window (e.g. on conversation reset). */
  clear(): void {
    this.contextWindow.length = 0;
  }

  /** Current number of messages in the context window. */
  get contextSize(): number {
    return this.contextWindow.length;
  }
}
