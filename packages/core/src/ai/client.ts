/**
 * AIClient — Main Orchestrator
 *
 * Factory method creates the correct provider from config.
 * Integrates with AuditChain for request/response logging (metadata only, never raw content).
 * Integrates with UsageTracker for token/cost aggregation.
 */

import type { AIRequest, AIResponse, AIStreamChunk, AIProviderName, ModelConfig } from '@friday/shared';
import type { AIProvider } from './providers/base.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenAIProvider } from './providers/openai.js';
import { GeminiProvider } from './providers/gemini.js';
import { OllamaProvider } from './providers/ollama.js';
import { CostCalculator } from './cost-calculator.js';
import { UsageTracker, type UsageStats } from './usage-tracker.js';
import { TokenLimitError } from './errors.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { SecureLogger } from '../logging/logger.js';
import { getSecret } from '../config/loader.js';
import type { RetryConfig } from './retry-manager.js';

export interface AIClientConfig {
  model: ModelConfig;
  retryConfig?: Partial<RetryConfig>;
}

export interface AIClientDeps {
  auditChain?: AuditChain;
  logger?: SecureLogger;
}

export class AIClient {
  private readonly provider: AIProvider;
  private readonly costCalculator: CostCalculator;
  private readonly usageTracker: UsageTracker;
  private readonly auditChain: AuditChain | null;
  private readonly logger: SecureLogger | null;
  private readonly providerName: AIProviderName;

  constructor(config: AIClientConfig, deps: AIClientDeps = {}) {
    this.costCalculator = new CostCalculator();
    this.usageTracker = new UsageTracker(config.model.maxTokensPerDay);
    this.auditChain = deps.auditChain ?? null;
    this.logger = deps.logger ?? null;
    this.providerName = config.model.provider as AIProviderName;
    this.provider = this.createProvider(config);
  }

  /**
   * Non-streaming chat completion.
   */
  async chat(request: AIRequest, context?: Record<string, unknown>): Promise<AIResponse> {
    // Check daily limit
    const limit = this.usageTracker.checkLimit();
    if (!limit.allowed) {
      throw new TokenLimitError(this.providerName);
    }

    const startTime = Date.now();

    await this.auditRecord('ai_request', {
      provider: this.providerName,
      model: request.model ?? 'default',
      messageCount: request.messages.length,
      hasTools: !!request.tools?.length,
      stream: false,
      ...(context ?? {}),
    });

    try {
      const response = await this.provider.chat(request);
      const elapsed = Date.now() - startTime;

      this.trackUsage(response, elapsed);

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
      this.usageTracker.recordError();
      this.usageTracker.recordLatency(Date.now() - startTime);

      await this.auditRecord('ai_error', {
        provider: this.providerName,
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * Streaming chat completion (async generator).
   */
  async *chatStream(
    request: AIRequest,
    context?: Record<string, unknown>,
  ): AsyncGenerator<AIStreamChunk, void, unknown> {
    const limit = this.usageTracker.checkLimit();
    if (!limit.allowed) {
      throw new TokenLimitError(this.providerName);
    }

    const startTime = Date.now();

    await this.auditRecord('ai_stream_request', {
      provider: this.providerName,
      model: request.model ?? 'default',
      messageCount: request.messages.length,
      hasTools: !!request.tools?.length,
      stream: true,
      ...(context ?? {}),
    });

    try {
      for await (const chunk of this.provider.chatStream(request)) {
        yield chunk;

        // Track usage from the final 'done' or 'usage' chunks
        if (chunk.type === 'done' && chunk.usage) {
          const elapsed = Date.now() - startTime;
          const costUsd = this.costCalculator.calculate(this.providerName, request.model ?? this.provider.name, chunk.usage);

          this.usageTracker.record({
            provider: this.providerName,
            model: request.model ?? 'default',
            usage: chunk.usage,
            costUsd,
            timestamp: Date.now(),
          });
          this.usageTracker.recordLatency(elapsed);

          await this.auditRecord('ai_stream_done', {
            provider: this.providerName,
            stopReason: chunk.stopReason,
            inputTokens: chunk.usage.inputTokens,
            outputTokens: chunk.usage.outputTokens,
            latencyMs: elapsed,
          });
        }
      }
    } catch (error) {
      this.usageTracker.recordError();

      await this.auditRecord('ai_stream_error', {
        provider: this.providerName,
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * Get aggregated usage statistics.
   */
  getUsageStats(): UsageStats {
    return this.usageTracker.getStats();
  }

  /**
   * Get the underlying provider name.
   */
  getProviderName(): AIProviderName {
    return this.providerName;
  }

  // ─── Private Helpers ─────────────────────────────────────────

  private createProvider(config: AIClientConfig): AIProvider {
    const apiKey = config.model.provider !== 'ollama'
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
      default:
        throw new Error(`Unknown AI provider: ${config.model.provider}`);
    }
  }

  private trackUsage(response: AIResponse, elapsed: number): void {
    const costUsd = this.costCalculator.calculate(this.providerName, response.model, response.usage);

    this.usageTracker.record({
      provider: this.providerName,
      model: response.model,
      usage: response.usage,
      costUsd,
      timestamp: Date.now(),
    });
    this.usageTracker.recordLatency(elapsed);
  }

  private async auditRecord(event: string, metadata: Record<string, unknown>): Promise<void> {
    if (!this.auditChain) return;

    try {
      await this.auditChain.record({
        event,
        level: event.includes('error') ? 'warn' : 'info',
        message: `AI ${event}`,
        metadata,
      });
    } catch {
      // Audit logging should never block AI operations
      this.logger?.warn('Failed to record AI audit event', { event });
    }
  }
}
