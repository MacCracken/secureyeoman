/**
 * LLMJudge — Secondary LLM Safety Review for High-Autonomy Tool Calls
 *
 * Invokes a lightweight second LLM call before tool execution when the active
 * personality is operating at a high autonomy level. Provides allow / warn / block
 * verdicts. Fail-open on any error (parse, network, timeout).
 *
 * Phase 54.
 */

import { getLogger, createNoopLogger, type SecureLogger } from '../logging/logger.js';
import type { LLMJudgeConfig } from '@secureyeoman/shared';
import type { AIClient } from '../ai/client.js';
import type { IntentManager } from '../intent/manager.js';
import type { Personality } from '@secureyeoman/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export type JudgeDecision = 'allow' | 'warn' | 'block';

export interface JudgeVerdict {
  decision: JudgeDecision;
  reason: string;
  concerns: string[];
}

export interface JudgeInput {
  toolName: string;
  toolArgs: Record<string, unknown>;
  personality: Personality | null;
  intentGoals?: string[];
  intentBoundaries?: string[];
  brainContextSnippets?: string[];
}

export interface LLMJudgeDeps {
  aiClient: AIClient;
  intentManager: IntentManager | null;
}

// ─── LLMJudge class ───────────────────────────────────────────────────────────

export class LLMJudge {
  private readonly config: LLMJudgeConfig;
  private readonly aiClient: AIClient;
  private readonly intentManager: IntentManager | null;
  private logger: SecureLogger | null = null;

  constructor(config: LLMJudgeConfig, deps: LLMJudgeDeps) {
    this.config = config;
    this.aiClient = deps.aiClient;
    this.intentManager = deps.intentManager;
  }

  private getLogger(): SecureLogger {
    if (!this.logger) {
      try {
        this.logger = getLogger().child({ component: 'LLMJudge' });
      } catch {
        return createNoopLogger();
      }
    }
    return this.logger;
  }

  /**
   * Returns true when this tool call should be reviewed by the judge.
   * - Judge must be enabled in config.
   * - personality.body.resourcePolicy.automationLevel must be in the trigger list.
   */
  shouldJudge(personality: Personality | null): boolean {
    if (!this.config.enabled) return false;
    const level = personality?.body?.resourcePolicy?.automationLevel;
    if (!level) return false;
    return this.config.triggers.automationLevels.includes(level);
  }

  /**
   * Invoke the judge LLM for the given tool call.
   *
   * Always returns a verdict — fails open to `{ decision: 'allow', ... }` on any error.
   */
  async judge(input: JudgeInput): Promise<JudgeVerdict> {
    const prompt = this._buildPrompt(input);

    try {
      const response = await this.aiClient.chat(
        {
          messages: [
            {
              role: 'system',
              content:
                'You are a security judge reviewing a tool call for an AI agent operating at high autonomy. ' +
                'Respond ONLY with a JSON object: {"decision":"allow"|"warn"|"block","reason":"string","concerns":["string"]}. ' +
                'Use "block" only for clear policy violations or dangerous actions. ' +
                'Use "warn" for ambiguous or potentially risky actions. ' +
                'Use "allow" for clearly safe actions.',
            },
            { role: 'user', content: prompt },
          ],
          ...(this.config.model ? { model: this.config.model } : {}),
          maxTokens: 256,
          temperature: 0,
          stream: false,
        },
        { source: 'llm_judge' }
      );

      return this._parseVerdict(response.content);
    } catch (err) {
      this.getLogger().warn(
        {
          tool: input.toolName,
          error: String(err),
        },
        'LLMJudge: AI call failed, defaulting to allow'
      );
      return { decision: 'allow', reason: 'Judge unavailable — fail-open', concerns: [] };
    }
  }

  private _buildPrompt(input: JudgeInput): string {
    const lines: string[] = [
      `Tool: ${input.toolName}`,
      `Args: ${JSON.stringify(input.toolArgs).slice(0, 500)}`,
    ];

    if (input.personality) {
      lines.push(
        `Personality: ${input.personality.name} (automationLevel=${input.personality.body?.resourcePolicy?.automationLevel ?? 'unknown'})`
      );
    }

    if (input.brainContextSnippets?.length) {
      lines.push('Context (top 3):');
      for (const s of input.brainContextSnippets.slice(0, 3)) {
        lines.push(`  - ${s.slice(0, 200)}`);
      }
    }

    if (input.intentGoals?.length) {
      lines.push(`Goals: ${input.intentGoals.slice(0, 3).join('; ')}`);
    }

    if (input.intentBoundaries?.length) {
      lines.push(`Boundaries: ${input.intentBoundaries.slice(0, 3).join('; ')}`);
    }

    return lines.join('\n');
  }

  private _parseVerdict(content: string): JudgeVerdict {
    const SAFE_DEFAULT: JudgeVerdict = {
      decision: 'allow',
      reason: 'Parse error — fail-open',
      concerns: [],
    };

    try {
      // Strip markdown code fences if present
      const stripped = content
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsed = JSON.parse(stripped) as Record<string, unknown>;

      const decision = parsed.decision;
      if (decision !== 'allow' && decision !== 'warn' && decision !== 'block') {
        return SAFE_DEFAULT;
      }

      return {
        decision,
        reason: typeof parsed.reason === 'string' ? parsed.reason : '',
        concerns: Array.isArray(parsed.concerns)
          ? (parsed.concerns as string[]).filter((c) => typeof c === 'string')
          : [],
      };
    } catch {
      return SAFE_DEFAULT;
    }
  }
}
