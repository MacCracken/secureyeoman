/**
 * RAG Evaluation Metrics — Phase 140
 *
 * Measures the quality of Retrieval-Augmented Generation by scoring:
 * - Faithfulness (LLM-as-Judge): does the answer only use info from context?
 * - Answer relevance: semantic similarity between answer and query
 * - Context recall: how much of the reference answer is covered by context
 * - Context precision: what fraction of retrieved chunks actually contributed
 * - Chunk utilization: fraction of retrieved chunks referenced in the answer
 * - Retrieval latency percentiles (p50/p95/p99)
 */

import type { AIProvider } from '../ai/providers/base.js';
import type { EmbeddingProvider } from '../ai/embeddings/types.js';
import type { SecureLogger } from '../logging/logger.js';
import { tokenOverlap, splitSentences } from './grounding-checker.js';

// ── Types ────────────────────────────────────────────────────────

export interface RagEvalConfig {
  enabled: boolean;
  /** Use LLM-as-Judge for faithfulness (vs token overlap fallback). */
  useLlmJudge: boolean;
  /** Model to use for LLM-as-Judge (null = use default provider). */
  judgeModel: string | null;
  /** Minimum faithfulness score to consider acceptable [0-1]. */
  faithfulnessThreshold: number;
  /** Maximum retrieval latency entries to track. */
  maxLatencyEntries: number;
}

export const DEFAULT_RAG_EVAL_CONFIG: RagEvalConfig = {
  enabled: false,
  useLlmJudge: true,
  judgeModel: null,
  faithfulnessThreshold: 0.7,
  maxLatencyEntries: 10_000,
};

export interface RagEvalInput {
  query: string;
  answer: string;
  contexts: string[];
  referenceAnswer?: string;
  retrievalLatencyMs?: number;
}

export interface RagEvalResult {
  faithfulness: number;
  answerRelevance: number;
  contextRecall: number | null;
  contextPrecision: number;
  chunkUtilization: number;
  overall: number;
}

export interface LatencyPercentiles {
  p50: number;
  p95: number;
  p99: number;
  count: number;
  mean: number;
}

export interface RagEvalDeps {
  aiProvider?: AIProvider;
  embeddingProvider?: EmbeddingProvider;
  logger: SecureLogger;
}

// ── Faithfulness Prompt ──────────────────────────────────────────

const FAITHFULNESS_PROMPT = `You are evaluating whether an AI answer is faithful to the provided context.

Context:
{context}

Answer:
{answer}

For each sentence in the answer, determine if it can be inferred from the context.
Respond with a JSON object:
{
  "faithful_sentences": <count of sentences supported by context>,
  "total_sentences": <total sentence count>,
  "score": <faithful_sentences / total_sentences, 0.0-1.0>
}

Only output the JSON object, no other text.`;

// ── RagEvalEngine ────────────────────────────────────────────────

export class RagEvalEngine {
  private readonly config: RagEvalConfig;
  private readonly deps: RagEvalDeps;
  private readonly latencies: number[] = [];

  constructor(config: Partial<RagEvalConfig>, deps: RagEvalDeps) {
    this.config = { ...DEFAULT_RAG_EVAL_CONFIG, ...config };
    this.deps = deps;
  }

  async evaluate(input: RagEvalInput): Promise<RagEvalResult> {
    if (input.retrievalLatencyMs != null) {
      this.recordLatency(input.retrievalLatencyMs);
    }

    const [faithfulness, answerRelevance, contextRecall, contextPrecision, chunkUtilization] =
      await Promise.all([
        this.scoreFaithfulness(input.answer, input.contexts),
        this.scoreAnswerRelevance(input.query, input.answer),
        input.referenceAnswer
          ? this.scoreContextRecall(input.contexts, input.referenceAnswer)
          : Promise.resolve(null),
        this.scoreContextPrecision(input.query, input.contexts),
        Promise.resolve(this.scoreChunkUtilization(input.answer, input.contexts)),
      ]);

    const scores = [faithfulness, answerRelevance, contextPrecision, chunkUtilization];
    if (contextRecall !== null) scores.push(contextRecall);
    const overall = scores.reduce((a, b) => a + b, 0) / scores.length;

    return {
      faithfulness,
      answerRelevance,
      contextRecall,
      contextPrecision,
      chunkUtilization,
      overall,
    };
  }

  /**
   * Score faithfulness: does the answer only contain info from contexts?
   * Uses LLM-as-Judge when available, falls back to token overlap.
   */
  async scoreFaithfulness(answer: string, contexts: string[]): Promise<number> {
    if (contexts.length === 0) return 0;

    if (this.config.useLlmJudge && this.deps.aiProvider) {
      try {
        return await this.llmFaithfulness(answer, contexts);
      } catch (err) {
        this.deps.logger.warn(
          {
            error: String(err),
          },
          'LLM faithfulness scoring failed, falling back to token overlap'
        );
      }
    }

    return this.tokenOverlapFaithfulness(answer, contexts);
  }

  private async llmFaithfulness(answer: string, contexts: string[]): Promise<number> {
    const contextStr = contexts.map((c, i) => `[${i + 1}] ${c}`).join('\n\n');
    const prompt = FAITHFULNESS_PROMPT.replace('{context}', contextStr).replace('{answer}', answer);

    const response = await this.deps.aiProvider!.chat({
      messages: [{ role: 'user' as const, content: prompt }],
      temperature: 0,
      maxTokens: 200,
      stream: false,
    });

    try {
      const json = JSON.parse(response.content);
      const score = Number(json.score);
      return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
    } catch {
      this.deps.logger.warn(
        {
          content: response.content?.slice(0, 200),
        },
        'Failed to parse LLM faithfulness response'
      );
      return this.tokenOverlapFaithfulness(answer, contexts);
    }
  }

  private tokenOverlapFaithfulness(answer: string, contexts: string[]): number {
    const sentences = splitSentences(answer);
    if (sentences.length === 0) return 1;

    const joinedContext = contexts.join(' ');
    let grounded = 0;

    for (const sentence of sentences) {
      if (sentence.split(/\s+/).length < 4) {
        grounded++;
        continue;
      }
      const overlap = tokenOverlap(sentence, joinedContext);
      if (overlap >= 0.2) grounded++;
    }

    return grounded / sentences.length;
  }

  /**
   * Score answer relevance via embedding cosine similarity.
   * Falls back to token overlap when no embedding provider.
   */
  async scoreAnswerRelevance(query: string, answer: string): Promise<number> {
    if (this.deps.embeddingProvider) {
      try {
        const [queryEmb, answerEmb] = await Promise.all([
          this.deps.embeddingProvider.embed([query]),
          this.deps.embeddingProvider.embed([answer]),
        ]);
        if (queryEmb[0] && answerEmb[0]) {
          return Math.max(0, cosineSimilarity(queryEmb[0], answerEmb[0]));
        }
      } catch (err) {
        this.deps.logger.warn({ error: String(err) }, 'Embedding relevance scoring failed');
      }
    }

    return tokenOverlap(query, answer);
  }

  /**
   * Context recall: fraction of reference answer sentences covered by contexts.
   */
  async scoreContextRecall(contexts: string[], referenceAnswer: string): Promise<number> {
    const refSentences = splitSentences(referenceAnswer);
    if (refSentences.length === 0) return 1;

    const joinedContext = contexts.join(' ');
    let covered = 0;

    for (const sentence of refSentences) {
      if (sentence.split(/\s+/).length < 4) {
        covered++;
        continue;
      }
      const overlap = tokenOverlap(sentence, joinedContext);
      if (overlap >= 0.15) covered++;
    }

    return covered / refSentences.length;
  }

  /**
   * Context precision: fraction of retrieved contexts relevant to the query.
   */
  async scoreContextPrecision(query: string, contexts: string[]): Promise<number> {
    if (contexts.length === 0) return 0;

    if (this.deps.embeddingProvider) {
      try {
        const [[queryEmb], contextEmbs] = await Promise.all([
          this.deps.embeddingProvider.embed([query]),
          this.deps.embeddingProvider.embed(contexts),
        ]);
        if (queryEmb && contextEmbs.length > 0) {
          let relevant = 0;
          for (const cEmb of contextEmbs) {
            if (cosineSimilarity(queryEmb, cEmb) >= 0.3) relevant++;
          }
          return relevant / contexts.length;
        }
      } catch (err) {
        this.deps.logger.warn({ error: String(err) }, 'Embedding precision scoring failed');
      }
    }

    let relevant = 0;
    for (const ctx of contexts) {
      if (tokenOverlap(query, ctx) >= 0.1) relevant++;
    }
    return relevant / contexts.length;
  }

  /**
   * Chunk utilization: fraction of chunks whose content appears in the answer.
   */
  scoreChunkUtilization(answer: string, contexts: string[]): number {
    if (contexts.length === 0) return 0;

    let utilized = 0;
    for (const ctx of contexts) {
      if (tokenOverlap(answer, ctx) >= 0.1) utilized++;
    }
    return utilized / contexts.length;
  }

  // ── Latency Tracking ────────────────────────────────────────

  recordLatency(ms: number): void {
    this.latencies.push(ms);
    if (this.latencies.length > this.config.maxLatencyEntries) {
      this.latencies.splice(0, this.latencies.length - this.config.maxLatencyEntries);
    }
  }

  getLatencyPercentiles(): LatencyPercentiles {
    if (this.latencies.length === 0) {
      return { p50: 0, p95: 0, p99: 0, count: 0, mean: 0 };
    }

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const n = sorted.length;
    const mean = sorted.reduce((a, b) => a + b, 0) / n;

    return {
      p50: sorted[Math.floor(n * 0.5)]!,
      p95: sorted[Math.floor(n * 0.95)]!,
      p99: sorted[Math.floor(n * 0.99)]!,
      count: n,
      mean: Math.round(mean * 100) / 100,
    };
  }

  /** Get summary of all metrics for dashboard. */
  getSummary(): {
    latency: LatencyPercentiles;
    config: RagEvalConfig;
    enabled: boolean;
  } {
    return {
      latency: this.getLatencyPercentiles(),
      config: { ...this.config },
      enabled: this.config.enabled,
    };
  }
}

// ── Utilities ────────────────────────────────────────────────────

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
