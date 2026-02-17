/**
 * Vector Store Module — Vector storage backends for semantic search.
 */

export type { VectorStore, VectorResult } from './types.js';
export { FaissVectorStore } from './faiss-store.js';
export { QdrantVectorStore, type QdrantStoreConfig } from './qdrant-store.js';
export { VectorMemoryManager } from './manager.js';

import type { VectorStore } from './types.js';
import type { VectorConfig } from '@friday/shared';
import { FaissVectorStore } from './faiss-store.js';
import { QdrantVectorStore } from './qdrant-store.js';

/**
 * Factory to create a vector store based on configuration.
 */
export function createVectorStore(config: VectorConfig, dimensions: number): VectorStore {
  if (config.backend === 'qdrant') {
    return new QdrantVectorStore({
      url: config.qdrant.url,
      collection: config.qdrant.collection,
      dimensions,
    });
  }

  return new FaissVectorStore(dimensions, config.faiss.persistDir);
}
