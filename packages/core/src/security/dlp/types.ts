/**
 * DLP Types — shared types for Data Loss Prevention & Content Classification.
 */

export type ClassificationLevel = 'public' | 'internal' | 'confidential' | 'restricted';

export const CLASSIFICATION_RANK: Record<ClassificationLevel, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

export interface ClassificationRule {
  type: 'pii' | 'keyword' | 'pattern';
  name: string;
  level: ClassificationLevel;
}

export interface ClassificationResult {
  level: ClassificationLevel;
  autoLevel: ClassificationLevel;
  rulesTriggered: ClassificationRule[];
  piiFound: string[];
  keywordsFound: string[];
}

export interface ClassificationRecord {
  id: string;
  contentId: string;
  contentType: 'conversation' | 'document' | 'memory' | 'knowledge' | 'message';
  classificationLevel: ClassificationLevel;
  autoLevel: ClassificationLevel | null;
  manualOverride: boolean;
  overriddenBy: string | null;
  rulesTriggered: ClassificationRule[];
  classifiedAt: number;
  tenantId: string;
}

export interface DlpPolicy {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rules: DlpPolicyRule[];
  action: 'block' | 'warn' | 'log';
  classificationLevels: ClassificationLevel[];
  appliesTo: string[];
  createdAt: number;
  updatedAt: number;
  tenantId: string;
}

export interface DlpPolicyRule {
  type: 'classification_level' | 'pii_type' | 'keyword' | 'pattern';
  value: string;
}

export interface DlpScanResult {
  allowed: boolean;
  action: 'allowed' | 'blocked' | 'warned';
  policyId: string | null;
  policyName: string | null;
  findings: DlpFinding[];
  classificationLevel: ClassificationLevel;
}

export interface DlpFinding {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface EgressEvent {
  id: string;
  destinationType: string;
  destinationId: string | null;
  contentHash: string;
  classificationLevel: ClassificationLevel | null;
  bytesSent: number;
  policyId: string | null;
  actionTaken: 'allowed' | 'blocked' | 'warned';
  scanFindings: DlpFinding[];
  userId: string | null;
  personalityId: string | null;
  createdAt: number;
  tenantId: string;
}

export interface RetentionPolicy {
  id: string;
  contentType: 'conversation' | 'memory' | 'document' | 'knowledge' | 'audit_log';
  retentionDays: number;
  classificationLevel: ClassificationLevel | null;
  enabled: boolean;
  lastPurgeAt: number | null;
  createdAt: number;
  updatedAt: number;
  tenantId: string;
}

export interface WatermarkRecord {
  id: string;
  contentId: string;
  contentType: string;
  watermarkData: string;
  algorithm: string;
  createdAt: number;
  tenantId: string;
}

// ── Egress Monitoring Types (Phase 136-F) ───────────────────────────────────

export interface EgressStats {
  totalEvents: number;
  byDestination: Record<string, number>;
  byAction: Record<string, number>;
  byClassification: Record<string, number>;
  period: { from: number; to: number };
}

export interface EgressAnomaly {
  hour: string;
  volume: number;
  mean: number;
  stddev: number;
  zScore: number;
  type: 'volume_spike' | 'new_destination' | 'restricted_egress';
}

export interface EgressDestination {
  destination: string;
  destinationType: string;
  eventCount: number;
  lastSeen: number;
}
