import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DlpManager } from './dlp-manager.js';
import type { DlpScanner } from './dlp-scanner.js';
import type { DlpPolicyStore } from './dlp-policy-store.js';
import type { EgressStore } from './egress-store.js';
import type { ClassificationStore } from './classification-store.js';
import type { DlpScanResult } from './types.js';

function makeScanResult(overrides: Partial<DlpScanResult> = {}): DlpScanResult {
  return {
    allowed: true,
    action: 'allowed',
    policyId: null,
    policyName: null,
    findings: [],
    classificationLevel: 'internal',
    ...overrides,
  };
}

describe('DlpManager', () => {
  let manager: DlpManager;
  let mockScanner: { scan: ReturnType<typeof vi.fn> };
  let mockEgressStore: { record: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> };
  let mockPolicyStore: Record<string, ReturnType<typeof vi.fn>>;
  let mockClassificationStore: Record<string, ReturnType<typeof vi.fn>>;
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => mockLogger),
  } as any;

  beforeEach(() => {
    mockScanner = { scan: vi.fn() };
    mockEgressStore = { record: vi.fn().mockResolvedValue('eg-1'), query: vi.fn() };
    mockPolicyStore = { list: vi.fn(), create: vi.fn(), getById: vi.fn(), update: vi.fn(), delete: vi.fn() };
    mockClassificationStore = { create: vi.fn(), getByContentId: vi.fn(), override: vi.fn(), list: vi.fn() };
    vi.clearAllMocks();

    manager = new DlpManager({
      scanner: mockScanner as unknown as DlpScanner,
      policyStore: mockPolicyStore as unknown as DlpPolicyStore,
      egressStore: mockEgressStore as unknown as EgressStore,
      classificationStore: mockClassificationStore as unknown as ClassificationStore,
      logger: mockLogger,
    });
  });

  it('scans outbound content and returns result', async () => {
    mockScanner.scan.mockResolvedValue(makeScanResult());
    const result = await manager.scanOutbound('Hello world', 'slack');
    expect(result.allowed).toBe(true);
    expect(result.action).toBe('allowed');
    expect(mockScanner.scan).toHaveBeenCalledWith('Hello world', 'slack', undefined);
  });

  it('records egress event after scan', async () => {
    mockScanner.scan.mockResolvedValue(makeScanResult({ classificationLevel: 'confidential' }));
    await manager.scanOutbound('Hello world', 'email', { userId: 'user-1' });
    expect(mockEgressStore.record).toHaveBeenCalledTimes(1);
    const call = mockEgressStore.record.mock.calls[0][0];
    expect(call.destinationType).toBe('email');
    expect(call.classificationLevel).toBe('confidential');
    expect(call.userId).toBe('user-1');
    expect(call.contentHash).toBeTruthy();
  });

  it('returns blocked result for blocked content', async () => {
    mockScanner.scan.mockResolvedValue(makeScanResult({
      allowed: false,
      action: 'blocked',
      policyId: 'pol-1',
      policyName: 'Block PII',
      findings: [{ type: 'pii_type', description: 'SSN detected', severity: 'high' }],
    }));
    const result = await manager.scanOutbound('SSN: 123-45-6789', 'slack');
    expect(result.allowed).toBe(false);
    expect(result.action).toBe('blocked');
    expect(result.policyId).toBe('pol-1');
  });

  it('logs warning when egress recording fails', async () => {
    mockScanner.scan.mockResolvedValue(makeScanResult());
    mockEgressStore.record.mockRejectedValue(new Error('DB error'));
    const result = await manager.scanOutbound('Hello', 'api');
    // Should still return scan result despite egress recording failure
    expect(result.allowed).toBe(true);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('passes metadata to egress event', async () => {
    mockScanner.scan.mockResolvedValue(makeScanResult());
    await manager.scanOutbound('Hello', 'webhook', {
      userId: 'u-1',
      personalityId: 'p-1',
      tenantId: 'tenant-2',
      contentType: 'text',
    });
    const call = mockEgressStore.record.mock.calls[0][0];
    expect(call.userId).toBe('u-1');
    expect(call.personalityId).toBe('p-1');
    expect(call.tenantId).toBe('tenant-2');
  });

  it('exposes policy and egress stores', () => {
    expect(manager.getPolicyStore()).toBe(mockPolicyStore);
    expect(manager.getEgressStore()).toBe(mockEgressStore);
  });

  it('logs scan info on completion', async () => {
    mockScanner.scan.mockResolvedValue(makeScanResult({ action: 'warned', findings: [{ type: 'keyword', description: 'Found', severity: 'medium' }] }));
    await manager.scanOutbound('Content', 'slack');
    expect(mockLogger.info).toHaveBeenCalledWith(
      'DLP outbound scan completed',
      expect.objectContaining({
        destination: 'slack',
        action: 'warned',
        findingsCount: 1,
      })
    );
  });
});
