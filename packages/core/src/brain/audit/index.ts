/**
 * Memory Audit Module — Phase 118
 *
 * Barrel exports for memory audits, compression, and reorganization.
 */

export { MemoryAuditStorage } from './audit-store.js';
export { MemoryAuditPolicy } from './policy.js';
export { MemoryAuditEngine, type AuditEngineOpts } from './engine.js';
export { MemoryAuditScheduler } from './scheduler.js';
export { MemoryCompressor, type MemoryCompressorOpts } from './compressor.js';
export { MemoryReorganizer, type MemoryReorganizerOpts } from './reorganizer.js';
export {
  KnowledgeGraphCoherenceChecker,
  type CoherenceCheckResult,
  type CoherenceIssue,
} from './coherence-checker.js';
