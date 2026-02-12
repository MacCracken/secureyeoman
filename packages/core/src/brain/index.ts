/**
 * Brain Module — Memory, Knowledge, and Skills for FRIDAY
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
