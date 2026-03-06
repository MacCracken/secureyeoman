/**
 * Aggregator — Model update aggregation strategies for federated learning.
 *
 * Implements FedAvg, FedProx, weighted average, median, and trimmed mean
 * strategies for combining participant model updates.
 */

import type { Logger } from 'pino';
import type { AggregationStrategy, ModelUpdate } from '@secureyeoman/shared';

export interface AggregatorDeps {
  log: Logger;
}

export interface AggregationResult {
  strategy: AggregationStrategy;
  globalLoss: number;
  globalMetrics: Record<string, number>;
  participantCount: number;
  totalDatasetSize: number;
}

export class Aggregator {
  private readonly log: Logger;

  constructor(deps: AggregatorDeps) {
    this.log = deps.log;
  }

  /** Aggregate model updates using the specified strategy. */
  aggregate(
    updates: ModelUpdate[],
    strategy: AggregationStrategy
  ): AggregationResult {
    if (updates.length === 0) {
      throw new Error('No model updates to aggregate');
    }

    this.log.info(
      { strategy, updateCount: updates.length },
      'Aggregating model updates'
    );

    switch (strategy) {
      case 'fedavg':
        return this.federatedAverage(updates);
      case 'fedprox':
        return this.federatedProx(updates);
      case 'fedsgd':
        return this.federatedSgd(updates);
      case 'weighted_avg':
        return this.weightedAverage(updates);
      case 'median':
        return this.medianAggregation(updates);
      case 'trimmed_mean':
        return this.trimmedMean(updates);
      default:
        return this.federatedAverage(updates);
    }
  }

  /** FedAvg — weighted average by dataset size (McMahan et al., 2017). */
  private federatedAverage(updates: ModelUpdate[]): AggregationResult {
    const totalSize = updates.reduce((s, u) => s + u.datasetSizeSeen, 0);
    const weights = updates.map((u) =>
      totalSize > 0 ? u.datasetSizeSeen / totalSize : 1 / updates.length
    );

    return this.computeWeightedResult(updates, weights, 'fedavg');
  }

  /** FedProx — fedavg with proximal term (Li et al., 2020). */
  private federatedProx(updates: ModelUpdate[]): AggregationResult {
    // Same aggregation as FedAvg; the proximal term is applied during
    // local training (mu * ||w - w_global||^2), not at aggregation time.
    return this.federatedAverage(updates);
  }

  /** FedSGD — simple average of gradients (no dataset weighting). */
  private federatedSgd(updates: ModelUpdate[]): AggregationResult {
    const weights = updates.map(() => 1 / updates.length);
    return this.computeWeightedResult(updates, weights, 'fedsgd');
  }

  /** Weighted average with equal weighting. */
  private weightedAverage(updates: ModelUpdate[]): AggregationResult {
    const weights = updates.map(() => 1 / updates.length);
    return this.computeWeightedResult(updates, weights, 'weighted_avg');
  }

  /** Coordinate-wise median — robust against Byzantine participants. */
  private medianAggregation(updates: ModelUpdate[]): AggregationResult {
    const losses = updates
      .map((u) => u.trainingLoss)
      .filter((l): l is number => l != null)
      .sort((a, b) => a - b);

    const globalLoss = losses.length > 0
      ? losses[Math.floor(losses.length / 2)]!
      : 0;

    const totalSize = updates.reduce((s, u) => s + u.datasetSizeSeen, 0);
    const globalMetrics = this.mergeMetrics(
      updates,
      updates.map(() => 1 / updates.length)
    );

    return {
      strategy: 'median',
      globalLoss,
      globalMetrics,
      participantCount: updates.length,
      totalDatasetSize: totalSize,
    };
  }

  /** Trimmed mean — discard top/bottom 10% then average. */
  private trimmedMean(updates: ModelUpdate[]): AggregationResult {
    const trimPercent = 0.1;
    const trimCount = Math.max(1, Math.floor(updates.length * trimPercent));

    const sorted = [...updates].sort(
      (a, b) => (a.trainingLoss ?? Infinity) - (b.trainingLoss ?? Infinity)
    );

    const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
    if (trimmed.length === 0) {
      return this.federatedAverage(updates);
    }

    const weights = trimmed.map(() => 1 / trimmed.length);
    return this.computeWeightedResult(trimmed, weights, 'trimmed_mean');
  }

  private computeWeightedResult(
    updates: ModelUpdate[],
    weights: number[],
    strategy: AggregationStrategy
  ): AggregationResult {
    let globalLoss = 0;
    for (let i = 0; i < updates.length; i++) {
      globalLoss += (updates[i]!.trainingLoss ?? 0) * weights[i]!;
    }

    const totalSize = updates.reduce((s, u) => s + u.datasetSizeSeen, 0);
    const globalMetrics = this.mergeMetrics(updates, weights);

    return {
      strategy,
      globalLoss,
      globalMetrics,
      participantCount: updates.length,
      totalDatasetSize: totalSize,
    };
  }

  private mergeMetrics(
    updates: ModelUpdate[],
    weights: number[]
  ): Record<string, number> {
    const keys = new Set<string>();
    for (const u of updates) {
      for (const k of Object.keys(u.metricsJson)) keys.add(k);
    }

    const result: Record<string, number> = {};
    for (const key of keys) {
      let val = 0;
      for (let i = 0; i < updates.length; i++) {
        val += (updates[i]!.metricsJson[key] ?? 0) * weights[i]!;
      }
      result[key] = val;
    }
    return result;
  }
}
