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
