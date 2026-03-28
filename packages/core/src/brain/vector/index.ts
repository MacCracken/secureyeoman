/**
 * Vector Store Module — Vector storage backends for semantic search.
 */

export type { VectorStore, VectorResult } from './types.js';
export { FaissVectorStore } from './faiss-store.js';
export { QdrantVectorStore, type QdrantStoreConfig } from './qdrant-store.js';
export { ChromaVectorStore, type ChromaStoreConfig } from './chroma-store.js';
export { AgnosVectorStore } from './agnos-store.js';
export { DaimonVectorStore } from './daimon-store.js';
export { VectorMemoryManager } from './manager.js';

import type { VectorStore } from './types.js';
import type { VectorConfig } from '@secureyeoman/shared';
import { AgnosClient, type AgnosClientConfig } from '../../integrations/agnos/agnos-client.js';
import { DaimonClient } from '../../integrations/daimon/daimon-client.js';
import { createNoopLogger } from '../../logging/logger.js';
import { FaissVectorStore } from './faiss-store.js';
import { QdrantVectorStore } from './qdrant-store.js';
import { ChromaVectorStore } from './chroma-store.js';
import { AgnosVectorStore } from './agnos-store.js';
import { DaimonVectorStore } from './daimon-store.js';

export interface CreateVectorStoreOptions {
  config: VectorConfig;
  dimensions: number;
  /** Required when config.backend === 'agnos'. */
  agnosClient?: AgnosClient;
  /** Required when config.backend === 'daimon'. */
  daimonClient?: DaimonClient;
}

/**
 * Factory to create a vector store based on configuration.
 */
export function createVectorStore(config: VectorConfig, dimensions: number): VectorStore;
export function createVectorStore(opts: CreateVectorStoreOptions): VectorStore;
export function createVectorStore(
  configOrOpts: VectorConfig | CreateVectorStoreOptions,
  maybeDimensions?: number
): VectorStore {
  const isOpts = 'config' in configOrOpts && 'dimensions' in configOrOpts;
  const config = isOpts ? configOrOpts.config : configOrOpts;
  const dimensions = isOpts ? configOrOpts.dimensions : maybeDimensions!;
  const agnosClient = isOpts ? configOrOpts.agnosClient : undefined;
  const daimonClient = isOpts ? configOrOpts.daimonClient : undefined;

  if (config.backend === 'daimon') {
    if (daimonClient) {
      return new DaimonVectorStore(daimonClient);
    }
    return new DaimonVectorStore(
      new DaimonClient(
        { baseUrl: config.daimon?.url ?? 'http://127.0.0.1:8090', apiKey: config.daimon?.apiKey },
        createNoopLogger()
      )
    );
  }

  if (config.backend === 'agnos') {
    if (agnosClient) {
      return new AgnosVectorStore(agnosClient);
    }
    // Create AgnosClient from config when not explicitly injected
    const agnosConfig: AgnosClientConfig = {
      runtimeUrl: config.agnos?.runtimeUrl ?? 'http://127.0.0.1:8090',
      apiKey: config.agnos?.apiKey,
    };
    return new AgnosVectorStore(new AgnosClient(agnosConfig, createNoopLogger()));
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
