/**
 * Base Embedding Provider
 *
 * Shared retry and logging behavior for embedding providers.
 * Mirrors the ai/providers/base.ts pattern.
 */

import type { EmbeddingProvider } from './types.js';
import { RetryManager, type RetryConfig } from '../retry-manager.js';
import type { SecureLogger } from '../../logging/logger.js';

export interface EmbeddingProviderConfig {
  retryConfig?: Partial<RetryConfig>;
}

export abstract class BaseEmbeddingProvider implements EmbeddingProvider {
  abstract readonly name: string;

  protected readonly retryManager: RetryManager;
  protected readonly logger: SecureLogger | null;

  constructor(config: EmbeddingProviderConfig = {}, logger?: SecureLogger) {
    this.retryManager = new RetryManager(config.retryConfig);
    this.logger = logger ?? null;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return this.retryManager.execute(() => this.doEmbed(texts));
  }

  abstract dimensions(): number;

  protected abstract doEmbed(texts: string[]): Promise<number[][]>;
}
