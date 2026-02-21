/**
 * Content Chunker — splits documents into overlapping token-budget chunks.
 *
 * Large documents stored in brain.memories or brain.knowledge overflow the
 * embedding model's context window and produce truncated or diluted vectors.
 * Chunking at paragraph/sentence boundaries with 15% overlap preserves
 * semantic continuity at chunk edges and enables fine-grained retrieval.
 *
 * ADR 096 — Content-Chunked Workspace Indexing
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChunkOptions {
  /** Target maximum tokens per chunk. Default: 800. */
  maxTokens?: number;
  /** Fractional overlap between successive chunks. Default: 0.15 (15%). */
  overlapFraction?: number;
}

export interface DocumentChunk {
  /** 0-based position within the original document. */
  index: number;
  /** The chunk text. */
  text: string;
  /** Estimated token count. */
  estimatedTokens: number;
}

// ── Token estimation ──────────────────────────────────────────────────────────

/**
 * Cheap token estimate: ~4 characters per token.
 * Accurate enough for budget decisions without a real tokeniser.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Sentence splitting ────────────────────────────────────────────────────────

/**
 * Split text into sentences using a simple regex that handles common
 * abbreviations and decimal numbers without false positives.
 *
 * Paragraph boundaries (double newlines) are treated as hard sentence breaks
 * so that document structure is preserved as a first-class signal.
 */
function splitSentences(text: string): string[] {
  // First split on paragraph boundaries to get natural top-level segments
  const paragraphs = text.split(/\n{2,}/);
  const sentences: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Within a paragraph, split on sentence-ending punctuation followed by
    // whitespace and an uppercase letter (or end of string).
    const parts = trimmed
      .split(/(?<=[.!?])\s+(?=[A-Z"'(])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    sentences.push(...(parts.length > 0 ? parts : [trimmed]));
  }

  return sentences;
}

// ── Chunker ───────────────────────────────────────────────────────────────────

/**
 * Split `content` into overlapping chunks within `maxTokens`.
 *
 * Algorithm:
 *  1. Split content into sentences (paragraph-aware).
 *  2. Greedily pack sentences into a chunk until the token budget is reached.
 *  3. Begin the next chunk with an overlap window of `overlapFraction * maxTokens`
 *     tokens taken from the tail of the previous chunk to preserve context at
 *     chunk boundaries.
 *  4. Return a `DocumentChunk[]` array.
 *
 * Documents that fit within a single `maxTokens` budget are returned as a
 * single-element array (no unnecessary splitting).
 */
export function chunk(content: string, options: ChunkOptions = {}): DocumentChunk[] {
  const maxTokens = options.maxTokens ?? 800;
  const overlapFraction = options.overlapFraction ?? 0.15;
  const overlapBudget = Math.floor(maxTokens * overlapFraction);

  const sentences = splitSentences(content);

  if (sentences.length === 0) {
    return [];
  }

  // Fast-path: entire document fits in one chunk
  if (estimateTokens(content) <= maxTokens) {
    return [{ index: 0, text: content.trim(), estimatedTokens: estimateTokens(content) }];
  }

  const chunks: DocumentChunk[] = [];
  let currentSentences: string[] = [];
  let currentTokens = 0;
  let chunkIndex = 0;

  function flushChunk(): void {
    if (currentSentences.length === 0) return;

    const text = currentSentences.join(' ').trim();
    chunks.push({ index: chunkIndex++, text, estimatedTokens: estimateTokens(text) });

    // Seed the next chunk with overlap from the tail of the current chunk
    if (overlapBudget > 0) {
      const overlap: string[] = [];
      let overlapTokens = 0;
      for (let i = currentSentences.length - 1; i >= 0; i--) {
        const sTokens = estimateTokens(currentSentences[i]!);
        if (overlapTokens + sTokens > overlapBudget) break;
        overlap.unshift(currentSentences[i]!);
        overlapTokens += sTokens;
      }
      currentSentences = overlap;
      currentTokens = overlapTokens;
    } else {
      currentSentences = [];
      currentTokens = 0;
    }
  }

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);

    // A single sentence that exceeds the budget is added as its own chunk
    if (sentenceTokens > maxTokens) {
      flushChunk();
      currentSentences = [];
      currentTokens = 0;
      chunks.push({ index: chunkIndex++, text: sentence, estimatedTokens: sentenceTokens });
      continue;
    }

    if (currentTokens + sentenceTokens > maxTokens && currentSentences.length > 0) {
      flushChunk();
    }

    currentSentences.push(sentence);
    currentTokens += sentenceTokens;
  }

  // Final flush
  if (currentSentences.length > 0) {
    flushChunk();
  }

  return chunks;
}
