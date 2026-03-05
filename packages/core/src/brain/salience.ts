/**
 * Salience Classification — Emotion/Urgency Tagging (Phase 125-C)
 *
 * Implements Damasio's somatic marker hypothesis: memories tagged with
 * emotional/urgency markers are recalled more readily.
 *
 * Uses the existing EmbeddingProvider to classify content against a set
 * of anchor embeddings for emotion/urgency categories. No extra model
 * needed — cosine similarity between content and anchors provides the
 * classification signal.
 */

import type { EmbeddingProvider } from '../ai/embeddings/types.js';

/** Salience dimensions scored for each memory/document. */
export interface SalienceScores {
  /** Urgency level: time-sensitive, critical, or blocking. [0–1] */
  urgency: number;
  /** Error/failure signal: bugs, outages, mistakes. [0–1] */
  error: number;
  /** User frustration or negative sentiment. [0–1] */
  frustration: number;
  /** Breakthrough or success signal. [0–1] */
  success: number;
  /** Curiosity or exploratory intent. [0–1] */
  curiosity: number;
  /** Composite salience score (weighted combination). [0–1] */
  composite: number;
}

/** Weight for each dimension in the composite score. */
export interface SalienceWeights {
  urgency: number;
  error: number;
  frustration: number;
  success: number;
  curiosity: number;
}

export const DEFAULT_SALIENCE_WEIGHTS: SalienceWeights = {
  urgency: 0.3,
  error: 0.25,
  frustration: 0.15,
  success: 0.15,
  curiosity: 0.15,
};

/**
 * Anchor texts used to generate reference embeddings for each dimension.
 * Multiple anchors per dimension capture different phrasings.
 */
const ANCHOR_TEXTS: Record<keyof SalienceWeights, string[]> = {
  urgency: [
    'This is urgent and needs immediate attention',
    'Critical priority, time-sensitive, must be done now',
    'Emergency situation, blocking all progress',
    'Deadline approaching, cannot wait any longer',
  ],
  error: [
    'Error occurred, something broke, system failure',
    'Bug found, crash detected, exception thrown',
    'Server is down, data loss, security breach',
    'Test failed, build broken, deployment failed',
  ],
  frustration: [
    'This is frustrating, nothing is working right',
    'I keep getting errors and it makes no sense',
    'Very disappointed with the results, not what I expected',
    'Confused and stuck, cannot figure this out',
  ],
  success: [
    'This worked perfectly, great success, all tests passing',
    'Breakthrough, figured it out, problem solved',
    'Excellent results, everything works as expected',
    'Milestone achieved, deployment successful, feature complete',
  ],
  curiosity: [
    'I wonder how this works, let me explore',
    'What if we tried a different approach, curious to see',
    'Can you explain this concept, I want to understand',
    'Interesting pattern, tell me more about this',
  ],
};

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * SalienceClassifier generates emotion/urgency scores for text content
 * by comparing embeddings against pre-computed anchor embeddings.
 */
export class SalienceClassifier {
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly weights: SalienceWeights;

  /** Cached anchor embeddings, computed lazily on first use. */
  private anchors: Map<keyof SalienceWeights, number[][]> | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(embeddingProvider: EmbeddingProvider, weights?: Partial<SalienceWeights>) {
    this.embeddingProvider = embeddingProvider;
    this.weights = { ...DEFAULT_SALIENCE_WEIGHTS, ...weights };
  }

  /**
   * Initialize anchor embeddings. Called lazily on first classify().
   * Safe to call multiple times (idempotent).
   */
  async initialize(): Promise<void> {
    if (this.anchors) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize().catch((err: unknown) => {
      // Clear so next call retries instead of returning a permanently rejected promise
      this.initPromise = null;
      throw err;
    });
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    const anchors = new Map<keyof SalienceWeights, number[][]>();

    for (const [dimension, texts] of Object.entries(ANCHOR_TEXTS) as [
      keyof SalienceWeights,
      string[],
    ][]) {
      const embeddings = await this.embeddingProvider.embed(texts);
      anchors.set(dimension, embeddings);
    }

    this.anchors = anchors;
  }

  /**
   * Classify the salience of a text content.
   *
   * For each dimension, computes the max cosine similarity between the
   * content embedding and the dimension's anchor embeddings. The composite
   * score is a weighted sum of dimension scores, normalized to [0–1].
   */
  async classify(text: string): Promise<SalienceScores> {
    await this.initialize();

    const [contentEmbedding] = await this.embeddingProvider.embed([text]);
    if (!contentEmbedding) {
      return { urgency: 0, error: 0, frustration: 0, success: 0, curiosity: 0, composite: 0 };
    }

    return this.classifyFromEmbedding(contentEmbedding);
  }

  /**
   * Classify from a pre-computed embedding (avoids duplicate embed calls).
   */
  classifyFromEmbedding(contentEmbedding: number[]): SalienceScores {
    if (!this.anchors) {
      return { urgency: 0, error: 0, frustration: 0, success: 0, curiosity: 0, composite: 0 };
    }

    const scores: Record<string, number> = {};

    for (const [dimension, anchorEmbeddings] of this.anchors) {
      // Max similarity across all anchors for this dimension
      let maxSim = 0;
      for (const anchor of anchorEmbeddings) {
        const sim = cosineSimilarity(contentEmbedding, anchor);
        // Remap from [-1, 1] cosine range to [0, 1]
        const normalized = Math.max(0, (sim + 1) / 2);
        maxSim = Math.max(maxSim, normalized);
      }
      scores[dimension] = maxSim;
    }

    // Compute weighted composite
    let composite = 0;
    let totalWeight = 0;
    for (const [dim, weight] of Object.entries(this.weights)) {
      composite += (scores[dim] ?? 0) * Number(weight);
      totalWeight += Number(weight);
    }
    composite = totalWeight > 0 ? composite / totalWeight : 0;

    return {
      urgency: scores.urgency ?? 0,
      error: scores.error ?? 0,
      frustration: scores.frustration ?? 0,
      success: scores.success ?? 0,
      curiosity: scores.curiosity ?? 0,
      composite,
    };
  }

  /** Whether anchor embeddings have been initialized. */
  get isInitialized(): boolean {
    return this.anchors !== null;
  }
}
