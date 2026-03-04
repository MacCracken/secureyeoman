/**
 * Memory Audit — Internal Runtime Types (Phase 118)
 */

export type {
  MemoryAuditScope,
  MemoryAuditStatus,
  MemoryTransformType,
  AuditSnapshot,
  CompressionSummary,
  ReorganizationSummary,
  MaintenanceSummary,
  MemoryAuditReport,
  MemoryArchiveEntry,
  MemoryAuditPolicy as MemoryAuditPolicyConfig,
  MemoryHealthMetrics,
} from '@secureyeoman/shared';

/** Row type for brain.audit_reports table. */
export interface AuditReportRow {
  id: string;
  tenant_id: string;
  personality_id: string | null;
  scope: string;
  started_at: number;
  completed_at: number | null;
  pre_snapshot: unknown;
  post_snapshot: unknown;
  compression_summary: unknown;
  reorganization_summary: unknown;
  maintenance_summary: unknown;
  status: string;
  approved_by: string | null;
  approved_at: number | null;
  error: string | null;
  created_at: number;
}

/** Row type for brain.memory_archive table. */
export interface MemoryArchiveRow {
  id: string;
  original_memory_id: string;
  original_content: string;
  original_importance: number;
  original_context: unknown;
  transform_type: string;
  audit_report_id: string | null;
  archived_at: number;
  tenant_id: string;
}

/** Options for creating a new audit report. */
export interface CreateAuditReportOpts {
  personalityId?: string | null;
  scope: 'daily' | 'weekly' | 'monthly';
  tenantId?: string;
}

/** Options for archiving a memory. */
export interface ArchiveMemoryOpts {
  originalMemoryId: string;
  originalContent: string;
  originalImportance: number;
  originalContext?: Record<string, unknown>;
  transformType: 'compressed' | 'merged' | 'reorganized' | 'promoted' | 'demoted';
  auditReportId?: string | null;
  tenantId?: string;
}

/** Deps for the audit engine. */
export interface AuditEngineDeps {
  brainStorage: import('../storage.js').BrainStorage;
  auditStorage: import('./audit-store.js').MemoryAuditStorage;
  policyConfig: import('@secureyeoman/shared').MemoryAuditPolicy;
  brainManager: import('../manager.js').BrainManager;
  compressor?: import('./compressor.js').MemoryCompressor | null;
  reorganizer?: import('./reorganizer.js').MemoryReorganizer | null;
  coherenceChecker?: import('./coherence-checker.js').KnowledgeGraphCoherenceChecker | null;
  logger: import('../../logging/logger.js').SecureLogger;
  getAlertManager?: () => import('../../telemetry/alert-manager.js').AlertManager | null;
}
