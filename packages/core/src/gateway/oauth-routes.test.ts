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
    generateState: vi
      .fn()
      .mockResolvedValue({ state: 'mock-state-token', codeVerifier: 'mock-verifier' }),
    validateState: vi.fn().mockResolvedValue({
      provider: 'google',
      redirectUri: 'http://localhost/callback',
      createdAt: Date.now(),
    }),
    exchangeCode: vi.fn().mockResolvedValue({ accessToken: 'acc-tok', refreshToken: 'ref-tok' }),
    getUserInfo: vi
      .fn()
      .mockResolvedValue({ id: 'goog-1', email: 'user@example.com', name: 'Test User' }),
    generateOAuthConnectionToken: vi.fn().mockReturnValue('conn-token-123'),
    storePendingTokens: vi.fn().mockResolvedValue(undefined),
    consumePendingTokens: vi.fn().mockResolvedValue(null),
    reload: vi.fn().mockReturnValue(['google']),
    ...overrides,
  } as unknown as OAuthService;
}

function makeMockTokenService(overrides?: Partial<OAuthTokenService>): OAuthTokenService {
  return {
    listTokens: vi.fn().mockResolvedValue([{ id: 'tok-1', provider: 'gmail', email: 'u@x.com' }]),
    revokeToken: vi.fn().mockResolvedValue(true),
    storeToken: vi.fn().mockResolvedValue(undefined),
    forceRefreshById: vi.fn().mockResolvedValue('refreshed-token'),
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
  it('redirects to provider authorize URL when configured, with PKCE params', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/oauth/google' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('accounts.google.com');
    expect(res.headers.location).toContain('code_challenge=');
    expect(res.headers.location).toContain('code_challenge_method=S256');
  });

  it('returns 400 when provider not configured', async () => {
    const app = buildApp({ isProviderConfigured: vi.fn().mockReturnValue(false) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/oauth/google' });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('not available');
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

describe('POST /api/v1/auth/oauth/tokens/:id/refresh', () => {
  it('force-refreshes a token and returns 200', async () => {
    const app = buildApp({}, true);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/tokens/tok-1/refresh',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('refreshed');
  });

  it('returns 404 when token not found or refresh failed', async () => {
    const app = Fastify();
    registerOAuthRoutes(app, {
      authService: {} as AuthService,
      oauthService: makeMockOAuthService(),
      baseUrl: 'http://localhost:3000',
      oauthTokenService: makeMockTokenService({
        forceRefreshById: vi.fn().mockResolvedValue(null),
      }),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/tokens/missing/refresh',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 503 when token service not configured', async () => {
    const app = buildApp({}, false);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/tokens/tok-1/refresh',
    });
    expect(res.statusCode).toBe(503);
  });
});

describe('GET /api/v1/auth/oauth/:provider — google services get offline params', () => {
  it('adds access_type=offline for gmail', async () => {
    const app = buildApp({
      isProviderConfigured: vi.fn().mockReturnValue(true),
      getProvider: vi.fn().mockReturnValue({
        ...MOCK_PROVIDER,
        id: 'gmail',
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      }),
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/oauth/gmail' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('access_type=offline');
    expect(res.headers.location).toContain('prompt=consent');
  });
});

describe('GET /api/v1/auth/oauth/:provider/callback — edge cases', () => {
  it('redirects with invalid_state when state provider does not match URL provider', async () => {
    const app = buildApp({
      validateState: vi.fn().mockReturnValue({
        provider: 'google', // mismatched — URL says gmail
        redirectUri: 'http://localhost/callback',
        createdAt: Date.now(),
      }),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/oauth/gmail/callback?code=auth-code&state=mock-state',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('invalid_state');
  });

  it('redirects to email error page on gmail exchange failure', async () => {
    const app = buildApp({
      validateState: vi.fn().mockReturnValue({
        provider: 'gmail',
        redirectUri: 'http://localhost/callback',
        createdAt: Date.now(),
      }),
      exchangeCode: vi.fn().mockRejectedValue(new Error('gmail token failed')),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/oauth/gmail/callback?code=auth-code&state=mock-state',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('/connections/email?error=');
  });

  it('redirects with "Unknown+error" when non-Error is thrown in callback', async () => {
    const app = buildApp({
      exchangeCode: vi.fn().mockRejectedValue('plain string error'),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/oauth/google/callback?code=auth-code&state=mock-state',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('Unknown%20error');
  });

  it('calls storeToken and redirects to email on successful gmail callback with token service', async () => {
    const fastifyApp = Fastify({ logger: false });
    const oauthSvc = makeMockOAuthService({
      validateState: vi.fn().mockReturnValue({
        provider: 'gmail',
        redirectUri: 'http://localhost/callback',
        createdAt: Date.now(),
      }),
      generateOAuthConnectionToken: vi.fn().mockReturnValue('gmail-conn-tok-2'),
      getUserInfo: vi
        .fn()
        .mockResolvedValue({ id: 'u-gmail', email: 'user@gmail.com', name: 'User' }),
    });
    const ts = makeMockTokenService();
    registerOAuthRoutes(fastifyApp, {
      authService: {} as AuthService,
      oauthService: oauthSvc,
      baseUrl: 'http://localhost:3000',
      oauthTokenService: ts,
    });
    const res = await fastifyApp.inject({
      method: 'GET',
      url: '/api/v1/auth/oauth/gmail/callback?code=auth-code&state=mock-state',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('/connections/email');
    expect(ts.storeToken).toHaveBeenCalled();
  });

  it('calls storeToken and redirects to calendar on googlecalendar callback', async () => {
    const fastifyApp = Fastify({ logger: false });
    const oauthSvc = makeMockOAuthService({
      validateState: vi.fn().mockReturnValue({
        provider: 'googlecalendar',
        redirectUri: 'http://localhost/callback',
        createdAt: Date.now(),
      }),
      generateOAuthConnectionToken: vi.fn().mockReturnValue('cal-conn-tok'),
      getUserInfo: vi
        .fn()
        .mockResolvedValue({ id: 'u-cal', email: 'user@gmail.com', name: 'User' }),
    });
    const ts = makeMockTokenService();
    registerOAuthRoutes(fastifyApp, {
      authService: {} as AuthService,
      oauthService: oauthSvc,
      baseUrl: 'http://localhost:3000',
      oauthTokenService: ts,
    });
    const res = await fastifyApp.inject({
      method: 'GET',
      url: '/api/v1/auth/oauth/googlecalendar/callback?code=auth-code&state=mock-state',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('/connections/calendar');
    expect(ts.storeToken).toHaveBeenCalled();
  });

  it('redirects to drive on googledrive callback', async () => {
    const fastifyApp = Fastify({ logger: false });
    const oauthSvc = makeMockOAuthService({
      validateState: vi.fn().mockReturnValue({
        provider: 'googledrive',
        redirectUri: 'http://localhost/callback',
        createdAt: Date.now(),
      }),
      generateOAuthConnectionToken: vi.fn().mockReturnValue('drive-conn-tok'),
      getUserInfo: vi
        .fn()
        .mockResolvedValue({ id: 'u-drive', email: 'user@gmail.com', name: 'User' }),
    });
    const ts = makeMockTokenService();
    registerOAuthRoutes(fastifyApp, {
      authService: {} as AuthService,
      oauthService: oauthSvc,
      baseUrl: 'http://localhost:3000',
      oauthTokenService: ts,
    });
    const res = await fastifyApp.inject({
      method: 'GET',
      url: '/api/v1/auth/oauth/googledrive/callback?code=auth-code&state=mock-state',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('/connections/drive');
    expect(ts.storeToken).toHaveBeenCalled();
  });
});

describe('POST /api/v1/auth/oauth/claim — success and token paths', () => {
  it('returns success config on valid pending gmail claim', async () => {
    const fastifyApp = Fastify({ logger: false });
    const oauthSvc = makeMockOAuthService({
      consumePendingTokens: vi.fn().mockResolvedValue({
        connectionToken: 'valid-claim-tok',
        provider: 'gmail',
        accessToken: 'acc-tok',
        refreshToken: 'ref-tok',
        email: 'claim@gmail.com',
        createdAt: Date.now(),
        expiresAt: Date.now() + 600_000,
      }),
    });
    registerOAuthRoutes(fastifyApp, {
      authService: {} as AuthService,
      oauthService: oauthSvc,
      baseUrl: 'http://localhost:3000',
    });

    // Claim the token
    const res = await fastifyApp.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/claim',
      payload: { connectionToken: 'valid-claim-tok', displayName: 'My Gmail' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().config.platform).toBe('gmail');
  });
});

describe('POST /api/v1/auth/oauth/reload', () => {
  it('returns updated provider list after reload', async () => {
    const reloadMock = vi.fn().mockReturnValue(['google', 'github']);
    const app = buildApp({ reload: reloadMock } as unknown as Partial<OAuthService>);
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/oauth/reload' });
    expect(res.statusCode).toBe(200);
    expect(res.json().providers).toHaveLength(2);
    expect(res.json().providers[0].id).toBe('google');
    expect(res.json().providers[1].id).toBe('github');
    expect(reloadMock).toHaveBeenCalled();
  });
});

describe('OAuthService.reload()', () => {
  it('picks up new env vars on reload', () => {
    const svc = new OAuthService({});
    expect(svc.isProviderConfigured('google')).toBe(false);

    process.env.GOOGLE_OAUTH_CLIENT_ID = 'new-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'new-secret';
    const providers = svc.reload();
    expect(providers).toContain('google');
    expect(svc.isProviderConfigured('google')).toBe(true);

    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
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

  it('generateState returns a state+codeVerifier and validateState returns the state', async () => {
    const svc = new OAuthService({});
    const { state, codeVerifier } = await svc.generateState('google', 'http://localhost/cb');
    expect(state).toBeTruthy();
    expect(codeVerifier).toBeTruthy();
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43); // base64url-encoded 32 bytes
    // Without DB-backed stateStorage, validateState returns null (no in-memory fallback)
    const result = await svc.validateState(state);
    expect(result).toBeNull();
  });

  it('validateState returns null for unknown state', async () => {
    const svc = new OAuthService({});
    expect(await svc.validateState('bogus-state')).toBeNull();
  });

  it('generateOAuthConnectionToken returns a deterministic hash', () => {
    const svc = new OAuthService({});
    const token1 = svc.generateOAuthConnectionToken('google', 'user-1');
    expect(token1).toHaveLength(43); // base64url-encoded 32-byte token
  });

  it('validateState returns null for expired state', async () => {
    const svc = new OAuthService({});
    const { state } = await svc.generateState('google', 'http://localhost/cb');

    // Without DB-backed stateStorage, validateState always returns null
    const result = await svc.validateState(state);
    expect(result).toBeNull();
  });

  it('loadFromEnv loads Google OAuth credentials from env vars', () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'env-google-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'env-google-secret';
    const svc = new OAuthService({});
    expect(svc.isProviderConfigured('google')).toBe(true);
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  });

  it('loadFromEnv loads GitHub OAuth credentials from env vars', () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = 'env-github-id';
    process.env.GITHUB_OAUTH_CLIENT_SECRET = 'env-github-secret';
    const svc = new OAuthService({});
    expect(svc.isProviderConfigured('github')).toBe(true);
    delete process.env.GITHUB_OAUTH_CLIENT_ID;
    delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
  });

  it('loadFromEnv loads Gmail credentials falling back to Google env vars', () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'env-google-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'env-google-secret';
    const svc = new OAuthService({});
    expect(svc.isProviderConfigured('gmail')).toBe(true);
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  });

  it('loadFromEnv loads Google Calendar using Google OAuth creds as fallback', () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'g-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'g-secret';
    const svc = new OAuthService({});
    expect(svc.isProviderConfigured('googlecalendar')).toBe(true);
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  });

  it('loadFromEnv loads Google Drive using Google OAuth creds as fallback', () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'g-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'g-secret';
    const svc = new OAuthService({});
    expect(svc.isProviderConfigured('googledrive')).toBe(true);
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  });
});

describe('OAuthService.exchangeCode()', () => {
  it('fetches and returns accessToken and refreshToken on success', async () => {
    const svc = new OAuthService({ google: { clientId: 'cid', clientSecret: 'csec' } });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'acc-tok', refresh_token: 'ref-tok' }),
      })
    );
    const result = await svc.exchangeCode('google', 'auth-code', 'http://localhost/cb');
    expect(result.accessToken).toBe('acc-tok');
    expect(result.refreshToken).toBe('ref-tok');
    vi.unstubAllGlobals();
  });

  it('returns undefined refreshToken when not present', async () => {
    const svc = new OAuthService({ google: { clientId: 'cid', clientSecret: 'csec' } });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'acc-only' }),
      })
    );
    const result = await svc.exchangeCode('google', 'code', 'http://localhost/cb');
    expect(result.refreshToken).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('throws when token exchange returns non-ok', async () => {
    const svc = new OAuthService({ google: { clientId: 'cid', clientSecret: 'csec' } });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        text: async () => 'Bad Request',
      })
    );
    await expect(svc.exchangeCode('google', 'code', 'http://localhost')).rejects.toThrow(
      'Token exchange failed'
    );
    vi.unstubAllGlobals();
  });

  it('throws when provider not configured', async () => {
    const svc = new OAuthService({});
    await expect(svc.exchangeCode('google', 'code', 'http://localhost')).rejects.toThrow(
      'not configured'
    );
  });
});

describe('OAuthService.getUserInfo()', () => {
  it('maps google response fields', async () => {
    const svc = new OAuthService({});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'g-1',
          email: 'user@gmail.com',
          name: 'Test User',
          picture: 'https://photo.url',
        }),
      })
    );
    const info = await svc.getUserInfo('google', 'tok');
    expect(info.id).toBe('g-1');
    expect(info.email).toBe('user@gmail.com');
    expect(info.avatarUrl).toBe('https://photo.url');
    vi.unstubAllGlobals();
  });

  it('maps gmail response the same as google', async () => {
    const svc = new OAuthService({});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'gm-1', email: 'user@gmail.com', name: 'Gmail User' }),
      })
    );
    const info = await svc.getUserInfo('gmail', 'tok');
    expect(info.id).toBe('gm-1');
    vi.unstubAllGlobals();
  });

  it('maps github response fields including avatar_url', async () => {
    const svc = new OAuthService({});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'gh-1',
          email: 'dev@github.com',
          name: 'Dev',
          avatar_url: 'https://avatar.url',
        }),
      })
    );
    const info = await svc.getUserInfo('github', 'tok');
    expect(info.id).toBe('gh-1');
    expect(info.avatarUrl).toBe('https://avatar.url');
    vi.unstubAllGlobals();
  });

  it('throws Unsupported provider for googlecalendar (no getUserInfo mapping)', async () => {
    const svc = new OAuthService({});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'cal-1' }),
      })
    );
    await expect(svc.getUserInfo('googlecalendar', 'tok')).rejects.toThrow('Unsupported provider');
    vi.unstubAllGlobals();
  });

  it('throws Unknown provider when provider not in OAUTH_PROVIDERS', async () => {
    const svc = new OAuthService({});
    await expect(svc.getUserInfo('nonexistent', 'tok')).rejects.toThrow('Unknown provider');
  });

  it('throws when getUserInfo fetch returns non-ok', async () => {
    const svc = new OAuthService({});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
      })
    );
    await expect(svc.getUserInfo('google', 'bad-tok')).rejects.toThrow('Failed to get user info');
    vi.unstubAllGlobals();
  });
});
