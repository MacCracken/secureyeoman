/**
 * NVIDIA RAA Attestation Provider Tests — Phase 129B
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NvidiaRaaAttestationProvider } from './nvidia-raa.js';

describe('NvidiaRaaAttestationProvider', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('has name "nvidia-raa"', () => {
    const provider = new NvidiaRaaAttestationProvider({ endpoint: 'https://nras.example.com' });
    expect(provider.name).toBe('nvidia-raa');
  });

  it('returns unverified when endpoint is empty', async () => {
    const provider = new NvidiaRaaAttestationProvider({ endpoint: '' });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.technology).toBeNull();
    expect(result.details).toContain('endpoint not configured');
  });

  it('returns verified when CC mode is on and status is verified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        confidential_compute_mode: true,
        attestation_status: 'verified',
        driver_version: '535.104.05',
        gpu_uuid: 'GPU-abc-123',
        technology: 'sev',
      }),
    }));

    const provider = new NvidiaRaaAttestationProvider({ endpoint: 'https://nras.example.com' });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(true);
    expect(result.technology).toBe('sev');
    expect(result.details).toContain('verified');
    expect(result.details).toContain('GPU-abc-123');
    expect(result.details).toContain('535.104.05');
  });

  it('returns unverified when CC mode is off', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        confidential_compute_mode: false,
        attestation_status: 'verified',
        gpu_uuid: 'GPU-xyz',
      }),
    }));

    const provider = new NvidiaRaaAttestationProvider({ endpoint: 'https://nras.example.com' });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.details).toContain('CC mode off');
  });

  it('returns unverified when attestation_status is not verified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        confidential_compute_mode: true,
        attestation_status: 'failed',
      }),
    }));

    const provider = new NvidiaRaaAttestationProvider({ endpoint: 'https://nras.example.com' });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.details).toContain('status failed');
  });

  it('defaults technology to auto when not specified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        confidential_compute_mode: true,
        attestation_status: 'verified',
      }),
    }));

    const provider = new NvidiaRaaAttestationProvider({ endpoint: 'https://nras.example.com' });
    const result = await provider.verifyAsync('openai');
    expect(result.technology).toBe('auto');
  });

  it('detects technology from response (tdx)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        confidential_compute_mode: true,
        attestation_status: 'verified',
        technology: 'tdx',
      }),
    }));

    const provider = new NvidiaRaaAttestationProvider({ endpoint: 'https://nras.example.com' });
    const result = await provider.verifyAsync('openai');
    expect(result.technology).toBe('tdx');
  });

  it('returns unverified on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
    }));

    const provider = new NvidiaRaaAttestationProvider({ endpoint: 'https://nras.example.com' });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.details).toContain('502');
  });

  it('handles network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const provider = new NvidiaRaaAttestationProvider({ endpoint: 'https://nras.example.com' });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.details).toContain('ECONNREFUSED');
  });

  it('handles fetch abort', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('The operation was aborted', 'AbortError')));

    const provider = new NvidiaRaaAttestationProvider({ endpoint: 'https://nras.example.com' });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(false);
    expect(result.details).toContain('request failed');
  });

  it('strips trailing slash from endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new NvidiaRaaAttestationProvider({ endpoint: 'https://nras.example.com/' });
    await provider.verifyAsync('openai');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://nras.example.com/v1/attestation/gpu',
      expect.any(Object),
    );
  });

  it('sets correct provider in result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));

    const provider = new NvidiaRaaAttestationProvider({ endpoint: 'https://nras.example.com' });
    const result = await provider.verifyAsync('gemini');
    expect(result.provider).toBe('gemini');
  });

  it('handles missing gpu_uuid and driver_version gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        confidential_compute_mode: true,
        attestation_status: 'verified',
      }),
    }));

    const provider = new NvidiaRaaAttestationProvider({ endpoint: 'https://nras.example.com' });
    const result = await provider.verifyAsync('openai');
    expect(result.verified).toBe(true);
    expect(result.details).not.toContain('GPU:');
    expect(result.details).not.toContain('driver');
  });
});
