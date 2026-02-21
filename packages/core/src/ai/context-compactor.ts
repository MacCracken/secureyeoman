/**
 * ContextCompactor — proactive token-budget management for chat conversations.
 *
 * The current failure mode is reactive: the LLM call fails with a
 * "context length exceeded" error and the caller re-tries with the same
 * overflowing context. This wastes a full API round-trip and produces a
 * cryptic error for the user.
 *
 * ContextCompactor estimates the token usage of the message array *before*
 * the API call. When usage exceeds a configurable threshold (default 80% of
 * the model's context window), it summarises older turns using the cheapest
 * available fast-tier model and replaces them with a single
 * `[Context summary: …]` system message.
 *
 * ADR 097 — Proactive Context Compaction
 */

import type { AIRequest } from '@secureyeoman/shared';

// ── Token estimation ──────────────────────────────────────────────────────────

/** ~4 chars/token — consistent with model-router and chunker heuristics. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateMessageTokens(messages: AIRequest['messages']): number {
  let total = 0;
  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    // Add ~4 overhead per message for role + framing tokens
    total += estimateTokens(content) + 4;
  }
  return total;
}

// ── Model context-window registry ─────────────────────────────────────────────

/**
 * Known context-window sizes (tokens) keyed by model name.
 * Conservative values; falls back to a safe 8 192-token default for unknowns.
 */
const CONTEXT_WINDOW: Record<string, number> = {
  // Anthropic
  'claude-opus-4-20250514': 200_000,
  'claude-sonnet-4-20250514': 200_000,
  'claude-sonnet-4-5': 200_000,
  'claude-haiku-4-5': 200_000,
  'claude-haiku-3-5-20241022': 200_000,
  // OpenAI
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  o1: 200_000,
  'o1-mini': 128_000,
  'o3-mini': 200_000,
  'gpt-5.2': 128_000,
  // Google
  'gemini-2.0-flash': 1_000_000,
  'gemini-3-flash': 1_000_000,
  // xAI / Grok
  'grok-3': 131_072,
  'grok-3-mini': 131_072,
  'grok-2-1212': 131_072,
  'grok-2-vision-1212': 131_072,
  // DeepSeek
  'deepseek-chat': 64_000,
  'deepseek-coder': 64_000,
  'deepseek-reasoner': 64_000,
  // Mistral
  'mistral-large-latest': 32_768,
  'mistral-small-latest': 32_768,
  'qwen3-coder': 32_768,
};

const DEFAULT_CONTEXT_WINDOW = 8_192;

export function getContextWindowSize(model: string): number {
  return CONTEXT_WINDOW[model] ?? DEFAULT_CONTEXT_WINDOW;
}

// ── CompactionResult ──────────────────────────────────────────────────────────

export interface CompactionResult {
  /** Whether compaction was actually performed. */
  compacted: boolean;
  /** The (possibly compacted) messages array. */
  messages: AIRequest['messages'];
  /** Token estimate before compaction. */
  estimatedTokensBefore: number;
  /** Token estimate after compaction (same as before when no compaction). */
  estimatedTokensAfter: number;
  /** Number of turns summarised (0 when no compaction). */
  turnsSummarised: number;
}

// ── ContextCompactor ──────────────────────────────────────────────────────────

export interface CompactorOptions {
  /**
   * Fraction of the model's context window at which compaction triggers.
   * Default: 0.80 (80%).
   */
  thresholdFraction?: number;
  /**
   * Maximum number of recent turns to *preserve* verbatim (never summarised).
   * Default: 4 (last 2 user+assistant pairs).
   */
  preserveRecentTurns?: number;
}

export type CompactorSummariser = (prompt: string) => Promise<string>;

export class ContextCompactor {
  private readonly thresholdFraction: number;
  private readonly preserveRecentTurns: number;

  constructor(options: CompactorOptions = {}) {
    this.thresholdFraction = options.thresholdFraction ?? 0.8;
    this.preserveRecentTurns = options.preserveRecentTurns ?? 4;
  }

  /**
   * Check whether the given message array is approaching the context limit.
   */
  needsCompaction(messages: AIRequest['messages'], model: string): boolean {
    const contextWindow = getContextWindowSize(model);
    const threshold = Math.floor(contextWindow * this.thresholdFraction);
    const estimated = estimateMessageTokens(messages);
    return estimated >= threshold;
  }

  /**
   * Estimate token usage for the messages array.
   */
  estimateTokens(messages: AIRequest['messages']): number {
    return estimateMessageTokens(messages);
  }

  /**
   * Compact the conversation by summarising older turns.
   *
   * The `summariser` callback receives a plain-text transcript of the turns
   * to summarise and returns a concise summary string. This keeps the
   * compactor decoupled from any specific AI provider.
   *
   * Structure of compacted output:
   *   [system prompt (preserved verbatim, if any)]
   *   [Context summary: …]            ← injected system message
   *   [last N user+assistant turns]   ← preserved verbatim
   *
   * @param messages     Full message array.
   * @param model        Current model name (used to look up context window).
   * @param summariser   Async callback that summarises a transcript string.
   */
  async compact(
    messages: AIRequest['messages'],
    model: string,
    summariser: CompactorSummariser
  ): Promise<CompactionResult> {
    const estimatedBefore = estimateMessageTokens(messages);

    if (!this.needsCompaction(messages, model)) {
      return {
        compacted: false,
        messages,
        estimatedTokensBefore: estimatedBefore,
        estimatedTokensAfter: estimatedBefore,
        turnsSummarised: 0,
      };
    }

    // Separate system messages from conversational turns
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversational = messages.filter((m) => m.role !== 'system');

    // Preserve the most recent N messages verbatim
    const preserveCount = Math.min(this.preserveRecentTurns, conversational.length);
    const toSummarise = conversational.slice(0, conversational.length - preserveCount);
    const toPreserve = conversational.slice(conversational.length - preserveCount);

    if (toSummarise.length === 0) {
      // Nothing old enough to summarise
      return {
        compacted: false,
        messages,
        estimatedTokensBefore: estimatedBefore,
        estimatedTokensAfter: estimatedBefore,
        turnsSummarised: 0,
      };
    }

    // Build a transcript for the summariser
    const transcript = toSummarise
      .map((m) => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return `${m.role.toUpperCase()}: ${content}`;
      })
      .join('\n\n');

    const summaryPrompt =
      `Summarise the following conversation excerpt in 3-5 concise sentences, ` +
      `preserving key decisions, facts, and any context needed to continue the conversation:\n\n` +
      transcript;

    const summary = await summariser(summaryPrompt);

    const summaryMessage: AIRequest['messages'][number] = {
      role: 'system',
      content: `[Context summary: ${summary}]`,
    };

    const compactedMessages: AIRequest['messages'] = [
      ...systemMessages,
      summaryMessage,
      ...toPreserve,
    ];

    const estimatedAfter = estimateMessageTokens(compactedMessages);

    return {
      compacted: true,
      messages: compactedMessages,
      estimatedTokensBefore: estimatedBefore,
      estimatedTokensAfter: estimatedAfter,
      turnsSummarised: toSummarise.length,
    };
  }
}
