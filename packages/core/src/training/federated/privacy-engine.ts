/**
 * Privacy Engine — Differential privacy mechanisms for federated learning.
 *
 * Implements gradient clipping, noise injection, and privacy budget
 * tracking to ensure participant data privacy during training.
 */

import type { Logger } from 'pino';
import type { DifferentialPrivacyConfig } from '@secureyeoman/shared';

export interface PrivacyEngineDeps {
  log: Logger;
}

export class PrivacyEngine {
  private readonly log: Logger;

  constructor(deps: PrivacyEngineDeps) {
    this.log = deps.log;
  }

  /** Clip gradient vector to max norm (L2 clipping). */
  clipGradients(gradients: number[], maxNorm: number): number[] {
    const norm = Math.sqrt(gradients.reduce((sum, g) => sum + g * g, 0));
    if (norm <= maxNorm) return gradients;

    const scale = maxNorm / norm;
    this.log.debug({ norm, maxNorm, scale }, 'Clipping gradients');
    return gradients.map((g) => g * scale);
  }

  /** Add noise to gradients for differential privacy. */
  addNoise(
    gradients: number[],
    config: DifferentialPrivacyConfig
  ): number[] {
    if (!config.enabled) return gradients;

    const sigma = config.noiseSigma > 0
      ? config.noiseSigma
      : this.computeSigma(config.epsilon, config.delta, config.maxGradientNorm);

    switch (config.mechanism) {
      case 'gaussian':
        return this.addGaussianNoise(gradients, sigma);
      case 'laplacian':
        return this.addLaplacianNoise(gradients, config.maxGradientNorm / config.epsilon);
      case 'local_dp':
        return this.addLocalDpNoise(gradients, config.epsilon);
      default:
        return gradients;
    }
  }

  /** Compute Gaussian sigma from (epsilon, delta) via analytic Gaussian mechanism. */
  computeSigma(epsilon: number, delta: number, sensitivity: number): number {
    // sigma = sensitivity * sqrt(2 * ln(1.25/delta)) / epsilon
    const sigma = (sensitivity * Math.sqrt(2 * Math.log(1.25 / delta))) / epsilon;
    return sigma;
  }

  /** Check if privacy budget is exhausted. */
  isBudgetExhausted(config: DifferentialPrivacyConfig): boolean {
    if (!config.enabled) return false;
    return config.privacyBudgetUsed >= config.privacyBudgetTotal;
  }

  /** Consume privacy budget for one round. Returns updated config. */
  consumeBudget(
    config: DifferentialPrivacyConfig,
    roundEpsilon: number
  ): DifferentialPrivacyConfig {
    const updated = { ...config };
    updated.privacyBudgetUsed = config.privacyBudgetUsed + roundEpsilon;

    this.log.info(
      { used: updated.privacyBudgetUsed, total: config.privacyBudgetTotal, roundEpsilon },
      'Privacy budget consumed'
    );

    return updated;
  }

  /** Get remaining privacy budget. */
  remainingBudget(config: DifferentialPrivacyConfig): number {
    return Math.max(0, config.privacyBudgetTotal - config.privacyBudgetUsed);
  }

  // ── Private ────────────────────────────────────────────────────

  private addGaussianNoise(values: number[], sigma: number): number[] {
    return values.map((v) => v + this.gaussianSample(0, sigma));
  }

  private addLaplacianNoise(values: number[], scale: number): number[] {
    return values.map((v) => v + this.laplacianSample(scale));
  }

  private addLocalDpNoise(values: number[], epsilon: number): number[] {
    // Randomised response mechanism
    const p = Math.exp(epsilon) / (Math.exp(epsilon) + 1);
    return values.map((v) => (Math.random() < p ? v : -v));
  }

  private gaussianSample(mean: number, stddev: number): number {
    // Box-Muller transform
    const u1 = Math.random() || 0.001;
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stddev;
  }

  private laplacianSample(scale: number): number {
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }
}
