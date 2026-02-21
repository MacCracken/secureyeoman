import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerAuthRoutes } from './auth-routes.js';
import { AuthError } from '../security/auth.js';
import type { AuthService } from '../security/auth.js';
import type { RBAC } from '../security/rbac.js';
import type { RateLimiterLike } from '../security/rate-limiter.js';

// ── Mock data ────────────────────────────────────────────────────────

const AUTH_USER = {
  userId: 'user-1',
  role: 'admin',
  permissions: ['*:*'],
  jti: 'jti-1',
  exp: Math.floor(Date.now() / 1000) + 3600,
};

const ROLE = {
  id: 'role_custom',
  name: 'custom',
  description: 'Custom role',
  permissions: [{ resource: 'chat', actions: ['read'] }],
  inheritFrom: [],
};

function makeMockAuthService(overrides?: Partial<AuthService>): AuthService {
  return {
    login: vi.fn().mockResolvedValue({ token: 'jwt-token', refreshToken: 'refresh-token' }),
    refresh: vi.fn().mockResolvedValue({ token: 'new-jwt', refreshToken: 'new-refresh' }),
    logout: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue(undefined),
    createApiKey: vi.fn().mockResolvedValue({ id: 'key-1', name: 'test-key', rawKey: 'sk-test' }),
    listApiKeys: vi.fn().mockReturnValue([{ id: 'key-1', name: 'test-key' }]),
    validateToken: vi.fn().mockResolvedValue(AUTH_USER),
    revokeApiKey: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as AuthService;
}

function makeMockRBAC(overrides?: Partial<RBAC>): RBAC {
  return {
    getAllRoles: vi.fn().mockReturnValue([ROLE]),
    getRole: vi.fn().mockReturnValue(ROLE),
    defineRole: vi.fn().mockResolvedValue(undefined),
    removeRole: vi.fn().mockResolvedValue(true),
    listUserAssignments: vi.fn().mockReturnValue([{ userId: 'user-1', roleId: 'role_custom' }]),
    assignUserRole: vi.fn().mockResolvedValue(undefined),
    revokeUserRole: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as RBAC;
}

function makeMockRateLimiter(): RateLimiterLike {
  return {
    check: vi.fn().mockResolvedValue({ allowed: true, remaining: 100 }),
  } as unknown as RateLimiterLike;
}

function buildApp(
  authOverrides?: Partial<AuthService>,
  rbacOverrides?: Partial<RBAC>,
  withAuthUser = true
) {
  const app = Fastify();

  // Decorate request with authUser for routes that require authentication
  app.decorateRequest('authUser', null);

  if (withAuthUser) {
    app.addHook('preHandler', async (request) => {
      (request as any).authUser = AUTH_USER;
    });
  }

  registerAuthRoutes(app, {
    authService: makeMockAuthService(authOverrides),
    rateLimiter: makeMockRateLimiter(),
    rbac: makeMockRBAC(rbacOverrides),
  });

  return app;
}

// ── Login ────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  it('returns tokens on successful login', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { password: 'test-password' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBe('jwt-token');
  });

  it('returns 400 when password missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns auth error status on AuthError', async () => {
    const err = new AuthError('Invalid credentials', 401);
    const app = buildApp({ login: vi.fn().mockRejectedValue(err) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on unexpected error', async () => {
    const app = buildApp({ login: vi.fn().mockRejectedValue(new Error('db error')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { password: 'test' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ── Refresh ──────────────────────────────────────────────────────────

describe('POST /api/v1/auth/refresh', () => {
  it('returns new tokens on valid refresh token', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: 'old-refresh-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBe('new-jwt');
  });

  it('returns 400 when refresh token missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 when refresh token is invalid', async () => {
    const app = buildApp({
      refresh: vi.fn().mockRejectedValue(new AuthError('Token expired', 401)),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: 'expired' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── Logout ───────────────────────────────────────────────────────────

describe('POST /api/v1/auth/logout', () => {
  it('logs out successfully', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('Logged out');
  });

  it('returns 400 when no authUser', async () => {
    const app = buildApp(undefined, undefined, false);
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' });
    expect(res.statusCode).toBe(400);
  });
});

// ── Reset password ───────────────────────────────────────────────────

describe('POST /api/v1/auth/reset-password', () => {
  it('resets password successfully', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { currentPassword: 'old', newPassword: 'new123456' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('reset');
  });

  it('returns 400 when currentPassword missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { newPassword: 'new' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when newPassword missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { currentPassword: 'old' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── API Keys ─────────────────────────────────────────────────────────

describe('POST /api/v1/auth/api-keys', () => {
  it('creates API key and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      payload: { name: 'my-key', role: 'viewer' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().rawKey).toBe('sk-test');
  });

  it('returns 400 when name missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      payload: { role: 'viewer' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when role missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      payload: { name: 'my-key' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/auth/api-keys', () => {
  it('returns list of API keys', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/api-keys' });
    expect(res.statusCode).toBe(200);
    expect(res.json().keys).toHaveLength(1);
  });
});

describe('POST /api/v1/auth/verify', () => {
  it('returns valid: true for valid token', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify',
      payload: { token: 'valid-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().valid).toBe(true);
  });

  it('returns valid: false for invalid token', async () => {
    const app = buildApp({ validateToken: vi.fn().mockRejectedValue(new Error('invalid')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify',
      payload: { token: 'bad-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().valid).toBe(false);
  });

  it('returns 400 when token missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/v1/auth/api-keys/:id', () => {
  it('revokes API key', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/auth/api-keys/key-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('revoked');
  });

  it('returns 404 when key not found', async () => {
    const app = buildApp({ revokeApiKey: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/auth/api-keys/missing' });
    expect(res.statusCode).toBe(404);
  });
});

// ── Roles ────────────────────────────────────────────────────────────

describe('GET /api/v1/auth/roles', () => {
  it('returns all roles', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/roles' });
    expect(res.statusCode).toBe(200);
    expect(res.json().roles).toHaveLength(1);
    expect(res.json().roles[0].isBuiltin).toBe(false);
  });

  it('marks builtin roles correctly', async () => {
    const builtinRole = { ...ROLE, id: 'role_admin', name: 'admin' };
    const app = buildApp(undefined, { getAllRoles: vi.fn().mockReturnValue([builtinRole]) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/roles' });
    expect(res.json().roles[0].isBuiltin).toBe(true);
  });
});

describe('POST /api/v1/auth/roles', () => {
  it('creates a role and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/roles',
      payload: {
        name: 'customrole',
        permissions: [{ resource: 'chat', actions: ['read'] }],
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it('returns 400 when name missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/roles',
      payload: { permissions: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when permissions missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/roles',
      payload: { name: 'test' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PUT /api/v1/auth/roles/:id', () => {
  it('updates a custom role', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/auth/roles/role_custom',
      payload: { name: 'updated-custom' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 403 when trying to update builtin role', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/auth/roles/role_admin',
      payload: { name: 'my-admin' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when role not found', async () => {
    const app = buildApp(undefined, { getRole: vi.fn().mockReturnValue(null) });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/auth/roles/role_missing',
      payload: { name: 'missing' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/auth/roles/:id', () => {
  it('deletes custom role', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/auth/roles/role_custom' });
    expect(res.statusCode).toBe(200);
  });

  it('returns 403 for builtin role', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/auth/roles/role_admin' });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when role not found', async () => {
    const app = buildApp(undefined, { removeRole: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/auth/roles/role_missing' });
    expect(res.statusCode).toBe(404);
  });
});

// ── Assignments ──────────────────────────────────────────────────────

describe('GET /api/v1/auth/assignments', () => {
  it('returns all assignments', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/assignments' });
    expect(res.statusCode).toBe(200);
    expect(res.json().assignments).toHaveLength(1);
  });
});

describe('POST /api/v1/auth/assignments', () => {
  it('creates assignment and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/assignments',
      payload: { userId: 'user-1', roleId: 'role_custom' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('returns 400 when userId missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/assignments',
      payload: { roleId: 'role_custom' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when role not found', async () => {
    const app = buildApp(undefined, { getRole: vi.fn().mockReturnValue(null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/assignments',
      payload: { userId: 'user-1', roleId: 'role_missing' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/auth/assignments/:userId', () => {
  it('revokes assignment', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/auth/assignments/user-1',
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when no assignment found', async () => {
    const app = buildApp(undefined, { revokeUserRole: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/auth/assignments/missing-user',
    });
    expect(res.statusCode).toBe(404);
  });
});
