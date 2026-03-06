/**
 * E2E: Personality CRUD & Lifecycle
 *
 * Tests personality creation, listing, update, activation, deletion,
 * and preset listing over real HTTP against a running server + DB.
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

const TEST_PERSONALITY = {
  name: 'E2E-Bot',
  description: 'E2E test personality',
  systemPrompt: 'You are a test bot for E2E testing.',
  traits: { humor: 'dry', formality: 'casual' },
  sex: 'unspecified',
  voice: '',
  preferredLanguage: '',
  defaultModel: null,
  includeArchetypes: true,
};

describe('Personality CRUD', () => {
  it('lists personalities (initially empty)', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.personalities).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('creates a personality', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(TEST_PERSONALITY),
    });
    expect(res.status).toBe(201);
    const { personality } = await res.json();
    expect(personality.name).toBe('E2E-Bot');
    expect(personality.id).toEqual(expect.any(String));
  });

  it('creates and then lists the personality', async () => {
    await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(TEST_PERSONALITY),
    });

    const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      headers: authHeaders(token),
    });
    const body = await res.json();
    expect(body.personalities).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.personalities[0].name).toBe('E2E-Bot');
  });

  it('updates a personality', async () => {
    const createRes = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(TEST_PERSONALITY),
    });
    const { personality: created } = await createRes.json();

    const updateRes = await fetch(`${server.baseUrl}/api/v1/soul/personalities/${created.id}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'E2E-Bot-Updated', systemPrompt: 'Updated prompt.' }),
    });
    expect(updateRes.status).toBe(200);
    const { personality: updated } = await updateRes.json();
    expect(updated.name).toBe('E2E-Bot-Updated');
    expect(updated.systemPrompt).toBe('Updated prompt.');
  });

  it('deletes a personality', async () => {
    const createRes = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(TEST_PERSONALITY),
    });
    const { personality: created } = await createRes.json();

    const deleteRes = await fetch(`${server.baseUrl}/api/v1/soul/personalities/${created.id}`, {
      method: 'DELETE',
      headers: authDeleteHeaders(token),
    });
    expect(deleteRes.status).toBe(204);

    // Verify it's gone
    const listRes = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      headers: authHeaders(token),
    });
    const body = await listRes.json();
    expect(body.personalities).toHaveLength(0);
  });

  it('returns 404 when updating non-existent personality', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities/non-existent-id`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Ghost' }),
    });
    expect(res.status).toBe(404);
  });

  it('creates multiple personalities with unique names', async () => {
    for (const name of ['Bot-A', 'Bot-B']) {
      const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ ...TEST_PERSONALITY, name }),
      });
      expect(res.status).toBe(201);
    }
    const list = await (
      await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
        headers: authHeaders(token),
      })
    ).json();
    expect(list.total).toBe(2);
  });
});

describe('Personality activation', () => {
  it('activates a personality', async () => {
    const createRes = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(TEST_PERSONALITY),
    });
    const { personality: created } = await createRes.json();

    const activateRes = await fetch(
      `${server.baseUrl}/api/v1/soul/personalities/${created.id}/activate`,
      { method: 'POST', headers: authHeaders(token), body: '{}' }
    );
    expect(activateRes.status).toBe(200);

    // Active personality should now return it
    const activeRes = await fetch(`${server.baseUrl}/api/v1/soul/personality`, {
      headers: authHeaders(token),
    });
    const { personality: active } = await activeRes.json();
    expect(active.id).toBe(created.id);
  });

  it('returns null when no personality is active', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/soul/personality`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.personality).toBeNull();
  });
});

describe('Personality presets', () => {
  it('lists available presets', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities/presets`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.presets).toEqual(expect.any(Array));
  });
});

describe('Pagination', () => {
  it('paginates personality list', async () => {
    // Create 3 personalities (use unique names with timestamp to avoid conflicts)
    const tag = Date.now();
    for (let i = 1; i <= 3; i++) {
      const createRes = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ ...TEST_PERSONALITY, name: `PagBot-${tag}-${i}` }),
      });
      expect(createRes.status).toBe(201);
    }

    const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities?limit=2&offset=0`, {
      headers: authHeaders(token),
    });
    const body = await res.json();
    expect(body.personalities).toHaveLength(2);
    expect(body.total).toBe(3);

    const page2 = await fetch(`${server.baseUrl}/api/v1/soul/personalities?limit=2&offset=2`, {
      headers: authHeaders(token),
    });
    const body2 = await page2.json();
    expect(body2.personalities).toHaveLength(1);
  });
});
