/**
 * Internal Sandbox Scanning Types (Phase 116)
 *
 * Interfaces used within the scanning engine — not shared externally.
 */

import type { ScanFinding, ScanResult, ExternalizationPolicy } from '@secureyeoman/shared';

/** Artifact extracted from a sandbox result for scanning. */
export interface SandboxArtifact {
  /** Unique identifier for this artifact. */
  id: string;
  /** MIME-like type (e.g. 'text/javascript', 'application/json', 'binary/elf'). */
  type: string;
  /** Raw content as string or Buffer. */
  content: string | Buffer;
  /** Where the artifact came from (e.g. 'sandbox.run', 'training.export', 'workflow.ci'). */
  sourceContext: string;
  /** Optional personality that produced it. */
  personalityId?: string;
  /** Optional user who triggered it. */
  userId?: string;
  /** Optional file name / path. */
  filename?: string;
  /** Size in bytes. */
  sizeBytes: number;
}

/** Interface all scanners must implement. */
export interface ArtifactScanner {
  /** Human-readable scanner name (e.g. 'code-scanner'). */
  readonly name: string;
  /** Semver version string. */
  readonly version: string;
  /** Scan an artifact and return findings. */
  scan(artifact: SandboxArtifact, signal?: AbortSignal): Promise<ScanFinding[]>;
}

/** Configuration for the scanning pipeline. */
export interface ScanPipelineConfig {
  /** Maximum total findings before short-circuiting. */
  maxFindings: number;
  /** Timeout for the entire pipeline in ms. */
  timeoutMs: number;
  /** Whether to stop on first critical finding. */
  failFast: boolean;
  /** Policy to determine verdict from findings. */
  policy: ExternalizationPolicy;
}

/** Threat pattern definition for the classifier. */
export interface ThreatPattern {
  id: string;
  name: string;
  category: string;
  description: string;
  killChainStage: string;
  indicators: RegExp[];
  coOccurrenceWith?: string[];
  intentWeight: number;
  version: string;
}

/** Output of the threat classifier. */
export interface ThreatAssessmentResult {
  classification: string;
  intentScore: number;
  killChainStages: string[];
  matchedPatterns: string[];
  escalationTier: string;
  summary: string;
}

/** Scan report attached to gated sandbox results. */
export interface ScanReport {
  scanResult: ScanResult;
  quarantineId?: string;
  redacted: boolean;
  gateDecision: 'pass' | 'redact' | 'quarantine' | 'block';
}
