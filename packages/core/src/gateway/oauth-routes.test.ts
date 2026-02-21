import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { OAuthService, registerOAuthRoutes } from './oauth-routes.js';
import type { AuthService } from '../security/auth.js';
import type { OAuthTokenService } from './oauth-token-service.js';

const MOCK_PROVIDER = {
  id: 'google',
  name: 'Google',
  clientId: 'test-client-id',
  clientSecret: 'test-secret',
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
  scopes: ['openid', 'email', 'profile'],
};

function makeMockOAuthService(overrides: Partial<OAuthService> = {}): OAuthService {
  return {
    isProviderConfigured: vi.fn().mockReturnValue(true),
    getProvider: vi.fn().mockReturnValue(MOCK_PROVIDER),
    getConfiguredProviders: vi.fn().mockReturnValue(['google']),
    generateState: vi.fn().mockReturnValue('mock-state-token'),
    validateState: vi.fn().mockReturnValue({
      provider: 'google',
      redirectUri: 'http://localhost/callback',
      createdAt: Date.now(),
    }),
    exchangeCode: vi.fn().mockResolvedValue({ accessToken: 'acc-tok', refreshToken: 'ref-tok' }),
    getUserInfo: vi
      .fn()
      .mockResolvedValue({ id: 'goog-1', email: 'user@example.com', name: 'Test User' }),
    generateOAuthConnectionToken: vi.fn().mockReturnValue('conn-token-123'),
    ...overrides,
  } as unknown as OAuthService;
}

function makeMockTokenService(overrides?: Partial<OAuthTokenService>): OAuthTokenService {
  return {
    listTokens: vi.fn().mockResolvedValue([{ id: 'tok-1', provider: 'gmail', email: 'u@x.com' }]),
    revokeToken: vi.fn().mockResolvedValue(true),
    storeToken: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as OAuthTokenService;
}

function buildApp(oauthOverrides: Partial<OAuthService> = {}, withTokenService = false) {
  const app = Fastify();
  const oauthService = makeMockOAuthService(oauthOverrides);
  const authService = {} as AuthService;
  registerOAuthRoutes(app, {
    authService,
    oauthService,
    baseUrl: 'http://localhost:3000',
    oauthTokenService: withTokenService ? makeMockTokenService() : undefined,
  });
  return app;
}

describe('GET /api/v1/auth/oauth/config', () => {
  it('returns configured providers', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/oauth/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json().providers).toHaveLength(1);
    expect(res.json().providers[0].id).toBe('google');
  });
});

describe('GET /api/v1/auth/oauth/:provider', () => {
  it('redirects to provider authorize URL when configured', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/oauth/google' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('accounts.google.com');
  });

  it('returns 400 when provider not configured', async () => {
    const app = buildApp({ isProviderConfigured: vi.fn().mockReturnValue(false) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/oauth/google' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('not configured');
  });

  it('returns 400 when provider unknown', async () => {
    const app = buildApp({ getProvider: vi.fn().mockReturnValue(undefined) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/oauth/unknown' });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/auth/oauth/:provider/callback', () => {
  it('redirects to error page when OAuth error returned', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/oauth/google/callback?error=access_denied',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('access_denied');
  });

  it('redirects with missing_params when code or state absent', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/oauth/google/callback',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('missing_params');
  });

  it('redirects with invalid_state when state is invalid', async () => {
    const app = buildApp({ validateState: vi.fn().mockReturnValue(null) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/oauth/google/callback?code=auth-code&state=bad-state',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('invalid_state');
  });

  it('redirects to oauth success page on successful exchange', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/oauth/google/callback?code=auth-code&state=mock-state',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('connected=true');
    expect(res.headers.location).toContain('google');
  });

  it('redirects to email page on successful gmail exchange', async () => {
    const app = buildApp({
      validateState: vi.fn().mockReturnValue({
        provider: 'gmail',
        redirectUri: 'http://localhost/callback',
        createdAt: Date.now(),
      }),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/oauth/gmail/callback?code=auth-code&state=mock-state',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('/connections/email');
  });

  it('redirects to error page on exchange failure', async () => {
    const app = buildApp({
      exchangeCode: vi.fn().mockRejectedValue(new Error('token exchange failed')),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/oauth/google/callback?code=auth-code&state=mock-state',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('error=');
  });
});

describe('POST /api/v1/auth/oauth/disconnect', () => {
  it('disconnects provider', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/disconnect',
      payload: { provider: 'google' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('google');
  });

  it('returns 400 when provider missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/disconnect',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/v1/auth/oauth/claim', () => {
  it('returns 400 when connectionToken missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/claim',
      payload: { displayName: 'Gmail' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when connectionToken not found', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/claim',
      payload: { connectionToken: 'nonexistent-token' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/v1/auth/oauth/tokens', () => {
  it('returns token list when service available', async () => {
    const app = buildApp({}, true);
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/oauth/tokens' });
    expect(res.statusCode).toBe(200);
    expect(res.json().tokens).toHaveLength(1);
    expect(res.json().total).toBe(1);
  });

  it('returns 503 when token service not configured', async () => {
    const app = buildApp({}, false);
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/oauth/tokens' });
    expect(res.statusCode).toBe(503);
  });
});

describe('DELETE /api/v1/auth/oauth/tokens/:id', () => {
  it('revokes a token', async () => {
    const app = buildApp({}, true);
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/auth/oauth/tokens/tok-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('revoked');
  });

  it('returns 404 when token not found', async () => {
    const app = Fastify();
    registerOAuthRoutes(app, {
      authService: {} as AuthService,
      oauthService: makeMockOAuthService(),
      baseUrl: 'http://localhost:3000',
      oauthTokenService: makeMockTokenService({ revokeToken: vi.fn().mockResolvedValue(false) }),
    });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/auth/oauth/tokens/missing' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 503 when token service not configured', async () => {
    const app = buildApp({}, false);
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/auth/oauth/tokens/tok-1' });
    expect(res.statusCode).toBe(503);
  });
});

describe('OAuthService unit tests', () => {
  it('isProviderConfigured returns false when no config', () => {
    const svc = new OAuthService({});
    expect(svc.isProviderConfigured('google')).toBe(false);
  });

  it('isProviderConfigured returns true when configured', () => {
    const svc = new OAuthService({ google: { clientId: 'id', clientSecret: 'secret' } });
    expect(svc.isProviderConfigured('google')).toBe(true);
  });

  it('getConfiguredProviders returns only configured providers', () => {
    const svc = new OAuthService({ google: { clientId: 'id', clientSecret: 'secret' } });
    const configured = svc.getConfiguredProviders();
    expect(configured).toContain('google');
  });

  it('getProvider returns provider by id', () => {
    const svc = new OAuthService({});
    expect(svc.getProvider('google')?.id).toBe('google');
    expect(svc.getProvider('unknown')).toBeUndefined();
  });

  it('generateState returns a token and validateState returns the state', () => {
    const svc = new OAuthService({});
    const state = svc.generateState('google', 'http://localhost/cb');
    expect(state).toBeTruthy();
    const result = svc.validateState(state);
    expect(result?.provider).toBe('google');
  });

  it('validateState returns null for unknown state', () => {
    const svc = new OAuthService({});
    expect(svc.validateState('bogus-state')).toBeNull();
  });

  it('generateOAuthConnectionToken returns a deterministic hash', () => {
    const svc = new OAuthService({});
    const token1 = svc.generateOAuthConnectionToken('google', 'user-1');
    expect(token1).toHaveLength(64); // sha256 hex
  });
});
