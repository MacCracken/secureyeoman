/**
 * Abstract AI Provider Base
 *
 * Common constructor, retry wrapping, logging, and usage recording
 * shared across all provider implementations.
 */

import type {
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIProviderName,
  ModelConfig,
} from '@friday/shared';
import { RetryManager, type RetryConfig } from '../retry-manager.js';
import type { SecureLogger } from '../../logging/logger.js';

export interface ProviderConfig {
  model: ModelConfig;
  apiKey?: string;
  retryConfig?: Partial<RetryConfig>;
}

/**
 * Interface that all providers must implement.
 */
export interface AIProvider {
  readonly name: AIProviderName;

  /** Non-streaming chat completion. */
  chat(request: AIRequest): Promise<AIResponse>;

  /** Streaming chat completion (async generator). */
  chatStream(request: AIRequest): AsyncGenerator<AIStreamChunk, void, unknown>;
}

/**
 * Abstract base class with shared retry and logging behavior.
 */
export abstract class BaseProvider implements AIProvider {
  abstract readonly name: AIProviderName;

  protected readonly modelConfig: ModelConfig;
  protected readonly retryManager: RetryManager;
  protected readonly logger: SecureLogger | null;
  protected readonly apiKey: string | undefined;

  constructor(config: ProviderConfig, logger?: SecureLogger) {
    this.modelConfig = config.model;
    this.apiKey = config.apiKey;
    this.retryManager = new RetryManager(config.retryConfig);
    this.logger = logger ?? null;
  }

  /**
   * Non-streaming chat with automatic retry.
   */
  async chat(request: AIRequest): Promise<AIResponse> {
    return this.retryManager.execute(() => this.doChat(request));
  }

  /**
   * Streaming is not retried automatically — callers handle reconnection.
   */
  abstract chatStream(request: AIRequest): AsyncGenerator<AIStreamChunk, void, unknown>;

  /**
   * Provider-specific non-streaming implementation (called inside retry).
   */
  protected abstract doChat(request: AIRequest): Promise<AIResponse>;

  /**
   * Resolve the model to use: request override or config default.
   */
  protected resolveModel(request: AIRequest): string {
    return request.model ?? this.modelConfig.model;
  }

  /**
   * Resolve maxTokens: request override or config default.
   */
  protected resolveMaxTokens(request: AIRequest): number {
    return request.maxTokens ?? this.modelConfig.maxTokens;
  }

  /**
   * Resolve temperature: request override or config default.
   */
  protected resolveTemperature(request: AIRequest): number {
    return request.temperature ?? this.modelConfig.temperature;
  }
}
