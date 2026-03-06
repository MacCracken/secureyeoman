/**
 * E2E: Audit Trail
 *
 * Verifies that authentication events produce audit entries,
 * and the audit verify endpoint confirms chain integrity.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  startE2EServer,
  login,
  authHeaders,
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

describe('Audit trail', () => {
  it('login produces audit entries', async () => {
    const { accessToken } = await login(server.baseUrl);

    const res = await fetch(`${server.baseUrl}/api/v1/audit`, {
      headers: authHeaders(accessToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.length).toBeGreaterThan(0);
  });

  it('failed login attempt is audited', async () => {
    // Fail a login
    await fetch(`${server.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'bad-password' }),
    });

    // Log in successfully to read audit
    const { accessToken } = await login(server.baseUrl);
    const res = await fetch(`${server.baseUrl}/api/v1/audit`, {
      headers: authHeaders(accessToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const failedEntry = body.entries.find(
      (e: { event?: string }) => e.event === 'auth_failure' || e.event === 'login_failed',
    );
    expect(failedEntry).toBeDefined();
  });

  it('audit chain verification succeeds', async () => {
    const { accessToken } = await login(server.baseUrl);

    const res = await fetch(`${server.baseUrl}/api/v1/audit/verify`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: '{}',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
  });
});
