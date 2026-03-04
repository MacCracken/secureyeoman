/**
 * Activation Math — ACT-R base-level activation and Hebbian scoring.
 *
 * Pure functions with no I/O dependencies.
 */

/**
 * Convert a last-accessed timestamp to fractional days, clamped to min 0.1.
 */
export function ageDays(lastAccessedMs: number | null, nowMs: number): number {
  if (lastAccessedMs == null) return 0.1;
  const days = (nowMs - lastAccessedMs) / 86_400_000;
  return Math.max(days, 0.1);
}

/**
 * ACT-R base-level activation: B_i = ln(n+1) − 0.5·ln(ageDays / (n+1))
 *
 * Frequently accessed, recently used items have higher activation.
 * Mirrors the SQL `brain.activation_score()` function.
 */
export function actrActivation(accessCount: number, ageDaysVal: number): number {
  const n = Math.max(accessCount, 0);
  const age = Math.max(ageDaysVal, 0.1);
  return Math.log(n + 1) - 0.5 * Math.log(age / (n + 1));
}

/**
 * Numerically stable softplus: log(1 + exp(x)), clamped to avoid overflow.
 */
export function softplus(x: number): number {
  return Math.log(1 + Math.exp(Math.min(x, 20)));
}

/**
 * Composite score blending content match with ACT-R activation and Hebbian boost.
 *
 * score = (1 − α)·contentMatch + α·σ(activation) + min(hebbianBoost, cap)·hebbianScale
 *
 * @param contentMatch   Original retrieval score [0–1]
 * @param activation     ACT-R activation value (unbounded real)
 * @param hebbianBoost   Sum of association weights from co-retrieved items
 * @param hebbianScale   Scaling factor for Hebbian contribution (default 1.0)
 * @param confidence     Document confidence [0–1] (default 1.0)
 * @param alpha          Blend weight for activation vs content [0–1] (default 0.3)
 * @param boostCap       Max Hebbian boost contribution (default 0.5)
 */
export function compositeScore(
  contentMatch: number,
  activation: number,
  hebbianBoost: number,
  hebbianScale = 1.0,
  confidence = 1.0,
  alpha = 0.3,
  boostCap = 0.5
): number {
  const normalizedActivation = sigmoid(activation);
  const cappedBoost = Math.min(hebbianBoost, boostCap) * hebbianScale;
  const raw = (1 - alpha) * contentMatch + alpha * normalizedActivation + cappedBoost;
  return raw * confidence;
}

/** Standard sigmoid for normalizing activation into [0,1]. */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.min(Math.max(x, -20), 20)));
}
