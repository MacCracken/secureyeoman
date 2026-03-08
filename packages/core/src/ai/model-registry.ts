/**
 * Model Registry — Centralized metadata for all known AI models.
 *
 * Consolidates model metadata (context windows, capabilities, tiers, providers)
 * into a single source of truth. Inspired by crewAI's constants-based model
 * validation, but using a typed registry with lookup and resolution utilities.
 *
 * The `"provider/model"` addressing convention (e.g. `"openai/gpt-4o"`) is
 * supported via `parseModelString()` for universal model identification.
 */

import type { AIProviderName } from '@secureyeoman/shared';

// ── Types ────────────────────────────────────────────────────────────────────

export type ModelCapability = 'chat' | 'vision' | 'reasoning' | 'tool_use' | 'code' | 'streaming';

export type ModelTier = 'fast' | 'capable' | 'premium';

export type CostTier = 'free' | 'low' | 'medium' | 'high';

export interface ModelEntry {
  /** Model identifier (e.g. `"gpt-4o"`, `"claude-sonnet-4-20250514"`). */
  model: string;
  /** Canonical provider name. */
  provider: AIProviderName;
  /** Maximum context window in tokens. */
  contextWindow: number;
  /** Maximum output tokens (if known). */
  maxOutputTokens?: number;
  /** Supported capabilities. */
  capabilities: readonly ModelCapability[];
  /** Performance/quality tier. */
  tier: ModelTier;
  /** Relative cost tier. */
  costTier: CostTier;
  /** Whether the model supports extended thinking / chain-of-thought. */
  extendedThinking?: boolean;
}

export interface ParsedModelString {
  provider: AIProviderName | null;
  model: string;
}

// ── Registry Data ────────────────────────────────────────────────────────────

const REGISTRY: ModelEntry[] = [
  // ── Anthropic ──────────────────────────────────────────────────
  {
    model: 'claude-opus-4-20250514',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
    capabilities: ['chat', 'vision', 'reasoning', 'tool_use', 'code', 'streaming'],
    tier: 'premium',
    costTier: 'high',
    extendedThinking: true,
  },
  {
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutputTokens: 16_000,
    capabilities: ['chat', 'vision', 'reasoning', 'tool_use', 'code', 'streaming'],
    tier: 'capable',
    costTier: 'medium',
    extendedThinking: true,
  },
  {
    model: 'claude-haiku-3-5-20241022',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    capabilities: ['chat', 'vision', 'tool_use', 'code', 'streaming'],
    tier: 'fast',
    costTier: 'low',
  },

  // ── OpenAI ─────────────────────────────────────────────────────
  {
    model: 'gpt-4o',
    provider: 'openai',
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    capabilities: ['chat', 'vision', 'reasoning', 'tool_use', 'code', 'streaming'],
    tier: 'capable',
    costTier: 'medium',
  },
  {
    model: 'gpt-4o-mini',
    provider: 'openai',
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    capabilities: ['chat', 'vision', 'tool_use', 'code', 'streaming'],
    tier: 'fast',
    costTier: 'low',
  },
  {
    model: 'gpt-4-turbo',
    provider: 'openai',
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    capabilities: ['chat', 'vision', 'tool_use', 'code', 'streaming'],
    tier: 'premium',
    costTier: 'high',
  },
  {
    model: 'o1',
    provider: 'openai',
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    capabilities: ['chat', 'reasoning', 'code'],
    tier: 'premium',
    costTier: 'high',
    extendedThinking: true,
  },
  {
    model: 'o1-mini',
    provider: 'openai',
    contextWindow: 128_000,
    maxOutputTokens: 65_536,
    capabilities: ['chat', 'reasoning', 'code'],
    tier: 'premium',
    costTier: 'high',
    extendedThinking: true,
  },
  {
    model: 'o3-mini',
    provider: 'openai',
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    capabilities: ['chat', 'reasoning', 'tool_use', 'code'],
    tier: 'fast',
    costTier: 'low',
    extendedThinking: true,
  },
  {
    model: 'o3',
    provider: 'openai',
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    capabilities: ['chat', 'reasoning', 'tool_use', 'code'],
    tier: 'premium',
    costTier: 'high',
    extendedThinking: true,
  },

  // ── Google Gemini ──────────────────────────────────────────────
  {
    model: 'gemini-2.0-flash',
    provider: 'gemini',
    contextWindow: 1_048_576,
    maxOutputTokens: 8_192,
    capabilities: ['chat', 'vision', 'tool_use', 'code', 'streaming'],
    tier: 'fast',
    costTier: 'low',
  },
  {
    model: 'gemini-2.0-flash-lite',
    provider: 'gemini',
    contextWindow: 1_048_576,
    maxOutputTokens: 8_192,
    capabilities: ['chat', 'vision', 'streaming'],
    tier: 'fast',
    costTier: 'low',
  },

  // ── OpenCode Zen ───────────────────────────────────────────────
  {
    model: 'gpt-5.2',
    provider: 'opencode',
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
    capabilities: ['chat', 'vision', 'reasoning', 'tool_use', 'code', 'streaming'],
    tier: 'capable',
    costTier: 'medium',
  },
  {
    model: 'claude-sonnet-4-5',
    provider: 'opencode',
    contextWindow: 200_000,
    maxOutputTokens: 16_000,
    capabilities: ['chat', 'vision', 'reasoning', 'tool_use', 'code', 'streaming'],
    tier: 'capable',
    costTier: 'medium',
  },
  {
    model: 'claude-haiku-4-5',
    provider: 'opencode',
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    capabilities: ['chat', 'vision', 'tool_use', 'code', 'streaming'],
    tier: 'fast',
    costTier: 'low',
  },
  {
    model: 'gemini-3-flash',
    provider: 'opencode',
    contextWindow: 1_048_576,
    maxOutputTokens: 8_192,
    capabilities: ['chat', 'vision', 'tool_use', 'code', 'streaming'],
    tier: 'fast',
    costTier: 'low',
  },
  {
    model: 'qwen3-coder',
    provider: 'opencode',
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    capabilities: ['chat', 'tool_use', 'code', 'streaming'],
    tier: 'fast',
    costTier: 'low',
  },
  {
    model: 'big-pickle',
    provider: 'opencode',
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
    capabilities: ['chat', 'reasoning', 'tool_use', 'code', 'streaming'],
    tier: 'fast',
    costTier: 'free',
  },

  // ── DeepSeek ───────────────────────────────────────────────────
  {
    model: 'deepseek-chat',
    provider: 'deepseek',
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    capabilities: ['chat', 'tool_use', 'code', 'streaming'],
    tier: 'fast',
    costTier: 'low',
  },
  {
    model: 'deepseek-coder',
    provider: 'deepseek',
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    capabilities: ['chat', 'code', 'streaming'],
    tier: 'fast',
    costTier: 'low',
  },
  {
    model: 'deepseek-reasoner',
    provider: 'deepseek',
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    capabilities: ['chat', 'reasoning', 'code', 'streaming'],
    tier: 'capable',
    costTier: 'low',
    extendedThinking: true,
  },

  // ── x.ai Grok ─────────────────────────────────────────────────
  {
    model: 'grok-3',
    provider: 'grok',
    contextWindow: 131_072,
    maxOutputTokens: 16_384,
    capabilities: ['chat', 'reasoning', 'tool_use', 'code', 'streaming'],
    tier: 'capable',
    costTier: 'medium',
  },
  {
    model: 'grok-3-mini',
    provider: 'grok',
    contextWindow: 131_072,
    maxOutputTokens: 16_384,
    capabilities: ['chat', 'reasoning', 'tool_use', 'code', 'streaming'],
    tier: 'fast',
    costTier: 'low',
  },
  {
    model: 'grok-2-1212',
    provider: 'grok',
    contextWindow: 131_072,
    maxOutputTokens: 16_384,
    capabilities: ['chat', 'tool_use', 'code', 'streaming'],
    tier: 'capable',
    costTier: 'medium',
  },
  {
    model: 'grok-2-vision-1212',
    provider: 'grok',
    contextWindow: 131_072,
    maxOutputTokens: 16_384,
    capabilities: ['chat', 'vision', 'tool_use', 'streaming'],
    tier: 'capable',
    costTier: 'medium',
  },

  // ── Groq (hosted inference) ────────────────────────────────────
  {
    model: 'llama-3.3-70b-versatile',
    provider: 'groq',
    contextWindow: 128_000,
    maxOutputTokens: 32_768,
    capabilities: ['chat', 'tool_use', 'code', 'streaming'],
    tier: 'capable',
    costTier: 'low',
  },
  {
    model: 'llama-3.1-8b-instant',
    provider: 'groq',
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    capabilities: ['chat', 'code', 'streaming'],
    tier: 'fast',
    costTier: 'low',
  },
  {
    model: 'mixtral-8x7b-32768',
    provider: 'groq',
    contextWindow: 32_768,
    maxOutputTokens: 4_096,
    capabilities: ['chat', 'code', 'streaming'],
    tier: 'fast',
    costTier: 'low',
  },
  {
    model: 'gemma2-9b-it',
    provider: 'groq',
    contextWindow: 8_192,
    maxOutputTokens: 4_096,
    capabilities: ['chat', 'streaming'],
    tier: 'fast',
    costTier: 'low',
  },

  // ── Letta (stateful agent platform — uses provider/model format) ──
  {
    model: 'openai/gpt-4o',
    provider: 'letta',
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    capabilities: ['chat', 'vision', 'tool_use', 'code', 'streaming'],
    tier: 'capable',
    costTier: 'medium',
  },
  {
    model: 'openai/gpt-4o-mini',
    provider: 'letta',
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    capabilities: ['chat', 'vision', 'tool_use', 'streaming'],
    tier: 'fast',
    costTier: 'low',
  },
  {
    model: 'anthropic/claude-sonnet-4-20250514',
    provider: 'letta',
    contextWindow: 200_000,
    maxOutputTokens: 16_000,
    capabilities: ['chat', 'vision', 'reasoning', 'tool_use', 'code', 'streaming'],
    tier: 'capable',
    costTier: 'medium',
  },
  {
    model: 'anthropic/claude-haiku-3-5-20241022',
    provider: 'letta',
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    capabilities: ['chat', 'vision', 'tool_use', 'streaming'],
    tier: 'fast',
    costTier: 'low',
  },
];

// ── Lookup Indexes (built lazily) ────────────────────────────────────────────

let _byModel: Map<string, ModelEntry> | null = null;
let _byProvider: Map<string, ModelEntry[]> | null = null;

function ensureIndexes(): void {
  if (_byModel) return;
  _byModel = new Map();
  _byProvider = new Map();
  for (const entry of REGISTRY) {
    _byModel.set(entry.model, entry);
    const list = _byProvider.get(entry.provider) ?? [];
    list.push(entry);
    _byProvider.set(entry.provider, list);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a `"provider/model"` string into its components.
 *
 * Accepts both `"openai/gpt-4o"` (provider-prefixed) and `"gpt-4o"` (bare model).
 * For bare models, the provider is resolved from the registry or returned as null.
 *
 * Letta models (which natively use `provider/model` format) are detected and
 * attributed to the `letta` provider.
 */
export function parseModelString(input: string): ParsedModelString {
  ensureIndexes();

  // Direct registry match first (handles Letta's "openai/gpt-4o" format)
  const direct = _byModel!.get(input);
  if (direct) {
    return { provider: direct.provider, model: input };
  }

  // Try "provider/model" split
  const slashIdx = input.indexOf('/');
  if (slashIdx > 0) {
    const providerPart = input.slice(0, slashIdx);
    const modelPart = input.slice(slashIdx + 1);

    // Check if the provider part is a known provider name
    const knownProviders = new Set([
      'anthropic',
      'openai',
      'gemini',
      'ollama',
      'opencode',
      'lmstudio',
      'localai',
      'deepseek',
      'mistral',
      'grok',
      'letta',
      'groq',
      'openrouter',
      'agnos',
    ]);

    if (knownProviders.has(providerPart)) {
      return { provider: providerPart as AIProviderName, model: modelPart };
    }
  }

  // Bare model name — look up provider from registry
  const entry = _byModel!.get(input);
  if (entry) {
    return { provider: entry.provider, model: input };
  }

  return { provider: null, model: input };
}

/**
 * Look up a model entry by model name.
 * Returns `undefined` for unknown models (local/dynamic models).
 */
export function getModelEntry(model: string): ModelEntry | undefined {
  ensureIndexes();
  return _byModel!.get(model);
}

/**
 * Get all registered models for a given provider.
 */
export function getModelsForProvider(provider: AIProviderName): readonly ModelEntry[] {
  ensureIndexes();
  return _byProvider!.get(provider) ?? [];
}

/**
 * Get the context window size for a model. Returns a conservative default
 * (128k) for unknown models.
 */
export function getContextWindow(model: string): number {
  const entry = getModelEntry(model);
  return entry?.contextWindow ?? 128_000;
}

/**
 * Check if a model has a specific capability.
 * Returns `true` for unknown models (assume capable to avoid false negatives).
 */
export function hasCapability(model: string, capability: ModelCapability): boolean {
  const entry = getModelEntry(model);
  if (!entry) return true; // unknown model — assume capable
  return entry.capabilities.includes(capability);
}

/**
 * Filter models by required capabilities.
 */
export function findModelsWithCapabilities(
  capabilities: ModelCapability[],
  options?: { provider?: AIProviderName; tier?: ModelTier }
): readonly ModelEntry[] {
  ensureIndexes();
  return REGISTRY.filter((entry) => {
    if (options?.provider && entry.provider !== options.provider) return false;
    if (options?.tier && entry.tier !== options.tier) return false;
    return capabilities.every((cap) => entry.capabilities.includes(cap));
  });
}

/**
 * Get the model tier for a model name. Falls back to `'capable'` for unknown models.
 * Local providers always return `'fast'`.
 */
export function getModelTier(model: string, provider?: string): ModelTier {
  const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio', 'localai', 'big-pickle']);
  if (provider && LOCAL_PROVIDERS.has(provider)) return 'fast';
  if (model === 'big-pickle') return 'fast';

  const entry = getModelEntry(model);
  return entry?.tier ?? 'capable';
}

/**
 * Get all registered model entries.
 */
export function getAllModels(): readonly ModelEntry[] {
  return REGISTRY;
}

/**
 * Resolve a provider from a model name. Returns `null` for unknown models.
 */
export function resolveProvider(model: string): AIProviderName | null {
  const entry = getModelEntry(model);
  return entry?.provider ?? null;
}

/** @internal — Reset indexes for testing. */
export function _resetIndexes(): void {
  _byModel = null;
  _byProvider = null;
}
