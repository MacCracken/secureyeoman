/**
 * Audit Chain -> SIEM Bridge (Phase 139)
 *
 * Hooks into audit chain events and DLP egress events, maps severity,
 * and forwards to the SIEM forwarder in real-time.
 */

import type { SiemForwarder, SiemSeverity, SiemEvent } from './siem/siem-forwarder.js';
import type { SecureLogger } from '../logging/logger.js';
import { getCurrentTraceId } from './otel.js';
import { getCurrentSpanId } from './instrument.js';
import { getCorrelationId } from '../utils/correlation-context.js';
import { errorToString } from '../utils/errors.js';

/** Maps audit event names to SIEM severity levels. */
const EVENT_SEVERITY_MAP: Record<string, SiemSeverity> = {
  // High severity — security events
  auth_failure: 'high',
  auth_lockout: 'critical',
  permission_denied: 'high',
  injection_attempt: 'critical',
  rate_limit_exceeded: 'medium',
  audit_chain_tampered: 'critical',

  // Medium severity — configuration changes
  config_changed: 'medium',
  role_assigned: 'medium',
  role_revoked: 'medium',
  user_created: 'medium',
  user_deleted: 'medium',
  sso_provider_created: 'medium',
  sso_provider_updated: 'medium',
  sso_provider_deleted: 'medium',
  tenant_created: 'medium',
  tenant_deleted: 'medium',

  // Low severity — normal operations
  auth_success: 'low',
  ai_request: 'low',
  ai_response: 'low',
  workflow_started: 'low',
  workflow_completed: 'low',
  workflow_failed: 'medium',

  // DLP events
  dlp_blocked: 'high',
  dlp_warned: 'medium',
  dlp_logged: 'low',
  classification_restricted: 'high',
  classification_confidential: 'medium',
};

const DEFAULT_SEVERITY: SiemSeverity = 'low';

export class AuditSiemBridge {
  constructor(
    private readonly forwarder: SiemForwarder,
    private readonly logger: SecureLogger
  ) {}

  /**
   * Forward an audit chain entry to SIEM.
   * Called by AuditChain.record() post-persist hook.
   */
  forwardAuditEvent(entry: {
    event: string;
    level?: string;
    message?: string;
    metadata?: Record<string, unknown>;
    userId?: string;
    tenantId?: string;
  }): void {
    try {
      const siemEvent: SiemEvent = {
        timestamp: new Date().toISOString(),
        source: 'audit-chain',
        event: entry.event,
        severity: EVENT_SEVERITY_MAP[entry.event] ?? DEFAULT_SEVERITY,
        message: entry.message ?? entry.event,
        metadata: entry.metadata ?? {},
        traceId: getCurrentTraceId() ?? undefined,
        spanId: getCurrentSpanId() ?? undefined,
        correlationId: getCorrelationId() ?? undefined,
        tenantId: entry.tenantId,
        userId: entry.userId,
      };
      this.forwarder.forward(siemEvent);
    } catch (err) {
      this.logger.error(
        {
          event: entry.event,
          error: errorToString(err),
        },
        'Failed to bridge audit event to SIEM'
      );
    }
  }

  /**
   * Forward a DLP egress event to SIEM.
   */
  forwardDlpEvent(entry: {
    action: 'blocked' | 'warned' | 'logged';
    destination: string;
    classificationLevel: string;
    findings?: string[];
    userId?: string;
    tenantId?: string;
  }): void {
    try {
      const eventName = `dlp_${entry.action}`;
      const siemEvent: SiemEvent = {
        timestamp: new Date().toISOString(),
        source: 'dlp',
        event: eventName,
        severity: EVENT_SEVERITY_MAP[eventName] ?? 'medium',
        message: `DLP ${entry.action}: content classified as ${entry.classificationLevel} destined for ${entry.destination}`,
        metadata: {
          destination: entry.destination,
          classificationLevel: entry.classificationLevel,
          findings: entry.findings ?? [],
        },
        traceId: getCurrentTraceId() ?? undefined,
        spanId: getCurrentSpanId() ?? undefined,
        correlationId: getCorrelationId() ?? undefined,
        tenantId: entry.tenantId,
        userId: entry.userId,
      };
      this.forwarder.forward(siemEvent);
    } catch (err) {
      this.logger.error(
        {
          action: entry.action,
          error: errorToString(err),
        },
        'Failed to bridge DLP event to SIEM'
      );
    }
  }
}
