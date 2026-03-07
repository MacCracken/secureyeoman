/**
 * Prompt A/B Test Manager — Phase 142
 *
 * Routes conversations to prompt variants based on traffic percentages.
 * Tracks outcomes per variant. Determines winners via simple comparison.
 *
 * In-memory implementation — tests persist for the process lifetime.
 * Can be extended with DB persistence in a future phase.
 */

import type { SecureLogger } from '../logging/logger.js';

export interface PromptVariant {
  id: string;
  name: string;
  systemPrompt: string;
  trafficPercent: number;
}

export interface PromptAbTest {
  id: string;
  personalityId: string;
  name: string;
  description: string;
  variants: PromptVariant[];
  status: 'draft' | 'running' | 'completed';
  minConversations: number;
  results: Map<string, VariantResult>;
  createdAt: number;
  completedAt: number | null;
}

export interface VariantResult {
  variantId: string;
  conversationCount: number;
  totalScore: number;
  avgScore: number | null;
}

export interface PromptAbTestCreate {
  personalityId: string;
  name: string;
  description?: string;
  variants: Omit<PromptVariant, 'id'>[];
  minConversations?: number;
}

export interface PromptResolveResult {
  testId: string;
  variantId: string;
  systemPrompt: string;
}

export class PromptAbTestManager {
  private readonly tests = new Map<string, PromptAbTest>();
  private readonly assignments = new Map<string, string>(); // conversationId → variantId
  private readonly logger?: SecureLogger;
  private nextId = 1;

  constructor(logger?: SecureLogger) {
    this.logger = logger;
  }

  create(data: PromptAbTestCreate): PromptAbTest {
    // Enforce one running test per personality
    for (const test of this.tests.values()) {
      if (test.personalityId === data.personalityId && test.status === 'running') {
        throw new Error('A running prompt A/B test already exists for this personality');
      }
    }

    // Validate traffic percentages
    const totalTraffic = data.variants.reduce((sum, v) => sum + v.trafficPercent, 0);
    if (Math.abs(totalTraffic - 100) > 1) {
      throw new Error(`Variant traffic percentages must sum to 100 (got ${totalTraffic})`);
    }

    if (data.variants.length < 2) {
      throw new Error('At least 2 variants are required');
    }

    const id = `pat-${this.nextId++}`;
    const variants: PromptVariant[] = data.variants.map((v, i) => ({
      ...v,
      id: `${id}-v${i}`,
    }));

    const results = new Map<string, VariantResult>();
    for (const v of variants) {
      results.set(v.id, { variantId: v.id, conversationCount: 0, totalScore: 0, avgScore: null });
    }

    const test: PromptAbTest = {
      id,
      personalityId: data.personalityId,
      name: data.name,
      description: data.description ?? '',
      variants,
      status: 'running',
      minConversations: data.minConversations ?? 50,
      results,
      createdAt: Date.now(),
      completedAt: null,
    };

    this.tests.set(id, test);
    this.logger?.info({ testId: id, personalityId: data.personalityId }, 'Prompt A/B test created');
    return test;
  }

  get(id: string): PromptAbTest | null {
    return this.tests.get(id) ?? null;
  }

  getActiveTest(personalityId: string): PromptAbTest | null {
    for (const test of this.tests.values()) {
      if (test.personalityId === personalityId && test.status === 'running') {
        return test;
      }
    }
    return null;
  }

  list(personalityId?: string): PromptAbTest[] {
    const tests = [...this.tests.values()];
    if (personalityId) return tests.filter((t) => t.personalityId === personalityId);
    return tests;
  }

  /**
   * Resolve which prompt variant to use for a conversation.
   * Returns null if no active test for this personality.
   * Sticky: same conversation always gets same variant.
   */
  resolvePrompt(personalityId: string, conversationId: string): PromptResolveResult | null {
    const test = this.getActiveTest(personalityId);
    if (!test) return null;

    // Check sticky assignment
    const key = `${test.id}:${conversationId}`;
    const existingVariantId = this.assignments.get(key);
    if (existingVariantId) {
      const variant = test.variants.find((v) => v.id === existingVariantId);
      if (variant) {
        return { testId: test.id, variantId: variant.id, systemPrompt: variant.systemPrompt };
      }
    }

    // Random assignment based on traffic percentages
    const rand = Math.random() * 100;
    let cumulative = 0;
    let selected = test.variants[0]!;

    for (const v of test.variants) {
      cumulative += v.trafficPercent;
      if (rand < cumulative) {
        selected = v;
        break;
      }
    }

    this.assignments.set(key, selected.id);

    // Increment conversation count
    const result = test.results.get(selected.id);
    if (result) result.conversationCount++;

    return { testId: test.id, variantId: selected.id, systemPrompt: selected.systemPrompt };
  }

  /**
   * Record a quality score for a conversation's variant.
   */
  recordScore(testId: string, conversationId: string, score: number): void {
    const test = this.tests.get(testId);
    if (!test) return;

    const key = `${testId}:${conversationId}`;
    const variantId = this.assignments.get(key);
    if (!variantId) return;

    const result = test.results.get(variantId);
    if (!result) return;

    result.totalScore += score;
    result.avgScore =
      result.conversationCount > 0 ? result.totalScore / result.conversationCount : null;
  }

  /**
   * Evaluate the test and determine a winner.
   */
  evaluate(testId: string): {
    winner: PromptVariant | null;
    results: VariantResult[];
    ready: boolean;
  } {
    const test = this.tests.get(testId);
    if (!test) throw new Error('Test not found');

    const results = [...test.results.values()];
    const totalConversations = results.reduce((s, r) => s + r.conversationCount, 0);
    const ready = totalConversations >= test.minConversations;

    let winner: PromptVariant | null = null;
    if (ready) {
      let bestAvg = -Infinity;
      for (const r of results) {
        if (r.avgScore != null && r.avgScore > bestAvg) {
          bestAvg = r.avgScore;
          winner = test.variants.find((v) => v.id === r.variantId) ?? null;
        }
      }
    }

    return { winner, results, ready };
  }

  /**
   * Complete a test with a chosen winner.
   */
  complete(testId: string, winnerVariantId: string): PromptAbTest | null {
    const test = this.tests.get(testId);
    if (test?.status !== 'running') return null;

    test.status = 'completed';
    test.completedAt = Date.now();

    this.logger?.info({ testId, winnerVariantId }, 'Prompt A/B test completed');
    return test;
  }

  /**
   * Cancel a running test.
   */
  cancel(testId: string): boolean {
    const test = this.tests.get(testId);
    if (test?.status !== 'running') return false;

    test.status = 'completed';
    test.completedAt = Date.now();
    return true;
  }

  /**
   * Serialize test for API response (converts Maps to plain objects).
   */
  serialize(test: PromptAbTest): Record<string, unknown> {
    return {
      id: test.id,
      personalityId: test.personalityId,
      name: test.name,
      description: test.description,
      variants: test.variants,
      status: test.status,
      minConversations: test.minConversations,
      results: [...test.results.values()],
      createdAt: test.createdAt,
      completedAt: test.completedAt,
    };
  }
}
