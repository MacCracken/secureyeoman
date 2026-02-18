/**
 * Vector Store Module — Vector storage backends for semantic search.
 */

export type { VectorStore, VectorResult } from './types.js';
export { FaissVectorStore } from './faiss-store.js';
export { QdrantVectorStore, type QdrantStoreConfig } from './qdrant-store.js';
export { ChromaVectorStore, type ChromaStoreConfig } from './chroma-store.js';
export { VectorMemoryManager } from './manager.js';

import type { VectorStore } from './types.js';
import type { VectorConfig } from '@secureyeoman/shared';
import { FaissVectorStore } from './faiss-store.js';
import { QdrantVectorStore } from './qdrant-store.js';
import { ChromaVectorStore } from './chroma-store.js';

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

  if (config.backend === 'chroma') {
    return new ChromaVectorStore({
      url: config.chroma.url,
      collection: config.chroma.collection,
      dimensions,
    });
  }

  return new FaissVectorStore(dimensions, config.faiss.persistDir);
}
