/**
 * VaultBackend unit tests
 *
 * All network calls are intercepted with vi.stubGlobal('fetch', ...) so no
 * real Vault server is required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VaultBackend } from './vault-backend.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetch(responses: Array<{ status: number; body: unknown }>) {
  let call = 0;
  return vi.fn(async () => {
    const { status, body } = responses[call++ % responses.length];
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  });
}

// ---------------------------------------------------------------------------
// Static-token backend (simplest case)
// ---------------------------------------------------------------------------

describe('VaultBackend — static token', () => {
  const cfg = { address: 'http://vault:8200', mount: 'secret', token: 'root-token' };

  beforeEach(() => vi.unstubAllGlobals());

  it('get() returns value from KV v2 response', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch([{ status: 200, body: { data: { data: { value: 'supersecret' } } } }])
    );
    const b = new VaultBackend(cfg);
    expect(await b.get('MY_KEY')).toBe('supersecret');
  });

  it('get() returns undefined on 404', async () => {
    vi.stubGlobal('fetch', makeFetch([{ status: 404, body: {} }]));
    const b = new VaultBackend(cfg);
    expect(await b.get('MISSING')).toBeUndefined();
  });

  it('set() POSTs to data path', async () => {
    const fetchMock = makeFetch([{ status: 200, body: {} }]);
    vi.stubGlobal('fetch', fetchMock);
    const b = new VaultBackend(cfg);
    await b.set('MY_KEY', 'hello');
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/secret/data/MY_KEY');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({ data: { value: 'hello' } });
  });

  it('delete() sends DELETE to metadata path and returns true', async () => {
    const fetchMock = makeFetch([{ status: 204, body: '' }]);
    vi.stubGlobal('fetch', fetchMock);
    const b = new VaultBackend(cfg);
    expect(await b.delete('MY_KEY')).toBe(true);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/secret/metadata/MY_KEY');
    expect(opts.method).toBe('DELETE');
  });

  it('delete() returns false on 404', async () => {
    vi.stubGlobal('fetch', makeFetch([{ status: 404, body: {} }]));
    const b = new VaultBackend(cfg);
    expect(await b.delete('MISSING')).toBe(false);
  });

  it('has() returns true when value exists', async () => {
    vi.stubGlobal('fetch', makeFetch([{ status: 200, body: { data: { data: { value: 'x' } } } }]));
    expect(await new VaultBackend(cfg).has('K')).toBe(true);
  });

  it('keys() returns list from metadata', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch([{ status: 200, body: { data: { keys: ['A', 'B', 'C/'] } } }])
    );
    const keys = await new VaultBackend(cfg).keys();
    // Subdirectory entries ending with '/' are filtered out
    expect(keys).toEqual(['A', 'B']);
  });

  it('keys() returns [] on 404', async () => {
    vi.stubGlobal('fetch', makeFetch([{ status: 404, body: {} }]));
    expect(await new VaultBackend(cfg).keys()).toEqual([]);
  });

  it('throws on unexpected error status', async () => {
    vi.stubGlobal('fetch', makeFetch([{ status: 500, body: { errors: ['internal'] } }]));
    await expect(new VaultBackend(cfg).get('K')).rejects.toThrow('500');
  });
});

// ---------------------------------------------------------------------------
// AppRole backend
// ---------------------------------------------------------------------------

describe('VaultBackend — AppRole auth', () => {
  const cfg = {
    address: 'http://vault:8200',
    mount: 'secret',
    roleId: 'role-abc',
    secretId: 'secret-xyz',
  };

  beforeEach(() => vi.unstubAllGlobals());

  it('logs in via AppRole then performs GET', async () => {
    const fetchMock = makeFetch([
      // AppRole login
      { status: 200, body: { auth: { client_token: 'short-lived-token' } } },
      // GET data
      { status: 200, body: { data: { data: { value: 'myval' } } } },
    ]);
    vi.stubGlobal('fetch', fetchMock);
    const b = new VaultBackend(cfg);
    expect(await b.get('K')).toBe('myval');
    // First call is login, second is data fetch
    const loginUrl = fetchMock.mock.calls[0][0] as string;
    expect(loginUrl).toContain('/v1/auth/approle/login');
  });

  it('caches the AppRole token for subsequent calls', async () => {
    const fetchMock = makeFetch([
      { status: 200, body: { auth: { client_token: 't1' } } },
      { status: 200, body: { data: { data: { value: 'v1' } } } },
      { status: 200, body: { data: { data: { value: 'v2' } } } },
    ]);
    vi.stubGlobal('fetch', fetchMock);
    const b = new VaultBackend(cfg);
    await b.get('K1');
    await b.get('K2');
    // Only one login call (index 0); GET at 1 and 2
    expect(fetchMock.mock.calls).toHaveLength(3);
  });

  it('refreshes token on 403 and retries once', async () => {
    const fetchMock = makeFetch([
      // Initial login
      { status: 200, body: { auth: { client_token: 'old-token' } } },
      // GET returns 403 (token expired)
      { status: 403, body: { errors: ['permission denied'] } },
      // Re-login
      { status: 200, body: { auth: { client_token: 'new-token' } } },
      // GET retried successfully
      { status: 200, body: { data: { data: { value: 'refreshed' } } } },
    ]);
    vi.stubGlobal('fetch', fetchMock);
    const b = new VaultBackend(cfg);
    expect(await b.get('K')).toBe('refreshed');
    expect(fetchMock.mock.calls).toHaveLength(4);
  });

  it('throws when no credentials are provided', async () => {
    const b = new VaultBackend({ address: 'http://vault:8200', mount: 'secret' });
    await expect(b.get('K')).rejects.toThrow('no token or AppRole credentials configured');
  });
});
