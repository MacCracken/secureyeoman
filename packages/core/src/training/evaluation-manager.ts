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
}

export interface EvalResult {
  evalId: string;
  metrics: {
    exact_match: number;
    char_similarity: number;
    sample_count: number;
    [key: string]: number;
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
    }

    const sampleCount = samples.length;
    const result: EvalResult = {
      evalId,
      metrics: {
        exact_match: sampleCount > 0 ? exactMatches / sampleCount : 0,
        char_similarity: sampleCount > 0 ? totalSimilarity / sampleCount : 0,
        sample_count: sampleCount,
      },
      completedAt: Date.now(),
    };

    this.logger.info('Evaluation: complete', {
      evalId,
      metrics: result.metrics,
    });

    return result;
  }
}
