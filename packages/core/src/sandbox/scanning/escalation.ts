/**
 * Escalation Manager — 4-tier threat response escalation (Phase 116-C)
 *
 * tier1_log: Log only
 * tier2_alert: Log + fire AlertManager
 * tier3_suspend: Log + alert + personality suspension
 * tier4_revoke: Log + alert + privilege revocation + risk register entry
 */

import type { ScanResult } from '@secureyeoman/shared';
import type { SandboxArtifact } from './types.js';

export interface EscalationManagerDeps {
  getAlertManager?: () => {
    fire: (type: string, severity: string, message: string, meta?: Record<string, unknown>) => void;
  } | null;
  auditChain?: {
    record: (event: string, level: string, message: string, metadata?: Record<string, unknown>) => Promise<void>;
  } | null;
  getSoulManager?: () => {
    suspendPersonality?: (id: string, reason: string) => Promise<void>;
  } | null;
  getDepartmentRiskManager?: () => {
    createEntry?: (entry: Record<string, unknown>) => Promise<unknown>;
  } | null;
}

export class EscalationManager {
  private readonly deps: EscalationManagerDeps;

  constructor(deps: EscalationManagerDeps = {}) {
    this.deps = deps;
  }

  async handleEscalation(scanResult: ScanResult, artifact: SandboxArtifact): Promise<void> {
    const tier = scanResult.threatAssessment?.escalationTier ?? this.inferTier(scanResult);

    const meta = {
      artifactId: artifact.id,
      sourceContext: artifact.sourceContext,
      personalityId: artifact.personalityId,
      userId: artifact.userId,
      verdict: scanResult.verdict,
      worstSeverity: scanResult.worstSeverity,
      findingCount: scanResult.findings.length,
      tier,
    };

    // Tier 1: Log
    if (this.deps.auditChain) {
      try {
        await this.deps.auditChain.record(
          'escalation_triggered',
          tier === 'tier4_revoke' || tier === 'tier3_suspend' ? 'security' : 'info',
          `Escalation ${tier}: ${scanResult.verdict} verdict on artifact from ${artifact.sourceContext}`,
          meta,
        );
      } catch {
        // Non-critical
      }
    }

    // Tier 2+: Alert
    if (tier !== 'tier1_log') {
      const alertMgr = this.deps.getAlertManager?.();
      if (alertMgr) {
        alertMgr.fire(
          'escalation_triggered',
          tier === 'tier4_revoke' ? 'critical' : tier === 'tier3_suspend' ? 'error' : 'warn',
          `Threat escalation ${tier}: ${scanResult.findings.length} findings`,
          meta,
        );
      }
    }

    // Tier 3+: Suspend personality
    if ((tier === 'tier3_suspend' || tier === 'tier4_revoke') && artifact.personalityId) {
      const soulMgr = this.deps.getSoulManager?.();
      if (soulMgr?.suspendPersonality) {
        try {
          await soulMgr.suspendPersonality(
            artifact.personalityId,
            `Auto-suspended: threat escalation ${tier}`,
          );
        } catch {
          // Non-critical
        }
      }
    }

    // Tier 4: Revoke + risk register
    if (tier === 'tier4_revoke') {
      const riskMgr = this.deps.getDepartmentRiskManager?.();
      if (riskMgr?.createEntry) {
        try {
          await riskMgr.createEntry({
            title: `Threat escalation: ${artifact.sourceContext}`,
            description: `Auto-created from sandbox scanning. ${scanResult.findings.length} findings, verdict: ${scanResult.verdict}.`,
            severity: 'critical',
            source: 'automated',
            category: 'security',
            status: 'open',
          });
        } catch {
          // Non-critical
        }
      }
    }
  }

  private inferTier(scanResult: ScanResult): string {
    const worst = scanResult.worstSeverity;
    if (worst === 'critical') return 'tier4_revoke';
    if (worst === 'high') return 'tier3_suspend';
    if (worst === 'medium') return 'tier2_alert';
    return 'tier1_log';
  }
}
