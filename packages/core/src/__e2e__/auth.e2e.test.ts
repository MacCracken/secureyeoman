/**
 * E2E: Authentication Flows
 *
 * Tests login, token refresh, API key creation, and auth rejection
 * over real HTTP against a running server.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  startE2EServer,
  login,
  authHeaders,
  apiKeyHeaders,
  setupTestDb,
  teardownTestDb,
  truncateAllTables,
  TEST_ADMIN_PASSWORD,
  type E2EServer,
} from './helpers.js';

let server: E2EServer;

beforeAll(async () => {
  await setupTestDb();
  server = await startE2EServer();
});

afterAll(async () => {
  await server.close();
  await teardownTestDb();
});

beforeEach(async () => {
  await truncateAllTables();
});

describe('Login', () => {
  it('succeeds with correct password', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: TEST_ADMIN_PASSWORD }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
  });

  it('rejects wrong password', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-password' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects empty body', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect([400, 401]).toContain(res.status);
  });
});

describe('Token-based access', () => {
  it('protected route returns 401 without token', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/metrics`);
    expect(res.status).toBe(401);
  });

  it('protected route returns 200 with valid token', async () => {
    const { accessToken } = await login(server.baseUrl);
    const res = await fetch(`${server.baseUrl}/api/v1/metrics`, {
      headers: authHeaders(accessToken),
    });
    expect(res.status).toBe(200);
  });

  it('rejects expired/invalid token', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/metrics`, {
      headers: authHeaders('invalid.jwt.token'),
    });
    expect(res.status).toBe(401);
  });
});

describe('Token refresh', () => {
  it('refreshes access token with valid refresh token', async () => {
    const { accessToken, refreshToken } = await login(server.baseUrl);
    const res = await fetch(`${server.baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ refreshToken }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toEqual(expect.any(String));
  });

  it('rejects invalid refresh token', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'invalid-token' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('API key auth', () => {
  it('creates an API key and uses it for auth', async () => {
    const { accessToken } = await login(server.baseUrl);

    // Create API key
    const createRes = await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ name: 'e2e-test-key', role: 'admin' }),
    });
    expect(createRes.status).toBe(201);
    const { key } = await createRes.json();

    // Use API key
    const metricsRes = await fetch(`${server.baseUrl}/api/v1/metrics`, {
      headers: apiKeyHeaders(key),
    });
    expect(metricsRes.status).toBe(200);
  });

  it('rejects invalid API key', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/metrics`, {
      headers: apiKeyHeaders('sck_fake_key_value'),
    });
    expect(res.status).toBe(401);
  });
});

describe('RBAC enforcement', () => {
  it('viewer cannot access admin-only endpoints', async () => {
    const { accessToken } = await login(server.baseUrl);

    // Create viewer-scoped API key
    const createRes = await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ name: 'viewer-key', role: 'viewer' }),
    });
    const { key } = await createRes.json();

    // Viewer should be denied security events
    const eventsRes = await fetch(`${server.baseUrl}/api/v1/security/events`, {
      headers: apiKeyHeaders(key),
    });
    expect(eventsRes.status).toBe(403);
  });

  it('viewer can access viewer-allowed endpoints', async () => {
    const { accessToken } = await login(server.baseUrl);

    const createRes = await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ name: 'viewer-key-2', role: 'viewer' }),
    });
    const { key } = await createRes.json();

    const metricsRes = await fetch(`${server.baseUrl}/api/v1/metrics`, {
      headers: apiKeyHeaders(key),
    });
    expect(metricsRes.status).toBe(200);

    const tasksRes = await fetch(`${server.baseUrl}/api/v1/tasks`, {
      headers: apiKeyHeaders(key),
    });
    expect(tasksRes.status).toBe(200);
  });
});
