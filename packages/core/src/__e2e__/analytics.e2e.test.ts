/**
 * E2E: Analytics & Reporting — Metrics, brain stats, cost tracking.
 *
 * Analytics routes require SecureYeoman. These tests exercise the available
 * metrics/stats endpoints on the shared E2E server and verify response shapes.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  startE2EServer,
  login,
  authHeaders,
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

describe('Metrics endpoint', () => {
  it('returns system metrics', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/metrics`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('tasks');
    expect(body).toHaveProperty('memory');
    expect(body.tasks).toEqual(expect.objectContaining({ total: 0, running: 0, completed: 0 }));
  });
});

describe('Brain stats as analytics source', () => {
  it('returns stats with memory and knowledge counts', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/brain/stats`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const { stats } = await res.json();
    expect(stats).toHaveProperty('memories');
    expect(stats).toHaveProperty('knowledge');
    expect(typeof stats.memories).toBe('number');
    expect(typeof stats.knowledge).toBe('number');
  });

  it('stats update after data ingestion', async () => {
    // Get baseline
    const before = await fetch(`${server.baseUrl}/api/v1/brain/stats`, {
      headers: authHeaders(token),
    });
    const { stats: statsBefore } = await before.json();

    // Add data
    await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ type: 'episodic', content: 'analytics test', source: 'e2e' }),
    });
    await fetch(`${server.baseUrl}/api/v1/brain/knowledge`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        topic: 'analytics',
        content: 'test knowledge',
        source: 'e2e',
        confidence: 0.8,
      }),
    });

    // Verify increase
    const after = await fetch(`${server.baseUrl}/api/v1/brain/stats`, {
      headers: authHeaders(token),
    });
    const { stats: statsAfter } = await after.json();
    expect(statsAfter.memories).toBeGreaterThan(statsBefore.memories);
    expect(statsAfter.knowledge).toBeGreaterThan(statsBefore.knowledge);
  });
});

describe('Audit log as reporting source', () => {
  it('returns audit entries', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/audit`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('audit chain verifies integrity', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/audit/verify`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('valid');
    expect(body.valid).toBe(true);
  });
});

describe('Tasks endpoint', () => {
  it('returns tasks list (initially empty)', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/tasks`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks).toEqual([]);
    expect(body.total).toBe(0);
  });
});
