/**
 * Vector Store Module — Vector storage backends for semantic search.
 */

export type { VectorStore, VectorResult } from './types.js';
export { FaissVectorStore } from './faiss-store.js';
export { QdrantVectorStore, type QdrantStoreConfig } from './qdrant-store.js';
export { ChromaVectorStore, type ChromaStoreConfig } from './chroma-store.js';
export { AgnosVectorStore } from './agnos-store.js';
export { VectorMemoryManager } from './manager.js';

import type { VectorStore } from './types.js';
import type { VectorConfig } from '@secureyeoman/shared';
import type { AgnosClient } from '../../integrations/agnos/agnos-client.js';
import { FaissVectorStore } from './faiss-store.js';
import { QdrantVectorStore } from './qdrant-store.js';
import { ChromaVectorStore } from './chroma-store.js';
import { AgnosVectorStore } from './agnos-store.js';

export interface CreateVectorStoreOptions {
  config: VectorConfig;
  dimensions: number;
  /** Required when config.backend === 'agnos'. */
  agnosClient?: AgnosClient;
}

/**
 * Factory to create a vector store based on configuration.
 */
export function createVectorStore(config: VectorConfig, dimensions: number): VectorStore;
export function createVectorStore(opts: CreateVectorStoreOptions): VectorStore;
export function createVectorStore(
  configOrOpts: VectorConfig | CreateVectorStoreOptions,
  maybeDimensions?: number,
): VectorStore {
  const isOpts = 'config' in configOrOpts && 'dimensions' in configOrOpts;
  const config = isOpts
    ? (configOrOpts as CreateVectorStoreOptions).config
    : (configOrOpts as VectorConfig);
  const dimensions = isOpts
    ? (configOrOpts as CreateVectorStoreOptions).dimensions
    : maybeDimensions!;
  const agnosClient = isOpts ? (configOrOpts as CreateVectorStoreOptions).agnosClient : undefined;

  if (config.backend === 'agnos') {
    if (!agnosClient) {
      throw new Error('AgnosClient is required when backend is "agnos"');
    }
    return new AgnosVectorStore(agnosClient);
  }

  if (config.backend === 'qdrant') {
    return new QdrantVectorStore({
      url: config.qdrant.url,
      collection: config.qdrant.collection,
      dimensions,
    });
  }

  if (config.backend === 'chroma') {
    return new ChromaVectorStore({
      url: config.chroma.url,
      collection: config.chroma.collection,
      dimensions,
    });
  }

  return new FaissVectorStore(dimensions, config.faiss.persistDir);
}
