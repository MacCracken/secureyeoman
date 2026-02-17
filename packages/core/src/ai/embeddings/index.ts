/**
 * Embeddings Module — Text embedding providers for vector memory.
 */

export type { EmbeddingProvider } from './types.js';
export { BaseEmbeddingProvider, type EmbeddingProviderConfig } from './base.js';
export { LocalEmbeddingProvider, type LocalEmbeddingConfig } from './local.js';
export { ApiEmbeddingProvider, type ApiEmbeddingConfig } from './api.js';

import type { EmbeddingProvider } from './types.js';
import type { VectorConfig } from '@secureyeoman/shared';
import type { SecureLogger } from '../../logging/logger.js';
import { LocalEmbeddingProvider } from './local.js';
import { ApiEmbeddingProvider } from './api.js';

/**
 * Factory to create an embedding provider based on configuration.
 */
export function createEmbeddingProvider(
  config: VectorConfig,
  apiKey?: string,
  logger?: SecureLogger
): EmbeddingProvider {
  if (config.provider === 'api' || config.provider === 'both') {
    if (!apiKey) {
      throw new Error('API key required for API embedding provider');
    }
    return new ApiEmbeddingProvider(
      {
        provider: config.api.provider,
        model: config.api.model,
        apiKey,
      },
      logger
    );
  }

  return new LocalEmbeddingProvider(
    {
      model: config.local.model,
    },
    logger
  );
}
