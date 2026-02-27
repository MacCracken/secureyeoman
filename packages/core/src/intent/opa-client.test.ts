/**
 * OpaClient Tests — Phase 50: Governance Hardening
 *
 * Uses vi.stubGlobal to mock the global fetch. OPA_ADDR env var is not set
 * so all tests construct the client directly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpaClient } from './opa-client.js';

// ─── fetch mock helpers ───────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown, contentType = 'application/json'): void {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(text),
      json: () => Promise.resolve(typeof body === 'string' ? {} : body),
      headers: { get: () => contentType },
    })
  );
}

beforeEach(() => {
  delete process.env.OPA_ADDR;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── fromEnv ───────────────────────────────────────────────────────────────────

describe('OpaClient.fromEnv', () => {
  it('returns null when OPA_ADDR is not set', () => {
    expect(OpaClient.fromEnv()).toBeNull();
  });

  it('returns an OpaClient when OPA_ADDR is set', () => {
    process.env.OPA_ADDR = 'http://opa:8181';
    expect(OpaClient.fromEnv()).toBeInstanceOf(OpaClient);
  });

  it('strips trailing slash from address', async () => {
    process.env.OPA_ADDR = 'http://opa:8181/';
    const client = OpaClient.fromEnv()!;
    // The client strips trailing slash — the policy path should not have a double-slash before v1
    mockFetch(200, {});
    await client.uploadPolicy('test', 'package test\nallow = true');
    const fetchMock = vi.mocked(fetch);
    const url = fetchMock.mock.calls[0][0] as string;
    // URL should be http://opa:8181/v1/policies/test (no // before v1)
    expect(url).toBe('http://opa:8181/v1/policies/test');
  });
});

// ── uploadPolicy ──────────────────────────────────────────────────────────────

describe('OpaClient.uploadPolicy', () => {
  it('uploads a Rego policy via PUT', async () => {
    mockFetch(200, {});
    const client = new OpaClient('http://opa:8181');
    await client.uploadPolicy('boundary_hb1', 'package boundary_hb1\nallow = true');

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://opa:8181/v1/policies/boundary_hb1');
    expect(init.method).toBe('PUT');
    expect(init.body).toContain('allow = true');
  });

  it('throws on non-2xx response', async () => {
    mockFetch(400, 'bad request', 'text/plain');
    const client = new OpaClient('http://opa:8181');
    await expect(client.uploadPolicy('bad', 'bad rego')).rejects.toThrow('OPA uploadPolicy failed');
  });
});

// ── deletePolicy ──────────────────────────────────────────────────────────────

describe('OpaClient.deletePolicy', () => {
  it('deletes a policy via DELETE', async () => {
    mockFetch(200, {});
    const client = new OpaClient('http://opa:8181');
    await client.deletePolicy('policy_p1');

    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://opa:8181/v1/policies/policy_p1');
    expect(init.method).toBe('DELETE');
  });

  it('ignores 404 (policy not found)', async () => {
    mockFetch(404, { message: 'policy not found' });
    const client = new OpaClient('http://opa:8181');
    await expect(client.deletePolicy('nonexistent')).resolves.toBeUndefined();
  });

  it('throws on 500 error', async () => {
    mockFetch(500, 'server error', 'text/plain');
    const client = new OpaClient('http://opa:8181');
    await expect(client.deletePolicy('policy_p1')).rejects.toThrow('OPA deletePolicy failed');
  });
});

// ── evaluate ──────────────────────────────────────────────────────────────────

describe('OpaClient.evaluate', () => {
  it('returns true when OPA result is true', async () => {
    mockFetch(200, { result: true });
    const client = new OpaClient('http://opa:8181');
    const result = await client.evaluate('boundary_hb1/allow', { action: 'delete prod' });
    expect(result).toBe(true);
  });

  it('returns false when OPA result is false', async () => {
    mockFetch(200, { result: false });
    const client = new OpaClient('http://opa:8181');
    const result = await client.evaluate('policy_p1/allow', { action: 'read data' });
    expect(result).toBe(false);
  });

  it('returns null on non-2xx response', async () => {
    mockFetch(500, {});
    const client = new OpaClient('http://opa:8181');
    const result = await client.evaluate('boundary/allow', { action: 'x' });
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const client = new OpaClient('http://opa:8181');
    const result = await client.evaluate('boundary/allow', { action: 'x' });
    expect(result).toBeNull();
  });

  it('returns null when result field is missing', async () => {
    mockFetch(200, { decision_id: 'abc123' });
    const client = new OpaClient('http://opa:8181');
    const result = await client.evaluate('boundary/allow', { action: 'x' });
    expect(result).toBeNull();
  });
});

// ── isHealthy ────────────────────────────────────────────────────────────────

describe('OpaClient.isHealthy', () => {
  it('returns true when OPA health endpoint responds 200', async () => {
    mockFetch(200, {});
    const client = new OpaClient('http://opa:8181');
    expect(await client.isHealthy()).toBe(true);
  });

  it('returns false on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    const client = new OpaClient('http://opa:8181');
    expect(await client.isHealthy()).toBe(false);
  });
});
