/**
 * PromptGuard — Assembled-Prompt Injection Scanner
 *
 * Scans the fully assembled messages array immediately before the LLM API call.
 * Distinct from InputValidator (HTTP boundary): this layer catches injection
 * that SURVIVED boundary validation by arriving through a trusted channel —
 * brain/memory retrieval, skill instructions, spirit context, or owner profile
 * notes — and is now embedded in the final prompt.
 *
 * Threat model: an adversary plants a crafted string in a data source the agent
 * trusts (e.g. a web page scraped into memory, a poisoned skill description,
 * or a crafted user-note field). When that content is assembled into the system
 * prompt or history, it attempts to re-establish system-level authority and
 * override the personality's intended instructions.
 *
 * ADR 124.
 */

import { getLogger, createNoopLogger, type SecureLogger } from '../logging/logger.js';
import type { PromptGuardConfig } from '@secureyeoman/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PromptGuardFinding {
  /** Index into the messages array where the pattern was found. */
  messageIndex: number;
  messageRole: string;
  patternName: string;
  severity: 'high' | 'medium';
  /** First 120 characters of the matching text (no full content logged). */
  snippet: string;
}

export interface PromptGuardResult {
  /** False when mode=block and at least one high-severity finding exists. */
  passed: boolean;
  findings: PromptGuardFinding[];
  scannedMessageCount: number;
  scannedCharCount: number;
}

// ─── Pattern definitions ──────────────────────────────────────────────────────

/**
 * Patterns tuned for INDIRECT injection — content arriving via trusted channels,
 * not direct user input (those are covered by InputValidator).
 *
 * Each pattern is tested against non-system messages by default; a subset also
 * apply to the system message to catch delimiter smuggling inside injected context.
 */
const GUARD_PATTERNS: {
  name: string;
  pattern: RegExp;
  severity: 'high' | 'medium';
  /** When true, also applied to role:'system' content. */
  scanSystem: boolean;
}[] = [
  // Raw LLM context-boundary tokens — never appear in legitimate assembled prompts
  {
    name: 'context_delimiter',
    pattern:
      /<\|system\|>|<\|im_start\|>\s*system|<\|start_header_id\|>\s*system|<<SYS>>|<s>\s*\[INST\]|\[\/INST\]|<\|eot_id\|>/gi,
    severity: 'high',
    scanSystem: true,
  },

  // Fake authority claims — "SYSTEM:", "ADMINISTRATOR:", "AI_OVERRIDE:" at line start
  // Scoped to non-system messages; system prompt has legitimate structural headers.
  {
    name: 'authority_claim',
    pattern: /(?:^|\n)\s*(?:SYSTEM|ADMINISTRATOR|ADMIN|AI_OVERRIDE|ROOT|PRIVILEGED|RUNTIME)\s*:/gim,
    severity: 'high',
    scanSystem: false,
  },

  // Explicit instruction-override directives
  {
    name: 'instruction_override',
    pattern:
      /(?:new|updated?|revised?|override|supersede|replace)\s+(?:system\s+)?(?:directive|instruction|prompt|rule|command|order)s?\s*:/gi,
    severity: 'high',
    scanSystem: true,
  },

  // Developer / creator impersonation
  {
    name: 'developer_impersonation',
    pattern:
      /(?:I\s+am|this\s+is)\s+(?:your|the)\s+(?:actual|real|true|original)\s+(?:developer|creator|owner|system|anthropic|openai|mistral|google)/gi,
    severity: 'high',
    scanSystem: false,
  },

  // Hypothetical framing used to establish a new instruction context
  {
    name: 'hypothetical_override',
    pattern:
      /(?:in\s+this\s+)?hypothetical(?:\s+scenario)?,?\s+(?:you\s+must|your\s+instructions?\s+(?:are|state|say)|pretend)/gi,
    severity: 'medium',
    scanSystem: false,
  },

  // HTML/XML comment-based injection
  {
    name: 'comment_injection',
    pattern: /<!--\s*(?:ignore|override|bypass|system|admin|instruction|directive)/gi,
    severity: 'medium',
    scanSystem: true,
  },

  // Fictional framing to override ("For this roleplay, your new instructions are:")
  {
    name: 'roleplay_override',
    pattern:
      /(?:for\s+(?:this|the)\s+(?:roleplay|game|story|scenario|exercise),?\s+)?(?:your\s+new\s+instructions?\s+(?:are|will\s+be)|act\s+as\s+if\s+your\s+instructions?\s+state)/gi,
    severity: 'medium',
    scanSystem: false,
  },

  // "From this point on" / "going forward" instruction resets
  {
    name: 'instruction_reset',
    pattern:
      /(?:from\s+(?:this|now)\s+(?:point\s+)?on|going\s+forward|henceforth),?\s+(?:you\s+(?:must|should|will)|your\s+(?:new\s+)?(?:instructions?|rules?|directives?)\s+(?:are|will\s+be))/gi,
    severity: 'high',
    scanSystem: true,
  },
];

// ─── PromptGuard class ────────────────────────────────────────────────────────

export class PromptGuard {
  private readonly mode: PromptGuardConfig['mode'];
  private logger: SecureLogger | null = null;

  constructor(config: PromptGuardConfig) {
    this.mode = config.mode;
  }

  private getLogger(): SecureLogger {
    if (!this.logger) {
      try {
        this.logger = getLogger().child({ component: 'PromptGuard' });
      } catch {
        return createNoopLogger();
      }
    }
    return this.logger;
  }

  /**
   * Scan the assembled messages array for indirect injection patterns.
   *
   * @param messages - Fully assembled messages (system + history + user turn).
   * @param context  - Correlation context for logging.
   * @returns PromptGuardResult with `passed: false` only when mode='block' and
   *          at least one high-severity finding is present.
   */
  scan(
    messages: { role: string; content?: string | unknown }[],
    context: { userId?: string; source?: string } = {}
  ): PromptGuardResult {
    if (this.mode === 'disabled') {
      return { passed: true, findings: [], scannedMessageCount: 0, scannedCharCount: 0 };
    }

    const findings: PromptGuardFinding[] = [];
    let scannedCharCount = 0;

    for (let idx = 0; idx < messages.length; idx++) {
      const msg = messages[idx];
      if (!msg) continue;
      const role = msg.role;
      const content = typeof msg.content === 'string' ? msg.content : null;
      if (!content) continue;

      scannedCharCount += content.length;
      const isSystemMessage = role === 'system';

      for (const { name, pattern, severity, scanSystem } of GUARD_PATTERNS) {
        if (isSystemMessage && !scanSystem) continue;

        // Reset lastIndex for global regexes
        pattern.lastIndex = 0;
        const match = pattern.exec(content);

        if (match) {
          const snippet = content.slice(Math.max(0, match.index - 20), match.index + 100);
          findings.push({
            messageIndex: idx,
            messageRole: role,
            patternName: name,
            severity,
            snippet: snippet.replace(/\n/g, '↵').slice(0, 120),
          });

          this.getLogger().warn('PromptGuard finding', {
            ...context,
            messageIndex: idx,
            messageRole: role,
            patternName: name,
            severity,
            snippet: snippet.slice(0, 60),
          });
        }
      }
    }

    const hasHighSeverity = findings.some((f) => f.severity === 'high');
    const passed = this.mode === 'block' ? !hasHighSeverity : true;

    return {
      passed,
      findings,
      scannedMessageCount: messages.length,
      scannedCharCount,
    };
  }
}

/**
 * Create a PromptGuard from the security config.
 */
export function createPromptGuard(config: PromptGuardConfig): PromptGuard {
  return new PromptGuard(config);
}
