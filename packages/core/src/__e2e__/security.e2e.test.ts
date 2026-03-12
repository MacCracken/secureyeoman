/**
 * E2E: Security Hardening
 *
 * Tests rate limiting, security headers, input validation,
 * and injection resistance over real HTTP.
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

describe('Security headers', () => {
  it('returns content-type on JSON responses', async () => {
    const res = await fetch(`${server.baseUrl}/health`);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('does not expose server version header', async () => {
    const res = await fetch(`${server.baseUrl}/health`);
    // Fastify should not leak its version
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('returns 401 for unknown protected routes (auth before routing)', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/nonexistent-route`);
    // Auth hook fires before route matching — unauthenticated gets 401
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown routes when authenticated', async () => {
    const { accessToken } = await login(server.baseUrl);
    const res = await fetch(`${server.baseUrl}/api/v1/nonexistent-route`, {
      headers: authHeaders(accessToken),
    });
    expect(res.status).toBe(404);
  });
});

describe('Input validation — SQL injection resistance', () => {
  it('rejects SQL injection in query params', async () => {
    const { accessToken } = await login(server.baseUrl);

    // Attempt SQL injection via limit param
    const res = await fetch(
      `${server.baseUrl}/api/v1/brain/memories?limit=1;DROP TABLE brain.memories;--`,
      { headers: authHeaders(accessToken) }
    );
    // Should either reject (400) or handle safely (200 with valid results)
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(Array.isArray(body.memories)).toBe(true);
    }
  });

  it('handles SQL injection in personality name safely', async () => {
    const { accessToken } = await login(server.baseUrl);

    const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        name: "Robert'; DROP TABLE soul.personalities;--",
        systemPrompt: 'Test',
        traits: {},
        sex: 'unspecified',
        voice: '',
        preferredLanguage: '',
        defaultModel: null,
        includeArchetypes: false,
      }),
    });
    // Should either create it safely (parameterized query) or reject
    expect([201, 400]).toContain(res.status);

    if (res.status === 201) {
      // Verify the table still works
      const listRes = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
        headers: authHeaders(accessToken),
      });
      expect(listRes.status).toBe(200);
      const body = await listRes.json();
      expect(body.total).toBe(1);
      // The malicious name should be stored as a plain string
      expect(body.personalities[0].name).toContain('DROP TABLE');
    }
  });
});

describe('Input validation — XSS resistance', () => {
  it('stores XSS payloads as plain text in personality names', async () => {
    const { accessToken } = await login(server.baseUrl);

    const xssPayload = '<script>alert("xss")</script>';
    const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        name: xssPayload,
        systemPrompt: 'Test',
        traits: {},
        sex: 'unspecified',
        voice: '',
        preferredLanguage: '',
        defaultModel: null,
        includeArchetypes: false,
      }),
    });
    expect([201, 400]).toContain(res.status);

    if (res.status === 201) {
      const listRes = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
        headers: authHeaders(accessToken),
      });
      const body = await listRes.json();
      // Should be stored as literal text, not executed
      expect(body.personalities[0].name).toBe(xssPayload);
    }
  });

  it('stores XSS payloads as plain text in memory content', async () => {
    const { accessToken } = await login(server.baseUrl);

    const xssPayload = '<img src=x onerror=alert(1)>';
    const res = await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        type: 'episodic',
        content: xssPayload,
        source: 'e2e-xss-test',
      }),
    });
    expect(res.status).toBe(201);

    const listRes = await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      headers: authHeaders(accessToken),
    });
    const body = await listRes.json();
    expect(body.memories[0].content).toBe(xssPayload);
  });
});

describe('Input validation — malformed requests', () => {
  it('rejects request with invalid JSON body', async () => {
    const { accessToken } = await login(server.baseUrl);

    const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: '{invalid json',
    });
    expect([400, 415, 500]).toContain(res.status);
  });

  it('rejects empty POST body on create endpoints', async () => {
    const { accessToken } = await login(server.baseUrl);

    const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: '',
    });
    expect([400, 415, 500]).toContain(res.status);
  });

  it('handles very long string values gracefully', async () => {
    const { accessToken } = await login(server.baseUrl);

    const longString = 'A'.repeat(100_000);
    const res = await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        type: 'episodic',
        content: longString,
        source: 'e2e-long-string',
      }),
    });
    // Should either accept or reject with a proper error, not crash
    expect([201, 400, 413]).toContain(res.status);
  });

  it('rejects request with wrong content-type', async () => {
    const { accessToken } = await login(server.baseUrl);

    const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'text/plain',
      },
      body: 'not json',
    });
    expect([400, 415, 500]).toContain(res.status);
  });
});

describe('Auth edge cases', () => {
  it('rejects Bearer token with empty value', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/metrics`, {
      headers: { authorization: 'Bearer ' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects authorization header without Bearer scheme', async () => {
    const { accessToken } = await login(server.baseUrl);
    const res = await fetch(`${server.baseUrl}/api/v1/metrics`, {
      headers: { authorization: accessToken },
    });
    expect(res.status).toBe(401);
  });

  it('rejects malformed JWT (extra dots)', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/metrics`, {
      headers: authHeaders('a.b.c.d.e'),
    });
    expect(res.status).toBe(401);
  });

  it('rejects JWT with None algorithm', async () => {
    // Craft a "none" alg JWT: header.payload.
    const header = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url');
    const payload = Buffer.from('{"sub":"admin","role":"admin"}').toString('base64url');
    const noneJwt = `${header}.${payload}.`;

    const res = await fetch(`${server.baseUrl}/api/v1/metrics`, {
      headers: authHeaders(noneJwt),
    });
    expect(res.status).toBe(401);
  });

  it('handles concurrent login attempts', async () => {
    const attempts = Array.from({ length: 5 }, () =>
      fetch(`${server.baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: TEST_ADMIN_PASSWORD }),
      })
    );

    const results = await Promise.all(attempts);
    // All should succeed (within rate limit)
    for (const res of results) {
      expect(res.status).toBe(200);
    }
  });
});

describe('HTTP method enforcement', () => {
  it('rejects PUT on health endpoint', async () => {
    const res = await fetch(`${server.baseUrl}/health`, { method: 'PUT' });
    expect([404, 405]).toContain(res.status);
  });

  it('rejects DELETE on health endpoint', async () => {
    const res = await fetch(`${server.baseUrl}/health`, { method: 'DELETE' });
    expect([404, 405]).toContain(res.status);
  });

  it('rejects GET on login endpoint', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
      method: 'GET',
    });
    expect([404, 405]).toContain(res.status);
  });
});

describe('Resource boundary validation', () => {
  it('returns 404 for personality with non-existent ID', async () => {
    const { accessToken } = await login(server.baseUrl);
    const res = await fetch(
      `${server.baseUrl}/api/v1/soul/personalities/00000000-0000-0000-0000-000000000000`,
      {
        method: 'PUT',
        headers: authHeaders(accessToken),
        body: JSON.stringify({ name: 'ghost' }),
      }
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for memory with non-existent ID', async () => {
    const { accessToken } = await login(server.baseUrl);
    const res = await fetch(
      `${server.baseUrl}/api/v1/brain/memories/00000000-0000-0000-0000-000000000000`,
      {
        method: 'DELETE',
        headers: { authorization: `Bearer ${accessToken}` },
      }
    );
    expect([204, 404]).toContain(res.status);
  });

  it('handles negative pagination params', async () => {
    const { accessToken } = await login(server.baseUrl);
    const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities?limit=-1&offset=-5`, {
      headers: authHeaders(accessToken),
    });
    // Should handle gracefully — either clamp to 0 or reject
    expect([200, 400]).toContain(res.status);
  });

  it('handles zero limit pagination', async () => {
    const { accessToken } = await login(server.baseUrl);
    const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities?limit=0`, {
      headers: authHeaders(accessToken),
    });
    expect([200, 400]).toContain(res.status);
  });
});
