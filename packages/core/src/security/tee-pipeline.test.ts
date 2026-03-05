/**
 * TEE Pipeline Manager — unit tests
 *
 * Phase 129-D — Confidential Computing TEE Full Stack
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfidentialPipelineManager } from './tee-pipeline.js';
import type { ConfidentialPipelineDeps } from './tee-pipeline.js';
import type { TeeAttestationVerifier, ProviderAttestationResult } from './tee-attestation.js';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockResult(
  provider: string,
  verified = true,
  technology: string | null = null
): ProviderAttestationResult {
  const now = Date.now();
  return {
    provider,
    verified,
    technology: technology as ProviderAttestationResult['technology'],
    attestationTime: now,
    expiresAt: now + 3_600_000,
    details: `Mock attestation for ${provider}`,
  };
}

function makeMockVerifier(overrides: Partial<TeeAttestationVerifier> = {}): TeeAttestationVerifier {
  return {
    verify: vi.fn().mockReturnValue({
      allowed: true,
      result: makeMockResult('anthropic'),
    }),
    verifyAsync: vi.fn().mockResolvedValue({
      allowed: true,
      result: makeMockResult('anthropic'),
    }),
    isProviderTeeCapable: vi.fn().mockReturnValue(true),
    getTeeCapableProviders: vi.fn().mockReturnValue(['anthropic', 'openai', 'gemini']),
    getProviderTeeInfo: vi.fn(),
    clearCache: vi.fn(),
    getCacheStats: vi.fn().mockReturnValue({ size: 0, providers: [] }),
    registerRemoteProvider: vi.fn(),
    getAttestationHistory: vi.fn().mockReturnValue([]),
    ...overrides,
  } as unknown as TeeAttestationVerifier;
}

function makeDeps(overrides: Partial<ConfidentialPipelineDeps> = {}): ConfidentialPipelineDeps {
  return {
    teeVerifier: makeMockVerifier(),
    logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as any,
    auditFn: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConfidentialPipelineManager', () => {
  let deps: ConfidentialPipelineDeps;
  let manager: ConfidentialPipelineManager;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeDeps();
    manager = new ConfidentialPipelineManager(deps);
  });

  // ── createConfidentialRequest ────────────────────────────────

  it('createConfidentialRequest returns valid structure', async () => {
    const req = await manager.createConfidentialRequest('anthropic');

    expect(req.requestId).toHaveLength(32); // 16 bytes hex
    expect(req.nonce).toHaveLength(64); // 32 bytes hex
    expect(req.provider).toBe('anthropic');
    expect(req.startedAt).toBeGreaterThan(0);
    expect(req.attestationChain).toHaveLength(2);
    expect(req.attestationChain[0].step).toBe('pipeline_start');
    expect(req.attestationChain[1].step).toBe('provider_attestation');
    expect(req.attestationChain[1].result).toBeDefined();
  });

  it('createConfidentialRequest calls verifyAsync on teeVerifier', async () => {
    await manager.createConfidentialRequest('openai');
    expect(deps.teeVerifier.verifyAsync).toHaveBeenCalledWith('openai');
  });

  it('createConfidentialRequest audits events', async () => {
    await manager.createConfidentialRequest('anthropic');
    expect(deps.auditFn).toHaveBeenCalledTimes(2);
    expect(deps.auditFn).toHaveBeenCalledWith(
      'tee_pipeline_start',
      expect.objectContaining({ provider: 'anthropic' })
    );
    expect(deps.auditFn).toHaveBeenCalledWith(
      'tee_pipeline_attestation',
      expect.objectContaining({ provider: 'anthropic', verified: true })
    );
  });

  it('createConfidentialRequest increments active request count', async () => {
    expect(manager.getActiveRequestCount()).toBe(0);
    await manager.createConfidentialRequest('anthropic');
    expect(manager.getActiveRequestCount()).toBe(1);
    await manager.createConfidentialRequest('openai');
    expect(manager.getActiveRequestCount()).toBe(2);
  });

  // ── verifyConfidentialResponse ───────────────────────────────

  it('verifyConfidentialResponse completes chain', async () => {
    const req = await manager.createConfidentialRequest('anthropic');
    const res = await manager.verifyConfidentialResponse(req.requestId);

    expect(res.requestId).toBe(req.requestId);
    expect(res.provider).toBe('anthropic');
    expect(res.completedAt).toBeGreaterThanOrEqual(req.startedAt);
    expect(res.chainValid).toBe(true);
    expect(res.chainHash).toHaveLength(64); // sha256 hex
    expect(res.attestationChain).toHaveLength(3);
    expect(res.attestationChain[2].step).toBe('pipeline_complete');
  });

  it('verifyConfidentialResponse throws for unknown request', async () => {
    await expect(manager.verifyConfidentialResponse('nonexistent-id')).rejects.toThrow(
      'Unknown request: nonexistent-id'
    );
  });

  it('verifyConfidentialResponse removes from active requests', async () => {
    const req = await manager.createConfidentialRequest('anthropic');
    expect(manager.getActiveRequestCount()).toBe(1);
    await manager.verifyConfidentialResponse(req.requestId);
    expect(manager.getActiveRequestCount()).toBe(0);
  });

  it('verifyConfidentialResponse audits completion', async () => {
    const req = await manager.createConfidentialRequest('anthropic');
    vi.mocked(deps.auditFn!).mockClear();

    await manager.verifyConfidentialResponse(req.requestId);

    expect(deps.auditFn).toHaveBeenCalledWith(
      'tee_pipeline_complete',
      expect.objectContaining({
        requestId: req.requestId,
        provider: 'anthropic',
        chainValid: true,
      })
    );
  });

  // ── getChainOfCustody ────────────────────────────────────────

  it('getChainOfCustody returns completed chain', async () => {
    const req = await manager.createConfidentialRequest('anthropic');
    await manager.verifyConfidentialResponse(req.requestId);

    const chain = manager.getChainOfCustody(req.requestId);
    expect(chain).not.toBeNull();
    expect(chain!.requestId).toBe(req.requestId);
    expect(chain!.provider).toBe('anthropic');
    expect(chain!.chainValid).toBe(true);
    expect(chain!.completedAt).toBeGreaterThan(0);
    expect(chain!.links).toHaveLength(3);
  });

  it('getChainOfCustody returns null for unknown', async () => {
    expect(manager.getChainOfCustody('unknown-id')).toBeNull();
  });

  // ── listCompletedChains ──────────────────────────────────────

  it('listCompletedChains returns completed chains', async () => {
    const req1 = await manager.createConfidentialRequest('anthropic');
    const req2 = await manager.createConfidentialRequest('openai');
    await manager.verifyConfidentialResponse(req1.requestId);
    await manager.verifyConfidentialResponse(req2.requestId);

    const chains = manager.listCompletedChains();
    expect(chains).toHaveLength(2);
  });

  it('listCompletedChains respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      const req = await manager.createConfidentialRequest('anthropic');
      await manager.verifyConfidentialResponse(req.requestId);
    }

    const chains = manager.listCompletedChains(3);
    expect(chains).toHaveLength(3);
  });

  // ── Chain validation ─────────────────────────────────────────

  it('chain validation checks timestamps', async () => {
    // Create a request, then manipulate the chain to have non-monotonic timestamps
    const req = await manager.createConfidentialRequest('anthropic');
    // Tamper with timestamps — set second link timestamp earlier than first
    req.attestationChain[1].timestamp = req.attestationChain[0].timestamp - 1000;

    const res = await manager.verifyConfidentialResponse(req.requestId);
    expect(res.chainValid).toBe(false);
  });

  it('chain validation checks attestation result', async () => {
    const verifier = makeMockVerifier({
      verifyAsync: vi.fn().mockResolvedValue({
        allowed: false,
        result: makeMockResult('unknown', false),
      }),
    });

    const mgr = new ConfidentialPipelineManager({
      ...deps,
      teeVerifier: verifier,
    });

    const req = await mgr.createConfidentialRequest('unknown');
    // Remove the result from attestation link to make chain invalid
    req.attestationChain[1].result = undefined;

    const res = await mgr.verifyConfidentialResponse(req.requestId);
    expect(res.chainValid).toBe(false);
  });

  // ── MAX_REQUESTS eviction ────────────────────────────────────

  it('evicts oldest active request at MAX_REQUESTS', async () => {
    // We can't easily create 1000 requests in a test, so we'll access private field
    const mgr = manager as any;
    // Fill with dummy entries
    for (let i = 0; i < 1000; i++) {
      mgr.requests.set(`req-${i}`, { requestId: `req-${i}`, provider: 'test' });
    }
    expect(manager.getActiveRequestCount()).toBe(1000);

    // Creating one more should evict the oldest
    await manager.createConfidentialRequest('anthropic');
    expect(manager.getActiveRequestCount()).toBe(1000);
    // The first entry should have been evicted
    expect(mgr.requests.has('req-0')).toBe(false);
  });

  it('evicts oldest completed chain at MAX_REQUESTS', async () => {
    const mgr = manager as any;
    for (let i = 0; i < 1000; i++) {
      mgr.completedChains.set(`chain-${i}`, {
        requestId: `chain-${i}`,
        provider: 'test',
        chainValid: true,
      });
    }

    const req = await manager.createConfidentialRequest('anthropic');
    await manager.verifyConfidentialResponse(req.requestId);

    expect(mgr.completedChains.has('chain-0')).toBe(false);
  });

  // ── getActiveRequestCount ────────────────────────────────────

  it('getActiveRequestCount is accurate', async () => {
    expect(manager.getActiveRequestCount()).toBe(0);

    const req1 = await manager.createConfidentialRequest('anthropic');
    expect(manager.getActiveRequestCount()).toBe(1);

    await manager.createConfidentialRequest('openai');
    expect(manager.getActiveRequestCount()).toBe(2);

    await manager.verifyConfidentialResponse(req1.requestId);
    expect(manager.getActiveRequestCount()).toBe(1);
  });

  // ── audit failure resilience ─────────────────────────────────

  it('handles audit function failure gracefully', async () => {
    const failingDeps = makeDeps({
      auditFn: vi.fn().mockRejectedValue(new Error('audit down')),
    });
    const mgr = new ConfidentialPipelineManager(failingDeps);

    // Should not throw
    const req = await mgr.createConfidentialRequest('anthropic');
    expect(req.requestId).toHaveLength(32);
    expect(failingDeps.logger!.warn).toHaveBeenCalled();
  });

  it('works without audit function', async () => {
    const mgr = new ConfidentialPipelineManager({
      teeVerifier: makeMockVerifier(),
    });

    const req = await mgr.createConfidentialRequest('anthropic');
    expect(req.requestId).toHaveLength(32);

    const res = await mgr.verifyConfidentialResponse(req.requestId);
    expect(res.chainValid).toBe(true);
  });
});
