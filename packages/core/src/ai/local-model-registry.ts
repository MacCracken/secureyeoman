/**
 * Local Model Registry — Track locally available models with capability metadata.
 *
 * Auto-detects models from Ollama, LM Studio, and LocalAI providers.
 * Augments the static model-registry with runtime-discovered local models.
 *
 * Part of GPU-Aware Inference Routing (inspired by NemoClaw).
 */

import type { ModelCapability, ModelTier } from './model-registry.js';
import { estimateVramRequirement } from './gpu-probe.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LocalModel {
  name: string;
  provider: 'ollama' | 'lmstudio' | 'localai';
  /** Size of the model file in bytes (if known). */
  sizeBytes: number;
  /** Estimated VRAM requirement in MB. */
  estimatedVramMb: number;
  /** When the model was last seen available. */
  lastSeen: string;
  /** Inferred capabilities based on model name heuristics. */
  capabilities: ModelCapability[];
  /** Inferred tier. Local models are typically fast/capable tier. */
  tier: ModelTier;
  /** Model family for grouping (e.g., 'llama', 'mistral', 'phi'). */
  family: string;
  /** Parameter count string if detectable (e.g., '7b', '70b'). */
  parameterCount: string | null;
}

export interface LocalModelRegistryState {
  models: LocalModel[];
  lastRefreshed: string;
  ollamaAvailable: boolean;
  lmstudioAvailable: boolean;
  localaiAvailable: boolean;
}

// ── Capability Inference ─────────────────────────────────────────────────────

function inferCapabilities(name: string): ModelCapability[] {
  const lower = name.toLowerCase();
  const caps: ModelCapability[] = ['chat', 'streaming'];

  if (/code|coder|starcoder|codellama|deepseek-coder|qwen.*coder/.test(lower)) {
    caps.push('code');
  }
  if (/vision|llava|moondream|bakllava|minicpm-v/.test(lower)) {
    caps.push('vision');
  }
  if (/70b|34b|mixtral|qwen.*72|deepseek-r1/.test(lower)) {
    caps.push('reasoning');
  }
  if (/tool|function|hermes|nous-hermes/.test(lower)) {
    caps.push('tool_use');
  }

  return caps;
}

function inferFamily(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('llama')) return 'llama';
  if (/mistral|mixtral/.test(lower)) return 'mistral';
  if (lower.includes('phi')) return 'phi';
  if (lower.includes('gemma')) return 'gemma';
  if (lower.includes('qwen')) return 'qwen';
  if (lower.includes('deepseek')) return 'deepseek';
  if (lower.includes('starcoder')) return 'starcoder';
  if (lower.includes('codellama')) return 'codellama';
  if (lower.includes('vicuna')) return 'vicuna';
  if (lower.includes('yi')) return 'yi';
  if (lower.includes('solar')) return 'solar';
  return 'other';
}

function inferParamCount(name: string): string | null {
  const match = /(\d+\.?\d*)[bB]/.exec(name);
  return match ? `${match[1]}b` : null;
}

function inferTier(name: string): ModelTier {
  const lower = name.toLowerCase();
  if (/70b|72b|34b|mixtral/.test(lower)) return 'capable';
  return 'fast';
}

// ── Provider Detection ───────────────────────────────────────────────────────

async function fetchOllamaModels(baseUrl = 'http://127.0.0.1:11434'): Promise<LocalModel[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); }, 3000);

    const response = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return [];

    const data = (await response.json()) as { models?: { name: string; size: number }[] };
    if (!data.models) return [];

    return data.models.map((m) => ({
      name: m.name,
      provider: 'ollama' as const,
      sizeBytes: m.size ?? 0,
      estimatedVramMb: estimateVramRequirement(m.name),
      lastSeen: new Date().toISOString(),
      capabilities: inferCapabilities(m.name),
      tier: inferTier(m.name),
      family: inferFamily(m.name),
      parameterCount: inferParamCount(m.name),
    }));
  } catch {
    return [];
  }
}

async function fetchLmStudioModels(baseUrl = 'http://127.0.0.1:1234'): Promise<LocalModel[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); }, 3000);

    const response = await fetch(`${baseUrl}/v1/models`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return [];

    const data = (await response.json()) as { data?: { id: string }[] };
    if (!data.data) return [];

    return data.data.map((m) => ({
      name: m.id,
      provider: 'lmstudio' as const,
      sizeBytes: 0,
      estimatedVramMb: estimateVramRequirement(m.id),
      lastSeen: new Date().toISOString(),
      capabilities: inferCapabilities(m.id),
      tier: inferTier(m.id),
      family: inferFamily(m.id),
      parameterCount: inferParamCount(m.id),
    }));
  } catch {
    return [];
  }
}

async function fetchLocalAIModels(baseUrl = 'http://127.0.0.1:8080'): Promise<LocalModel[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); }, 3000);

    const response = await fetch(`${baseUrl}/v1/models`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return [];

    const data = (await response.json()) as { data?: { id: string }[] };
    if (!data.data) return [];

    return data.data.map((m) => ({
      name: m.id,
      provider: 'localai' as const,
      sizeBytes: 0,
      estimatedVramMb: estimateVramRequirement(m.id),
      lastSeen: new Date().toISOString(),
      capabilities: inferCapabilities(m.id),
      tier: inferTier(m.id),
      family: inferFamily(m.id),
      parameterCount: inferParamCount(m.id),
    }));
  } catch {
    return [];
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

let _state: LocalModelRegistryState | null = null;
let _stateAt = 0;
const STATE_TTL_MS = 60_000; // 1 minute

/**
 * Refresh the local model registry by querying all local providers.
 */
export async function refreshLocalModels(forceRefresh = false): Promise<LocalModelRegistryState> {
  if (!forceRefresh && _state && Date.now() - _stateAt < STATE_TTL_MS) {
    return _state;
  }

  const [ollama, lmstudio, localai] = await Promise.all([
    fetchOllamaModels(),
    fetchLmStudioModels(),
    fetchLocalAIModels(),
  ]);

  _state = {
    models: [...ollama, ...lmstudio, ...localai],
    lastRefreshed: new Date().toISOString(),
    ollamaAvailable: ollama.length > 0,
    lmstudioAvailable: lmstudio.length > 0,
    localaiAvailable: localai.length > 0,
  };
  _stateAt = Date.now();

  return _state;
}

/**
 * Find local models that can run within the given VRAM budget.
 */
export function findModelsWithinVram(
  models: LocalModel[],
  availableVramMb: number
): LocalModel[] {
  return models
    .filter((m) => m.estimatedVramMb <= availableVramMb)
    .sort((a, b) => b.estimatedVramMb - a.estimatedVramMb); // largest first (best quality)
}

/**
 * Find local models with specific capabilities.
 */
export function findLocalModelsWithCapabilities(
  models: LocalModel[],
  requiredCapabilities: ModelCapability[]
): LocalModel[] {
  return models.filter((m) =>
    requiredCapabilities.every((cap) => m.capabilities.includes(cap))
  );
}

/** @internal — Reset cache for testing. */
export function _resetLocalModelCache(): void {
  _state = null;
  _stateAt = 0;
}
