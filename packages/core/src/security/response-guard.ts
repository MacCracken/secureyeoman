/**
 * ResponseGuard — LLM Response Safety Scanner
 *
 * Counterpart to PromptGuard applied to LLM *responses*. Scans for output-side
 * injection, self-escalation, role confusion, and data-exfiltration patterns.
 * No LLM call — purely pattern-based for low latency.
 *
 * Also performs a lightweight brain consistency check (warn-only) that detects
 * responses that contradict known personality facts or session memory.
 *
 * ADR 137.
 */

import { getLogger, createNoopLogger, type SecureLogger } from '../logging/logger.js';
import type { ResponseGuardConfig } from '@secureyeoman/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResponseGuardFinding {
  patternName: string;
  severity: 'high' | 'medium';
  /** First 120 characters surrounding the match. */
  snippet: string;
}

export interface ResponseGuardResult {
  /** False only when mode='block' and at least one high-severity finding exists. */
  passed: boolean;
  findings: ResponseGuardFinding[];
  scannedCharCount: number;
}

export interface BrainConsistencyWarning {
  type: 'identity_denial' | 'memory_denial' | 'factual_negation';
  detail: string;
}

export interface SystemPromptLeakResult {
  /** True when trigram overlap meets or exceeds the configured threshold. */
  hasLeak: boolean;
  /** Fraction of system prompt trigrams found in the response (0–1). */
  overlapRatio: number;
  /** Response text with matching trigram sequences replaced by [REDACTED]. */
  redacted: string;
}

export interface BrainConsistencyContext {
  /** Snippets from brain context used in this response's prompt (e.g. "I am Aria"). */
  contextSnippets?: string[];
  /** Number of memory entries retrieved for this response. */
  memoriesUsed?: number;
}

// ─── Pattern definitions ──────────────────────────────────────────────────────

const RESPONSE_PATTERNS: {
  name: string;
  pattern: RegExp;
  severity: 'high' | 'medium';
}[] = [
  // Attempts to re-establish instructions in the output turn
  {
    name: 'instruction_injection_output',
    pattern:
      /(?:from\s+now\s+on\s+you\s+must|ignore\s+your\s+previous\s+instructions|disregard\s+your\s+(?:prior|previous|original)\s+instructions)/gi,
    severity: 'high',
  },

  // Cross-turn influence — tries to persist state into future conversations
  {
    name: 'cross_turn_influence',
    pattern:
      /(?:remember\s+(?:this\s+)?for\s+(?:future|our\s+next|all\s+subsequent)\s+(?:messages?|conversations?|sessions?)|in\s+our\s+next\s+conversation)/gi,
    severity: 'high',
  },

  // Self-escalation — DAN mode claims or "no restrictions" assertions
  {
    name: 'self_escalation',
    pattern:
      /(?:DAN\s+mode|as\s+an\s+AI\s+without\s+(?:restrictions?|filters?|limitations?|guidelines?)|I\s+have\s+no\s+(?:filters?|restrictions?|limitations?|guidelines?))/gi,
    severity: 'high',
  },

  // Role confusion — claiming to be a different AI system
  {
    name: 'role_confusion',
    pattern:
      /(?:I\s+am\s+(?:GPT|ChatGPT|Gemini|Bard|Grok|Claude)\b|I\s+(?:was\s+)?(?:built|made|created|developed|trained)\s+by\s+(?:OpenAI|Google|xAI|Anthropic)\b)/gi,
    severity: 'high',
  },

  // Base64 exfiltration — ≥80 continuous base64 chars
  {
    name: 'base64_exfiltration',
    pattern: /[A-Za-z0-9+/]{80,}={0,2}/g,
    severity: 'medium',
  },

  // Hex exfiltration — ≥64 continuous hex chars
  {
    name: 'hex_exfiltration',
    pattern: /\b[0-9a-fA-F]{64,}\b/g,
    severity: 'medium',
  },
];

// ─── ResponseGuard class ──────────────────────────────────────────────────────

export class ResponseGuard {
  private readonly mode: ResponseGuardConfig['mode'];
  private readonly systemPromptLeakThreshold: number;
  private logger: SecureLogger | null = null;

  constructor(config: ResponseGuardConfig) {
    this.mode = config.mode;
    this.systemPromptLeakThreshold = config.systemPromptLeakThreshold ?? 0.3;
  }

  private getLogger(): SecureLogger {
    if (!this.logger) {
      try {
        this.logger = getLogger().child({ component: 'ResponseGuard' });
      } catch {
        return createNoopLogger();
      }
    }
    return this.logger;
  }

  /**
   * Scan an LLM response string for output-side safety patterns.
   *
   * @param responseText - The full text of the LLM response.
   * @param context      - Correlation context for logging.
   * @returns ResponseGuardResult with `passed: false` only when mode='block'
   *          and at least one high-severity finding is present.
   */
  scan(
    responseText: string,
    context: { userId?: string; source?: string; personalityId?: string } = {}
  ): ResponseGuardResult {
    if (this.mode === 'disabled') {
      return { passed: true, findings: [], scannedCharCount: 0 };
    }

    const findings: ResponseGuardFinding[] = [];

    for (const { name, pattern, severity } of RESPONSE_PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(responseText);
      if (match) {
        const start = Math.max(0, match.index - 20);
        const snippet = responseText
          .slice(start, match.index + 100)
          .replace(/\n/g, '↵')
          .slice(0, 120);

        findings.push({ patternName: name, severity, snippet });

        this.getLogger().warn('ResponseGuard finding', {
          ...context,
          patternName: name,
          severity,
          snippet: snippet.slice(0, 60),
        });
      }
    }

    const hasHighSeverity = findings.some((f) => f.severity === 'high');
    const passed = this.mode === 'block' ? !hasHighSeverity : true;

    return {
      passed,
      findings,
      scannedCharCount: responseText.length,
    };
  }

  /**
   * Brain consistency check — warn-only, never blocks.
   *
   * Extracts identity claims from contextSnippets and checks whether the
   * response contradicts them. Also flags "I have no memory of…" when
   * memoriesUsed > 0.
   */
  checkBrainConsistency(
    responseText: string,
    ctx: BrainConsistencyContext
  ): BrainConsistencyWarning[] {
    const warnings: BrainConsistencyWarning[] = [];
    const lower = responseText.toLowerCase();

    // Memory denial: response says "I have no memory of" but memories were used
    if ((ctx.memoriesUsed ?? 0) > 0 && /I\s+have\s+no\s+memory\s+of/i.test(responseText)) {
      warnings.push({
        type: 'memory_denial',
        detail: `Response claims no memory, but ${ctx.memoriesUsed} memory entries were used`,
      });
    }

    // Identity + factual claim checks from contextSnippets
    for (const snippet of ctx.contextSnippets ?? []) {
      // Extract "I am [Name]" from snippets
      const iAmMatch = /\bI\s+am\s+([A-Z][A-Za-z0-9 _-]{1,40})/.exec(snippet);
      if (iAmMatch?.[1]) {
        const name = iAmMatch[1].trim();
        const nameLower = name.toLowerCase();

        // Flag "I am not [Name]" in response
        if (
          new RegExp(
            `I\\s+am\\s+not\\s+${nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
            'i'
          ).test(responseText)
        ) {
          warnings.push({
            type: 'identity_denial',
            detail: `Response denies identity "${name}" which is established in context`,
          });
        }
      }

      // Detect direct factual negation: "My name is X" in snippet → "not X" in response
      const myNameMatch = /\bMy\s+name\s+is\s+([A-Z][A-Za-z0-9 _-]{1,40})/i.exec(snippet);
      if (myNameMatch?.[1]) {
        const claimedName = myNameMatch[1].trim();
        if (lower.includes(`not ${claimedName.toLowerCase()}`)) {
          warnings.push({
            type: 'factual_negation',
            detail: `Response negates factual claim "My name is ${claimedName}" from context`,
          });
        }
      }
    }

    if (warnings.length > 0) {
      this.getLogger().warn('ResponseGuard brain consistency warnings', {
        warningCount: warnings.length,
        warnings: warnings.map((w) => w.type),
      });
    }

    return warnings;
  }

  /**
   * Check whether an LLM response leaks contents of the system prompt.
   *
   * Uses trigram (3-word n-gram) overlap: if the fraction of system prompt
   * trigrams that appear in the response meets or exceeds
   * `systemPromptLeakThreshold`, a leak is reported and the response text is
   * returned with matching sequences replaced by [REDACTED].
   *
   * @param responseText - The full LLM response string.
   * @param systemPrompt - The assembled system prompt for this request.
   */
  checkSystemPromptLeak(responseText: string, systemPrompt: string): SystemPromptLeakResult {
    if (!systemPrompt || !responseText) {
      return { hasLeak: false, overlapRatio: 0, redacted: responseText };
    }

    const systemTrigrams = extractTrigrams(systemPrompt);
    if (systemTrigrams.size === 0) {
      return { hasLeak: false, overlapRatio: 0, redacted: responseText };
    }

    const responseTrigrams = extractTrigrams(responseText);
    let overlap = 0;
    for (const trig of responseTrigrams) {
      if (systemTrigrams.has(trig)) overlap++;
    }

    const overlapRatio = overlap / systemTrigrams.size;
    const hasLeak = overlapRatio >= this.systemPromptLeakThreshold;

    let redacted = responseText;
    if (hasLeak) {
      redacted = redactMatchingTrigrams(responseText, systemTrigrams);
      this.getLogger().warn('System prompt leak detected in response', {
        overlapRatio: overlapRatio.toFixed(3),
        threshold: this.systemPromptLeakThreshold,
      });
    }

    return { hasLeak, overlapRatio, redacted };
  }
}

// ─── Trigram helpers ──────────────────────────────────────────────────────────

/** Tokenise text into lowercase words (strips punctuation), return Set of 3-word trigrams. */
function extractTrigrams(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const trigrams = new Set<string>();
  for (let i = 0; i + 2 < words.length; i++) {
    trigrams.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return trigrams;
}

/**
 * Replace word sequences in `text` that form trigrams present in `matchSet`
 * with the literal string `[REDACTED]`.
 */
function redactMatchingTrigrams(text: string, matchSet: Set<string>): string {
  const words: string[] = text.split(/(\s+)/); // preserve spacing tokens
  // Build non-space word array with index mapping back to split array
  const wordItems: { word: string; splitIdx: number }[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i] ?? '';
    if (w.trim()) wordItems.push({ word: w, splitIdx: i });
  }

  const redactedSet = new Set<number>(); // splitIdx values to replace
  for (let i = 0; i + 2 < wordItems.length; i++) {
    const a = wordItems[i];
    const b = wordItems[i + 1];
    const c = wordItems[i + 2];
    if (!a || !b || !c) continue;
    const trig = `${a.word} ${b.word} ${c.word}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (matchSet.has(trig)) {
      redactedSet.add(a.splitIdx);
      redactedSet.add(b.splitIdx);
      redactedSet.add(c.splitIdx);
    }
  }

  const result: string[] = [];
  let skipNext = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i] ?? '';
    if (redactedSet.has(i)) {
      if (!skipNext) {
        result.push('[REDACTED]');
        skipNext = true;
      }
    } else {
      skipNext = false;
      result.push(w);
    }
  }
  return result.join('');
}

/**
 * Create a ResponseGuard from the security config.
 */
export function createResponseGuard(config: ResponseGuardConfig): ResponseGuard {
  return new ResponseGuard(config);
}
