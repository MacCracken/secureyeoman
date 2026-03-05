/**
 * Threat Classifier — Intent scoring and threat classification (Phase 116-C)
 *
 * Scores 0.0–1.0 via pattern matching + co-occurrence amplification +
 * finding severity weighting. Maps to ThreatClassification and EscalationTier.
 */

import type { ScanFinding } from '@secureyeoman/shared';
import type { ThreatPattern, ThreatAssessmentResult, SandboxArtifact } from './types.js';
import type { ThreatClassifierIntegration } from './scanner-pipeline.js';
import { BUILTIN_THREAT_PATTERNS } from './threat-patterns.js';

const SEVERITY_WEIGHTS: Record<string, number> = {
  info: 0.05,
  low: 0.15,
  medium: 0.35,
  high: 0.6,
  critical: 0.9,
};

const CO_OCCURRENCE_AMPLIFIER = 1.3;

export class ThreatClassifier implements ThreatClassifierIntegration {
  private readonly patterns: ThreatPattern[];

  constructor(additionalPatterns: ThreatPattern[] = []) {
    this.patterns = [...BUILTIN_THREAT_PATTERNS, ...additionalPatterns];
  }

  classify(findings: ScanFinding[], artifact: SandboxArtifact): ThreatAssessmentResult {
    const content =
      typeof artifact.content === 'string' ? artifact.content : artifact.content.toString('utf-8');

    // Step 1: Match threat patterns against content
    const matchedPatternIds: string[] = [];
    const matchedKillChainStages = new Set<string>();
    let patternIntentSum = 0;

    for (const pattern of this.patterns) {
      let matched = false;
      for (const indicator of pattern.indicators) {
        if (indicator.test(content)) {
          matched = true;
          break;
        }
      }
      if (matched) {
        matchedPatternIds.push(pattern.id);
        matchedKillChainStages.add(pattern.killChainStage);
        patternIntentSum += pattern.intentWeight;
      }
    }

    // Step 2: Finding severity weighting
    let severityScore = 0;
    for (const finding of findings) {
      severityScore += SEVERITY_WEIGHTS[finding.severity] ?? 0;
    }
    // Normalize by count (capped)
    const normalizedSeverity =
      findings.length > 0 ? Math.min(severityScore / findings.length, 1) : 0;

    // Step 3: Co-occurrence amplification
    let coOccurrenceBoost = 1;
    for (const pattern of this.patterns) {
      if (!matchedPatternIds.includes(pattern.id)) continue;
      if (!pattern.coOccurrenceWith) continue;
      for (const coId of pattern.coOccurrenceWith) {
        if (matchedPatternIds.includes(coId)) {
          coOccurrenceBoost *= CO_OCCURRENCE_AMPLIFIER;
          break; // One boost per pattern
        }
      }
    }

    // Step 4: Compute final intent score (0.0–1.0)
    const rawScore =
      matchedPatternIds.length > 0
        ? (patternIntentSum / matchedPatternIds.length) * 0.6 + normalizedSeverity * 0.4
        : normalizedSeverity * 0.5;

    const intentScore = Math.min(rawScore * coOccurrenceBoost, 1.0);

    // Step 5: Classification
    const classification = this.classifyScore(intentScore);
    const escalationTier = this.scoreToEscalationTier(intentScore);

    // Step 6: Summary
    const summary = this.buildSummary(matchedPatternIds, classification, intentScore);

    return {
      classification,
      intentScore: Math.round(intentScore * 1000) / 1000,
      killChainStages: Array.from(matchedKillChainStages),
      matchedPatterns: matchedPatternIds,
      escalationTier,
      summary,
    };
  }

  private classifyScore(score: number): string {
    if (score < 0.2) return 'benign';
    if (score < 0.5) return 'suspicious';
    if (score < 0.8) return 'likely_malicious';
    return 'malicious';
  }

  private scoreToEscalationTier(score: number): string {
    if (score < 0.2) return 'tier1_log';
    if (score < 0.5) return 'tier2_alert';
    if (score < 0.8) return 'tier3_suspend';
    return 'tier4_revoke';
  }

  private buildSummary(matchedPatterns: string[], classification: string, score: number): string {
    if (matchedPatterns.length === 0) {
      return `Classification: ${classification} (score: ${score.toFixed(2)}). No known threat patterns matched.`;
    }
    const patternNames = matchedPatterns
      .map((id) => this.patterns.find((p) => p.id === id)?.name ?? id)
      .slice(0, 5);
    return `Classification: ${classification} (score: ${score.toFixed(2)}). Matched patterns: ${patternNames.join(', ')}.`;
  }
}
