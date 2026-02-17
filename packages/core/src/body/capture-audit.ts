/**
 * Capture Audit Events
 *
 * Specialized audit event types and logging for screen capture operations.
 * Extends the base audit chain with capture-specific events and provenance tracking.
 *
 * @see ADR 014: Screen Capture Security Architecture
 * @see NEXT_STEP_04: Audit Logging Integration
 */

import type { CaptureScope, CaptureResource } from '../body/types.js';

/**
 * Capture event types for audit logging
 */
export type CaptureEventType =
  | 'capture.requested' // User requests capture
  | 'capture.approved' // Consent granted
  | 'capture.denied' // Consent denied
  | 'capture.started' // Capture begins
  | 'capture.completed' // Capture successful
  | 'capture.failed' // Capture error
  | 'capture.stopped' // User stopped early
  | 'capture.expired' // Time limit reached
  | 'capture.accessed' // Someone viewed the capture
  | 'capture.deleted' // Capture deleted
  | 'capture.exported' // Data exported
  | 'consent.revoked'; // Active consent revoked

/**
 * Result of a capture operation
 */
export interface CaptureResult {
  success: boolean;
  action?: string;
  error?: string;
  captureId?: string;
  fileSize?: number;
  duration?: number;
}

/**
 * Capture-specific audit event
 * Extends base audit entry with capture context
 */
export interface CaptureAuditEvent {
  /** Unique identifier (UUID v7) */
  id: string;

  /** Unix timestamp (ms) */
  timestamp: number;

  /** Event type */
  eventType: CaptureEventType;

  /** Session ID */
  sessionId: string;

  /** User who performed the action */
  userId: string;

  /** Role of the user */
  roleId: string;

  /** Associated consent ID */
  consentId: string;

  /** What was requested/captured */
  scope: CaptureScope;

  /** Operation result */
  result: CaptureResult;

  /** Additional metadata */
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    correlationId?: string;
    location?: string;
    deviceInfo?: string;
  };

  /** SHA-256 hash of event data (for integrity) */
  hash: string;

  /** Hash of previous event (blockchain-style chain) */
  previousHash: string;

  /** HMAC-SHA256 signature */
  signature: string;
}

/**
 * Data provenance tracking for captured content
 */
export interface DataProvenance {
  /** Unique capture ID */
  captureId: string;

  /** When capture was created */
  createdAt: number;

  /** Who created the capture */
  createdBy: string;

  /** Associated consent ID */
  consentId: string;

  /** Scope of the capture */
  scope: CaptureScope;

  /** SHA-256 hash of content at creation */
  contentHash: string;

  /** Chain of custody - every access recorded */
  custodyChain: {
    timestamp: number;
    action: 'created' | 'viewed' | 'copied' | 'exported' | 'deleted' | 'modified';
    actor: string;
    location?: string;
    reason?: string;
  }[];
}

/**
 * Anomaly detection result
 */
export interface Anomaly {
  /** Anomaly type */
  type: 'high_frequency' | 'after_hours' | 'large_scope' | 'unusual_access' | 'failed_attempts';

  /** User ID associated with anomaly */
  userId: string;

  /** Severity level */
  severity: 'info' | 'warning' | 'critical';

  /** Description */
  details: string;

  /** Related event IDs */
  eventIds?: string[];

  /** Timestamp of detection */
  detectedAt: number;
}

/**
 * Compliance report structure
 */
export interface ComplianceReport {
  /** Report period */
  period: {
    start: Date;
    end: Date;
  };

  /** Summary statistics */
  summary: {
    totalRequests: number;
    totalApproved: number;
    totalDenied: number;
    totalCompleted: number;
    totalFailed: number;
    totalStopped: number;
    totalExpired: number;
    totalAccessed: number;
    totalDeleted: number;
    totalExported: number;
  };

  /** Aggregated by user */
  byUser: {
    userId: string;
    requests: number;
    approved: number;
    denied: number;
    completed: number;
  }[];

  /** Aggregated by resource type */
  byResource: {
    resource: CaptureResource;
    requests: number;
    completed: number;
  }[];

  /** Chain integrity verification */
  chainIntegrity: {
    valid: boolean;
    totalEvents: number;
    errors?: string[];
  };

  /** Detected anomalies */
  anomalies: Anomaly[];

  /** Report generation timestamp */
  generatedAt: Date;
}

/**
 * Filter options for audit queries
 */
export interface AuditFilter {
  /** Start date */
  startDate?: Date;

  /** End date */
  endDate?: Date;

  /** Event types to include */
  eventTypes?: CaptureEventType[];

  /** User IDs to filter */
  userIds?: string[];

  /** Resource types */
  resources?: CaptureResource[];

  /** Success/failure filter */
  success?: boolean;
}

/**
 * High-risk event detection rules
 */
export interface RiskDetectionRules {
  /** Maximum requests per hour before alert */
  maxRequestsPerHour: number;

  /** Maximum duration that triggers alert (seconds) */
  maxDurationAlert: number;

  /** Business hours (hour of day, 0-23) */
  businessHours: {
    start: number;
    end: number;
  };

  /** Maximum failed attempts before alert */
  maxFailedAttempts: number;
}

/**
 * Default risk detection rules
 */
export const DEFAULT_RISK_RULES: RiskDetectionRules = {
  maxRequestsPerHour: 10,
  maxDurationAlert: 300, // 5 minutes
  businessHours: {
    start: 9,
    end: 17,
  },
  maxFailedAttempts: 5,
};
