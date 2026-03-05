import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EscalationManager, type EscalationManagerDeps } from './escalation.js';
import type { ScanResult } from '@secureyeoman/shared';
import type { SandboxArtifact } from './types.js';
import { randomUUID } from 'node:crypto';

function makeScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    artifactId: randomUUID(),
    verdict: 'quarantine',
    findings: [
      { id: randomUUID(), scanner: 'test', severity: 'high', category: 'test', message: 'test' },
    ],
    worstSeverity: 'high',
    scanDurationMs: 100,
    scannerVersions: {},
    scannedAt: Date.now(),
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<SandboxArtifact> = {}): SandboxArtifact {
  return {
    id: randomUUID(),
    type: 'text/plain',
    content: 'test content',
    sourceContext: 'test',
    sizeBytes: 12,
    personalityId: 'personality-1',
    userId: 'user-1',
    ...overrides,
  };
}

describe('EscalationManager', () => {
  let auditRecord: ReturnType<typeof vi.fn>;
  let alertFire: ReturnType<typeof vi.fn>;
  let suspendPersonality: ReturnType<typeof vi.fn>;
  let createEntry: ReturnType<typeof vi.fn>;
  let deps: EscalationManagerDeps;

  beforeEach(() => {
    auditRecord = vi.fn().mockResolvedValue(undefined);
    alertFire = vi.fn();
    suspendPersonality = vi.fn().mockResolvedValue(undefined);
    createEntry = vi.fn().mockResolvedValue({ id: 'risk-1' });
    deps = {
      auditChain: { record: auditRecord },
      getAlertManager: () => ({ fire: alertFire }),
      getSoulManager: () => ({ suspendPersonality }),
      getDepartmentRiskManager: () => ({ createEntry }),
    };
  });

  it('logs audit for tier1', async () => {
    const mgr = new EscalationManager(deps);
    const scanResult = makeScanResult({
      worstSeverity: 'low',
      threatAssessment: {
        escalationTier: 'tier1_log',
        classification: 'benign',
        intentScore: 0.1,
        killChainStages: [],
        matchedPatterns: [],
        summary: '',
      },
    });
    await mgr.handleEscalation(scanResult, makeArtifact());
    expect(auditRecord).toHaveBeenCalledTimes(1);
    expect(alertFire).not.toHaveBeenCalled();
    expect(suspendPersonality).not.toHaveBeenCalled();
    expect(createEntry).not.toHaveBeenCalled();
  });

  it('fires alert for tier2', async () => {
    const mgr = new EscalationManager(deps);
    const scanResult = makeScanResult({
      threatAssessment: {
        escalationTier: 'tier2_alert',
        classification: 'suspicious',
        intentScore: 0.3,
        killChainStages: [],
        matchedPatterns: [],
        summary: '',
      },
    });
    await mgr.handleEscalation(scanResult, makeArtifact());
    expect(auditRecord).toHaveBeenCalledTimes(1);
    expect(alertFire).toHaveBeenCalledTimes(1);
    expect(alertFire).toHaveBeenCalledWith(
      'escalation_triggered',
      'warn',
      expect.any(String),
      expect.any(Object)
    );
    expect(suspendPersonality).not.toHaveBeenCalled();
  });

  it('suspends personality for tier3', async () => {
    const mgr = new EscalationManager(deps);
    const scanResult = makeScanResult({
      threatAssessment: {
        escalationTier: 'tier3_suspend',
        classification: 'likely_malicious',
        intentScore: 0.6,
        killChainStages: [],
        matchedPatterns: [],
        summary: '',
      },
    });
    await mgr.handleEscalation(scanResult, makeArtifact());
    expect(auditRecord).toHaveBeenCalledTimes(1);
    expect(alertFire).toHaveBeenCalledTimes(1);
    expect(alertFire).toHaveBeenCalledWith(
      'escalation_triggered',
      'error',
      expect.any(String),
      expect.any(Object)
    );
    expect(suspendPersonality).toHaveBeenCalledTimes(1);
    expect(suspendPersonality).toHaveBeenCalledWith(
      'personality-1',
      expect.stringContaining('tier3_suspend')
    );
  });

  it('skips personality suspension when no personalityId', async () => {
    const mgr = new EscalationManager(deps);
    const scanResult = makeScanResult({
      threatAssessment: {
        escalationTier: 'tier3_suspend',
        classification: 'likely_malicious',
        intentScore: 0.6,
        killChainStages: [],
        matchedPatterns: [],
        summary: '',
      },
    });
    await mgr.handleEscalation(scanResult, makeArtifact({ personalityId: undefined }));
    expect(suspendPersonality).not.toHaveBeenCalled();
  });

  it('revokes and creates risk entry for tier4', async () => {
    const mgr = new EscalationManager(deps);
    const scanResult = makeScanResult({
      worstSeverity: 'critical',
      threatAssessment: {
        escalationTier: 'tier4_revoke',
        classification: 'malicious',
        intentScore: 0.9,
        killChainStages: [],
        matchedPatterns: [],
        summary: '',
      },
    });
    await mgr.handleEscalation(scanResult, makeArtifact());
    expect(auditRecord).toHaveBeenCalledTimes(1);
    expect(alertFire).toHaveBeenCalledWith(
      'escalation_triggered',
      'critical',
      expect.any(String),
      expect.any(Object)
    );
    expect(suspendPersonality).toHaveBeenCalledTimes(1);
    expect(createEntry).toHaveBeenCalledTimes(1);
    expect(createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'critical',
        source: 'automated',
        category: 'security',
        status: 'open',
      })
    );
  });

  it('infers tier from worst severity when no threatAssessment', async () => {
    const mgr = new EscalationManager(deps);

    // critical → tier4
    await mgr.handleEscalation(makeScanResult({ worstSeverity: 'critical' }), makeArtifact());
    expect(createEntry).toHaveBeenCalledTimes(1);

    // high → tier3
    createEntry.mockClear();
    suspendPersonality.mockClear();
    await mgr.handleEscalation(makeScanResult({ worstSeverity: 'high' }), makeArtifact());
    expect(suspendPersonality).toHaveBeenCalledTimes(1);
    expect(createEntry).not.toHaveBeenCalled();

    // medium → tier2
    alertFire.mockClear();
    suspendPersonality.mockClear();
    await mgr.handleEscalation(makeScanResult({ worstSeverity: 'medium' }), makeArtifact());
    expect(alertFire).toHaveBeenCalledTimes(1);
    expect(suspendPersonality).not.toHaveBeenCalled();

    // low → tier1
    alertFire.mockClear();
    await mgr.handleEscalation(makeScanResult({ worstSeverity: 'low' }), makeArtifact());
    expect(alertFire).not.toHaveBeenCalled();
  });

  it('handles missing deps gracefully', async () => {
    const mgr = new EscalationManager({});
    // Should not throw with no deps
    await expect(
      mgr.handleEscalation(
        makeScanResult({
          worstSeverity: 'critical',
          threatAssessment: {
            escalationTier: 'tier4_revoke',
            classification: 'malicious',
            intentScore: 0.9,
            killChainStages: [],
            matchedPatterns: [],
            summary: '',
          },
        }),
        makeArtifact()
      )
    ).resolves.toBeUndefined();
  });

  it('handles audit chain errors gracefully', async () => {
    const failingAudit = vi.fn().mockRejectedValue(new Error('audit fail'));
    const mgr = new EscalationManager({ auditChain: { record: failingAudit } });
    await expect(
      mgr.handleEscalation(makeScanResult({ worstSeverity: 'low' }), makeArtifact())
    ).resolves.toBeUndefined();
  });

  it('handles soul manager errors gracefully', async () => {
    const failingSuspend = vi.fn().mockRejectedValue(new Error('suspend fail'));
    const mgr = new EscalationManager({
      getSoulManager: () => ({ suspendPersonality: failingSuspend }),
    });
    await expect(
      mgr.handleEscalation(
        makeScanResult({
          threatAssessment: {
            escalationTier: 'tier3_suspend',
            classification: 'likely_malicious',
            intentScore: 0.6,
            killChainStages: [],
            matchedPatterns: [],
            summary: '',
          },
        }),
        makeArtifact()
      )
    ).resolves.toBeUndefined();
  });

  it('handles risk manager errors gracefully', async () => {
    const failingCreate = vi.fn().mockRejectedValue(new Error('risk fail'));
    const mgr = new EscalationManager({
      getDepartmentRiskManager: () => ({ createEntry: failingCreate }),
    });
    await expect(
      mgr.handleEscalation(
        makeScanResult({
          worstSeverity: 'critical',
          threatAssessment: {
            escalationTier: 'tier4_revoke',
            classification: 'malicious',
            intentScore: 0.9,
            killChainStages: [],
            matchedPatterns: [],
            summary: '',
          },
        }),
        makeArtifact()
      )
    ).resolves.toBeUndefined();
  });

  it('includes metadata in audit record', async () => {
    const mgr = new EscalationManager(deps);
    const artifact = makeArtifact({
      sourceContext: 'sandbox.run',
      personalityId: 'p-1',
      userId: 'u-1',
    });
    const scanResult = makeScanResult({ worstSeverity: 'low' });
    await mgr.handleEscalation(scanResult, artifact);
    expect(auditRecord).toHaveBeenCalledWith(
      'escalation_triggered',
      'info',
      expect.any(String),
      expect.objectContaining({
        artifactId: artifact.id,
        sourceContext: 'sandbox.run',
        personalityId: 'p-1',
        userId: 'u-1',
        verdict: scanResult.verdict,
        worstSeverity: 'low',
      })
    );
  });

  it('uses security level for tier3/tier4 audit', async () => {
    const mgr = new EscalationManager(deps);
    await mgr.handleEscalation(
      makeScanResult({
        threatAssessment: {
          escalationTier: 'tier3_suspend',
          classification: 'likely_malicious',
          intentScore: 0.6,
          killChainStages: [],
          matchedPatterns: [],
          summary: '',
        },
      }),
      makeArtifact()
    );
    expect(auditRecord).toHaveBeenCalledWith(
      'escalation_triggered',
      'security',
      expect.any(String),
      expect.any(Object)
    );
  });

  it('returns null soul manager gracefully', async () => {
    const mgr = new EscalationManager({
      getSoulManager: () => null,
    });
    await expect(
      mgr.handleEscalation(
        makeScanResult({
          threatAssessment: {
            escalationTier: 'tier3_suspend',
            classification: 'likely_malicious',
            intentScore: 0.6,
            killChainStages: [],
            matchedPatterns: [],
            summary: '',
          },
        }),
        makeArtifact()
      )
    ).resolves.toBeUndefined();
  });

  it('returns null alert manager gracefully', async () => {
    const mgr = new EscalationManager({
      getAlertManager: () => null,
    });
    await expect(
      mgr.handleEscalation(
        makeScanResult({
          threatAssessment: {
            escalationTier: 'tier2_alert',
            classification: 'suspicious',
            intentScore: 0.3,
            killChainStages: [],
            matchedPatterns: [],
            summary: '',
          },
        }),
        makeArtifact()
      )
    ).resolves.toBeUndefined();
  });
});
