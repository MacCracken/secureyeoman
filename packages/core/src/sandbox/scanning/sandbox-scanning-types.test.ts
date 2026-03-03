import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  ScanFindingSeveritySchema,
  ScanVerdictSchema,
  ThreatClassificationSchema,
  KillChainStageSchema,
  EscalationTierSchema,
  ScanFindingSchema,
  ThreatAssessmentSchema,
  ScanResultSchema,
  ExternalizationPolicySchema,
  QuarantineEntrySchema,
  ScanHistoryRowSchema,
} from '@secureyeoman/shared';

describe('ScanFindingSeveritySchema', () => {
  it('accepts valid severities', () => {
    for (const s of ['info', 'low', 'medium', 'high', 'critical']) {
      expect(ScanFindingSeveritySchema.parse(s)).toBe(s);
    }
  });

  it('rejects invalid severity', () => {
    expect(() => ScanFindingSeveritySchema.parse('extreme')).toThrow();
  });
});

describe('ScanVerdictSchema', () => {
  it('accepts valid verdicts', () => {
    for (const v of ['pass', 'warn', 'quarantine', 'block']) {
      expect(ScanVerdictSchema.parse(v)).toBe(v);
    }
  });

  it('rejects invalid verdict', () => {
    expect(() => ScanVerdictSchema.parse('allow')).toThrow();
  });
});

describe('ThreatClassificationSchema', () => {
  it('accepts valid classifications', () => {
    for (const c of ['benign', 'suspicious', 'likely_malicious', 'malicious']) {
      expect(ThreatClassificationSchema.parse(c)).toBe(c);
    }
  });

  it('rejects invalid classification', () => {
    expect(() => ThreatClassificationSchema.parse('unknown')).toThrow();
  });
});

describe('KillChainStageSchema', () => {
  it('accepts all 7 stages', () => {
    const stages = [
      'reconnaissance',
      'weaponization',
      'delivery',
      'exploitation',
      'installation',
      'command_and_control',
      'actions_on_objectives',
    ];
    for (const s of stages) {
      expect(KillChainStageSchema.parse(s)).toBe(s);
    }
  });

  it('rejects invalid stage', () => {
    expect(() => KillChainStageSchema.parse('lateral_movement')).toThrow();
  });
});

describe('EscalationTierSchema', () => {
  it('accepts valid tiers', () => {
    for (const t of ['tier1_log', 'tier2_alert', 'tier3_suspend', 'tier4_revoke']) {
      expect(EscalationTierSchema.parse(t)).toBe(t);
    }
  });

  it('rejects invalid tier', () => {
    expect(() => EscalationTierSchema.parse('tier5_nuke')).toThrow();
  });
});

describe('ScanFindingSchema', () => {
  const validFinding = {
    id: randomUUID(),
    scanner: 'code-scanner',
    severity: 'high',
    category: 'injection',
    message: 'Potential command injection detected',
  };

  it('parses valid finding', () => {
    const result = ScanFindingSchema.parse(validFinding);
    expect(result.scanner).toBe('code-scanner');
    expect(result.severity).toBe('high');
  });

  it('accepts optional fields', () => {
    const result = ScanFindingSchema.parse({
      ...validFinding,
      line: 42,
      column: 10,
      evidence: 'exec(userInput)',
      cwe: 'CWE-78',
      recommendation: 'Use parameterized commands',
    });
    expect(result.line).toBe(42);
    expect(result.cwe).toBe('CWE-78');
  });

  it('rejects missing required fields', () => {
    expect(() => ScanFindingSchema.parse({ id: randomUUID() })).toThrow();
  });

  it('rejects scanner name > 64 chars', () => {
    expect(() =>
      ScanFindingSchema.parse({ ...validFinding, scanner: 'x'.repeat(65) })
    ).toThrow();
  });

  it('rejects message > 1024 chars', () => {
    expect(() =>
      ScanFindingSchema.parse({ ...validFinding, message: 'x'.repeat(1025) })
    ).toThrow();
  });
});

describe('ThreatAssessmentSchema', () => {
  it('parses valid assessment', () => {
    const result = ThreatAssessmentSchema.parse({
      classification: 'suspicious',
      intentScore: 0.45,
      killChainStages: ['reconnaissance'],
      matchedPatterns: ['port_scan'],
      escalationTier: 'tier2_alert',
    });
    expect(result.classification).toBe('suspicious');
    expect(result.intentScore).toBe(0.45);
  });

  it('defaults arrays to empty', () => {
    const result = ThreatAssessmentSchema.parse({
      classification: 'benign',
      intentScore: 0.0,
      escalationTier: 'tier1_log',
    });
    expect(result.killChainStages).toEqual([]);
    expect(result.matchedPatterns).toEqual([]);
  });

  it('rejects intentScore > 1', () => {
    expect(() =>
      ThreatAssessmentSchema.parse({
        classification: 'malicious',
        intentScore: 1.5,
        escalationTier: 'tier4_revoke',
      })
    ).toThrow();
  });
});

describe('ScanResultSchema', () => {
  it('parses valid result', () => {
    const result = ScanResultSchema.parse({
      artifactId: randomUUID(),
      verdict: 'pass',
      findings: [],
      worstSeverity: 'info',
      scanDurationMs: 42,
      scannedAt: Date.now(),
    });
    expect(result.verdict).toBe('pass');
    expect(result.findings).toEqual([]);
  });

  it('defaults findings to empty array', () => {
    const result = ScanResultSchema.parse({
      artifactId: randomUUID(),
      verdict: 'warn',
      scannedAt: Date.now(),
    });
    expect(result.findings).toEqual([]);
  });

  it('rejects invalid verdict', () => {
    expect(() =>
      ScanResultSchema.parse({
        artifactId: randomUUID(),
        verdict: 'maybe',
        scannedAt: Date.now(),
      })
    ).toThrow();
  });
});

describe('ExternalizationPolicySchema', () => {
  it('applies all defaults', () => {
    const result = ExternalizationPolicySchema.parse({});
    expect(result.enabled).toBe(true);
    expect(result.quarantineThreshold).toBe('high');
    expect(result.blockThreshold).toBe('critical');
    expect(result.maxFindingsBeforeQuarantine).toBe(50);
    expect(result.intentScoreQuarantineThreshold).toBe(0.7);
    expect(result.maxArtifactSizeBytes).toBe(52_428_800);
    expect(result.redactSecrets).toBe(true);
    expect(result.failOpen).toBe(false);
  });

  it('overrides defaults', () => {
    const result = ExternalizationPolicySchema.parse({
      quarantineThreshold: 'medium',
      failOpen: true,
    });
    expect(result.quarantineThreshold).toBe('medium');
    expect(result.failOpen).toBe(true);
  });
});

describe('QuarantineEntrySchema', () => {
  it('parses valid entry', () => {
    const now = Date.now();
    const result = QuarantineEntrySchema.parse({
      id: randomUUID(),
      artifactId: randomUUID(),
      artifactType: 'text/javascript',
      sourceContext: 'sandbox.run',
      scanResult: {
        artifactId: randomUUID(),
        verdict: 'quarantine',
        scannedAt: now,
      },
      status: 'quarantined',
      createdAt: now,
    });
    expect(result.status).toBe('quarantined');
  });

  it('rejects invalid status', () => {
    expect(() =>
      QuarantineEntrySchema.parse({
        id: randomUUID(),
        artifactId: randomUUID(),
        artifactType: 'text/plain',
        sourceContext: 'test',
        scanResult: {
          artifactId: randomUUID(),
          verdict: 'quarantine',
          scannedAt: Date.now(),
        },
        status: 'pending',
        createdAt: Date.now(),
      })
    ).toThrow();
  });
});

describe('ScanHistoryRowSchema', () => {
  it('parses valid row', () => {
    const result = ScanHistoryRowSchema.parse({
      id: randomUUID(),
      artifactId: randomUUID(),
      artifactType: 'application/json',
      sourceContext: 'workflow.ci',
      verdict: 'pass',
      createdAt: Date.now(),
    });
    expect(result.findingCount).toBe(0);
    expect(result.worstSeverity).toBe('info');
  });

  it('includes optional threat assessment', () => {
    const result = ScanHistoryRowSchema.parse({
      id: randomUUID(),
      artifactId: randomUUID(),
      artifactType: 'text/python',
      sourceContext: 'sandbox.run',
      verdict: 'quarantine',
      findingCount: 5,
      worstSeverity: 'critical',
      intentScore: 0.9,
      threatAssessment: {
        classification: 'malicious',
        intentScore: 0.9,
        escalationTier: 'tier4_revoke',
      },
      createdAt: Date.now(),
    });
    expect(result.threatAssessment?.classification).toBe('malicious');
  });
});
