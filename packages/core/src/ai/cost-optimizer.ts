/**
 * Cost Optimizer — analyzes usage data and produces recommendations
 */

import type { CostRecommendation, CostAnalysis } from '@friday/shared';
import type { SecureLogger } from '../logging/logger.js';
import type { UsageTracker } from './usage-tracker.js';
import { uuidv7 } from '../utils/crypto.js';

export interface CostOptimizerDeps {
  logger: SecureLogger;
  usageTracker: UsageTracker;
}

export class CostOptimizer {
  private logger: SecureLogger;
  private usageTracker: UsageTracker;

  constructor(deps: CostOptimizerDeps) {
    this.logger = deps.logger;
    this.usageTracker = deps.usageTracker;
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
}
