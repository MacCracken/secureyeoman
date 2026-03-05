/**
 * Externalization Gate — Scans sandbox outputs before release (Phase 116-B)
 *
 * Wraps SandboxResult<T>, extracts artifacts, runs scanning pipeline,
 * applies externalization policy. Transparent to callers.
 */

import { randomUUID } from 'node:crypto';
import type { ScanResult, ExternalizationPolicy } from '@secureyeoman/shared';
import type { SandboxResult } from '../types.js';
import type { ScanReport, SandboxArtifact } from './types.js';
import type { ScannerPipeline } from './scanner-pipeline.js';
import type { QuarantineStorage } from './quarantine-storage.js';
import type { ScanHistoryStore } from './scan-history-store.js';
import type { SecretsScanner } from './secrets-scanner.js';

export interface ExternalizationGateDeps {
  pipeline: ScannerPipeline;
  quarantineStorage?: QuarantineStorage | null;
  scanHistoryStore?: ScanHistoryStore | null;
  secretsScanner?: SecretsScanner | null;
  policy: ExternalizationPolicy;
  getAlertManager?: () => {
    fire: (type: string, severity: string, message: string, meta?: Record<string, unknown>) => void;
  } | null;
  auditChain?: {
    record: (
      event: string,
      level: string,
      message: string,
      metadata?: Record<string, unknown>
    ) => Promise<void>;
  } | null;
  escalationManager?: {
    handleEscalation: (scanResult: ScanResult, artifact: SandboxArtifact) => Promise<void>;
  } | null;
  offenderTracker?: {
    track: (
      userId: string | undefined,
      personalityId: string | undefined,
      scanResult: ScanResult
    ) => void;
  } | null;
}

export interface GatedResult<T> {
  sandboxResult: SandboxResult<T>;
  scanReport?: ScanReport;
}

export class ExternalizationGate {
  private readonly deps: ExternalizationGateDeps;

  constructor(deps: ExternalizationGateDeps) {
    this.deps = deps;
  }

  /**
   * Gate a sandbox result through the scanning pipeline.
   * Returns the original result (possibly with redacted content) plus a scan report.
   */
  async gate<T>(
    sandboxResult: SandboxResult<T>,
    meta: {
      sourceContext: string;
      personalityId?: string;
      userId?: string;
      artifactType?: string;
    }
  ): Promise<GatedResult<T>> {
    if (!this.deps.policy.enabled) {
      return { sandboxResult };
    }

    // Extract artifact from sandbox result
    const content = this.extractContent(sandboxResult);
    if (!content) {
      return { sandboxResult };
    }

    const artifact: SandboxArtifact = {
      id: randomUUID(),
      type: meta.artifactType ?? 'application/octet-stream',
      content,
      sourceContext: meta.sourceContext,
      personalityId: meta.personalityId,
      userId: meta.userId,
      sizeBytes: typeof content === 'string' ? Buffer.byteLength(content) : content.length,
    };

    // Check size limit
    if (artifact.sizeBytes > this.deps.policy.maxArtifactSizeBytes) {
      const scanResult: ScanResult = {
        artifactId: artifact.id,
        verdict: 'block',
        findings: [
          {
            id: randomUUID(),
            scanner: 'externalization-gate',
            severity: 'high',
            category: 'oversized',
            message: `Artifact exceeds size limit (${artifact.sizeBytes} bytes)`,
          },
        ],
        worstSeverity: 'high',
        scanDurationMs: 0,
        scannerVersions: {},
        scannedAt: Date.now(),
      };

      await this.recordAndAudit(scanResult, artifact);

      return {
        sandboxResult: {
          ...sandboxResult,
          success: false,
          error: new Error('Artifact blocked: exceeds size limit'),
        },
        scanReport: { scanResult, redacted: false, gateDecision: 'block' },
      };
    }

    // Run scanning pipeline
    const scanResult = await this.deps.pipeline.scan(artifact);

    // Record to history
    await this.recordAndAudit(scanResult, artifact);

    // Apply verdict
    switch (scanResult.verdict) {
      case 'pass':
        return {
          sandboxResult,
          scanReport: { scanResult, redacted: false, gateDecision: 'pass' },
        };

      case 'warn': {
        // Redact secrets if policy allows
        if (this.deps.policy.redactSecrets && this.deps.secretsScanner) {
          const redacted = this.redactResult(sandboxResult, this.deps.secretsScanner);
          return {
            sandboxResult: redacted,
            scanReport: { scanResult, redacted: true, gateDecision: 'redact' },
          };
        }
        return {
          sandboxResult,
          scanReport: { scanResult, redacted: false, gateDecision: 'pass' },
        };
      }

      case 'quarantine': {
        // Quarantine the artifact
        let quarantineId: string | undefined;
        if (this.deps.quarantineStorage) {
          const entry = await this.deps.quarantineStorage.quarantine(content, scanResult, {
            artifactType: artifact.type,
            sourceContext: artifact.sourceContext,
            personalityId: artifact.personalityId,
            userId: artifact.userId,
          });
          quarantineId = entry.id;
        }

        // Escalation
        if (this.deps.escalationManager) {
          await this.deps.escalationManager.handleEscalation(scanResult, artifact);
        }
        if (this.deps.offenderTracker) {
          this.deps.offenderTracker.track(artifact.userId, artifact.personalityId, scanResult);
        }

        // Fire alert
        const alertMgr = this.deps.getAlertManager?.();
        if (alertMgr) {
          alertMgr.fire(
            'artifact_quarantined',
            scanResult.worstSeverity,
            `Artifact quarantined: ${scanResult.findings.length} findings (worst: ${scanResult.worstSeverity})`,
            { artifactId: artifact.id, quarantineId, sourceContext: artifact.sourceContext }
          );
        }

        return {
          sandboxResult: {
            ...sandboxResult,
            success: false,
            error: new Error(
              `Artifact quarantined (${quarantineId ?? 'no-store'}): ${scanResult.findings.length} findings`
            ),
            violations: [
              ...sandboxResult.violations,
              {
                type: 'scanning' as const,
                description: `Artifact quarantined: ${scanResult.worstSeverity} severity detected`,
                timestamp: Date.now(),
              },
            ],
          },
          scanReport: { scanResult, quarantineId, redacted: false, gateDecision: 'quarantine' },
        };
      }

      case 'block': {
        // Escalation
        if (this.deps.escalationManager) {
          await this.deps.escalationManager.handleEscalation(scanResult, artifact);
        }
        if (this.deps.offenderTracker) {
          this.deps.offenderTracker.track(artifact.userId, artifact.personalityId, scanResult);
        }

        // Fire alert
        const alertMgr = this.deps.getAlertManager?.();
        if (alertMgr) {
          alertMgr.fire(
            'artifact_blocked',
            'critical',
            `Artifact blocked: critical threat detected`,
            { artifactId: artifact.id, sourceContext: artifact.sourceContext }
          );
        }

        return {
          sandboxResult: {
            ...sandboxResult,
            success: false,
            error: new Error(
              `Artifact blocked: critical threat detected (${scanResult.findings.length} findings)`
            ),
            violations: [
              ...sandboxResult.violations,
              {
                type: 'scanning' as const,
                description: 'Artifact blocked by externalization gate',
                timestamp: Date.now(),
              },
            ],
          },
          scanReport: { scanResult, redacted: false, gateDecision: 'block' },
        };
      }

      default:
        return { sandboxResult };
    }
  }

  private extractContent<T>(result: SandboxResult<T>): string | Buffer | null {
    if (result.result == null) return null;
    if (typeof result.result === 'string') return result.result;
    if (Buffer.isBuffer(result.result)) return result.result;
    try {
      return JSON.stringify(result.result);
    } catch {
      return String(result.result);
    }
  }

  private redactResult<T>(
    result: SandboxResult<T>,
    secretsScanner: SecretsScanner
  ): SandboxResult<T> {
    if (typeof result.result === 'string') {
      return { ...result, result: secretsScanner.redact(result.result) as T };
    }
    return result;
  }

  private async recordAndAudit(scanResult: ScanResult, artifact: SandboxArtifact): Promise<void> {
    // Record to scan history
    if (this.deps.scanHistoryStore) {
      try {
        await this.deps.scanHistoryStore.record({
          artifactId: artifact.id,
          artifactType: artifact.type,
          sourceContext: artifact.sourceContext,
          personalityId: artifact.personalityId,
          userId: artifact.userId,
          scanResult,
        });
      } catch {
        // Non-critical — don't fail the gate
      }
    }

    // Audit
    if (this.deps.auditChain && scanResult.verdict !== 'pass') {
      try {
        await this.deps.auditChain.record(
          'artifact_scanned',
          scanResult.verdict === 'block' ? 'security' : 'info',
          `Artifact scanned: verdict=${scanResult.verdict}, findings=${scanResult.findings.length}`,
          {
            artifactId: artifact.id,
            verdict: scanResult.verdict,
            worstSeverity: scanResult.worstSeverity,
            findingCount: scanResult.findings.length,
            sourceContext: artifact.sourceContext,
            threatAssessment: scanResult.threatAssessment,
          }
        );
      } catch {
        // Non-critical
      }
    }
  }
}
