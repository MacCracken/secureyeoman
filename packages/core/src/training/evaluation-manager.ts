/**
 * EvaluationManager — runs an evaluation suite against a trained model.
 *
 * For each sample in an eval set, calls the model being evaluated and
 * computes metrics:
 *   - exact_match: fraction of responses that exactly match the gold answer
 *   - char_similarity: average character-level Jaccard similarity
 *   - sample_count: total samples evaluated
 *
 * The eval set can be provided directly (array of {prompt, gold} pairs)
 * or loaded from a JSONL dataset path produced by DataCurationManager.
 */

import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { SecureLogger } from '../logging/logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EvalSample {
  prompt: string;
  gold: string;
}

export interface EvalConfig {
  /** Inline eval samples. Either this or datasetPath must be provided. */
  samples?: EvalSample[];
  /**
   * Path to a JSONL dataset (ShareGPT format from DataCurationManager).
   * Each line's first human turn → prompt; first gpt turn → gold.
   */
  datasetPath?: string;
  /** Maximum samples to evaluate. */
  maxSamples?: number;
  /** Callable that takes a prompt and returns the model's response. */
  modelFn: (prompt: string) => Promise<string>;
  /** When true, compute semantic similarity via Ollama embeddings. */
  semanticSimilarity?: boolean;
  /** Ollama embeddings endpoint, e.g. http://localhost:11434 */
  ollamaEmbedUrl?: string;
  /** Optional sandbox to execute tool calls and check outcome correctness. */
  sandboxFn?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}

export interface EvalResult {
  evalId: string;
  metrics: {
    exact_match: number;
    char_similarity: number;
    sample_count: number;
    tool_name_accuracy: number;
    tool_arg_match: number;
    outcome_correctness?: number;
    semantic_similarity?: number;
  };
  completedAt: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Character-level Jaccard similarity between two strings. */
function charJaccard(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a.toLowerCase());
  const setB = new Set(b.toLowerCase());
  let intersection = 0;
  for (const ch of setA) {
    if (setB.has(ch)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

async function loadSamplesFromDataset(
  datasetPath: string,
  maxSamples: number
): Promise<EvalSample[]> {
  const samples: EvalSample[] = [];
  const rl = createInterface({ input: createReadStream(datasetPath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (samples.length >= maxSamples) break;
    try {
      const obj = JSON.parse(line) as {
        conversations?: { from: string; value: string }[];
      };
      const convs = obj.conversations ?? [];
      const humanTurn = convs.find((c) => c.from === 'human');
      const gptTurn = convs.find((c) => c.from === 'gpt');
      if (humanTurn && gptTurn) {
        samples.push({ prompt: humanTurn.value, gold: gptTurn.value });
      }
    } catch {
      // skip malformed lines
    }
  }
  return samples;
}

// ── Tool-call evaluation helpers ──────────────────────────────────────────────

/**
 * Parse a JSON tool-call block from response text.
 * Supports ```json {...} ``` fenced blocks and bare JSON objects.
 */
export function parseToolCall(
  response: string
): { name: string; args: Record<string, unknown> } | null {
  // Try fenced code block first
  const fenceMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  const raw = fenceMatch ? fenceMatch[1]! : response.trim();

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.name === 'string') {
      return {
        name: parsed.name,
        args: (parsed.args ?? parsed.arguments ?? parsed.parameters ?? {}) as Record<
          string,
          unknown
        >,
      };
    }
    // Also support {tool: ..., input: ...}
    if (typeof parsed.tool === 'string') {
      return {
        name: parsed.tool,
        args: (parsed.input ?? parsed.arguments ?? {}) as Record<string, unknown>,
      };
    }
  } catch {
    // not JSON
  }
  return null;
}

/** Fraction of responses where the selected tool name matches the gold. */
export function computeToolNameAccuracy(responses: string[], goldResponses: string[]): number {
  if (responses.length === 0) return 0;
  let correct = 0;
  for (let i = 0; i < responses.length; i++) {
    const pred = parseToolCall(responses[i]!);
    const gold = parseToolCall(goldResponses[i]!);
    if (pred && gold && pred.name === gold.name) correct++;
  }
  return correct / responses.length;
}

/** Average per-argument precision across all response pairs. */
export function computeToolArgMatch(responses: string[], goldResponses: string[]): number {
  if (responses.length === 0) return 0;
  let totalPrecision = 0;
  let counted = 0;
  for (let i = 0; i < responses.length; i++) {
    const pred = parseToolCall(responses[i]!);
    const gold = parseToolCall(goldResponses[i]!);
    if (!pred || !gold) continue;
    const goldKeys = Object.keys(gold.args);
    if (goldKeys.length === 0) {
      totalPrecision += 1; // no args = trivially correct
      counted++;
      continue;
    }
    let matched = 0;
    for (const key of goldKeys) {
      if (key in pred.args && String(pred.args[key]) === String(gold.args[key])) {
        matched++;
      }
    }
    totalPrecision += matched / goldKeys.length;
    counted++;
  }
  return counted > 0 ? totalPrecision / counted : 0;
}

/** Cosine similarity between two embedding vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Fetch Ollama embeddings and return cosine similarity averaged over all pairs.
 * Silently returns 0 if Ollama is unreachable.
 */
export async function computeSemanticSimilarity(
  responses: string[],
  goldResponses: string[],
  ollamaUrl: string
): Promise<number> {
  if (responses.length === 0) return 0;
  const embedUrl = `${ollamaUrl.replace(/\/$/, '')}/api/embeddings`;
  let totalSim = 0;
  let counted = 0;

  for (let i = 0; i < responses.length; i++) {
    try {
      const [respEmbed, goldEmbed] = await Promise.all([
        fetchEmbedding(embedUrl, responses[i]!),
        fetchEmbedding(embedUrl, goldResponses[i]!),
      ]);
      if (respEmbed && goldEmbed) {
        totalSim += cosineSimilarity(respEmbed, goldEmbed);
        counted++;
      }
    } catch {
      // skip on network error
    }
  }

  return counted > 0 ? totalSim / counted : 0;
}

async function fetchEmbedding(url: string, text: string): Promise<number[] | null> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { embedding?: number[] };
  return data.embedding ?? null;
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class EvaluationManager {
  constructor(private readonly logger: SecureLogger) {}

  async runEvaluation(config: EvalConfig): Promise<EvalResult> {
    const evalId = randomUUID();
    const maxSamples = config.maxSamples ?? 200;

    let samples: EvalSample[];
    if (config.samples && config.samples.length > 0) {
      samples = config.samples.slice(0, maxSamples);
    } else if (config.datasetPath) {
      samples = await loadSamplesFromDataset(config.datasetPath, maxSamples);
    } else {
      throw new Error('EvaluationManager: either samples or datasetPath must be provided');
    }

    this.logger.info('Evaluation: starting', { evalId, sampleCount: samples.length });

    let exactMatches = 0;
    let totalSimilarity = 0;
    const allResponses: string[] = [];
    const allGolds: string[] = [];
    let outcomeCorrect = 0;
    let outcomeCounted = 0;

    for (const sample of samples) {
      let response = '';
      try {
        response = await config.modelFn(sample.prompt);
      } catch (err) {
        this.logger.warn('Evaluation: model call failed for sample', {
          evalId,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      const normalizedResponse = response.trim().toLowerCase();
      const normalizedGold = sample.gold.trim().toLowerCase();

      if (normalizedResponse === normalizedGold) exactMatches++;
      totalSimilarity += charJaccard(normalizedResponse, normalizedGold);
      allResponses.push(response);
      allGolds.push(sample.gold);

      // Outcome correctness via sandbox
      if (config.sandboxFn) {
        const toolCall = parseToolCall(response);
        const goldCall = parseToolCall(sample.gold);
        if (toolCall && goldCall) {
          try {
            const [actual, expected] = await Promise.all([
              config.sandboxFn(toolCall.name, toolCall.args),
              config.sandboxFn(goldCall.name, goldCall.args),
            ]);
            if (JSON.stringify(actual) === JSON.stringify(expected)) outcomeCorrect++;
            outcomeCounted++;
          } catch {
            // sandbox error; skip
          }
        }
      }
    }

    const sampleCount = allResponses.length;

    // Factored tool-call metrics
    const toolNameAccuracy = computeToolNameAccuracy(allResponses, allGolds);
    const toolArgMatch = computeToolArgMatch(allResponses, allGolds);

    // Semantic similarity (optional)
    let semanticSim: number | undefined;
    if (config.semanticSimilarity && config.ollamaEmbedUrl) {
      semanticSim = await computeSemanticSimilarity(
        allResponses,
        allGolds,
        config.ollamaEmbedUrl
      );
    }

    const metrics: EvalResult['metrics'] = {
      exact_match: sampleCount > 0 ? exactMatches / sampleCount : 0,
      char_similarity: sampleCount > 0 ? totalSimilarity / sampleCount : 0,
      sample_count: sampleCount,
      tool_name_accuracy: toolNameAccuracy,
      tool_arg_match: toolArgMatch,
    };

    if (outcomeCounted > 0) {
      metrics.outcome_correctness = outcomeCorrect / outcomeCounted;
    }
    if (semanticSim !== undefined) {
      metrics.semantic_similarity = semanticSim;
    }

    const result: EvalResult = {
      evalId,
      metrics,
      completedAt: Date.now(),
    };

    this.logger.info('Evaluation: complete', {
      evalId,
      metrics: result.metrics,
    });

    return result;
  }
}
