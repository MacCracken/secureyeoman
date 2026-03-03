import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExternalizationGate } from './externalization-gate.js';
import type { ExternalizationGateDeps } from './externalization-gate.js';
import type { ScannerPipeline } from './scanner-pipeline.js';
import type { SandboxResult } from '../types.js';
import type { ScanResult, ExternalizationPolicy } from '@secureyeoman/shared';
import { randomUUID } from 'node:crypto';

function makePolicy(overrides: Partial<ExternalizationPolicy> = {}): ExternalizationPolicy {
  return {
    enabled: true,
    quarantineThreshold: 'high',
    blockThreshold: 'critical',
    maxFindingsBeforeQuarantine: 50,
    intentScoreQuarantineThreshold: 0.7,
    maxArtifactSizeBytes: 52_428_800,
    redactSecrets: true,
    failOpen: false,
    ...overrides,
  };
}

function makeScanResult(verdict: ScanResult['verdict'] = 'pass', overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    artifactId: randomUUID(),
    verdict,
    findings: [],
    worstSeverity: 'info',
    scanDurationMs: 5,
    scannerVersions: {},
    scannedAt: Date.now(),
    ...overrides,
  };
}

function makeSandboxResult<T>(result: T): SandboxResult<T> {
  return {
    success: true,
    result,
    violations: [],
  };
}

function makePipeline(scanResult: ScanResult): ScannerPipeline {
  return {
    scan: vi.fn().mockResolvedValue(scanResult),
    setClassifier: vi.fn(),
  } as unknown as ScannerPipeline;
}

describe('ExternalizationGate', () => {
  let deps: ExternalizationGateDeps;
  let gate: ExternalizationGate;

  beforeEach(() => {
    deps = {
      pipeline: makePipeline(makeScanResult('pass')),
      policy: makePolicy(),
      quarantineStorage: null,
      scanHistoryStore: null,
      secretsScanner: null,
    };
    gate = new ExternalizationGate(deps);
  });

  it('passes through when policy is disabled', async () => {
    deps.policy.enabled = false;
    gate = new ExternalizationGate(deps);
    const result = await gate.gate(makeSandboxResult('hello'), { sourceContext: 'test' });
    expect(result.sandboxResult.result).toBe('hello');
    expect(result.scanReport).toBeUndefined();
  });

  it('passes through when result is null', async () => {
    const result = await gate.gate(makeSandboxResult(null), { sourceContext: 'test' });
    expect(result.scanReport).toBeUndefined();
  });

  it('returns pass for clean string result', async () => {
    const result = await gate.gate(makeSandboxResult('clean output'), { sourceContext: 'test' });
    expect(result.scanReport?.gateDecision).toBe('pass');
    expect(result.sandboxResult.success).toBe(true);
    expect(result.sandboxResult.result).toBe('clean output');
  });

  it('returns pass for clean object result', async () => {
    const result = await gate.gate(makeSandboxResult({ key: 'value' }), { sourceContext: 'test' });
    expect(result.scanReport?.gateDecision).toBe('pass');
  });

  it('blocks oversized artifacts', async () => {
    deps.policy.maxArtifactSizeBytes = 10;
    gate = new ExternalizationGate(deps);
    const result = await gate.gate(makeSandboxResult('a very long string that exceeds the limit'), {
      sourceContext: 'test',
    });
    expect(result.scanReport?.gateDecision).toBe('block');
    expect(result.sandboxResult.success).toBe(false);
  });

  it('handles warn verdict with secret redaction', async () => {
    const secretsScanner = { redact: vi.fn().mockReturnValue('redacted content') };
    deps.pipeline = makePipeline(makeScanResult('warn'));
    deps.secretsScanner = secretsScanner as any;
    gate = new ExternalizationGate(deps);

    const result = await gate.gate(makeSandboxResult('secret content'), { sourceContext: 'test' });
    expect(result.scanReport?.gateDecision).toBe('redact');
    expect(result.scanReport?.redacted).toBe(true);
    expect(result.sandboxResult.result).toBe('redacted content');
  });

  it('handles warn verdict without redaction', async () => {
    deps.pipeline = makePipeline(makeScanResult('warn'));
    deps.policy.redactSecrets = false;
    gate = new ExternalizationGate(deps);

    const result = await gate.gate(makeSandboxResult('content'), { sourceContext: 'test' });
    expect(result.scanReport?.gateDecision).toBe('pass');
    expect(result.scanReport?.redacted).toBe(false);
  });

  it('quarantines high-severity findings', async () => {
    const quarantineStorage = {
      quarantine: vi.fn().mockResolvedValue({ id: 'q-123' }),
    };
    deps.pipeline = makePipeline(makeScanResult('quarantine', {
      findings: [{ id: randomUUID(), scanner: 'test', severity: 'high', category: 'test', message: 'bad' }],
      worstSeverity: 'high',
    }));
    deps.quarantineStorage = quarantineStorage as any;
    gate = new ExternalizationGate(deps);

    const result = await gate.gate(makeSandboxResult('malicious code'), { sourceContext: 'sandbox.run' });
    expect(result.scanReport?.gateDecision).toBe('quarantine');
    expect(result.scanReport?.quarantineId).toBe('q-123');
    expect(result.sandboxResult.success).toBe(false);
    expect(quarantineStorage.quarantine).toHaveBeenCalled();
  });

  it('blocks critical findings', async () => {
    deps.pipeline = makePipeline(makeScanResult('block', {
      findings: [{ id: randomUUID(), scanner: 'test', severity: 'critical', category: 'test', message: 'critical' }],
      worstSeverity: 'critical',
    }));
    gate = new ExternalizationGate(deps);

    const result = await gate.gate(makeSandboxResult('exploit'), { sourceContext: 'test' });
    expect(result.scanReport?.gateDecision).toBe('block');
    expect(result.sandboxResult.success).toBe(false);
  });

  it('adds scanning violation on quarantine', async () => {
    deps.pipeline = makePipeline(makeScanResult('quarantine'));
    gate = new ExternalizationGate(deps);

    const result = await gate.gate(makeSandboxResult('bad'), { sourceContext: 'test' });
    const scanViolation = result.sandboxResult.violations.find((v) => v.type === 'scanning');
    expect(scanViolation).toBeDefined();
  });

  it('adds scanning violation on block', async () => {
    deps.pipeline = makePipeline(makeScanResult('block'));
    gate = new ExternalizationGate(deps);

    const result = await gate.gate(makeSandboxResult('bad'), { sourceContext: 'test' });
    const scanViolation = result.sandboxResult.violations.find((v) => v.type === 'scanning');
    expect(scanViolation).toBeDefined();
  });

  it('fires alert on quarantine', async () => {
    const alertMgr = { fire: vi.fn() };
    deps.pipeline = makePipeline(makeScanResult('quarantine'));
    deps.getAlertManager = () => alertMgr;
    gate = new ExternalizationGate(deps);

    await gate.gate(makeSandboxResult('bad'), { sourceContext: 'test' });
    expect(alertMgr.fire).toHaveBeenCalledWith(
      'artifact_quarantined',
      expect.any(String),
      expect.stringContaining('quarantined'),
      expect.any(Object),
    );
  });

  it('fires alert on block', async () => {
    const alertMgr = { fire: vi.fn() };
    deps.pipeline = makePipeline(makeScanResult('block'));
    deps.getAlertManager = () => alertMgr;
    gate = new ExternalizationGate(deps);

    await gate.gate(makeSandboxResult('bad'), { sourceContext: 'test' });
    expect(alertMgr.fire).toHaveBeenCalledWith(
      'artifact_blocked',
      'critical',
      expect.stringContaining('blocked'),
      expect.any(Object),
    );
  });

  it('records to scan history', async () => {
    const store = { record: vi.fn().mockResolvedValue({}) };
    deps.scanHistoryStore = store as any;
    deps.pipeline = makePipeline(makeScanResult('warn'));
    gate = new ExternalizationGate(deps);

    await gate.gate(makeSandboxResult('content'), { sourceContext: 'test' });
    expect(store.record).toHaveBeenCalledWith(expect.objectContaining({
      sourceContext: 'test',
    }));
  });

  it('records audit entry on non-pass verdict', async () => {
    const auditChain = { record: vi.fn().mockResolvedValue(undefined) };
    deps.auditChain = auditChain;
    deps.pipeline = makePipeline(makeScanResult('warn'));
    gate = new ExternalizationGate(deps);

    await gate.gate(makeSandboxResult('content'), { sourceContext: 'test' });
    expect(auditChain.record).toHaveBeenCalled();
  });

  it('does not record audit on pass verdict', async () => {
    const auditChain = { record: vi.fn().mockResolvedValue(undefined) };
    deps.auditChain = auditChain;
    gate = new ExternalizationGate(deps);

    await gate.gate(makeSandboxResult('clean'), { sourceContext: 'test' });
    expect(auditChain.record).not.toHaveBeenCalled();
  });

  it('calls escalation manager on quarantine', async () => {
    const escalation = { handleEscalation: vi.fn().mockResolvedValue(undefined) };
    deps.escalationManager = escalation;
    deps.pipeline = makePipeline(makeScanResult('quarantine'));
    gate = new ExternalizationGate(deps);

    await gate.gate(makeSandboxResult('bad'), { sourceContext: 'test' });
    expect(escalation.handleEscalation).toHaveBeenCalled();
  });

  it('calls offender tracker on block', async () => {
    const tracker = { track: vi.fn() };
    deps.offenderTracker = tracker;
    deps.pipeline = makePipeline(makeScanResult('block'));
    gate = new ExternalizationGate(deps);

    await gate.gate(makeSandboxResult('bad'), { sourceContext: 'test', userId: 'u1' });
    expect(tracker.track).toHaveBeenCalledWith('u1', undefined, expect.any(Object));
  });

  it('handles Buffer result', async () => {
    const result = await gate.gate(makeSandboxResult(Buffer.from('binary data')), { sourceContext: 'test' });
    expect(result.scanReport?.gateDecision).toBe('pass');
  });

  it('survives scan history store failure', async () => {
    const store = { record: vi.fn().mockRejectedValue(new Error('db down')) };
    deps.scanHistoryStore = store as any;
    deps.pipeline = makePipeline(makeScanResult('warn'));
    gate = new ExternalizationGate(deps);

    // Should not throw
    const result = await gate.gate(makeSandboxResult('content'), { sourceContext: 'test' });
    expect(result.scanReport?.gateDecision).toBeDefined();
  });

  it('preserves personality and user context', async () => {
    const store = { record: vi.fn().mockResolvedValue({}) };
    deps.scanHistoryStore = store as any;
    deps.pipeline = makePipeline(makeScanResult('warn'));
    gate = new ExternalizationGate(deps);

    await gate.gate(makeSandboxResult('content'), {
      sourceContext: 'sandbox.run',
      personalityId: 'p-1',
      userId: 'u-1',
    });
    expect(store.record).toHaveBeenCalledWith(expect.objectContaining({
      personalityId: 'p-1',
      userId: 'u-1',
    }));
  });
});
