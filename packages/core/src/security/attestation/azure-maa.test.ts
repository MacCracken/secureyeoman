/**
 * Azure MAA Attestation Provider Tests — Phase 129B
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AzureMaaAttestationProvider } from './azure-maa.js';

function makeJwt(payload: Record<string, unknown>, exp?: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({ ...payload, ...(exp !== undefined ? { exp } : {}) }),
  ).toString('base64url');
  const sig = Buffer.from('fake-signature').toString('base64url');
  return `${header}.${body}.${sig}`;
}

describe('AzureMaaAttestationProvider', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('has name "azure-maa"', () => {
    const provider = new AzureMaaAttestationProvider({ tenantUrl: 'https://maa.example.com', policyName: 'default' });
    expect(provider.name).toBe('azure-maa');
  });

  it('returns unverified when tenantUrl is empty', async () => {
    const provider = new AzureMaaAttestationProvider({ tenantUrl: '', policyName: 'default' });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.details).toContain('tenant URL not configured');
    expect(result.technology).toBeNull();
  });

  it('returns unverified on HTTP error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    }));

    const provider = new AzureMaaAttestationProvider({
      tenantUrl: 'https://maa.example.com',
      policyName: 'default',
    });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.technology).toBe('sgx');
    expect(result.details).toContain('503');
    expect(result.details).toContain('Service Unavailable');
  });

  it('returns unverified when response has no token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ something: 'else' }),
    }));

    const provider = new AzureMaaAttestationProvider({
      tenantUrl: 'https://maa.example.com',
      policyName: 'default',
    });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.details).toContain('missing attestation token');
  });

  it('returns unverified for invalid JWT format (not 3 parts)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'only.two' }),
    }));

    const provider = new AzureMaaAttestationProvider({
      tenantUrl: 'https://maa.example.com',
      policyName: 'default',
    });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.details).toContain('Invalid JWT token format');
  });

  it('returns verified for valid JWT with correct claims', async () => {
    const token = makeJwt({
      'x-ms-attestation-type': 'sgx',
      'x-ms-policy-signer': { alg: 'RS256' },
    }, Math.floor(Date.now() / 1000) + 7200);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token }),
    }));

    const provider = new AzureMaaAttestationProvider({
      tenantUrl: 'https://maa.example.com',
      policyName: 'test-policy',
    });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(true);
    expect(result.technology).toBe('sgx');
    expect(result.details).toContain('verified');
    expect(result.details).toContain('test-policy');
  });

  it('returns unverified when attestation-type is not sgx', async () => {
    const token = makeJwt({
      'x-ms-attestation-type': 'unknown',
      'x-ms-policy-signer': { alg: 'RS256' },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token }),
    }));

    const provider = new AzureMaaAttestationProvider({
      tenantUrl: 'https://maa.example.com',
      policyName: 'default',
    });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.details).toContain('claims validation failed');
  });

  it('returns unverified when policy-signer is missing', async () => {
    const token = makeJwt({
      'x-ms-attestation-type': 'sgx',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token }),
    }));

    const provider = new AzureMaaAttestationProvider({
      tenantUrl: 'https://maa.example.com',
      policyName: 'default',
    });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
  });

  it('handles fetch timeout/abort', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('The operation was aborted', 'AbortError')));

    const provider = new AzureMaaAttestationProvider({
      tenantUrl: 'https://maa.example.com',
      policyName: 'default',
    });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.details).toContain('request failed');
    expect(result.details).toContain('aborted');
  });

  it('handles network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const provider = new AzureMaaAttestationProvider({
      tenantUrl: 'https://maa.example.com',
      policyName: 'default',
    });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.details).toContain('ECONNREFUSED');
  });

  it('uses JWT exp claim for expiresAt', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 7200;
    const token = makeJwt({
      'x-ms-attestation-type': 'sgx',
      'x-ms-policy-signer': { alg: 'RS256' },
    }, futureExp);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token }),
    }));

    const provider = new AzureMaaAttestationProvider({
      tenantUrl: 'https://maa.example.com',
      policyName: 'default',
    });
    const result = await provider.verifyAsync('openai');
    expect(result.expiresAt).toBe(futureExp * 1000);
  });

  it('defaults expiresAt to 1 hour when JWT has no exp', async () => {
    const token = makeJwt({
      'x-ms-attestation-type': 'sgx',
      'x-ms-policy-signer': { alg: 'RS256' },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token }),
    }));

    const provider = new AzureMaaAttestationProvider({
      tenantUrl: 'https://maa.example.com',
      policyName: 'default',
    });
    const before = Date.now();
    const result = await provider.verifyAsync('openai');
    // Should be roughly now + 1 hour
    expect(result.expiresAt).toBeGreaterThanOrEqual(before + 3_600_000 - 1000);
    expect(result.expiresAt).toBeLessThanOrEqual(Date.now() + 3_600_000 + 1000);
  });

  it('strips trailing slash from tenantUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AzureMaaAttestationProvider({
      tenantUrl: 'https://maa.example.com/',
      policyName: 'default',
    });
    await provider.verifyAsync('openai');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://maa.example.com/attest/SgxEnclave?api-version=2022-08-01',
      expect.any(Object),
    );
  });

  it('sets correct provider in result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));

    const provider = new AzureMaaAttestationProvider({
      tenantUrl: 'https://maa.example.com',
      policyName: 'default',
    });
    const result = await provider.verifyAsync('gemini');
    expect(result.provider).toBe('gemini');
  });

  it('handles non-Error thrown from fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string-error'));

    const provider = new AzureMaaAttestationProvider({
      tenantUrl: 'https://maa.example.com',
      policyName: 'default',
    });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.details).toContain('string-error');
  });
});
