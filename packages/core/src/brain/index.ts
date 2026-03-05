/**
 * Brain Module — Memory, Knowledge, and Skills for SecureYeoman
 *
 * In Our Image: No-Thing-Ness → The One (Soul) → The Plurality (Spirit/Brain/Body)
 */

export { BrainStorage } from './storage.js';
export { BrainManager } from './manager.js';
export { ExternalBrainSync, type SyncResult } from './external-sync.js';

export type {
  Memory,
  MemoryType,
  MemoryCreate,
  MemoryQuery,
  KnowledgeEntry,
  KnowledgeCreate,
  KnowledgeQuery,
  SkillFilter,
  BrainManagerDeps,
  BrainStats,
  AuditStorage,
} from './types.js';

// Vector Memory
export { VectorMemoryManager, type VectorMemoryManagerDeps } from './vector/manager.js';
export { createVectorStore } from './vector/index.js';
export type { VectorStore, VectorResult } from './vector/types.js';

// Memory Consolidation
export {
  ConsolidationManager,
  type ConsolidationConfig,
  type ConsolidationManagerDeps,
} from './consolidation/manager.js';
export type {
  ConsolidationActionType,
  ConsolidationAction,
  ConsolidationReport,
} from './consolidation/types.js';

// Memory Audit (Phase 118)
export {
  MemoryAuditStorage,
  MemoryAuditPolicy,
  MemoryAuditEngine,
  MemoryAuditScheduler,
  MemoryCompressor,
  MemoryReorganizer,
  KnowledgeGraphCoherenceChecker,
} from './audit/index.js';

// Cognitive Memory (Phase 124)
export { CognitiveMemoryStorage } from './cognitive-memory-store.js';
export { CognitiveMemoryManager } from './cognitive-memory-manager.js';

// Context-Dependent Retrieval (Phase 125-A)
export {
  ContextRetriever,
  fuseEmbeddings,
  computeCentroid,
  type ContextRetrievalConfig,
} from './context-retrieval.js';

// Working Memory / Predictive Pre-Fetch (Phase 125-B)
export {
  WorkingMemoryBuffer,
  type WorkingMemoryConfig,
  type WorkingMemoryItem,
} from './working-memory.js';

// Salience Classification (Phase 125-C)
export { SalienceClassifier, type SalienceScores, type SalienceWeights } from './salience.js';

// Future Scaffolds (Phase 125 — Pending)
export { ReconsolidationManager, type ReconsolidationConfig } from './reconsolidation.js';
export {
  SchemaClusteringManager,
  type SchemaClusteringConfig,
  kMeans,
} from './schema-clustering.js';
export { RetrievalOptimizer, type RetrievalOptimizerConfig } from './retrieval-optimizer.js';
