/**
 * GroundingChecker — Verifies AI response claims against retrieved sources.
 *
 * Uses token-overlap similarity as the default grounding method (no embedding
 * dependency). Splits response into sentences, scores each against the best
 * matching source, and computes an aggregate grounding score.
 *
 * Phase 110 — Inline Citations & Grounding
 */

import type { SourceReference, GroundingCheckResult } from '@secureyeoman/shared';

export type GroundednessMode = 'off' | 'annotate_only' | 'block_unverified' | 'strip_unverified';

/** Minimum grounding score below which `block_unverified` mode rejects the response. */
const BLOCK_THRESHOLD = 0.3;

/** Per-sentence similarity threshold to consider the sentence grounded. */
const SENTENCE_GROUND_THRESHOLD = 0.25;

// ── Sentence Splitting ────────────────────────────────────────────────────────

/**
 * Split text into sentences. Handles common abbreviations and decimal numbers
 * to avoid false splits.
 */
export function splitSentences(text: string): string[] {
  // Replace common abbreviations to avoid false splits
  const cleaned = text
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Inc|Ltd|Jr|Sr|etc|vs|approx|dept|est)\./gi, '$1\u0000')
    .replace(/(\d)\./g, '$1\u0001');

  const raw = cleaned.split(/(?<=[.!?])\s+/);

  return raw
    .map((s) => s.replace(/\u0000/g, '.').replace(/\u0001/g, '.').trim())
    .filter((s) => s.length > 0);
}

// ── Token Overlap Similarity ──────────────────────────────────────────────────

/**
 * Tokenize text into lowercased word tokens, stripping punctuation.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/**
 * Compute Jaccard-like token overlap between two texts.
 * Returns 0.0–1.0 where 1.0 means identical token sets.
 */
export function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// ── GroundingChecker ──────────────────────────────────────────────────────────

export class GroundingChecker {
  /**
   * Check how well the AI response is grounded in the provided sources.
   *
   * @param content   The AI response text.
   * @param sources   Source references used for the response.
   * @param mode      Enforcement mode.
   * @returns         Grounding check result with score and possibly modified content.
   */
  check(
    content: string,
    sources: SourceReference[],
    mode: GroundednessMode = 'off'
  ): GroundingCheckResult {
    if (mode === 'off' || sources.length === 0) {
      return {
        score: 1.0,
        totalSentences: 0,
        groundedSentences: 0,
        content,
        blocked: false,
      };
    }

    const sentences = splitSentences(content);
    if (sentences.length === 0) {
      return {
        score: 1.0,
        totalSentences: 0,
        groundedSentences: 0,
        content,
        blocked: false,
      };
    }

    const sourceTexts = sources.map((s) => s.content);
    const sentenceScores: { sentence: string; bestScore: number; grounded: boolean }[] = [];

    for (const sentence of sentences) {
      // Skip very short sentences (greetings, transitions)
      if (sentence.split(/\s+/).length < 4) {
        sentenceScores.push({ sentence, bestScore: 1.0, grounded: true });
        continue;
      }

      let bestScore = 0;
      for (const sourceText of sourceTexts) {
        const score = tokenOverlap(sentence, sourceText);
        if (score > bestScore) bestScore = score;
      }

      sentenceScores.push({
        sentence,
        bestScore,
        grounded: bestScore >= SENTENCE_GROUND_THRESHOLD,
      });
    }

    const groundedCount = sentenceScores.filter((s) => s.grounded).length;
    const score = sentences.length > 0 ? groundedCount / sentences.length : 1.0;

    switch (mode) {
      case 'annotate_only': {
        const annotated = sentenceScores
          .map((s) => (s.grounded ? s.sentence : `${s.sentence} [unverified]`))
          .join(' ');
        return {
          score,
          totalSentences: sentences.length,
          groundedSentences: groundedCount,
          content: annotated,
          blocked: false,
        };
      }

      case 'block_unverified': {
        return {
          score,
          totalSentences: sentences.length,
          groundedSentences: groundedCount,
          content,
          blocked: score < BLOCK_THRESHOLD,
        };
      }

      case 'strip_unverified': {
        const stripped = sentenceScores
          .filter((s) => s.grounded)
          .map((s) => s.sentence)
          .join(' ');
        return {
          score,
          totalSentences: sentences.length,
          groundedSentences: groundedCount,
          content: stripped || content, // fall back to original if everything stripped
          blocked: false,
        };
      }

      default:
        return {
          score,
          totalSentences: sentences.length,
          groundedSentences: groundedCount,
          content,
          blocked: false,
        };
    }
  }
}
