/**
 * DLP Scanner — evaluates outbound content against active DLP policies.
 *
 * Flow:
 * 1. Classify content via ClassificationEngine
 * 2. Fetch active policies that apply to the destination
 * 3. Evaluate each policy's rules against content
 * 4. Return the strictest action (block > warn > log > allowed)
 */

import type { ClassificationEngine } from './classification-engine.js';
import type { DlpPolicyStore } from './dlp-policy-store.js';
import type { DlpPolicy, DlpScanResult, DlpFinding, ClassificationLevel } from './types.js';
import { CLASSIFICATION_RANK } from './types.js';

export interface DlpScannerConfig {
  /** Default action when no policy matches. */
  defaultAction?: 'allowed' | 'warned';
}

const ACTION_SEVERITY: Record<string, number> = {
  log: 1,
  warn: 2,
  block: 3,
};

const FINDING_SEVERITY_MAP: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
  log: 'low',
  warn: 'medium',
  block: 'high',
};

export class DlpScanner {
  private readonly engine: ClassificationEngine;
  private readonly policyStore: DlpPolicyStore;
  private readonly config: DlpScannerConfig;

  constructor(
    engine: ClassificationEngine,
    policyStore: DlpPolicyStore,
    config?: DlpScannerConfig
  ) {
    this.engine = engine;
    this.policyStore = policyStore;
    this.config = config ?? {};
  }

  async scan(content: string, destination: string, _contentType?: string): Promise<DlpScanResult> {
    // 1. Classify content
    const classification = this.engine.classify(content);

    // 2. Fetch active policies applicable to this destination
    const { policies } = await this.policyStore.list({
      active: true,
      appliesTo: destination,
    });

    if (policies.length === 0) {
      return {
        allowed: true,
        action: this.config.defaultAction ?? 'allowed',
        policyId: null,
        policyName: null,
        findings: [],
        classificationLevel: classification.level,
      };
    }

    // 3. Evaluate each policy
    let strictestAction: 'allowed' | 'blocked' | 'warned' = this.config.defaultAction ?? 'allowed';
    let strictestPolicyId: string | null = null;
    let strictestPolicyName: string | null = null;
    let strictestSeverity = 0;
    const allFindings: DlpFinding[] = [];

    for (const policy of policies) {
      const findings = this.evaluatePolicy(
        policy,
        content,
        classification.level,
        classification.piiFound
      );
      if (findings.length > 0) {
        allFindings.push(...findings);
        const policySeverity = ACTION_SEVERITY[policy.action] ?? 0;
        if (policySeverity > strictestSeverity) {
          strictestSeverity = policySeverity;
          strictestPolicyId = policy.id;
          strictestPolicyName = policy.name;
          if (policy.action === 'block') {
            strictestAction = 'blocked';
          } else if (policy.action === 'warn') {
            strictestAction = 'warned';
          }
        }
      }
    }

    return {
      allowed: strictestAction !== 'blocked',
      action: strictestAction,
      policyId: strictestPolicyId,
      policyName: strictestPolicyName,
      findings: allFindings,
      classificationLevel: classification.level,
    };
  }

  private evaluatePolicy(
    policy: DlpPolicy,
    content: string,
    level: ClassificationLevel,
    piiFound: string[]
  ): DlpFinding[] {
    const findings: DlpFinding[] = [];
    const severity = FINDING_SEVERITY_MAP[policy.action] ?? 'medium';

    for (const rule of policy.rules) {
      switch (rule.type) {
        case 'classification_level': {
          const requiredRank = CLASSIFICATION_RANK[rule.value as ClassificationLevel];
          if (requiredRank !== undefined && CLASSIFICATION_RANK[level] >= requiredRank) {
            findings.push({
              type: 'classification_level',
              description: `Content classified as '${level}' meets or exceeds policy threshold '${rule.value}'`,
              severity,
            });
          }
          break;
        }

        case 'pii_type': {
          if (piiFound.includes(rule.value)) {
            findings.push({
              type: 'pii_type',
              description: `PII type '${rule.value}' detected in content`,
              severity,
            });
          }
          break;
        }

        case 'keyword': {
          if (content.toLowerCase().includes(rule.value.toLowerCase())) {
            findings.push({
              type: 'keyword',
              description: `Keyword '${rule.value}' found in content`,
              severity,
            });
          }
          break;
        }

        case 'pattern': {
          try {
            const re = new RegExp(rule.value, 'gi');
            if (re.test(content)) {
              findings.push({
                type: 'pattern',
                description: `Pattern '${rule.value}' matched in content`,
                severity,
              });
            }
          } catch {
            // Invalid regex — skip
          }
          break;
        }
      }
    }

    return findings;
  }
}
