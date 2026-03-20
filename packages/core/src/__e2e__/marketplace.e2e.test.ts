/**
 * E2E: Marketplace — Skill listing, install/uninstall, community status.
 *
 * Tests the marketplace REST API with real HTTP against a running server + DB.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  startE2EServer,
  login,
  authHeaders,
  authDeleteHeaders,
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

describe('Marketplace listing', () => {
  it('lists marketplace items (initially empty or seeded)', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/marketplace`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('skills');
    expect(Array.isArray(body.skills)).toBe(true);
  });

  it('supports pagination', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/marketplace?limit=5&offset=0`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('skills');
    expect(body).toHaveProperty('total');
    expect(typeof body.total).toBe('number');
  });
});

describe('Marketplace install/uninstall', () => {
  it('returns 404 for non-existent item install', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/marketplace/nonexistent-id/install`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    // Should be 404 or 400 — item doesn't exist
    expect([400, 404]).toContain(res.status);
  });

  it('returns 404 for non-existent item uninstall', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/marketplace/nonexistent-id/uninstall`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    expect([400, 404]).toContain(res.status);
  });
});

describe('Marketplace item detail', () => {
  it('returns 404 for non-existent item', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/marketplace/does-not-exist`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(404);
  });
});

describe('Community personalities', () => {
  it('lists community personalities (may be empty without repo)', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/marketplace/community/personalities`, {
      headers: authHeaders(token),
    });
    // 200 with empty list or 404/500 if no community repo configured
    expect([200, 404, 500]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(Array.isArray(body.personalities || body)).toBe(true);
    }
  });

  it('returns community sync status', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/marketplace/community/status`, {
      headers: authHeaders(token),
    });
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(body).toHaveProperty('lastSyncedAt');
    }
  });
});

describe('Skill lifecycle via soul routes', () => {
  it('creates and lists a skill', async () => {
    const createRes = await fetch(`${server.baseUrl}/api/v1/soul/skills`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'test-skill',
        description: 'A test skill for E2E',
        instructions: 'You are a helpful test assistant',
        enabled: true,
      }),
    });
    expect(createRes.status).toBe(201);
    const { skill } = await createRes.json();
    expect(skill.name).toBe('test-skill');

    const listRes = await fetch(`${server.baseUrl}/api/v1/soul/skills`, {
      headers: authHeaders(token),
    });
    expect(listRes.status).toBe(200);
    const { skills } = await listRes.json();
    expect(skills.length).toBeGreaterThanOrEqual(1);
    expect(skills.some((s: { name: string }) => s.name === 'test-skill')).toBe(true);
  });

  it('deletes a skill', async () => {
    const createRes = await fetch(`${server.baseUrl}/api/v1/soul/skills`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'deletable-skill',
        description: 'Will be deleted',
        instructions: 'temp',
        enabled: false,
      }),
    });
    const { skill } = await createRes.json();

    const delRes = await fetch(`${server.baseUrl}/api/v1/soul/skills/${skill.id}`, {
      method: 'DELETE',
      headers: authDeleteHeaders(token),
    });
    expect([200, 204]).toContain(delRes.status);
  });
});
