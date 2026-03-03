import { describe, it, expect, vi } from 'vitest';
import { ScannerPipeline, worstSeverity, severityRank, severityToVerdict } from './scanner-pipeline.js';
import type { ArtifactScanner, SandboxArtifact, ScanPipelineConfig } from './types.js';
import { randomUUID } from 'node:crypto';
import type { ScanFinding, ScanFindingSeverity, ExternalizationPolicy } from '@secureyeoman/shared';

function makeArtifact(content = 'test'): SandboxArtifact {
  return {
    id: randomUUID(),
    type: 'text/plain',
    content,
    sourceContext: 'test',
    sizeBytes: Buffer.byteLength(content),
  };
}

function makeFinding(overrides: Partial<ScanFinding> = {}): ScanFinding {
  return {
    id: randomUUID(),
    scanner: 'test-scanner',
    severity: 'medium',
    category: 'test',
    message: 'Test finding',
    ...overrides,
  };
}

function makeScanner(findings: ScanFinding[] = [], name = 'test-scanner'): ArtifactScanner {
  return {
    name,
    version: '1.0.0',
    scan: vi.fn().mockResolvedValue(findings),
  };
}

const defaultPolicy: ExternalizationPolicy = {
  enabled: true,
  quarantineThreshold: 'high',
  blockThreshold: 'critical',
  maxFindingsBeforeQuarantine: 50,
  intentScoreQuarantineThreshold: 0.7,
  maxArtifactSizeBytes: 52_428_800,
  redactSecrets: true,
  failOpen: false,
};

describe('worstSeverity', () => {
  it('returns info for empty findings', () => {
    expect(worstSeverity([])).toBe('info');
  });

  it('returns the highest severity', () => {
    const findings = [
      makeFinding({ severity: 'low' }),
      makeFinding({ severity: 'critical' }),
      makeFinding({ severity: 'medium' }),
    ];
    expect(worstSeverity(findings)).toBe('critical');
  });

  it('handles single finding', () => {
    expect(worstSeverity([makeFinding({ severity: 'high' })])).toBe('high');
  });
});

describe('severityRank', () => {
  it('ranks info lowest', () => {
    expect(severityRank('info')).toBe(0);
  });

  it('ranks critical highest', () => {
    expect(severityRank('critical')).toBe(4);
  });

  it('maintains order', () => {
    const order: ScanFindingSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
    for (let i = 0; i < order.length - 1; i++) {
      expect(severityRank(order[i])).toBeLessThan(severityRank(order[i + 1]));
    }
  });
});

describe('severityToVerdict', () => {
  const config: ScanPipelineConfig = {
    maxFindings: 200,
    timeoutMs: 30000,
    failFast: false,
    policy: defaultPolicy,
  };

  it('returns pass for info severity', () => {
    expect(severityToVerdict('info', 0, config)).toBe('pass');
  });

  it('returns warn for low/medium severity', () => {
    expect(severityToVerdict('low', 1, config)).toBe('warn');
    expect(severityToVerdict('medium', 1, config)).toBe('warn');
  });

  it('returns quarantine for high severity', () => {
    expect(severityToVerdict('high', 1, config)).toBe('quarantine');
  });

  it('returns block for critical severity', () => {
    expect(severityToVerdict('critical', 1, config)).toBe('block');
  });

  it('returns quarantine for too many findings', () => {
    expect(severityToVerdict('low', 50, config)).toBe('quarantine');
  });
});

describe('ScannerPipeline', () => {
  it('returns pass for clean artifact', async () => {
    const pipeline = new ScannerPipeline([makeScanner()], { policy: defaultPolicy });
    const result = await pipeline.scan(makeArtifact());
    expect(result.verdict).toBe('pass');
    expect(result.findings).toEqual([]);
  });

  it('aggregates findings from multiple scanners', async () => {
    const s1 = makeScanner([makeFinding({ severity: 'low', scanner: 's1' })], 's1');
    const s2 = makeScanner([makeFinding({ severity: 'medium', scanner: 's2' })], 's2');
    const pipeline = new ScannerPipeline([s1, s2], { policy: defaultPolicy });
    const result = await pipeline.scan(makeArtifact());
    expect(result.findings.length).toBe(2);
    expect(result.worstSeverity).toBe('medium');
    expect(result.verdict).toBe('warn');
  });

  it('records scanner versions', async () => {
    const pipeline = new ScannerPipeline([makeScanner([], 'my-scanner')], { policy: defaultPolicy });
    const result = await pipeline.scan(makeArtifact());
    expect(result.scannerVersions['my-scanner']).toBe('1.0.0');
  });

  it('returns quarantine for high severity findings', async () => {
    const pipeline = new ScannerPipeline(
      [makeScanner([makeFinding({ severity: 'high' })])],
      { policy: defaultPolicy },
    );
    const result = await pipeline.scan(makeArtifact());
    expect(result.verdict).toBe('quarantine');
  });

  it('returns block for critical severity findings', async () => {
    const pipeline = new ScannerPipeline(
      [makeScanner([makeFinding({ severity: 'critical' })])],
      { policy: defaultPolicy },
    );
    const result = await pipeline.scan(makeArtifact());
    expect(result.verdict).toBe('block');
  });

  it('caps findings at maxFindings', async () => {
    const manyFindings = Array.from({ length: 300 }, () => makeFinding());
    const pipeline = new ScannerPipeline([makeScanner(manyFindings)], {
      policy: defaultPolicy,
      maxFindings: 100,
    });
    const result = await pipeline.scan(makeArtifact());
    expect(result.findings.length).toBeLessThanOrEqual(100);
  });

  it('handles scanner errors gracefully', async () => {
    const failingScanner: ArtifactScanner = {
      name: 'failing',
      version: '1.0.0',
      scan: vi.fn().mockRejectedValue(new Error('scanner crash')),
    };
    const okScanner = makeScanner([makeFinding()]);
    const pipeline = new ScannerPipeline([failingScanner, okScanner], { policy: defaultPolicy });
    const result = await pipeline.scan(makeArtifact());
    // Should still have findings from the working scanner
    expect(result.findings.length).toBe(1);
  });

  it('applies failOpen=false when all scanners rejected', async () => {
    // All scanners fail — Promise.allSettled still resolves, no findings produced
    const failingScanner: ArtifactScanner = {
      name: 'failing',
      version: '1.0.0',
      scan: vi.fn().mockRejectedValue(new Error('total failure')),
    };
    const pipeline = new ScannerPipeline([failingScanner], {
      policy: { ...defaultPolicy, failOpen: false },
    });
    const result = await pipeline.scan(makeArtifact());
    // No findings means verdict is pass (scanners silently failed)
    expect(result.verdict).toBe('pass');
    expect(result.findings).toEqual([]);
  });

  it('applies failOpen policy on actual pipeline error', async () => {
    // Force the pipeline's own code path to throw (not the scanner)
    const badScanner: ArtifactScanner = {
      name: 'bad',
      version: '1.0.0',
      scan: vi.fn().mockResolvedValue([makeFinding()]),
    };
    const pipeline = new ScannerPipeline([badScanner], {
      policy: { ...defaultPolicy, failOpen: true },
    });
    // Override scan array to cause pipeline-level error
    (pipeline as any).scanners = null; // Force TypeError when iterating
    const result = await pipeline.scan(makeArtifact());
    expect(result.verdict).toBe('pass');
    expect(result.findings.length).toBe(1);
    expect(result.findings[0].category).toBe('scan_error');
  });

  it('includes scan duration', async () => {
    const pipeline = new ScannerPipeline([makeScanner()], { policy: defaultPolicy });
    const result = await pipeline.scan(makeArtifact());
    expect(result.scanDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('includes scannedAt timestamp', async () => {
    const before = Date.now();
    const pipeline = new ScannerPipeline([makeScanner()], { policy: defaultPolicy });
    const result = await pipeline.scan(makeArtifact());
    expect(result.scannedAt).toBeGreaterThanOrEqual(before);
  });

  it('integrates with threat classifier', async () => {
    const pipeline = new ScannerPipeline(
      [makeScanner([makeFinding({ severity: 'medium' })])],
      { policy: defaultPolicy },
    );
    pipeline.setClassifier({
      classify: () => ({
        classification: 'suspicious',
        intentScore: 0.8,
        killChainStages: ['reconnaissance'],
        matchedPatterns: ['port_scan'],
        escalationTier: 'tier2_alert',
        summary: 'Suspicious activity',
      }),
    });
    const result = await pipeline.scan(makeArtifact());
    // Intent score 0.8 >= threshold 0.7 → upgrade from warn to quarantine
    expect(result.verdict).toBe('quarantine');
    expect(result.threatAssessment).toBeDefined();
    expect(result.threatAssessment?.intentScore).toBe(0.8);
  });

  it('does not run classifier when no findings', async () => {
    const classifyFn = vi.fn();
    const pipeline = new ScannerPipeline([makeScanner()], { policy: defaultPolicy });
    pipeline.setClassifier({ classify: classifyFn });
    await pipeline.scan(makeArtifact());
    expect(classifyFn).not.toHaveBeenCalled();
  });
});
