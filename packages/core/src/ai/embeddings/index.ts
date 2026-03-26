/**
 * Embeddings Module — Text embedding providers for vector memory.
 */

export type { EmbeddingProvider } from './types.js';
export { BaseEmbeddingProvider, type EmbeddingProviderConfig } from './base.js';
export { LocalEmbeddingProvider, type LocalEmbeddingConfig } from './local.js';
export { ApiEmbeddingProvider, type ApiEmbeddingConfig } from './api.js';
export { OllamaEmbeddingProvider, type OllamaEmbeddingConfig } from './ollama.js';
export { HooshEmbeddingProvider, type HooshEmbeddingConfig } from './hoosh.js';

import type { EmbeddingProvider } from './types.js';
import type { VectorConfig } from '@secureyeoman/shared';
import type { SecureLogger } from '../../logging/logger.js';
import { LocalEmbeddingProvider } from './local.js';
import { ApiEmbeddingProvider } from './api.js';
import { OllamaEmbeddingProvider } from './ollama.js';
import { HooshEmbeddingProvider } from './hoosh.js';

/**
 * Factory to create an embedding provider based on configuration.
 */
export function createEmbeddingProvider(
  config: VectorConfig,
  apiKey?: string,
  logger?: SecureLogger
): EmbeddingProvider {
  if (config.provider === 'api' || config.provider === 'both') {
    // Ollama uses a local HTTP endpoint — no API key needed
    if (config.api.provider === 'ollama') {
      return new OllamaEmbeddingProvider(
        {
          model:
            config.api.model !== 'text-embedding-3-small' ? config.api.model : 'nomic-embed-text',
          baseUrl: config.api.baseUrl,
        },
        logger
      );
    }

    // Hoosh gateway — no API key required (local gateway)
    if (config.api.provider === 'hoosh') {
      return new HooshEmbeddingProvider(
        {
          model: config.api.model,
          baseUrl: config.api.baseUrl,
          apiKey,
        },
        logger
      );
    }

    if (!apiKey) {
      throw new Error('API key required for API embedding provider');
    }
    return new ApiEmbeddingProvider(
      {
        provider: config.api.provider,
        model: config.api.model,
        apiKey,
        baseUrl: config.api.baseUrl,
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
