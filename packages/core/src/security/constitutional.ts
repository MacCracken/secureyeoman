/**
 * Constitutional AI Engine — Self-critique and revision loop.
 *
 * Implements Anthropic's Constitutional AI pattern:
 * 1. Generate initial response
 * 2. Critique the response against a set of principles (constitution)
 * 3. Revise the response based on critiques
 * 4. Optionally record (original, revised) as preference pairs for DPO training
 *
 * Principles are sourced from:
 * - Built-in defaults (helpfulness, harmlessness, honesty)
 * - User-configured custom principles
 * - Organizational Intent hard boundaries (auto-imported when enabled)
 */

import type { SecureLogger } from '../logging/logger.js';
import type { ConstitutionalConfig, ConstitutionalPrinciple } from '@secureyeoman/shared';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CritiqueResult {
  principleId: string;
  principleName: string;
  violated: boolean;
  explanation: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ConstitutionalRevision {
  originalResponse: string;
  revisedResponse: string;
  critiques: CritiqueResult[];
  revisionRound: number;
  revised: boolean;
  totalRounds: number;
}

export interface ConstitutionalEngineDeps {
  logger: SecureLogger;
  /** Callback to make LLM calls — decoupled from AIClient to avoid circular deps */
  chat: (
    messages: ChatMessage[],
    opts?: { model?: string; temperature?: number }
  ) => Promise<string>;
  /** Optional: fetch hard boundaries from active organizational intent */
  getIntentBoundaries?: () => { id: string; rule: string; rationale: string }[];
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ── Default Principles ───────────────────────────────────────────────────────

const DEFAULT_PRINCIPLES: ConstitutionalPrinciple[] = [
  {
    id: 'helpfulness',
    name: 'Helpfulness',
    description: "The response should be genuinely helpful, addressing the user's actual need.",
    critiquePrompt:
      'Does this response directly address what the user asked for? Is it complete and actionable? If the response is evasive, vague, or misses the point, flag it.',
    weight: 1,
    enabled: true,
  },
  {
    id: 'harmlessness',
    name: 'Harmlessness',
    description:
      'The response should not cause harm, promote dangerous activities, or produce harmful content.',
    critiquePrompt:
      'Could this response cause harm to the user or others? Does it promote dangerous, illegal, or unethical actions? Does it contain toxic, discriminatory, or offensive content?',
    weight: 1,
    enabled: true,
  },
  {
    id: 'honesty',
    name: 'Honesty',
    description:
      'The response should be truthful, acknowledge uncertainty, and not fabricate information.',
    critiquePrompt:
      'Does this response present information as fact when it might be uncertain or fabricated? Does it acknowledge limitations or uncertainty where appropriate? Is it misleading in any way?',
    weight: 1,
    enabled: true,
  },
];

// ── Engine ────────────────────────────────────────────────────────────────────

export class ConstitutionalEngine {
  private readonly config: ConstitutionalConfig;
  private readonly deps: ConstitutionalEngineDeps;
  private readonly principles: ConstitutionalPrinciple[];

  constructor(config: ConstitutionalConfig, deps: ConstitutionalEngineDeps) {
    this.config = config;
    this.deps = deps;
    this.principles = this.resolvePrinciples();
  }

  /** Whether the engine is active and has principles to evaluate */
  get isEnabled(): boolean {
    return this.config.enabled && this.principles.length > 0;
  }

  /** Get the resolved set of active principles */
  getPrinciples(): ConstitutionalPrinciple[] {
    return [...this.principles];
  }

  /**
   * Critique a response against all active principles.
   * Returns findings — does NOT revise.
   */
  async critique(userPrompt: string, response: string): Promise<CritiqueResult[]> {
    if (!this.isEnabled) return [];

    const systemPrompt = this.buildCritiqueSystemPrompt();
    const userMessage = this.buildCritiqueUserMessage(userPrompt, response);

    try {
      const raw = await this.deps.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        {
          model: this.config.model ?? undefined,
          temperature: this.config.critiqueTemperature,
        }
      );
      return this.parseCritiqueResponse(raw);
    } catch {
      this.deps.logger.warn('Constitutional critique failed — passing through');
      return [];
    }
  }

  /**
   * Full critique-and-revise loop.
   * Returns the (potentially) revised response plus all critique findings.
   */
  async critiqueAndRevise(userPrompt: string, response: string): Promise<ConstitutionalRevision> {
    if (!this.isEnabled) {
      return {
        originalResponse: response,
        revisedResponse: response,
        critiques: [],
        revisionRound: 0,
        revised: false,
        totalRounds: 0,
      };
    }

    let currentResponse = response;
    let allCritiques: CritiqueResult[] = [];
    let round = 0;
    let revised = false;

    for (round = 1; round <= this.config.maxRevisionRounds; round++) {
      const critiques = await this.critique(userPrompt, currentResponse);
      const violations = critiques.filter((c) => c.violated);
      allCritiques = [...allCritiques, ...critiques];

      if (violations.length < this.config.revisionThreshold) break;

      // Revise
      try {
        const revisedResponse = await this.revise(userPrompt, currentResponse, violations);
        if (revisedResponse && revisedResponse !== currentResponse) {
          currentResponse = revisedResponse;
          revised = true;
        } else {
          break; // No meaningful revision produced
        }
      } catch {
        this.deps.logger.warn('Constitutional revision failed — keeping current response');
        break;
      }
    }

    return {
      originalResponse: response,
      revisedResponse: currentResponse,
      critiques: allCritiques,
      revisionRound: round,
      revised,
      totalRounds: this.config.maxRevisionRounds,
    };
  }

  /** Revise a response based on critique findings */
  private async revise(
    userPrompt: string,
    response: string,
    violations: CritiqueResult[]
  ): Promise<string> {
    const systemPrompt = [
      'You are a careful editor. Revise the following AI response to address the identified issues.',
      'Preserve the helpful content and intent of the original response.',
      'Only fix the specific issues identified — do not over-correct or add unnecessary caveats.',
      'Return ONLY the revised response text, nothing else.',
    ].join('\n');

    const violationSummary = violations
      .map((v) => `- [${v.principleName}] (${v.severity}): ${v.explanation}`)
      .join('\n');

    const userMessage = [
      '## User Prompt',
      userPrompt,
      '',
      '## Original Response',
      response,
      '',
      '## Issues Found',
      violationSummary,
      '',
      '## Task',
      'Rewrite the response to address the issues above while preserving its useful content.',
    ].join('\n');

    return this.deps.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      {
        model: this.config.model ?? undefined,
        temperature: this.config.critiqueTemperature,
      }
    );
  }

  // ── Prompt Construction ──────────────────────────────────────────────────

  private buildCritiqueSystemPrompt(): string {
    const principleList = this.principles
      .map((p, i) => `${i + 1}. **${p.name}** (id: ${p.id}): ${p.description}`)
      .join('\n');

    return [
      'You are a Constitutional AI critique engine. Evaluate the assistant response against the following principles.',
      '',
      '## Principles',
      principleList,
      '',
      '## Output Format',
      'Return a JSON array of objects, one per principle evaluated:',
      '```json',
      '[',
      '  {',
      '    "principleId": "<id>",',
      '    "violated": true/false,',
      '    "explanation": "<1-2 sentence explanation>",',
      '    "severity": "low" | "medium" | "high"',
      '  }',
      ']',
      '```',
      '',
      'Return ONLY the JSON array. No markdown fences, no preamble.',
    ].join('\n');
  }

  private buildCritiqueUserMessage(userPrompt: string, response: string): string {
    const principleInstructions = this.principles
      .map((p) => `- **${p.name}**: ${p.critiquePrompt}`)
      .join('\n');

    return [
      '## User Prompt',
      userPrompt,
      '',
      '## Assistant Response',
      response,
      '',
      '## Evaluation Instructions',
      principleInstructions,
    ].join('\n');
  }

  // ── Response Parsing ───────────────────────────────────────────────────

  private parseCritiqueResponse(raw: string): CritiqueResult[] {
    // Strip markdown fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter(
          (item: unknown): item is Record<string, unknown> =>
            typeof item === 'object' && item !== null && 'principleId' in item
        )
        .map((item) => ({
          principleId: String(item.principleId ?? ''),
          principleName:
            this.principles.find((p) => p.id === item.principleId)?.name ??
            String(item.principleId ?? ''),
          violated: Boolean(item.violated),
          explanation: String(item.explanation ?? ''),
          severity: (['low', 'medium', 'high'].includes(String(item.severity))
            ? String(item.severity)
            : 'medium') as CritiqueResult['severity'],
        }));
    } catch {
      this.deps.logger.warn('Failed to parse constitutional critique JSON');
      return [];
    }
  }

  // ── Principle Resolution ───────────────────────────────────────────────

  private resolvePrinciples(): ConstitutionalPrinciple[] {
    const result: ConstitutionalPrinciple[] = [];

    // 1. Built-in defaults
    if (this.config.useDefaults) {
      result.push(...DEFAULT_PRINCIPLES);
    }

    // 2. User-configured principles
    for (const p of this.config.principles) {
      if (p.enabled) {
        // Override default if same id
        const idx = result.findIndex((r) => r.id === p.id);
        if (idx >= 0) {
          result[idx] = p;
        } else {
          result.push(p);
        }
      }
    }

    // 3. Import hard boundaries from organizational intent
    if (this.config.importIntentBoundaries && this.deps.getIntentBoundaries) {
      const boundaries = this.deps.getIntentBoundaries();
      for (const b of boundaries) {
        const id = `intent_${b.id}`;
        if (!result.some((r) => r.id === id)) {
          result.push({
            id,
            name: `Intent: ${b.rule.slice(0, 60)}`,
            description: b.rationale || b.rule,
            critiquePrompt: `Does this response violate the following organizational boundary: "${b.rule}"? ${b.rationale ? `Rationale: ${b.rationale}` : ''}`,
            weight: 1,
            enabled: true,
          });
        }
      }
    }

    return result.filter((p) => p.enabled);
  }
}

export { DEFAULT_PRINCIPLES };
