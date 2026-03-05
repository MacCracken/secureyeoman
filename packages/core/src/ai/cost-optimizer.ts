/**
 * Cost Optimizer — analyzes usage data and produces recommendations.
 *
 * Enhanced with historical pattern analysis, workload detection, and
 * actionable auto-routing suggestions.
 */

import type { CostRecommendation, CostAnalysis } from '@secureyeoman/shared';
import type { SecureLogger } from '../logging/logger.js';
import type { UsageTracker } from './usage-tracker.js';
import type { UsageStorage, HistoryRow } from './usage-storage.js';
import type { CostCalculator } from './cost-calculator.js';
import { uuidv7 } from '../utils/crypto.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface PerModelStats {
  provider: string;
  model: string;
  calls: number;
  totalTokens: number;
  totalCostUsd: number;
  avgCostPerCall: number;
  avgOutputTokens: number;
}

export interface WorkloadBreakdown {
  simple: number;   // percentage 0-100
  moderate: number;
  complex: number;
}

export interface RoutingSuggestion {
  currentModel: string;
  currentProvider: string;
  suggestedModel: string;
  suggestedProvider: string;
  affectedCalls: number;
  currentCostUsd: number;
  projectedCostUsd: number;
  savingsUsd: number;
  savingsPercent: number;
  reason: string;
}

export interface CostForecast {
  dailyProjected: number;
  weeklyProjected: number;
  monthlyProjected: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  confidence: number; // 0-1
}

export interface DetailedCostAnalysis extends CostAnalysis {
  perModelStats: PerModelStats[];
  workloadBreakdown: WorkloadBreakdown;
  potentialSavingsUsd: number;
  routingSuggestions: RoutingSuggestion[];
  forecast: CostForecast;
}

// ── Premium/Fast model classification ──────────────────────────────────────

const PREMIUM_MODELS = new Set([
  'claude-opus-4-20250514',
  'gpt-4-turbo',
  'o1',
  'o1-mini',
  'o3',
]);

const FAST_MODEL_ALTERNATIVES: Record<string, { model: string; provider: string }> = {
  'claude-opus-4-20250514': { model: 'claude-haiku-3-5-20241022', provider: 'anthropic' },
  'gpt-4-turbo': { model: 'gpt-4o-mini', provider: 'openai' },
  o1: { model: 'o3-mini', provider: 'openai' },
  'o1-mini': { model: 'gpt-4o-mini', provider: 'openai' },
  o3: { model: 'o3-mini', provider: 'openai' },
  'claude-sonnet-4-20250514': { model: 'claude-haiku-3-5-20241022', provider: 'anthropic' },
  'gpt-4o': { model: 'gpt-4o-mini', provider: 'openai' },
  'grok-3': { model: 'grok-3-mini', provider: 'grok' },
  'deepseek-reasoner': { model: 'deepseek-chat', provider: 'deepseek' },
};

/** Threshold: calls with output tokens below this to a premium model are "expensive simple tasks". */
const SIMPLE_TASK_OUTPUT_THRESHOLD = 500;

// ── Cost Optimizer ─────────────────────────────────────────────────────────

export interface CostOptimizerDeps {
  logger: SecureLogger;
  usageTracker: UsageTracker;
  usageStorage?: UsageStorage;
  costCalculator?: CostCalculator;
}

export class CostOptimizer {
  private logger: SecureLogger;
  private usageTracker: UsageTracker;
  private usageStorage: UsageStorage | undefined;
  private costCalculator: CostCalculator | undefined;

  constructor(deps: CostOptimizerDeps) {
    this.logger = deps.logger;
    this.usageTracker = deps.usageTracker;
    this.usageStorage = deps.usageStorage;
    this.costCalculator = deps.costCalculator;
  }

  analyze(): CostAnalysis {
    const stats = this.usageTracker.getStats();
    const recommendations: CostRecommendation[] = [];
    const now = Date.now();

    // Recommend caching if cost is high
    if (stats.costUsdToday > 1) {
      recommendations.push({
        id: uuidv7(),
        title: 'Enable prompt caching',
        description: `Daily cost is $${stats.costUsdToday.toFixed(2)}. Prompt caching can reduce repeated token costs by 50-90%.`,
        priority: stats.costUsdToday > 10 ? 'high' : 'medium',
        estimatedSavingsUsd: stats.costUsdToday * 0.3,
        currentCostUsd: stats.costUsdToday,
        suggestedAction: 'Enable prompt caching in model configuration',
        category: 'caching',
        createdAt: now,
      });
    }

    // Recommend cheaper model if using expensive one
    if (stats.costUsdToday > 5) {
      recommendations.push({
        id: uuidv7(),
        title: 'Consider a cheaper model for simple tasks',
        description: 'Route simple queries to a smaller model (e.g., Haiku) to reduce costs.',
        priority: 'high',
        estimatedSavingsUsd: stats.costUsdToday * 0.5,
        currentCostUsd: stats.costUsdToday,
        suggestedAction: 'Configure model routing rules based on task complexity',
        category: 'model_selection',
        createdAt: now,
      });
    }

    // Recommend token reduction if high usage
    if (stats.tokensUsedToday > 100000) {
      recommendations.push({
        id: uuidv7(),
        title: 'Optimize prompt length',
        description: `${stats.tokensUsedToday.toLocaleString()} tokens used today. Consider shortening system prompts or summarizing context.`,
        priority: 'medium',
        estimatedSavingsUsd: stats.costUsdToday * 0.2,
        currentCostUsd: stats.costUsdToday,
        suggestedAction: 'Review and shorten system prompts; use context summarization',
        category: 'token_reduction',
        createdAt: now,
      });
    }

    // Always provide a low-priority scheduling recommendation
    if (stats.apiCallsTotal > 10) {
      recommendations.push({
        id: uuidv7(),
        title: 'Batch non-urgent requests',
        description:
          'Batching API calls during off-peak hours can reduce costs with some providers.',
        priority: 'low',
        estimatedSavingsUsd: stats.costUsdToday * 0.05,
        currentCostUsd: stats.costUsdToday,
        suggestedAction: 'Enable request batching for background tasks',
        category: 'batching',
        createdAt: now,
      });
    }

    this.logger.debug('Cost analysis completed', { recommendationCount: recommendations.length });

    return {
      totalCostUsd: stats.costUsdMonth,
      dailyAverageCostUsd: stats.costUsdToday,
      topModels: [],
      recommendations,
      analyzedAt: now,
    };
  }

  // ── Detailed Analysis ──────────────────────────────────────────────────

  async analyzeDetailed(
    options?: { days?: number; personalityId?: string }
  ): Promise<DetailedCostAnalysis> {
    const days = options?.days ?? 30;
    const personalityId = options?.personalityId;

    const base = this.analyze();
    const history = await this.queryHistory(days, personalityId);

    const perModelStats = this.computePerModelStats(history);
    const workloadBreakdown = this.computeWorkloadBreakdown(history);
    const routingSuggestions = this.computeRoutingSuggestions(history);
    const potentialSavingsUsd = routingSuggestions.reduce((sum, s) => sum + s.savingsUsd, 0);
    const forecast = this.computeForecast(history, days);

    // Build top models from per-model stats
    const topModels = perModelStats
      .slice()
      .sort((a, b) => b.totalCostUsd - a.totalCostUsd)
      .slice(0, 10)
      .map((s) => ({ model: `${s.provider}/${s.model}`, costUsd: s.totalCostUsd, callCount: s.calls }));

    this.logger.info(
      'Detailed cost analysis completed',
      { days, perModelCount: perModelStats.length, suggestionsCount: routingSuggestions.length }
    );

    return {
      ...base,
      topModels,
      perModelStats,
      workloadBreakdown,
      potentialSavingsUsd,
      routingSuggestions,
      forecast,
    };
  }

  // ── Routing Suggestions ────────────────────────────────────────────────

  async getRoutingSuggestions(): Promise<RoutingSuggestion[]> {
    const history = await this.queryHistory(7);
    return this.computeRoutingSuggestions(history);
  }

  // ── Forecast ───────────────────────────────────────────────────────────

  async forecast(days: number): Promise<CostForecast> {
    const history = await this.queryHistory(Math.max(days, 7));
    return this.computeForecast(history, days);
  }

  // ── Internal helpers ───────────────────────────────────────────────────

  private async queryHistory(days: number, personalityId?: string): Promise<HistoryRow[]> {
    if (!this.usageStorage) return [];
    const from = Date.now() - days * 24 * 60 * 60 * 1000;
    return this.usageStorage.queryHistory({
      from,
      groupBy: 'day',
      ...(personalityId ? { personalityId } : {}),
    });
  }

  private computePerModelStats(history: HistoryRow[]): PerModelStats[] {
    const map = new Map<string, PerModelStats>();

    for (const row of history) {
      const key = `${row.provider}/${row.model}`;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          provider: row.provider,
          model: row.model,
          calls: 0,
          totalTokens: 0,
          totalCostUsd: 0,
          avgCostPerCall: 0,
          avgOutputTokens: 0,
        };
        map.set(key, entry);
      }
      entry.calls += row.calls;
      entry.totalTokens += row.totalTokens;
      entry.totalCostUsd += row.costUsd;
      entry.avgOutputTokens =
        (entry.avgOutputTokens * (entry.calls - row.calls) + row.outputTokens) / entry.calls;
    }

    for (const entry of map.values()) {
      entry.avgCostPerCall = entry.calls > 0 ? entry.totalCostUsd / entry.calls : 0;
    }

    return Array.from(map.values()).sort((a, b) => b.totalCostUsd - a.totalCostUsd);
  }

  /**
   * Classify workload into simple/moderate/complex based on average output tokens.
   * - simple: avg output tokens < 500
   * - moderate: 500 <= avg output tokens < 2000
   * - complex: avg output tokens >= 2000
   */
  private computeWorkloadBreakdown(history: HistoryRow[]): WorkloadBreakdown {
    let simple = 0;
    let moderate = 0;
    let complex = 0;
    let totalCalls = 0;

    for (const row of history) {
      const avgOut = row.calls > 0 ? row.outputTokens / row.calls : 0;
      if (avgOut < SIMPLE_TASK_OUTPUT_THRESHOLD) {
        simple += row.calls;
      } else if (avgOut < 2000) {
        moderate += row.calls;
      } else {
        complex += row.calls;
      }
      totalCalls += row.calls;
    }

    if (totalCalls === 0) {
      return { simple: 0, moderate: 0, complex: 0 };
    }

    return {
      simple: Math.round((simple / totalCalls) * 100),
      moderate: Math.round((moderate / totalCalls) * 100),
      complex: Math.round((complex / totalCalls) * 100),
    };
  }

  /**
   * Identify premium model calls with low output tokens and suggest fast-tier alternatives.
   * Uses CostCalculator to project savings when available.
   */
  private computeRoutingSuggestions(history: HistoryRow[]): RoutingSuggestion[] {
    const suggestions: RoutingSuggestion[] = [];

    for (const row of history) {
      const avgOut = row.calls > 0 ? row.outputTokens / row.calls : 0;
      if (avgOut >= SIMPLE_TASK_OUTPUT_THRESHOLD) continue;

      const alt = FAST_MODEL_ALTERNATIVES[row.model];
      if (!alt) continue;

      // Estimate projected cost with the alternative model
      let projectedCostUsd = row.costUsd * 0.2; // default: assume 80% savings
      if (this.costCalculator) {
        const avgInputPerCall = row.calls > 0 ? (row.inputTokens / row.calls) : 0;
        const avgOutputPerCall = row.calls > 0 ? (row.outputTokens / row.calls) : 0;
        const perCallCost = this.costCalculator.calculate(alt.provider as any, alt.model, {
          inputTokens: Math.ceil(avgInputPerCall),
          outputTokens: Math.ceil(avgOutputPerCall),
          cachedTokens: 0,
          totalTokens: Math.ceil(avgInputPerCall + avgOutputPerCall),
          thinkingTokens: 0,
        });
        projectedCostUsd = perCallCost * row.calls;
      }

      const savingsUsd = Math.max(0, row.costUsd - projectedCostUsd);
      const savingsPercent = row.costUsd > 0 ? Math.round((savingsUsd / row.costUsd) * 100) : 0;

      if (savingsUsd > 0) {
        suggestions.push({
          currentModel: row.model,
          currentProvider: row.provider,
          suggestedModel: alt.model,
          suggestedProvider: alt.provider,
          affectedCalls: row.calls,
          currentCostUsd: row.costUsd,
          projectedCostUsd,
          savingsUsd,
          savingsPercent,
          reason: `${row.calls} calls to ${row.model} averaged ${Math.round(avgOut)} output tokens — a fast-tier model can handle these at lower cost.`,
        });
      }
    }

    // Sort by savings descending
    suggestions.sort((a, b) => b.savingsUsd - a.savingsUsd);
    return suggestions;
  }

  /**
   * Linear projection from daily cost data.
   * Trend detection: compare first-half average to second-half average.
   * Confidence decreases with fewer data points.
   */
  private computeForecast(history: HistoryRow[], requestedDays: number): CostForecast {
    // Aggregate cost per day
    const dailyCost = new Map<string, number>();
    for (const row of history) {
      dailyCost.set(row.date, (dailyCost.get(row.date) ?? 0) + row.costUsd);
    }

    const sortedDays = Array.from(dailyCost.entries())
      .sort(([a], [b]) => a.localeCompare(b));

    if (sortedDays.length === 0) {
      return {
        dailyProjected: 0,
        weeklyProjected: 0,
        monthlyProjected: 0,
        trend: 'stable',
        confidence: 0,
      };
    }

    const costs = sortedDays.map(([, c]) => c);
    const totalCost = costs.reduce((s, c) => s + c, 0);
    const dailyAvg = totalCost / costs.length;

    // Trend: compare first half to second half
    const mid = Math.floor(costs.length / 2);
    const firstHalf = costs.slice(0, mid);
    const secondHalf = costs.slice(mid);
    const firstAvg = firstHalf.length > 0
      ? firstHalf.reduce((s, c) => s + c, 0) / firstHalf.length
      : 0;
    const secondAvg = secondHalf.length > 0
      ? secondHalf.reduce((s, c) => s + c, 0) / secondHalf.length
      : 0;

    let trend: CostForecast['trend'] = 'stable';
    if (costs.length >= 2) {
      const pctChange = firstAvg > 0 ? (secondAvg - firstAvg) / firstAvg : 0;
      if (pctChange > 0.1) trend = 'increasing';
      else if (pctChange < -0.1) trend = 'decreasing';
    }

    // Confidence: scales with data points (max at 14+ days)
    const confidence = Math.min(costs.length / 14, 1);

    return {
      dailyProjected: Number(dailyAvg.toFixed(4)),
      weeklyProjected: Number((dailyAvg * 7).toFixed(4)),
      monthlyProjected: Number((dailyAvg * 30).toFixed(4)),
      trend,
      confidence: Number(confidence.toFixed(2)),
    };
  }
}
