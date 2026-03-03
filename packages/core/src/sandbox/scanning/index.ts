/**
 * Sandbox Scanning — Barrel export (Phase 116)
 */

export { CodeScanner } from './code-scanner.js';
export { SecretsScanner } from './secrets-scanner.js';
export { DataScanner } from './data-scanner.js';
export {
  ScannerPipeline,
  worstSeverity,
  severityRank,
  severityToVerdict,
  type ThreatClassifierIntegration,
} from './scanner-pipeline.js';
export { ExternalizationGate, type ExternalizationGateDeps, type GatedResult } from './externalization-gate.js';
export { QuarantineStorage, type QuarantineMetadata } from './quarantine-storage.js';
export { ScanHistoryStore, type ScanHistoryRecordInput, type ScanHistoryListOptions, type ScanStats } from './scan-history-store.js';
export { BUILTIN_THREAT_PATTERNS } from './threat-patterns.js';
export { ThreatClassifier } from './threat-classifier.js';
export { RuntimeGuard, RuntimeMonitor, type RuntimeGuardConfig, type RuntimeMonitorEvent } from './runtime-guard.js';
export { EscalationManager, type EscalationManagerDeps } from './escalation.js';
export { OffenderTracker, type OffenderTrackerConfig, type OffenderStatus } from './offender-tracker.js';
export { registerScanningRoutes, type ScanningRoutesOptions } from './scanning-routes.js';
export type {
  SandboxArtifact,
  ArtifactScanner,
  ScanPipelineConfig,
  ThreatPattern,
  ThreatAssessmentResult,
  ScanReport,
} from './types.js';
