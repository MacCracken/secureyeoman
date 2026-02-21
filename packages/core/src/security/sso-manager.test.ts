import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must mock openid-client before importing SsoManager (lazy import via dynamic import)
vi.mock('openid-client', () => ({
  discovery: vi.fn(),
  randomPKCECodeVerifier: vi.fn().mockReturnValue('test-verifier'),
  calculatePKCECodeChallenge: vi.fn().mockResolvedValue('test-challenge'),
  buildAuthorizationUrl: vi
    .fn()
    .mockReturnValue(new URL('https://idp.example.com/authorize?state=abc')),
  authorizationCodeGrant: vi.fn(),
}));

import { SsoManager } from './sso-manager.js';
import type { SsoManagerDeps } from './sso-manager.js';
import type { SsoStorage, IdentityProvider } from './sso-storage.js';
import type { AuthService } from './auth.js';

// ── Helpers ──────────────────────────────────────────────────────

const PROVIDER: IdentityProvider = {
  id: 'idp-1',
  name: 'Test OIDC',
  type: 'oidc',
  issuerUrl: 'https://idp.example.com',
  clientId: 'client-123',
  clientSecret: 'secret',
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
    getIdentityProvider: vi.fn().mockResolvedValue(PROVIDER),
    createSsoState: vi.fn().mockResolvedValue(undefined),
    getSsoState: vi.fn().mockResolvedValue({
      state: 'abc123',
      providerId: 'idp-1',
      redirectUri: 'https://app.example.com/callback',
      codeVerifier: 'test-verifier',
      workspaceId: null,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
    }),
    deleteSsoState: vi.fn().mockResolvedValue(undefined),
    getMappingByExternalSubject: vi.fn().mockResolvedValue(null),
    createIdentityMapping: vi.fn().mockResolvedValue({
      id: 'map-1',
      idpId: 'idp-1',
      localUserId: 'u1',
      externalSubject: 'sub1',
      attributes: {},
      createdAt: 0,
      lastLoginAt: null,
    }),
    updateMappingLastLogin: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SsoStorage;
}

function makeMockAuth(overrides?: Partial<AuthService>): AuthService {
  return {
    getUserByEmail: vi.fn().mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      displayName: 'Test',
      isAdmin: false,
      createdAt: 0,
    }),
    createUser: vi.fn().mockResolvedValue({
      id: 'u-new',
      email: 'new@example.com',
      displayName: 'New',
      isAdmin: false,
      createdAt: 0,
    }),
    createUserSession: vi
      .fn()
      .mockResolvedValue({ accessToken: 'tok-a', refreshToken: 'tok-r', expiresIn: 3600 }),
    ...overrides,
  } as unknown as AuthService;
}

function makeDeps(
  storageOverrides?: Partial<SsoStorage>,
  authOverrides?: Partial<AuthService>
): SsoManagerDeps {
  const noop = () => {};
  return {
    storage: makeMockStorage(storageOverrides),
    authService: makeMockAuth(authOverrides),
    logger: {
      trace: noop,
      debug: noop,
      info: noop,
      warn: noop,
      error: noop,
      fatal: noop,
      child: () => ({}),
    } as never,
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('SsoManager', () => {
  let oidc: typeof import('openid-client');

  beforeEach(async () => {
    oidc = await import('openid-client');
    vi.mocked(oidc.discovery).mockResolvedValue({ issuer: 'https://idp.example.com' } as never);
    vi.mocked(oidc.buildAuthorizationUrl).mockReturnValue(
      new URL('https://idp.example.com/authorize?state=abc')
    );
  });

  describe('getAuthorizationUrl', () => {
    it('returns an authorization URL', async () => {
      const manager = new SsoManager(makeDeps());
      const url = await manager.getAuthorizationUrl('idp-1', 'https://app/callback');
      expect(url).toContain('https://idp.example.com');
    });

    it('throws when provider not found', async () => {
      const deps = makeDeps({ getIdentityProvider: vi.fn().mockResolvedValue(null) });
      const manager = new SsoManager(deps);
      await expect(manager.getAuthorizationUrl('missing', 'https://app/callback')).rejects.toThrow(
        'not found'
      );
    });

    it('throws when provider is disabled', async () => {
      const deps = makeDeps({
        getIdentityProvider: vi.fn().mockResolvedValue({ ...PROVIDER, enabled: false }),
      });
      const manager = new SsoManager(deps);
      await expect(manager.getAuthorizationUrl('idp-1', 'https://app/callback')).rejects.toThrow(
        'disabled'
      );
    });

    it('throws when provider is not OIDC', async () => {
      const deps = makeDeps({
        getIdentityProvider: vi.fn().mockResolvedValue({ ...PROVIDER, type: 'saml' }),
      });
      const manager = new SsoManager(deps);
      await expect(manager.getAuthorizationUrl('idp-1', 'https://app/callback')).rejects.toThrow(
        'OIDC'
      );
    });

    it('saves state and code_verifier to storage', async () => {
      const storageMock = makeMockStorage();
      const manager = new SsoManager({ ...makeDeps(), storage: storageMock });
      await manager.getAuthorizationUrl('idp-1', 'https://app/callback', 'ws-1');
      expect(storageMock.createSsoState).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'idp-1',
          redirectUri: 'https://app/callback',
          workspaceId: 'ws-1',
        })
      );
    });
  });

  describe('handleCallback', () => {
    it('throws when state param missing', async () => {
      const manager = new SsoManager(makeDeps());
      const url = new URL('https://app/callback?code=xyz');
      await expect(manager.handleCallback('idp-1', url)).rejects.toThrow('Missing state');
    });

    it('throws when state not found in storage', async () => {
      const deps = makeDeps({ getSsoState: vi.fn().mockResolvedValue(null) });
      const manager = new SsoManager(deps);
      const url = new URL('https://app/callback?code=xyz&state=bad');
      await expect(manager.handleCallback('idp-1', url)).rejects.toThrow('expired');
    });

    it('throws when provider id mismatches stored state', async () => {
      const deps = makeDeps({
        getSsoState: vi.fn().mockResolvedValue({
          state: 's',
          providerId: 'other-idp',
          redirectUri: 'r',
          codeVerifier: null,
          workspaceId: null,
          createdAt: 0,
          expiresAt: Date.now() + 60000,
        }),
      });
      const manager = new SsoManager(deps);
      const url = new URL('https://app/callback?state=s');
      await expect(manager.handleCallback('idp-1', url)).rejects.toThrow('mismatch');
    });

    it('throws when provider not found during callback (second lookup fails)', async () => {
      const storage = makeMockStorage({
        getSsoState: vi.fn().mockResolvedValue({
          state: 's',
          providerId: 'idp-1',
          redirectUri: 'r',
          codeVerifier: null,
          workspaceId: null,
          createdAt: 0,
          expiresAt: Date.now() + 60000,
        }),
        // First call (state lookup validation doesn't call getIdentityProvider) — callback checks it
        getIdentityProvider: vi.fn().mockResolvedValueOnce(null),
      });
      const manager = new SsoManager({ ...makeDeps(), storage });
      const url = new URL('https://app/callback?state=s&code=xyz');
      await expect(manager.handleCallback('idp-1', url)).rejects.toThrow('not found');
    });

    it('provisions existing user and creates session', async () => {
      vi.mocked(oidc.authorizationCodeGrant).mockResolvedValue({
        claims: () => ({ sub: 'sub1', email: 'user@example.com', name: 'User' }),
      } as never);

      const authMock = makeMockAuth();
      const manager = new SsoManager({ ...makeDeps(), authService: authMock });
      const url = new URL('https://app/callback?state=abc123&code=xyz');
      const { result, redirectUri } = await manager.handleCallback('idp-1', url);

      expect(result.accessToken).toBe('tok-a');
      expect(redirectUri).toBe('https://app.example.com/callback');
      expect(authMock.createUserSession).toHaveBeenCalled();
    });

    it('returns existing mapping when user previously linked', async () => {
      vi.mocked(oidc.authorizationCodeGrant).mockResolvedValue({
        claims: () => ({ sub: 'sub1', email: 'user@example.com', name: 'User' }),
      } as never);

      const storageMock = makeMockStorage({
        getMappingByExternalSubject: vi.fn().mockResolvedValue({
          id: 'map-1',
          idpId: 'idp-1',
          localUserId: 'existing-user',
          externalSubject: 'sub1',
          attributes: {},
          createdAt: 0,
          lastLoginAt: null,
        }),
      });
      const authMock = makeMockAuth();
      const manager = new SsoManager({
        ...makeDeps(),
        storage: storageMock,
        authService: authMock,
      });
      const url = new URL('https://app/callback?state=abc123&code=xyz');
      await manager.handleCallback('idp-1', url);

      expect(storageMock.updateMappingLastLogin).toHaveBeenCalled();
      expect(authMock.createUserSession).toHaveBeenCalledWith('existing-user', expect.anything());
    });

    it('auto-provisions new user when autoProvision is true', async () => {
      vi.mocked(oidc.authorizationCodeGrant).mockResolvedValue({
        claims: () => ({ sub: 'new-sub', email: 'new@example.com', name: 'New User' }),
      } as never);

      const authMock = makeMockAuth({
        getUserByEmail: vi.fn().mockResolvedValue(null), // user doesn't exist
        createUser: vi.fn().mockResolvedValue({
          id: 'u-new',
          email: 'new@example.com',
          displayName: 'New User',
          isAdmin: false,
          createdAt: 0,
        }),
      });
      const manager = new SsoManager({ ...makeDeps(), authService: authMock });
      const url = new URL('https://app/callback?state=abc123&code=xyz');
      await manager.handleCallback('idp-1', url);

      expect(authMock.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com' })
      );
    });

    it('throws when user not found and autoProvision is disabled', async () => {
      vi.mocked(oidc.authorizationCodeGrant).mockResolvedValue({
        claims: () => ({ sub: 'sub-x', email: 'x@example.com', name: 'X' }),
      } as never);

      const storageMock = makeMockStorage({
        getIdentityProvider: vi.fn().mockResolvedValue({ ...PROVIDER, autoProvision: false }),
      });
      const authMock = makeMockAuth({ getUserByEmail: vi.fn().mockResolvedValue(null) });
      const manager = new SsoManager({
        ...makeDeps(),
        storage: storageMock,
        authService: authMock,
      });
      const url = new URL('https://app/callback?state=abc123&code=xyz');
      await expect(manager.handleCallback('idp-1', url)).rejects.toThrow(
        'auto-provisioning is disabled'
      );
    });

    it('throws when ID token has no claims', async () => {
      vi.mocked(oidc.authorizationCodeGrant).mockResolvedValue({
        claims: () => null,
      } as never);
      const manager = new SsoManager(makeDeps());
      const url = new URL('https://app/callback?state=abc123&code=xyz');
      await expect(manager.handleCallback('idp-1', url)).rejects.toThrow('No claims');
    });

    // ── Consume-state-on-failure coverage ─────────────────────────

    it('consumes state (deleteSsoState) even when provider ID mismatches', async () => {
      const storageMock = makeMockStorage({
        getSsoState: vi.fn().mockResolvedValue({
          state: 's',
          providerId: 'other-idp',
          redirectUri: 'r',
          codeVerifier: null,
          workspaceId: null,
          createdAt: 0,
          expiresAt: Date.now() + 60000,
        }),
      });
      const manager = new SsoManager({ ...makeDeps(), storage: storageMock });
      const url = new URL('https://app/callback?state=s&code=xyz');
      await expect(manager.handleCallback('idp-1', url)).rejects.toThrow('mismatch');
      expect(storageMock.deleteSsoState).toHaveBeenCalledWith('s');
    });

    it('propagates IDP error response (e.g. access_denied) and state is consumed', async () => {
      vi.mocked(oidc.authorizationCodeGrant).mockRejectedValue(
        Object.assign(new Error('access_denied'), { error: 'access_denied' })
      );
      const storageMock = makeMockStorage();
      const manager = new SsoManager({ ...makeDeps(), storage: storageMock });
      const url = new URL(
        'https://app/callback?error=access_denied&error_description=User+denied&state=abc123'
      );
      await expect(manager.handleCallback('idp-1', url)).rejects.toThrow('access_denied');
      expect(storageMock.deleteSsoState).toHaveBeenCalledWith('abc123');
    });

    it('propagates error for malformed callback (invalid code) and state is consumed', async () => {
      vi.mocked(oidc.authorizationCodeGrant).mockRejectedValue(
        new Error('invalid_grant: authorization code not found')
      );
      const storageMock = makeMockStorage();
      const manager = new SsoManager({ ...makeDeps(), storage: storageMock });
      const url = new URL('https://app/callback?state=abc123&code=bad-code');
      await expect(manager.handleCallback('idp-1', url)).rejects.toThrow('invalid_grant');
      expect(storageMock.deleteSsoState).toHaveBeenCalledWith('abc123');
    });

    it('throws for malformed callback missing both code and error params', async () => {
      vi.mocked(oidc.authorizationCodeGrant).mockRejectedValue(new Error('missing code parameter'));
      const storageMock = makeMockStorage();
      const manager = new SsoManager({ ...makeDeps(), storage: storageMock });
      const url = new URL('https://app/callback?state=abc123');
      await expect(manager.handleCallback('idp-1', url)).rejects.toThrow('missing code parameter');
      expect(storageMock.deleteSsoState).toHaveBeenCalledWith('abc123');
    });
  });
});
