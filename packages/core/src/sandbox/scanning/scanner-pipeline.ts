/**
 * Scanner Pipeline — Orchestrates all scanners, aggregates findings (Phase 116-A)
 *
 * Runs scanners via Promise.allSettled, applies AbortController for failFast,
 * computes worst severity and verdict from policy.
 */

import { randomUUID } from 'node:crypto';
import type { ScanFinding, ScanFindingSeverity, ScanResult, ScanVerdict } from '@secureyeoman/shared';
import type { ArtifactScanner, SandboxArtifact, ScanPipelineConfig, ThreatAssessmentResult } from './types.js';

const SEVERITY_ORDER: ScanFindingSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
const DEFAULT_MAX_FINDINGS = 200;
const DEFAULT_TIMEOUT_MS = 30_000;

export function worstSeverity(findings: ScanFinding[]): ScanFindingSeverity {
  let worst: ScanFindingSeverity = 'info';
  for (const f of findings) {
    if (severityRank(f.severity) > severityRank(worst)) {
      worst = f.severity;
    }
  }
  return worst;
}

export function severityRank(s: ScanFindingSeverity): number {
  return SEVERITY_ORDER.indexOf(s);
}

export function severityToVerdict(
  worst: ScanFindingSeverity,
  findingCount: number,
  config: ScanPipelineConfig,
): ScanVerdict {
  const policy = config.policy;

  // Block threshold
  if (severityRank(worst) >= severityRank(policy.blockThreshold)) {
    return 'block';
  }

  // Quarantine threshold
  if (severityRank(worst) >= severityRank(policy.quarantineThreshold)) {
    return 'quarantine';
  }

  // Too many findings
  if (findingCount >= policy.maxFindingsBeforeQuarantine) {
    return 'quarantine';
  }

  // Any non-info findings → warn
  if (worst !== 'info') {
    return 'warn';
  }

  return 'pass';
}

/** Interface for optional threat classifier integration. */
export interface ThreatClassifierIntegration {
  classify(findings: ScanFinding[], artifact: SandboxArtifact): ThreatAssessmentResult;
}

export class ScannerPipeline {
  private readonly scanners: ArtifactScanner[];
  private readonly config: ScanPipelineConfig;
  private classifier: ThreatClassifierIntegration | null = null;

  constructor(scanners: ArtifactScanner[], config: Partial<ScanPipelineConfig> = {}) {
    this.scanners = scanners;
    this.config = {
      maxFindings: config.maxFindings ?? DEFAULT_MAX_FINDINGS,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      failFast: config.failFast ?? false,
      policy: config.policy ?? {
        enabled: true,
        quarantineThreshold: 'high',
        blockThreshold: 'critical',
        maxFindingsBeforeQuarantine: 50,
        intentScoreQuarantineThreshold: 0.7,
        maxArtifactSizeBytes: 52_428_800,
        redactSecrets: true,
        failOpen: false,
      },
    };
  }

  setClassifier(classifier: ThreatClassifierIntegration): void {
    this.classifier = classifier;
  }

  async scan(artifact: SandboxArtifact): Promise<ScanResult> {
    const startTime = Date.now();
    const ac = new AbortController();

    // Timeout
    const timer = setTimeout(() => ac.abort(), this.config.timeoutMs);

    try {
      const allFindings: ScanFinding[] = [];

      // Run all scanners concurrently
      const results = await Promise.allSettled(
        this.scanners.map(async (scanner) => {
          const findings = await scanner.scan(artifact, ac.signal);

          if (this.config.failFast) {
            // Check for critical findings → abort others
            const hasCritical = findings.some((f) => f.severity === 'critical');
            if (hasCritical) {
              ac.abort();
            }
          }

          return { scanner: scanner.name, version: scanner.version, findings };
        }),
      );

      const scannerVersions: Record<string, string> = {};

      for (const result of results) {
        if (result.status === 'fulfilled') {
          scannerVersions[result.value.scanner] = result.value.version;
          for (const f of result.value.findings) {
            if (allFindings.length < this.config.maxFindings) {
              allFindings.push(f);
            }
          }
        }
        // Rejected scanners are silently skipped (logged upstream)
      }

      const worst = worstSeverity(allFindings);
      let verdict = severityToVerdict(worst, allFindings.length, this.config);
      const scanDurationMs = Date.now() - startTime;

      // Run threat classifier if available and there are findings
      let threatAssessment: ThreatAssessmentResult | undefined;
      if (this.classifier && allFindings.length > 0) {
        threatAssessment = this.classifier.classify(allFindings, artifact);

        // Intent score can upgrade verdict
        if (
          threatAssessment.intentScore >= this.config.policy.intentScoreQuarantineThreshold &&
          verdict === 'warn'
        ) {
          verdict = 'quarantine';
        }
      }

      const scanResult: ScanResult = {
        artifactId: artifact.id,
        verdict,
        findings: allFindings,
        worstSeverity: worst,
        scanDurationMs,
        scannerVersions,
        scannedAt: Date.now(),
      };

      if (threatAssessment) {
        scanResult.threatAssessment = {
          classification: threatAssessment.classification as ScanResult['threatAssessment'] extends infer T
            ? T extends { classification: infer C } ? C : never : never,
          intentScore: threatAssessment.intentScore,
          killChainStages: threatAssessment.killChainStages as ScanResult['threatAssessment'] extends infer T
            ? T extends { killChainStages: infer K } ? K : never : never,
          matchedPatterns: threatAssessment.matchedPatterns,
          escalationTier: threatAssessment.escalationTier as ScanResult['threatAssessment'] extends infer T
            ? T extends { escalationTier: infer E } ? E : never : never,
          summary: threatAssessment.summary,
        };
      }

      return scanResult;
    } catch (err) {
      // Scanner pipeline failure — apply failOpen policy
      const scanDurationMs = Date.now() - startTime;
      return {
        artifactId: artifact.id,
        verdict: this.config.policy.failOpen ? 'pass' : 'quarantine',
        findings: [{
          id: randomUUID(),
          scanner: 'scanner-pipeline',
          severity: 'high',
          category: 'scan_error',
          message: `Pipeline error: ${err instanceof Error ? err.message : String(err)}`,
        }],
        worstSeverity: 'high',
        scanDurationMs,
        scannerVersions: {},
        scannedAt: Date.now(),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
