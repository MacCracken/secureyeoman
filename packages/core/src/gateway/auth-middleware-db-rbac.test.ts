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

describe('Auth Middleware — RBAC & Workspace', () => {
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

  // ── RBAC enforcement ────────────────────────────────────────────

  describe('RBAC', () => {
    it('admin can access everything', async () => {
      const token = await loginAndGetToken();
      const headers = { authorization: `Bearer ${token}` };

      const metricsRes = await app.inject({ method: 'GET', url: '/api/v1/metrics', headers });
      expect(metricsRes.statusCode).toBe(200);

      const auditRes = await app.inject({ method: 'GET', url: '/api/v1/audit', headers });
      expect(auditRes.statusCode).toBe(200);

      const keysRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/api-keys',
        headers,
        payload: {},
      });
      expect(keysRes.statusCode).toBe(200);
    });

    it('viewer can read metrics and tasks but not audit', async () => {
      const key = await createViewerApiKey();
      const headers = { 'x-api-key': key };

      const metricsRes = await app.inject({ method: 'GET', url: '/api/v1/metrics', headers });
      expect(metricsRes.statusCode).toBe(200);

      const tasksRes = await app.inject({ method: 'GET', url: '/api/v1/tasks', headers });
      expect(tasksRes.statusCode).toBe(200);

      const auditRes = await app.inject({ method: 'GET', url: '/api/v1/audit', headers });
      expect(auditRes.statusCode).toBe(403);

      const secEventsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/security/events',
        headers,
      });
      expect(secEventsRes.statusCode).toBe(403);
    });

    it('viewer cannot access admin-only routes', async () => {
      const key = await createViewerApiKey();
      const headers = { 'x-api-key': key };

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/api-keys',
        headers,
        payload: {},
      });
      expect(res.statusCode).toBe(403);
    });

    it('unmapped routes default-deny for non-admin', async () => {
      const key = await createViewerApiKey();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/danger',
        headers: { 'x-api-key': key },
      });
      expect(res.statusCode).toBe(403);
    });

    it('admin can access unmapped routes', async () => {
      const token = await loginAndGetToken();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/danger',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ── Operator role ────────────────────────────────────────────────

  describe('operator role', () => {
    async function createOperatorApiKey(): Promise<string> {
      const { key } = await authService.createApiKey({
        name: 'op-key',
        role: 'operator',
        userId: 'admin',
      });
      return key;
    }

    it('operator can read metrics', async () => {
      const key = await createOperatorApiKey();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/metrics',
        headers: { 'x-api-key': key },
      });
      expect(res.statusCode).toBe(200);
    });

    it('operator can read integrations', async () => {
      const key = await createOperatorApiKey();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations',
        headers: { 'x-api-key': key },
      });
      expect(res.statusCode).toBe(200);
    });

    it('operator can read brain memories', async () => {
      const key = await createOperatorApiKey();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/brain/memories',
        headers: { 'x-api-key': key },
      });
      expect(res.statusCode).toBe(200);
    });

    it('operator can read soul/users', async () => {
      const key = await createOperatorApiKey();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/soul/users',
        headers: { 'x-api-key': key },
      });
      expect(res.statusCode).toBe(200);
    });

    it('operator can GET /api/v1/auth/api-keys (auth:read)', async () => {
      const key = await createOperatorApiKey();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/api-keys',
        headers: { 'x-api-key': key },
      });
      expect(res.statusCode).toBe(200);
    });

    it('operator cannot access unmapped admin-only routes', async () => {
      const key = await createOperatorApiKey();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/danger',
        headers: { 'x-api-key': key },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── Auth management routes ────────────────────────────────────────

  describe('auth management routes', () => {
    it('admin can GET /api/v1/auth/api-keys', async () => {
      const token = await loginAndGetToken();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/api-keys',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('viewer cannot POST /api/v1/auth/api-keys (no auth:write)', async () => {
      const key = await createViewerApiKey();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/api-keys',
        headers: { 'x-api-key': key },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── Workspace RBAC routes (Phase 25 fixes) ───────────────────────

  describe('workspace RBAC routes', () => {
    async function createOperatorKey(): Promise<string> {
      const { key } = await authService.createApiKey({
        name: 'op-ws',
        role: 'operator',
        userId: 'admin',
      });
      return key;
    }

    it('admin can GET /api/v1/workspaces', async () => {
      const token = await loginAndGetToken();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/workspaces',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('viewer can GET /api/v1/workspaces (workspaces:read)', async () => {
      const key = await createViewerApiKey();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/workspaces',
        headers: { 'x-api-key': key },
      });
      expect(res.statusCode).toBe(200);
    });

    it('viewer can GET /api/v1/workspaces/:id', async () => {
      const key = await createViewerApiKey();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/workspaces/ws-1',
        headers: { 'x-api-key': key },
      });
      expect(res.statusCode).toBe(200);
    });

    it('viewer can GET /api/v1/workspaces/:id/members (was unmapped — now workspaces:read)', async () => {
      const key = await createViewerApiKey();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/workspaces/ws-1/members',
        headers: { 'x-api-key': key },
      });
      expect(res.statusCode).toBe(200);
    });

    it('operator can PUT /api/v1/workspaces/:id (was unmapped — now workspaces:write)', async () => {
      const key = await createOperatorKey();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/workspaces/ws-1',
        headers: { 'x-api-key': key },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
    });

    it('viewer cannot PUT /api/v1/workspaces/:id (no workspaces:write)', async () => {
      const key = await createViewerApiKey();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/workspaces/ws-1',
        headers: { 'x-api-key': key },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
    });

    it('operator can POST /api/v1/workspaces/:id/members (workspaces:write)', async () => {
      const key = await createOperatorKey();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/workspaces/ws-1/members',
        headers: { 'x-api-key': key },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
    });

    it('viewer cannot POST /api/v1/workspaces/:id/members (no workspaces:write)', async () => {
      const key = await createViewerApiKey();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/workspaces/ws-1/members',
        headers: { 'x-api-key': key },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
    });

    it('operator can PUT /api/v1/workspaces/:id/members/:userId (was unmapped — now workspaces:write)', async () => {
      const key = await createOperatorKey();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/workspaces/ws-1/members/u1',
        headers: { 'x-api-key': key },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
    });

    it('viewer cannot PUT /api/v1/workspaces/:id/members/:userId', async () => {
      const key = await createViewerApiKey();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/workspaces/ws-1/members/u1',
        headers: { 'x-api-key': key },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
    });

    it('admin can GET /api/v1/users (auth:read — was unmapped)', async () => {
      const token = await loginAndGetToken();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('operator can GET /api/v1/users (auth:read)', async () => {
      const key = await createOperatorKey();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users',
        headers: { 'x-api-key': key },
      });
      expect(res.statusCode).toBe(200);
    });

    it('viewer cannot GET /api/v1/users (no auth:read)', async () => {
      const key = await createViewerApiKey();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users',
        headers: { 'x-api-key': key },
      });
      expect(res.statusCode).toBe(403);
    });

    it('admin can POST /api/v1/users (auth:write — was unmapped)', async () => {
      const token = await loginAndGetToken();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
    });

    it('operator cannot POST /api/v1/users (no auth:write)', async () => {
      const key = await createOperatorKey();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: { 'x-api-key': key },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
    });

    it('admin can DELETE /api/v1/users/:id (auth:write — was unmapped)', async () => {
      const token = await loginAndGetToken();
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/users/u1',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('operator cannot DELETE /api/v1/users/:id (no auth:write)', async () => {
      const key = await createOperatorKey();
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/users/u1',
        headers: { 'x-api-key': key },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── mTLS role assignment ─────────────────────────────────────────

  describe('mTLS role assignment', () => {
    it('mTLS client with no role assignment falls back to operator role', async () => {
      const { createAuthHook: createHook } = await import('./auth-middleware.js');
      const hook = createHook({ authService, logger: noopLogger(), rbac });

      const mockRequest = {
        routeOptions: { url: '/api/v1/metrics' },
        url: '/api/v1/metrics',
        headers: {},
        raw: {
          socket: {
            authorized: true,
            getPeerCertificate: () => ({ subject: { CN: 'cert-user-unknown' } }),
          },
        },
        authUser: undefined as any,
      };

      await hook(mockRequest as any, {} as any);
      expect(mockRequest.authUser.role).toBe('operator');
      expect(mockRequest.authUser.userId).toBe('cert-user-unknown');
    });

    it('mTLS client with viewer assignment gets viewer role', async () => {
      await rbac.assignUserRole('cert-viewer', 'role_viewer', 'admin');

      const { createAuthHook: createHook } = await import('./auth-middleware.js');
      const hook = createHook({ authService, logger: noopLogger(), rbac });

      const mockRequest = {
        routeOptions: { url: '/api/v1/metrics' },
        url: '/api/v1/metrics',
        headers: {},
        raw: {
          socket: {
            authorized: true,
            getPeerCertificate: () => ({ subject: { CN: 'cert-viewer' } }),
          },
        },
        authUser: undefined as any,
      };

      await hook(mockRequest as any, {} as any);
      expect(mockRequest.authUser.role).toBe('role_viewer');
      expect(mockRequest.authUser.userId).toBe('cert-viewer');
    });
  });
});
