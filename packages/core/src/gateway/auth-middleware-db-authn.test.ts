import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { AuthService, AuthError } from '../security/auth.js';
import { AuthStorage } from '../security/auth-storage.js';
import { AuditChain, InMemoryAuditStorage } from '../logging/audit-chain.js';
import { RBAC, initializeRBAC } from '../security/rbac.js';
import { RateLimiter } from '../security/rate-limiter.js';
import { createAuthHook, createRbacHook } from './auth-middleware.js';
import type { SecureLogger } from '../logging/logger.js';
import { sha256 } from '../utils/crypto.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

const TOKEN_SECRET = 'test-token-secret-at-least-32chars!!';
const ADMIN_PASSWORD_RAW = 'test-admin-password-32chars!!';
const ADMIN_PASSWORD = sha256(ADMIN_PASSWORD_RAW);
const SIGNING_KEY = 'a]&3Gk9$mQ#vL7@pR!wZ5*xN2^bT8+dF';

function noopLogger(): SecureLogger {
  const noop = () => {};
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => noopLogger(),
    level: 'silent',
  };
}

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('Auth Middleware — Authentication & Bypass', () => {
  let app: FastifyInstance;
  let authStorage: AuthStorage;
  let authService: AuthService;
  let rbac: RBAC;
  let rateLimiter: RateLimiter;
  let auditChain: AuditChain;

  beforeEach(async () => {
    await truncateAllTables();
    authStorage = new AuthStorage();
    const auditStorage = new InMemoryAuditStorage();
    auditChain = new AuditChain({ storage: auditStorage, signingKey: SIGNING_KEY });
    await auditChain.initialize();
    rbac = await initializeRBAC();
    rateLimiter = new RateLimiter({ defaultWindowMs: 60000, defaultMaxRequests: 100 });
    rateLimiter.addRule({
      name: 'auth_attempts',
      windowMs: 900000,
      maxRequests: 50,
      keyType: 'ip',
      onExceed: 'reject',
    });

    authService = new AuthService(
      {
        tokenSecret: TOKEN_SECRET,
        tokenExpirySeconds: 3600,
        refreshTokenExpirySeconds: 86400,
        adminPassword: ADMIN_PASSWORD,
      },
      {
        storage: authStorage,
        auditChain,
        rbac,
        rateLimiter,
        logger: noopLogger(),
      }
    );

    app = Fastify({ logger: false });

    const logger = noopLogger();
    app.addHook('onRequest', createAuthHook({ authService, logger }));
    app.addHook('onRequest', createRbacHook({ rbac, auditChain, logger }));

    // Register test routes that match the permission map
    app.get('/health', async () => ({ status: 'ok' }));
    app.post('/api/v1/auth/login', async () => ({ ok: true }));
    app.post('/api/v1/auth/logout', async (req) => ({ user: req.authUser?.userId }));
    app.get('/api/v1/metrics', async (req) => ({ user: req.authUser?.userId }));
    app.get('/api/v1/tasks', async (req) => ({ user: req.authUser?.userId }));
    app.get('/api/v1/audit', async (req) => ({ user: req.authUser?.userId }));
    app.post('/api/v1/audit/verify', async (req) => ({ user: req.authUser?.userId }));
    app.get('/api/v1/security/events', async (req) => ({ user: req.authUser?.userId }));
    app.post('/api/v1/auth/verify', async (req) => ({ user: req.authUser?.userId }));
    app.post('/api/v1/auth/api-keys', async (req) => ({ user: req.authUser?.userId }));
    app.get('/api/v1/auth/api-keys', async (req) => ({ user: req.authUser?.userId }));
    app.delete('/api/v1/auth/api-keys/:id', async (req) => ({ user: req.authUser?.userId }));
    // unmapped route
    app.get('/api/v1/admin/danger', async (req) => ({ user: req.authUser?.userId }));
    // routes for new RBAC tests
    app.get('/api/v1/integrations', async (req) => ({ user: req.authUser?.userId }));
    app.get('/api/v1/brain/memories', async (req) => ({ user: req.authUser?.userId }));
    app.get('/api/v1/soul/users', async (req) => ({ user: req.authUser?.userId }));
    // workspace routes (previously missing from ROUTE_PERMISSIONS)
    app.get('/api/v1/workspaces', async (req) => ({ user: req.authUser?.userId }));
    app.get('/api/v1/workspaces/:id', async (req) => ({ user: req.authUser?.userId }));
    app.put('/api/v1/workspaces/:id', async (req) => ({ user: req.authUser?.userId }));
    app.get('/api/v1/workspaces/:id/members', async (req) => ({ user: req.authUser?.userId }));
    app.post('/api/v1/workspaces/:id/members', async (req) => ({ user: req.authUser?.userId }));
    app.put('/api/v1/workspaces/:id/members/:userId', async (req) => ({
      user: req.authUser?.userId,
    }));
    app.delete('/api/v1/workspaces/:id/members/:userId', async (req) => ({
      user: req.authUser?.userId,
    }));
    // user management routes (previously missing from ROUTE_PERMISSIONS)
    app.get('/api/v1/users', async (req) => ({ user: req.authUser?.userId }));
    app.post('/api/v1/users', async (req) => ({ user: req.authUser?.userId }));
    app.delete('/api/v1/users/:id', async (req) => ({ user: req.authUser?.userId }));

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    rateLimiter.stop();
  });

  // helper
  async function loginAndGetToken(): Promise<string> {
    const result = await authService.login(ADMIN_PASSWORD_RAW, '127.0.0.1');
    return result.accessToken;
  }

  async function createViewerApiKey(): Promise<string> {
    const { key } = await authService.createApiKey({
      name: 'viewer-key',
      role: 'viewer',
      userId: 'admin',
    });
    return key;
  }

  // ── Public routes bypass auth ────────────────────────────────────

  describe('public routes', () => {
    it('GET /health should be accessible without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    });

    it('POST /api/v1/auth/login should be accessible without auth', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: {} });
      expect(res.statusCode).toBe(200);
    });
  });

  // ── 401 on missing credentials ──────────────────────────────────

  describe('missing credentials', () => {
    it('should return 401 for protected route without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/metrics' });
      expect(res.statusCode).toBe(401);
      expect(res.json().message).toMatch(/Missing authentication/i);
    });
  });

  // ── Bearer token auth ───────────────────────────────────────────

  describe('Bearer token', () => {
    it('should authenticate with a valid Bearer token', async () => {
      const token = await loginAndGetToken();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/metrics',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user).toBe('admin');
    });

    it('should return 401 for an invalid token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/metrics',
        headers: { authorization: 'Bearer invalid.token.here' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── X-API-Key auth ──────────────────────────────────────────────

  describe('X-API-Key', () => {
    it('should authenticate with a valid API key', async () => {
      const key = await createViewerApiKey();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/metrics',
        headers: { 'x-api-key': key },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user).toBe('admin');
    });

    it('should return 401 for an invalid API key', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/metrics',
        headers: { 'x-api-key': 'sck_invalid' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── Auth verify endpoint RBAC ──────────────────────────────────

  describe('auth verify', () => {
    it('admin can access POST /api/v1/auth/verify', async () => {
      const token = await loginAndGetToken();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
    });

    it('viewer cannot access POST /api/v1/auth/verify (no auth permission)', async () => {
      const key = await createViewerApiKey();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify',
        headers: { 'x-api-key': key },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
    });

    it('unauthenticated cannot access POST /api/v1/auth/verify', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify',
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── Token-only routes ───────────────────────────────────────────

  describe('token-only routes', () => {
    it('should allow authenticated user to access logout without RBAC check', async () => {
      const token = await loginAndGetToken();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ─── bypass and error branch coverage ──────────────────────────────

  describe('auth bypass branches', () => {
    function makeReply() {
      let _code = 200;
      let _sent = false;
      return {
        wasSent: () => _sent,
        sentCode: () => _code,
        code: (c: number) => {
          _code = c;
          return {
            send: (_body: unknown) => {
              _sent = true;
            },
          };
        },
      };
    }

    it('allows GET /api/v1/soul/personalities/:id/avatar without auth', async () => {
      const hook = createAuthHook({ authService, logger: noopLogger() });
      const req: any = {
        method: 'GET',
        routeOptions: { url: '/api/v1/soul/personalities/:id/avatar' },
        url: '/api/v1/soul/personalities/abc123/avatar',
        headers: {},
        raw: { socket: {} },
      };
      const reply = makeReply();
      await hook(req, reply as any);
      expect(reply.wasSent()).toBe(false); // no 401 — avatar bypass fired
    });

    it('skips auth check for non-API/non-WS paths (SPA routes)', async () => {
      const hook = createAuthHook({ authService, logger: noopLogger() });
      const req: any = {
        method: 'GET',
        routeOptions: { url: '/dashboard' },
        url: '/dashboard',
        headers: {},
        raw: { socket: {} },
      };
      const reply = makeReply();
      await hook(req, reply as any);
      expect(reply.wasSent()).toBe(false); // no auth needed for SPA route
    });

    it('falls through when mTLS cert is authorized but has no subject.CN', async () => {
      const fakeAuth = {
        verifyToken: async () => {
          throw new Error('no token');
        },
        verifyApiKey: async () => {
          throw new Error('no key');
        },
      } as unknown as typeof authService;

      const hook = createAuthHook({ authService: fakeAuth, logger: noopLogger() });
      const req: any = {
        method: 'GET',
        routeOptions: { url: '/api/v1/metrics' },
        url: '/api/v1/metrics',
        headers: {},
        raw: { socket: { authorized: true, getPeerCertificate: () => ({ subject: {} }) } },
      };
      const reply = makeReply();
      await hook(req, reply as any);
      // Falls through to JWT/API-key auth, then gets 401 "Missing authentication credentials"
      expect(reply.wasSent()).toBe(true);
      expect(reply.sentCode()).toBe(401);
    });

    it('falls through when mTLS getPeerCertificate() throws', async () => {
      const hook = createAuthHook({ authService, logger: noopLogger() });
      const req: any = {
        method: 'GET',
        routeOptions: { url: '/api/v1/metrics' },
        url: '/api/v1/metrics',
        headers: {},
        raw: {
          socket: {
            authorized: true,
            getPeerCertificate: () => {
              throw new Error('cert error');
            },
          },
        },
      };
      const reply = makeReply();
      await hook(req, reply as any);
      // Exception caught — falls through to Bearer/API-key, then 401
      expect(reply.wasSent()).toBe(true);
      expect(reply.sentCode()).toBe(401);
    });

    it('returns 401 when Bearer token throws generic (non-AuthError)', async () => {
      const fakeAuth = {
        verifyToken: async () => {
          throw new Error('unexpected internal error');
        },
        verifyApiKey: async () => {
          throw new Error('no key');
        },
      } as unknown as typeof authService;

      const hook = createAuthHook({ authService: fakeAuth, logger: noopLogger() });
      const req: any = {
        method: 'GET',
        routeOptions: { url: '/api/v1/metrics' },
        url: '/api/v1/metrics',
        headers: { authorization: 'Bearer some-token' },
        raw: { socket: {} },
      };
      const reply = makeReply();
      await hook(req, reply as any);
      expect(reply.wasSent()).toBe(true);
      expect(reply.sentCode()).toBe(401);
    });

    it('returns 401 when API key throws generic (non-AuthError)', async () => {
      const fakeAuth = {
        verifyToken: async () => {
          throw new Error('no token');
        },
        verifyApiKey: async () => {
          throw new Error('unexpected key error');
        },
      } as unknown as typeof authService;

      const hook = createAuthHook({ authService: fakeAuth, logger: noopLogger() });
      const req: any = {
        method: 'GET',
        routeOptions: { url: '/api/v1/metrics' },
        url: '/api/v1/metrics',
        headers: { 'x-api-key': 'bad-key-value' },
        raw: { socket: {} },
      };
      const reply = makeReply();
      await hook(req, reply as any);
      expect(reply.wasSent()).toBe(true);
      expect(reply.sentCode()).toBe(401);
    });

    it('returns 401 "Missing authentication credentials" when no Bearer and no API key', async () => {
      const hook = createAuthHook({ authService, logger: noopLogger() });
      const req: any = {
        method: 'GET',
        routeOptions: { url: '/api/v1/metrics' },
        url: '/api/v1/metrics',
        headers: {},
        raw: { socket: {} },
      };
      const reply = makeReply();
      await hook(req, reply as any);
      expect(reply.wasSent()).toBe(true);
      expect(reply.sentCode()).toBe(401);
    });

    it('returns AuthError statusCode when Bearer token throws AuthError', async () => {
      const fakeAuth = {
        validateToken: async () => {
          const err = new AuthError('Token expired', 401);
          throw err;
        },
        validateApiKey: async () => {
          throw new Error('no key');
        },
      } as unknown as typeof authService;

      const hook = createAuthHook({ authService: fakeAuth, logger: noopLogger() });
      const req: any = {
        method: 'GET',
        routeOptions: { url: '/api/v1/metrics' },
        url: '/api/v1/metrics',
        headers: { authorization: 'Bearer expired-token' },
        raw: { socket: {} },
      };
      const reply = makeReply();
      await hook(req, reply as any);
      expect(reply.wasSent()).toBe(true);
      expect(reply.sentCode()).toBe(401);
    });

    it('returns AuthError statusCode when API key throws AuthError', async () => {
      const fakeAuth = {
        validateToken: async () => {
          throw new Error('no token');
        },
        validateApiKey: async () => {
          const err = new AuthError('API key revoked', 403);
          throw err;
        },
      } as unknown as typeof authService;

      const hook = createAuthHook({ authService: fakeAuth, logger: noopLogger() });
      const req: any = {
        method: 'GET',
        routeOptions: { url: '/api/v1/metrics' },
        url: '/api/v1/metrics',
        headers: { 'x-api-key': 'revoked-key' },
        raw: { socket: {} },
      };
      const reply = makeReply();
      await hook(req, reply as any);
      expect(reply.wasSent()).toBe(true);
      expect(reply.sentCode()).toBe(403);
    });

    it('prefers Bearer token over API key when both are present', async () => {
      const token = await loginAndGetToken();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/metrics',
        headers: {
          authorization: `Bearer ${token}`,
          'x-api-key': 'should-not-be-used',
        },
      });
      // Bearer succeeds first — API key path is never reached
      expect(res.statusCode).toBe(200);
      expect(res.json().user).toBe('admin');
    });

    it('RBAC hook returns 401 "Not authenticated" when authUser is missing on protected route', async () => {
      const rbacHook = createRbacHook({ rbac, auditChain, logger: noopLogger() });
      const req: any = {
        method: 'GET',
        routeOptions: { url: '/api/v1/metrics' },
        url: '/api/v1/metrics',
        authUser: undefined,
      };
      const reply = makeReply();
      await rbacHook(req, reply as any);
      expect(reply.wasSent()).toBe(true);
      expect(reply.sentCode()).toBe(401);
    });

    it('RBAC hook skips non-API/non-WS paths', async () => {
      const rbacHook = createRbacHook({ rbac, auditChain, logger: noopLogger() });
      const req: any = {
        method: 'GET',
        routeOptions: { url: '/dashboard/settings' },
        url: '/dashboard/settings',
        authUser: undefined,
      };
      const reply = makeReply();
      await rbacHook(req, reply as any);
      expect(reply.wasSent()).toBe(false); // No auth check for SPA routes
    });

    it('RBAC hook skips avatar GET requests', async () => {
      const rbacHook = createRbacHook({ rbac, auditChain, logger: noopLogger() });
      const req: any = {
        method: 'GET',
        routeOptions: { url: '/api/v1/soul/personalities/:id/avatar' },
        url: '/api/v1/soul/personalities/abc/avatar',
        authUser: undefined,
      };
      const reply = makeReply();
      await rbacHook(req, reply as any);
      expect(reply.wasSent()).toBe(false); // Avatar bypass
    });
  });
});
