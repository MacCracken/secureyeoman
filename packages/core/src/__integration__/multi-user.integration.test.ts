/**
 * Integration Test: Multi-User Auth Flows
 *
 * Verifies session isolation across multiple concurrent users:
 * independent tokens, role enforcement per session, and that
 * logging out one session does not affect others.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import {
  createTestStack,
  createTestGateway,
  loginAndGetToken,
  setupTestDb,
  teardownTestDb,
  truncateAllTables,
  type TestStack,
} from './helpers.js';
import type { FastifyInstance } from 'fastify';

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('Multi-User Auth Flows Integration', () => {
  let stack: TestStack;
  let app: FastifyInstance;

  beforeEach(async () => {
    await truncateAllTables();
    stack = await createTestStack();
    await stack.auditChain.initialize();
    app = await createTestGateway(stack);
  });

  afterEach(async () => {
    await app.close();
    stack.cleanup();
  });

  // ── Concurrent sessions ───────────────────────────────────────────

  it('two concurrent admin sessions operate independently', async () => {
    const session1 = await loginAndGetToken(app);
    const session2 = await loginAndGetToken(app);

    // Both tokens are distinct
    expect(session1.accessToken).not.toBe(session2.accessToken);
    expect(session1.refreshToken).not.toBe(session2.refreshToken);

    // Both are valid
    const res1 = await app.inject({
      method: 'GET',
      url: '/api/v1/metrics',
      headers: { authorization: `Bearer ${session1.accessToken}` },
    });
    expect(res1.statusCode).toBe(200);

    const res2 = await app.inject({
      method: 'GET',
      url: '/api/v1/metrics',
      headers: { authorization: `Bearer ${session2.accessToken}` },
    });
    expect(res2.statusCode).toBe(200);
  });

  it('logging out one session does not revoke another session', async () => {
    const session1 = await loginAndGetToken(app);
    const session2 = await loginAndGetToken(app);

    // Logout session1
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { authorization: `Bearer ${session1.accessToken}` },
    });
    expect(logoutRes.statusCode).toBe(200);

    // session1 token is now revoked
    const afterLogout1 = await app.inject({
      method: 'GET',
      url: '/api/v1/metrics',
      headers: { authorization: `Bearer ${session1.accessToken}` },
    });
    expect(afterLogout1.statusCode).toBe(401);

    // session2 token is still valid
    const afterLogout2 = await app.inject({
      method: 'GET',
      url: '/api/v1/metrics',
      headers: { authorization: `Bearer ${session2.accessToken}` },
    });
    expect(afterLogout2.statusCode).toBe(200);
  });

  // ── Viewer vs Admin concurrency ───────────────────────────────────

  it('viewer API key and admin token operate concurrently with correct RBAC', async () => {
    const { accessToken: adminToken } = await loginAndGetToken(app);

    // Create a viewer API key
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'concurrent-viewer', role: 'viewer' },
    });
    expect(createRes.statusCode).toBe(201);
    const viewerKey = JSON.parse(createRes.body).key;

    // Admin can read security events
    const adminRead = await app.inject({
      method: 'GET',
      url: '/api/v1/security/events',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(adminRead.statusCode).toBe(200);

    // Viewer is denied security events
    const viewerDenied = await app.inject({
      method: 'GET',
      url: '/api/v1/security/events',
      headers: { 'x-api-key': viewerKey },
    });
    expect(viewerDenied.statusCode).toBe(403);

    // Both can read metrics simultaneously
    const [adminMetrics, viewerMetrics] = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/api/v1/metrics',
        headers: { authorization: `Bearer ${adminToken}` },
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/metrics',
        headers: { 'x-api-key': viewerKey },
      }),
    ]);
    expect(adminMetrics.statusCode).toBe(200);
    expect(viewerMetrics.statusCode).toBe(200);
  });

  // ── Refresh token isolation ───────────────────────────────────────

  it('refreshing one session does not affect another session', async () => {
    const session1 = await loginAndGetToken(app);
    const session2 = await loginAndGetToken(app);

    // Refresh session1
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: session1.refreshToken },
      headers: { authorization: `Bearer ${session1.accessToken}` },
    });
    expect(refreshRes.statusCode).toBe(200);
    const refreshed = JSON.parse(refreshRes.body);
    expect(refreshed.accessToken).toBeDefined();

    // session2 old token is still valid
    const session2Check = await app.inject({
      method: 'GET',
      url: '/api/v1/metrics',
      headers: { authorization: `Bearer ${session2.accessToken}` },
    });
    expect(session2Check.statusCode).toBe(200);
  });

  // ── Stale token rejection ─────────────────────────────────────────

  it('using a stale refresh token after rotation is rejected', async () => {
    const { accessToken, refreshToken } = await loginAndGetToken(app);

    // Rotate refresh token
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(refreshRes.statusCode).toBe(200);

    // Attempt to reuse the old refresh token
    const staleRefresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(staleRefresh.statusCode).toBe(401);
  });

  // ── Multiple API keys, single admin ──────────────────────────────

  it('multiple API keys from the same admin session work independently', async () => {
    const { accessToken } = await loginAndGetToken(app);

    const [key1Res, key2Res] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/api-keys',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: 'key-1', role: 'admin' },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/api-keys',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: 'key-2', role: 'viewer' },
      }),
    ]);
    expect(key1Res.statusCode).toBe(201);
    expect(key2Res.statusCode).toBe(201);

    const key1 = JSON.parse(key1Res.body).key;
    const key2 = JSON.parse(key2Res.body).key;
    expect(key1).not.toBe(key2);

    // Revoke key1 — key2 still works
    const revokeRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/auth/api-keys/${JSON.parse(key1Res.body).id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(revokeRes.statusCode).toBe(200);

    const key1After = await app.inject({
      method: 'GET',
      url: '/api/v1/tasks',
      headers: { 'x-api-key': key1 },
    });
    expect(key1After.statusCode).toBe(401);

    const key2After = await app.inject({
      method: 'GET',
      url: '/api/v1/tasks',
      headers: { 'x-api-key': key2 },
    });
    expect(key2After.statusCode).toBe(200);
  });
});
