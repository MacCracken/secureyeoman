import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerSsoRoutes } from './sso-routes.js';
import type { SsoManager } from '../security/sso-manager.js';
import type { SsoStorage, IdentityProvider } from '../security/sso-storage.js';

// ── Mock data ──────────────────────────────────────────────────────

const PROVIDER: IdentityProvider = {
  id: 'idp-1',
  name: 'Okta',
  type: 'oidc',
  issuerUrl: 'https://okta.example.com',
  clientId: 'client-1',
  clientSecret: 'secret-do-not-expose',
  scopes: 'openid email profile',
  metadataUrl: null,
  entityId: null,
  acsUrl: null,
  enabled: true,
  autoProvision: true,
  defaultRole: 'viewer',
  config: {},
  createdAt: 1000,
  updatedAt: 1000,
};

function makeMockStorage(overrides?: Partial<SsoStorage>): SsoStorage {
  return {
    listIdentityProviders: vi.fn().mockResolvedValue([PROVIDER]),
    getIdentityProvider: vi.fn().mockResolvedValue(PROVIDER),
    createIdentityProvider: vi.fn().mockResolvedValue(PROVIDER),
    updateIdentityProvider: vi.fn().mockResolvedValue(PROVIDER),
    deleteIdentityProvider: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as SsoStorage;
}

function makeMockManager(overrides?: Partial<SsoManager>): SsoManager {
  return {
    getAuthorizationUrl: vi.fn().mockResolvedValue('https://idp.example.com/authorize?state=xyz'),
    handleCallback: vi.fn().mockResolvedValue({
      result: { accessToken: 'tok-a', refreshToken: 'tok-r', expiresIn: 3600 },
      redirectUri: 'https://app.example.com/dashboard',
    }),
    ...overrides,
  } as unknown as SsoManager;
}

function buildApp(storageOverrides?: Partial<SsoStorage>, managerOverrides?: Partial<SsoManager>) {
  const app = Fastify();
  registerSsoRoutes(app, {
    ssoStorage: makeMockStorage(storageOverrides),
    ssoManager: makeMockManager(managerOverrides),
    dashboardUrl: 'https://app.example.com/dashboard',
  });
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────

describe('SSO Routes — provider discovery', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(() => {
    app = buildApp();
  });

  it('GET /api/v1/auth/sso/providers returns enabled providers without client secrets', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/sso/providers' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.providers).toHaveLength(1);
    expect(body.total).toBe(1);
    // clientSecret must be stripped
    expect(body.providers[0].clientSecret).toBeUndefined();
    expect(body.providers[0].name).toBe('Okta');
  });
});

describe('SSO Routes — authorization flow', () => {
  it('GET /api/v1/auth/sso/authorize/:id redirects to IDP', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/sso/authorize/idp-1' });
    // Fastify inject follows redirects? No — it returns the 302
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('idp.example.com');
  });

  it('GET /api/v1/auth/sso/authorize/:id returns 400 on manager error', async () => {
    const app = buildApp(undefined, {
      getAuthorizationUrl: vi.fn().mockRejectedValue(new Error('provider disabled')),
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/sso/authorize/idp-1' });
    expect(res.statusCode).toBe(400);
  });

  // ── Scheme calculation (operator-precedence bug regression) ──────

  it('authorize: passes http:// redirect URI when x-forwarded-proto is http', async () => {
    const getAuthorizationUrl = vi
      .fn()
      .mockResolvedValue('https://idp.example.com/authorize?state=xyz');
    const app = buildApp(undefined, { getAuthorizationUrl });
    await app.inject({
      method: 'GET',
      url: '/api/v1/auth/sso/authorize/idp-1',
      headers: { 'x-forwarded-proto': 'http', host: 'proxy.example.com' },
    });
    expect(getAuthorizationUrl).toHaveBeenCalledWith(
      'idp-1',
      'http://proxy.example.com/api/v1/auth/sso/callback/idp-1',
      undefined
    );
  });

  it('authorize: passes https:// redirect URI when x-forwarded-proto is https', async () => {
    const getAuthorizationUrl = vi
      .fn()
      .mockResolvedValue('https://idp.example.com/authorize?state=xyz');
    const app = buildApp(undefined, { getAuthorizationUrl });
    await app.inject({
      method: 'GET',
      url: '/api/v1/auth/sso/authorize/idp-1',
      headers: { 'x-forwarded-proto': 'https', host: 'secure.example.com' },
    });
    expect(getAuthorizationUrl).toHaveBeenCalledWith(
      'idp-1',
      'https://secure.example.com/api/v1/auth/sso/callback/idp-1',
      undefined
    );
  });

  it('authorize: falls back to http:// when x-forwarded-proto header is absent', async () => {
    const getAuthorizationUrl = vi
      .fn()
      .mockResolvedValue('https://idp.example.com/authorize?state=xyz');
    const app = buildApp(undefined, { getAuthorizationUrl });
    await app.inject({
      method: 'GET',
      url: '/api/v1/auth/sso/authorize/idp-1',
      headers: { host: 'localhost:3000' },
    });
    expect(getAuthorizationUrl).toHaveBeenCalledWith(
      'idp-1',
      expect.stringMatching(/^http:\/\//),
      undefined
    );
  });

  it('authorize: passes workspace query param to manager', async () => {
    const getAuthorizationUrl = vi
      .fn()
      .mockResolvedValue('https://idp.example.com/authorize?state=xyz');
    const app = buildApp(undefined, { getAuthorizationUrl });
    await app.inject({
      method: 'GET',
      url: '/api/v1/auth/sso/authorize/idp-1?workspace=ws-42',
      headers: { host: 'localhost' },
    });
    expect(getAuthorizationUrl).toHaveBeenCalledWith('idp-1', expect.any(String), 'ws-42');
  });

  // ── Callback route ───────────────────────────────────────────────

  it('GET /api/v1/auth/sso/callback/:id redirects to dashboard with tokens', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/sso/callback/idp-1?state=xyz&code=abc',
      headers: { host: 'localhost' },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('access_token=tok-a');
  });

  it('GET /api/v1/auth/sso/callback/:id redirects to dashboard with error on failure', async () => {
    const app = buildApp(undefined, {
      handleCallback: vi.fn().mockRejectedValue(new Error('invalid state')),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/sso/callback/idp-1?state=bad',
      headers: { host: 'localhost' },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('sso_error');
  });

  it('callback: missing state param redirects to dashboard with sso_error', async () => {
    // Manager throws 'Missing state parameter' — route should redirect with error
    const app = buildApp(undefined, {
      handleCallback: vi.fn().mockRejectedValue(new Error('Missing state parameter in callback')),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/sso/callback/idp-1',
      headers: { host: 'localhost' },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('sso_error');
    // Parse the sso_error query param (handles + encoding in query strings)
    const errParam = new URL(res.headers.location!).searchParams.get('sso_error');
    expect(errParam).toContain('Missing state parameter');
  });

  it('callback: IDP error response (access_denied) redirects with sso_error', async () => {
    const app = buildApp(undefined, {
      handleCallback: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('access_denied'), { error: 'access_denied' })),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/sso/callback/idp-1?error=access_denied&state=abc',
      headers: { host: 'localhost' },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('sso_error');
    const errParam = new URL(res.headers.location!).searchParams.get('sso_error');
    expect(errParam).toContain('access_denied');
  });

  it('callback: expired state redirects with sso_error', async () => {
    const app = buildApp(undefined, {
      handleCallback: vi.fn().mockRejectedValue(new Error('Invalid or expired SSO state')),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/sso/callback/idp-1?state=old-state&code=xyz',
      headers: { host: 'localhost' },
    });
    expect(res.statusCode).toBe(302);
    const errParam = new URL(res.headers.location!).searchParams.get('sso_error');
    expect(errParam).toContain('expired');
  });
});

describe('SSO Routes — provider management (admin)', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(() => {
    app = buildApp();
  });

  it('POST /api/v1/auth/sso/providers creates provider (strips secret)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sso/providers',
      payload: {
        name: 'Okta',
        type: 'oidc',
        issuerUrl: 'https://okta.example.com',
        clientId: 'c1',
        clientSecret: 'secret',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().provider.name).toBe('Okta');
    expect(res.json().provider.clientSecret).toBeUndefined();
  });

  it('POST /api/v1/auth/sso/providers returns 400 on storage error', async () => {
    const a = buildApp({
      createIdentityProvider: vi.fn().mockRejectedValue(new Error('duplicate')),
    });
    const res = await a.inject({
      method: 'POST',
      url: '/api/v1/auth/sso/providers',
      payload: { name: 'X', type: 'oidc' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/v1/auth/sso/providers/:id returns provider without secret', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/sso/providers/idp-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().provider.id).toBe('idp-1');
    expect(res.json().provider.clientSecret).toBeUndefined();
  });

  it('GET /api/v1/auth/sso/providers/:id returns 404 when not found', async () => {
    const a = buildApp({ getIdentityProvider: vi.fn().mockResolvedValue(null) });
    const res = await a.inject({ method: 'GET', url: '/api/v1/auth/sso/providers/missing' });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /api/v1/auth/sso/providers/:id updates provider', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/auth/sso/providers/idp-1',
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().provider.id).toBe('idp-1');
    expect(res.json().provider.clientSecret).toBeUndefined();
  });

  it('PUT /api/v1/auth/sso/providers/:id returns 404 when provider not found', async () => {
    const a = buildApp({ updateIdentityProvider: vi.fn().mockResolvedValue(null) });
    const res = await a.inject({
      method: 'PUT',
      url: '/api/v1/auth/sso/providers/missing',
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /api/v1/auth/sso/providers/:id returns 400 on storage error', async () => {
    const a = buildApp({
      updateIdentityProvider: vi.fn().mockRejectedValue(new Error('constraint')),
    });
    const res = await a.inject({
      method: 'PUT',
      url: '/api/v1/auth/sso/providers/idp-1',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE /api/v1/auth/sso/providers/:id returns 200 with message', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/auth/sso/providers/idp-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('deleted');
  });

  it('DELETE /api/v1/auth/sso/providers/:id returns 404 when not found', async () => {
    const a = buildApp({ deleteIdentityProvider: vi.fn().mockResolvedValue(false) });
    const res = await a.inject({ method: 'DELETE', url: '/api/v1/auth/sso/providers/missing' });
    expect(res.statusCode).toBe(404);
  });
});
