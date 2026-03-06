/**
 * E2E: Health Endpoint
 *
 * Verifies the health endpoint is publicly accessible and returns
 * expected shape over real HTTP.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startE2EServer, setupTestDb, teardownTestDb, type E2EServer } from './helpers.js';

let server: E2EServer;

beforeAll(async () => {
  await setupTestDb();
  server = await startE2EServer();
});

afterAll(async () => {
  await server.close();
  await teardownTestDb();
});

describe('Health endpoint', () => {
  it('returns 200 without authentication', async () => {
    const res = await fetch(`${server.baseUrl}/health`);
    expect(res.status).toBe(200);
  });

  it('returns expected JSON shape', async () => {
    const res = await fetch(`${server.baseUrl}/health`);
    const body = await res.json();
    expect(body).toMatchObject({
      status: 'ok',
      version: expect.any(String),
      uptime: expect.any(Number),
    });
  });

  it('sets correct content-type header', async () => {
    const res = await fetch(`${server.baseUrl}/health`);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
