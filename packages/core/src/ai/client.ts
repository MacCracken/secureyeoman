/**
 * AIClient — Main Orchestrator
 *
 * Factory method creates the correct provider from config.
 * Integrates with AuditChain for request/response logging (metadata only, never raw content).
 * Integrates with UsageTracker for token/cost aggregation.
 *
 * Supports a configurable fallback chain: when the primary provider returns a
 * rate-limit (429) or unavailability (502/503) error, the client automatically
 * tries alternative models in the order specified by `config.model.fallbacks`.
 * Fallback providers are instantiated lazily on first use.
 *
 * Note on streaming fallback: if a stream fails mid-delivery (after yielding
 * some chunks), the fallback starts a fresh stream. Callers may see partial
 * content from provider A followed by complete content from provider B.
 */

import type {
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIProviderName,
  ModelConfig,
  FallbackModelConfig,
} from '@secureyeoman/shared';
import type { AIProvider } from './providers/base.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenAIProvider } from './providers/openai.js';
import { GeminiProvider } from './providers/gemini.js';
import { OllamaProvider } from './providers/ollama.js';
import { OpenCodeProvider } from './providers/opencode.js';
import { LMStudioProvider } from './providers/lmstudio.js';
import { LocalAIProvider } from './providers/localai.js';
import { DeepSeekProvider } from './providers/deepseek.js';
import { MistralProvider } from './providers/mistral.js';
import { GrokProvider } from './providers/grok.js';
import { CostCalculator } from './cost-calculator.js';
import { UsageTracker, type UsageStats } from './usage-tracker.js';
import type { UsageStorage } from './usage-storage.js';
import { TokenLimitError, RateLimitError, ProviderUnavailableError } from './errors.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { SecureLogger } from '../logging/logger.js';
import { getSecret } from '../config/loader.js';
import type { RetryConfig } from './retry-manager.js';
import type { SoulManager } from '../soul/manager.js';

export interface AIClientConfig {
  model: ModelConfig;
  retryConfig?: Partial<RetryConfig>;
}

export interface AIClientDeps {
  auditChain?: AuditChain;
  logger?: SecureLogger;
  usageStorage?: UsageStorage;
  soulManager?: SoulManager;
  /**
   * Pre-built tracker to reuse across model switches.
   * When provided, usageStorage is ignored for tracker construction —
   * the existing tracker (already seeded from DB) is carried over as-is.
   */
  usageTracker?: UsageTracker;
}

export class AIClient {
  private readonly provider: AIProvider;
  private readonly costCalculator: CostCalculator;
  private readonly usageTracker: UsageTracker;
  private readonly auditChain: AuditChain | null;
  private readonly logger: SecureLogger | null;
  private readonly providerName: AIProviderName;
  private readonly primaryModelConfig: ModelConfig;
  private readonly fallbackConfigs: FallbackModelConfig[];
  private readonly fallbackProviders = new Map<number, AIProvider>();
  private readonly retryConfig?: Partial<RetryConfig>;
  private soulManager: SoulManager | null;
  private initPromise: Promise<void> | null = null;

  constructor(config: AIClientConfig, deps: AIClientDeps = {}) {
    this.costCalculator = new CostCalculator();
    this.usageTracker =
      deps.usageTracker ?? new UsageTracker(config.model.maxTokensPerDay, deps.usageStorage);
    this.auditChain = deps.auditChain ?? null;
    this.logger = deps.logger ?? null;
    this.providerName = config.model.provider;
    this.primaryModelConfig = config.model;
    this.fallbackConfigs = config.model.fallbacks ?? [];
    this.retryConfig = config.retryConfig;
    this.soulManager = deps.soulManager ?? null;
    this.provider = this.createProvider(config);
  }

  /** Inject or replace the SoulManager after construction. */
  setSoulManager(manager: SoulManager): void {
    this.soulManager = manager;
  }

  /**
   * Non-streaming chat completion with fallback support.
   *
   * @param requestFallbacks - Optional per-request fallback chain. When provided, overrides
   *   the system-level `config.model.fallbacks` for this call only.
   */
  async chat(
    request: AIRequest,
    context?: Record<string, unknown>,
    requestFallbacks?: FallbackModelConfig[]
  ): Promise<AIResponse> {
    await this.ensureInitialized();
    // Check daily limit
    const limit = this.usageTracker.checkLimit();
    if (!limit.allowed) {
      throw new TokenLimitError(this.providerName);
    }

    const fallbacks = requestFallbacks ?? this.fallbackConfigs;

    // Try primary provider
    let primaryError: Error | undefined;
    try {
      return await this.doChatWithProvider(this.provider, this.providerName, request, context);
    } catch (error) {
      primaryError = error as Error;
      if (!this.isFallbackEligible(primaryError) || fallbacks.length === 0) {
        throw primaryError;
      }
    }

    // Primary failed with a fallback-eligible error — try fallbacks
    await this.auditRecord('ai_fallback_triggered', {
      primaryProvider: this.providerName,
      error: primaryError.message,
      fallbackCount: fallbacks.length,
    });

    for (let i = 0; i < fallbacks.length; i++) {
      const fbConfig = fallbacks[i]!;
      const fbProviderName = fbConfig.provider;

      await this.auditRecord('ai_fallback_attempt', {
        index: i,
        provider: fbProviderName,
        model: fbConfig.model,
      });

      try {
        const fbProvider = this.getOrCreateFallbackProvider(i, fbConfig);
        const response = await this.doChatWithProvider(
          fbProvider,
          fbProviderName,
          request,
          context
        );

        await this.auditRecord('ai_fallback_success', {
          index: i,
          provider: fbProviderName,
          model: fbConfig.model,
        });

        return response;
      } catch (error) {
        const fbError = error as Error;
        if (!this.isFallbackEligible(fbError)) {
          // Non-recoverable error from fallback — don't continue chain
          throw fbError;
        }
        // Fallback-eligible error — continue to next fallback
      }
    }

    // All fallbacks exhausted
    await this.auditRecord('ai_fallback_exhausted', {
      primaryProvider: this.providerName,
      fallbackCount: fallbacks.length,
    });

    throw primaryError;
  }

  /**
   * Streaming chat completion (async generator) with fallback support.
   *
   * @param requestFallbacks - Optional per-request fallback chain. When provided, overrides
   *   the system-level `config.model.fallbacks` for this call only.
   */
  async *chatStream(
    request: AIRequest,
    context?: Record<string, unknown>,
    requestFallbacks?: FallbackModelConfig[]
  ): AsyncGenerator<AIStreamChunk, void, unknown> {
    await this.ensureInitialized();
    const limit = this.usageTracker.checkLimit();
    if (!limit.allowed) {
      throw new TokenLimitError(this.providerName);
    }

    const fallbacks = requestFallbacks ?? this.fallbackConfigs;

    // Try primary provider
    let primaryError: Error | undefined;
    try {
      yield* this.doChatStreamWithProvider(this.provider, this.providerName, request, context);
      return;
    } catch (error) {
      primaryError = error as Error;
      if (!this.isFallbackEligible(primaryError) || fallbacks.length === 0) {
        throw primaryError;
      }
    }

    // Primary failed — try fallbacks
    await this.auditRecord('ai_fallback_triggered', {
      primaryProvider: this.providerName,
      error: primaryError.message,
      fallbackCount: fallbacks.length,
      stream: true,
    });

    for (let i = 0; i < fallbacks.length; i++) {
      const fbConfig = fallbacks[i]!;
      const fbProviderName = fbConfig.provider;

      await this.auditRecord('ai_fallback_attempt', {
        index: i,
        provider: fbProviderName,
        model: fbConfig.model,
        stream: true,
      });

      try {
        const fbProvider = this.getOrCreateFallbackProvider(i, fbConfig);
        yield* this.doChatStreamWithProvider(fbProvider, fbProviderName, request, context);

        await this.auditRecord('ai_fallback_success', {
          index: i,
          provider: fbProviderName,
          model: fbConfig.model,
          stream: true,
        });

        return;
      } catch (error) {
        const fbError = error as Error;
        if (!this.isFallbackEligible(fbError)) {
          throw fbError;
        }
      }
    }

    // All fallbacks exhausted
    await this.auditRecord('ai_fallback_exhausted', {
      primaryProvider: this.providerName,
      fallbackCount: fallbacks.length,
      stream: true,
    });

    throw primaryError;
  }

  /**
   * Get aggregated usage statistics.
   */
  getUsageStats(): UsageStats {
    return this.usageTracker.getStats();
  }

  /**
   * Get the usage tracker instance (for cost optimizer integration).
   */
  getUsageTracker(): UsageTracker {
    return this.usageTracker;
  }

  /**
   * Load historical usage records from the database.
   * Safe to call multiple times — subsequent calls are no-ops.
   * Called automatically on the first chat()/chatStream() invocation;
   * you may also call it explicitly during startup if eager seeding is preferred.
   */
  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.usageTracker.init();
    }
    await this.initPromise;
  }

  /** Ensure usage history is loaded before processing a request. */
  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.usageTracker.init();
    }
    await this.initPromise;
  }

  /**
   * Get the underlying provider name.
   */
  getProviderName(): AIProviderName {
    return this.providerName;
  }

  // ─── Private Helpers ─────────────────────────────────────────

  /**
   * Returns true for errors that should trigger fallback (rate limit, provider unavailable).
   */
  private isFallbackEligible(error: Error): boolean {
    return error instanceof RateLimitError || error instanceof ProviderUnavailableError;
  }

  /**
   * Lazily instantiate a fallback provider, caching it for reuse.
   * When called with an explicit fbConfig (per-request fallbacks), uses a separate cache key
   * that won't collide with the system-level fallback providers.
   * Inherits retry config and unset fields from the primary model config.
   */
  private getOrCreateFallbackProvider(index: number, fbConfig: FallbackModelConfig): AIProvider {
    // Use a negative index offset to distinguish per-request fallbacks from system-level ones
    const cacheKey = index;
    const cached = this.fallbackProviders.get(cacheKey);
    // Only reuse cached provider if it matches the same provider+model
    if (cached) {
      const systemFbConfig = this.fallbackConfigs[index];
      if (
        systemFbConfig &&
        systemFbConfig.provider === fbConfig.provider &&
        systemFbConfig.model === fbConfig.model
      ) {
        return cached;
      }
    }

    // Build a full ModelConfig by inheriting unset fields from primary
    const fullModelConfig: ModelConfig = {
      provider: fbConfig.provider,
      model: fbConfig.model,
      apiKeyEnv: fbConfig.apiKeyEnv,
      baseUrl: fbConfig.baseUrl ?? this.primaryModelConfig.baseUrl,
      maxTokens: fbConfig.maxTokens ?? this.primaryModelConfig.maxTokens,
      temperature: fbConfig.temperature ?? this.primaryModelConfig.temperature,
      maxRequestsPerMinute: this.primaryModelConfig.maxRequestsPerMinute,
      maxTokensPerDay: this.primaryModelConfig.maxTokensPerDay,
      requestTimeoutMs: fbConfig.requestTimeoutMs ?? this.primaryModelConfig.requestTimeoutMs,
      maxRetries: this.primaryModelConfig.maxRetries,
      retryDelayMs: this.primaryModelConfig.retryDelayMs,
      fallbacks: [],
    };

    const provider = this.createProvider({ model: fullModelConfig, retryConfig: this.retryConfig });
    // Only cache system-level fallbacks (when they match the configured index)
    if (this.fallbackConfigs[index]?.provider === fbConfig.provider &&
        this.fallbackConfigs[index]?.model === fbConfig.model) {
      this.fallbackProviders.set(cacheKey, provider);
    }
    return provider;
  }

  /**
   * Execute a non-streaming chat call against a specific provider, with audit and usage tracking.
   */
  private async doChatWithProvider(
    provider: AIProvider,
    providerName: AIProviderName,
    request: AIRequest,
    context?: Record<string, unknown>
  ): Promise<AIResponse> {
    const startTime = Date.now();

    await this.auditRecord('ai_request', {
      provider: providerName,
      model: request.model ?? 'default',
      messageCount: request.messages.length,
      hasTools: !!request.tools?.length,
      stream: false,
      ...(context ?? {}),
    });

    try {
      const response = await provider.chat(request);
      const elapsed = Date.now() - startTime;

      await this.trackUsage(response, elapsed);

      await this.auditRecord('ai_response', {
        provider: response.provider,
        model: response.model,
        stopReason: response.stopReason,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        cachedTokens: response.usage.cachedTokens,
        latencyMs: elapsed,
      });

      return response;
    } catch (error) {
      this.usageTracker.recordError(providerName, request.model ?? 'default');
      this.usageTracker.recordLatency(Date.now() - startTime);

      await this.auditRecord('ai_error', {
        provider: providerName,
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * Execute a streaming chat call against a specific provider, with audit and usage tracking.
   */
  private async *doChatStreamWithProvider(
    provider: AIProvider,
    providerName: AIProviderName,
    request: AIRequest,
    context?: Record<string, unknown>
  ): AsyncGenerator<AIStreamChunk, void, unknown> {
    const startTime = Date.now();

    await this.auditRecord('ai_stream_request', {
      provider: providerName,
      model: request.model ?? 'default',
      messageCount: request.messages.length,
      hasTools: !!request.tools?.length,
      stream: true,
      ...(context ?? {}),
    });

    try {
      for await (const chunk of provider.chatStream(request)) {
        yield chunk;

        // Track usage from the final 'done' or 'usage' chunks
        if (chunk.type === 'done' && chunk.usage) {
          const elapsed = Date.now() - startTime;
          const costUsd = this.costCalculator.calculate(
            providerName,
            request.model ?? provider.name,
            chunk.usage
          );

          const streamPersonality = this.soulManager
            ? await this.soulManager.getActivePersonality().catch(() => null)
            : null;

          this.usageTracker.record({
            provider: providerName,
            model: request.model ?? 'default',
            usage: chunk.usage,
            costUsd,
            timestamp: Date.now(),
            personalityId: streamPersonality?.id,
            latencyMs: elapsed,
          });

          await this.auditRecord('ai_stream_done', {
            provider: providerName,
            stopReason: chunk.stopReason,
            inputTokens: chunk.usage.inputTokens,
            outputTokens: chunk.usage.outputTokens,
            latencyMs: elapsed,
          });
        }
      }
    } catch (error) {
      this.usageTracker.recordError(providerName, request.model ?? 'default');

      await this.auditRecord('ai_stream_error', {
        provider: providerName,
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
      });

      throw error;
    }
  }

  private createProvider(config: AIClientConfig): AIProvider {
    const noKeyProviders = ['ollama', 'lmstudio', 'localai'];
    const apiKey = !noKeyProviders.includes(config.model.provider)
      ? getSecret(config.model.apiKeyEnv)
      : undefined;

    const providerConfig = {
      model: config.model,
      apiKey,
      retryConfig: config.retryConfig,
    };

    switch (config.model.provider) {
      case 'anthropic':
        return new AnthropicProvider(providerConfig, this.logger ?? undefined);
      case 'openai':
        return new OpenAIProvider(providerConfig, this.logger ?? undefined);
      case 'gemini':
        return new GeminiProvider(providerConfig, this.logger ?? undefined);
      case 'ollama':
        return new OllamaProvider(providerConfig, this.logger ?? undefined);
      case 'opencode':
        return new OpenCodeProvider(providerConfig, this.logger ?? undefined);
      case 'lmstudio':
        return new LMStudioProvider(providerConfig, this.logger ?? undefined);
      case 'localai':
        return new LocalAIProvider(providerConfig, this.logger ?? undefined);
      case 'deepseek':
        return new DeepSeekProvider(providerConfig, this.logger ?? undefined);
      case 'mistral':
        return new MistralProvider(providerConfig, this.logger ?? undefined);
      case 'grok':
        return new GrokProvider(providerConfig, this.logger ?? undefined);
      default:
        throw new Error(`Unknown AI provider: ${config.model.provider}`);
    }
  }

  private async trackUsage(response: AIResponse, elapsed: number): Promise<void> {
    const costUsd = this.costCalculator.calculate(
      this.providerName,
      response.model,
      response.usage
    );

    const personality = this.soulManager
      ? await this.soulManager.getActivePersonality().catch(() => null)
      : null;

    this.usageTracker.record({
      provider: this.providerName,
      model: response.model,
      usage: response.usage,
      costUsd,
      timestamp: Date.now(),
      personalityId: personality?.id,
      latencyMs: elapsed,
    });
  }

  private async auditRecord(event: string, metadata: Record<string, unknown>): Promise<void> {
    if (!this.auditChain) return;

    try {
      await this.auditChain.record({
        event,
        level: event.includes('error') || event.includes('exhausted') ? 'warn' : 'info',
        message: `AI ${event}`,
        metadata,
      });
    } catch {
      // Audit logging should never block AI operations
      this.logger?.warn('Failed to record AI audit event', { event });
    }
  }
}
