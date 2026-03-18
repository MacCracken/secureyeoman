/**
 * Privacy-Aware Inference Router — Routes requests based on content sensitivity,
 * GPU availability, and cost preferences.
 *
 * Integrates the DLP classification engine with GPU probe and local model registry
 * to make intelligent routing decisions:
 *
 * 1. Classify content sensitivity via DLP
 * 2. If sensitive → route exclusively to local models (if GPU available)
 * 3. If not sensitive → route based on cost/capability preference
 * 4. Always respect personality-level routing policy
 *
 * Inspired by NVIDIA NemoClaw's Privacy Router (GTC 2026).
 */

import type { GpuProbeResult } from './gpu-probe.js';
import type { LocalModel, LocalModelRegistryState } from './local-model-registry.js';
import { findModelsWithinVram, findLocalModelsWithCapabilities } from './local-model-registry.js';
import type { ClassificationLevel } from '../security/dlp/types.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type RoutingPolicy = 'auto' | 'local-preferred' | 'local-only' | 'cloud-only';

export type RoutingReason =
  | 'privacy-enforced' // DLP classified content as sensitive → must use local
  | 'policy-local-only' // Personality policy requires local-only
  | 'policy-cloud-only' // Personality policy requires cloud-only
  | 'local-preferred' // User prefers local when available
  | 'local-capable' // Local GPU can handle the request
  | 'local-insufficient' // Not enough GPU resources → fall back to cloud
  | 'no-local-models' // No local models available
  | 'cost-optimized'; // Chose cheapest viable option

export interface PrivacyRoutingDecision {
  /** Whether to use a local model or cloud provider. */
  target: 'local' | 'cloud';
  /** Why this routing decision was made. */
  reason: RoutingReason;
  /** If local, the recommended model. Null if cloud. */
  localModel: LocalModel | null;
  /** DLP classification level of the content. */
  classificationLevel: ClassificationLevel;
  /** Whether the content contains PII. */
  containsPii: boolean;
  /** Whether local inference is viable (GPU + models available). */
  localViable: boolean;
  /** Confidence in the routing decision (0-1). */
  confidence: number;
}

export interface PrivacyRouterConfig {
  /** Routing policy. Default: 'auto'. */
  policy: RoutingPolicy;
  /** Classification levels that force local routing. Default: ['confidential', 'restricted']. */
  sensitivityThreshold: ClassificationLevel[];
  /** Whether PII detection alone forces local routing. Default: true. */
  piiForcesLocal: boolean;
  /** Minimum free VRAM (MB) required to consider local inference. Default: 2048. */
  minFreeVramMb: number;
}

const DEFAULT_CONFIG: PrivacyRouterConfig = {
  policy: 'auto',
  sensitivityThreshold: ['confidential', 'restricted'],
  piiForcesLocal: true,
  minFreeVramMb: 2048,
};

// ── Router ───────────────────────────────────────────────────────────────────

/**
 * Make a privacy-aware routing decision.
 *
 * @param classificationLevel - DLP classification result for the content
 * @param piiFound - PII types detected in the content
 * @param gpu - Current GPU probe result
 * @param localModels - Available local models
 * @param requiredCapabilities - Capabilities the model must have (e.g., ['code', 'vision'])
 * @param config - Routing policy configuration
 */
export function routeWithPrivacy(
  classificationLevel: ClassificationLevel,
  piiFound: string[],
  gpu: GpuProbeResult,
  localModels: LocalModelRegistryState,
  requiredCapabilities: string[] = [],
  config: Partial<PrivacyRouterConfig> = {}
): PrivacyRoutingDecision {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const containsPii = piiFound.length > 0;

  // Check if local inference is viable
  const freeVram = gpu.totalFreeVramMb;
  const viableModels = findModelsWithinVram(localModels.models, freeVram);
  const capableModels =
    requiredCapabilities.length > 0
      ? findLocalModelsWithCapabilities(viableModels, requiredCapabilities as any)
      : viableModels;
  const localViable = gpu.available && freeVram >= cfg.minFreeVramMb && capableModels.length > 0;

  // Policy overrides
  if (cfg.policy === 'cloud-only') {
    return {
      target: 'cloud',
      reason: 'policy-cloud-only',
      localModel: null,
      classificationLevel,
      containsPii,
      localViable,
      confidence: 1.0,
    };
  }

  if (cfg.policy === 'local-only') {
    return {
      target: 'local',
      reason: 'policy-local-only',
      localModel: capableModels[0] ?? null,
      classificationLevel,
      containsPii,
      localViable,
      confidence: localViable ? 0.9 : 0.3,
    };
  }

  // Privacy enforcement: sensitive content must stay local
  const isSensitive =
    cfg.sensitivityThreshold.includes(classificationLevel) || (cfg.piiForcesLocal && containsPii);

  if (isSensitive) {
    if (localViable) {
      return {
        target: 'local',
        reason: 'privacy-enforced',
        localModel: capableModels[0] ?? null,
        classificationLevel,
        containsPii,
        localViable,
        confidence: 0.95,
      };
    }
    // Sensitive but no local option — still route to cloud with low confidence
    // (caller should warn user about privacy risk)
    return {
      target: 'cloud',
      reason: 'local-insufficient',
      localModel: null,
      classificationLevel,
      containsPii,
      localViable: false,
      confidence: 0.4,
    };
  }

  // Auto/local-preferred: use local if available and capable
  if (cfg.policy === 'local-preferred' && localViable) {
    return {
      target: 'local',
      reason: 'local-preferred',
      localModel: capableModels[0] ?? null,
      classificationLevel,
      containsPii,
      localViable,
      confidence: 0.8,
    };
  }

  if (cfg.policy === 'auto' && localViable) {
    return {
      target: 'local',
      reason: 'local-capable',
      localModel: capableModels[0] ?? null,
      classificationLevel,
      containsPii,
      localViable,
      confidence: 0.7,
    };
  }

  // Fall back to cloud
  const reason: RoutingReason =
    localModels.models.length === 0
      ? 'no-local-models'
      : localViable
        ? 'cost-optimized'
        : 'local-insufficient';

  return {
    target: 'cloud',
    reason,
    localModel: null,
    classificationLevel,
    containsPii,
    localViable,
    confidence: 0.8,
  };
}
