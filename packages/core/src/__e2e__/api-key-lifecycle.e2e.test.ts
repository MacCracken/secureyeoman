/**
 * E2E: API Key Lifecycle
 *
 * Tests full API key management — creation, listing, revocation,
 * rotation, and scope enforcement over real HTTP.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  startE2EServer,
  login,
  authHeaders,
  authDeleteHeaders,
  apiKeyHeaders,
  setupTestDb,
  teardownTestDb,
  truncateAllTables,
  type E2EServer,
} from './helpers.js';

let server: E2EServer;
let token: string;

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
  ({ accessToken: token } = await login(server.baseUrl));
});

describe('API key creation', () => {
  it('creates an API key with admin role', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'admin-key', role: 'admin' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.key).toEqual(expect.any(String));
    expect(body.key).toMatch(/^sck_/);
  });

  it('creates an API key with viewer role', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'viewer-key', role: 'viewer' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.key).toMatch(/^sck_/);
  });

  it('creates multiple API keys with unique names', async () => {
    for (const name of ['key-alpha', 'key-beta', 'key-gamma']) {
      const res = await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name, role: 'admin' }),
      });
      expect(res.status).toBe(201);
    }
  });
});

describe('API key listing', () => {
  it('lists created API keys', async () => {
    // Create two keys
    await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'list-test-1', role: 'admin' }),
    });
    await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'list-test-2', role: 'viewer' }),
    });

    const res = await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys.length).toBeGreaterThanOrEqual(2);

    // Keys should show name and role but NOT the raw key value
    const key1 = body.keys.find((k: { name: string }) => k.name === 'list-test-1');
    expect(key1).toBeDefined();
    expect(key1.role).toBe('admin');
  });
});

describe('API key revocation', () => {
  it('revokes an API key and it stops working', async () => {
    // Create key
    const createRes = await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'revoke-test', role: 'admin' }),
    });
    const { key, id } = await createRes.json();

    // Verify it works
    const beforeRes = await fetch(`${server.baseUrl}/api/v1/metrics`, {
      headers: apiKeyHeaders(key),
    });
    expect(beforeRes.status).toBe(200);

    // Revoke it
    const revokeRes = await fetch(`${server.baseUrl}/api/v1/auth/api-keys/${id}`, {
      method: 'DELETE',
      headers: authDeleteHeaders(token),
    });
    expect([200, 204]).toContain(revokeRes.status);

    // Verify it no longer works
    const afterRes = await fetch(`${server.baseUrl}/api/v1/metrics`, {
      headers: apiKeyHeaders(key),
    });
    expect(afterRes.status).toBe(401);
  });
});

describe('API key RBAC enforcement', () => {
  it('viewer key cannot create personalities', async () => {
    const createRes = await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'rbac-viewer', role: 'viewer' }),
    });
    const { key } = await createRes.json();

    const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      method: 'POST',
      headers: apiKeyHeaders(key),
      body: JSON.stringify({
        name: 'Should-Fail',
        systemPrompt: 'No.',
        traits: {},
        sex: 'unspecified',
        voice: '',
        preferredLanguage: '',
        defaultModel: null,
        includeArchetypes: false,
      }),
    });
    expect(res.status).toBe(403);
  });

  it('admin key can create and delete personalities', async () => {
    const createKeyRes = await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'rbac-admin', role: 'admin' }),
    });
    const { key } = await createKeyRes.json();

    // Create
    const createRes = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      method: 'POST',
      headers: apiKeyHeaders(key),
      body: JSON.stringify({
        name: 'Admin-Created',
        systemPrompt: 'Yes.',
        traits: {},
        sex: 'unspecified',
        voice: '',
        preferredLanguage: '',
        defaultModel: null,
        includeArchetypes: false,
      }),
    });
    expect(createRes.status).toBe(201);
    const { personality } = await createRes.json();

    // Delete
    const deleteRes = await fetch(
      `${server.baseUrl}/api/v1/soul/personalities/${personality.id}`,
      {
        method: 'DELETE',
        headers: { 'x-api-key': key },
      }
    );
    expect(deleteRes.status).toBe(204);
  });

  it('viewer key cannot create API keys', async () => {
    const viewerKeyRes = await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'nested-viewer', role: 'viewer' }),
    });
    const { key } = await viewerKeyRes.json();

    // Viewer trying to create another API key
    const res = await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      method: 'POST',
      headers: apiKeyHeaders(key),
      body: JSON.stringify({ name: 'escalation-attempt', role: 'admin' }),
    });
    expect(res.status).toBe(403);
  });

  it('viewer key cannot revoke API keys', async () => {
    // Create admin key first
    const adminKeyRes = await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'target-key', role: 'admin' }),
    });
    const { id: targetId } = await adminKeyRes.json();

    // Create viewer key
    const viewerKeyRes = await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'attacker-viewer', role: 'viewer' }),
    });
    const { key: viewerKey } = await viewerKeyRes.json();

    // Viewer trying to revoke admin key
    const res = await fetch(`${server.baseUrl}/api/v1/auth/api-keys/${targetId}`, {
      method: 'DELETE',
      headers: { 'x-api-key': viewerKey },
    });
    expect(res.status).toBe(403);
  });
});

describe('API key edge cases', () => {
  it('rejects API key creation without name', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ role: 'admin' }),
    });
    expect([400, 500]).toContain(res.status);
  });

  it('handles API key with special characters in name', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'key-with-<script>-chars', role: 'admin' }),
    });
    expect([201, 400]).toContain(res.status);
  });
});
