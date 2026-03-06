/**
 * E2E: Brain — Memories & Knowledge CRUD
 *
 * Tests memory creation, recall, deletion, and knowledge entry
 * lifecycle over real HTTP against a running server + DB.
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

describe('Memories', () => {
  it('lists memories (initially empty)', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.memories).toEqual([]);
  });

  it('creates a memory', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        type: 'episodic',
        content: 'User prefers dark mode',
        source: 'e2e-test',
        importance: 0.8,
      }),
    });
    expect(res.status).toBe(201);
    const { memory } = await res.json();
    expect(memory.content).toBe('User prefers dark mode');
    expect(memory.type).toBe('episodic');
    expect(memory.id).toEqual(expect.any(String));
  });

  it('recalls created memory', async () => {
    await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        type: 'episodic',
        content: 'User prefers dark mode',
        source: 'e2e-test',
      }),
    });

    const res = await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      headers: authHeaders(token),
    });
    const { memories } = await res.json();
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toBe('User prefers dark mode');
  });

  it('filters memories by type', async () => {
    await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ type: 'episodic', content: 'Obs 1', source: 'e2e' }),
    });
    await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ type: 'semantic', content: 'Pref 1', source: 'e2e' }),
    });

    const res = await fetch(`${server.baseUrl}/api/v1/brain/memories?type=episodic`, {
      headers: authHeaders(token),
    });
    const { memories } = await res.json();
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toBe('Obs 1');
  });

  it('deletes a memory', async () => {
    const createRes = await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        type: 'episodic',
        content: 'Temp memory',
        source: 'e2e-test',
      }),
    });
    const { memory } = await createRes.json();

    const deleteRes = await fetch(`${server.baseUrl}/api/v1/brain/memories/${memory.id}`, {
      method: 'DELETE',
      headers: authDeleteHeaders(token),
    });
    expect(deleteRes.status).toBe(204);

    // Verify gone
    const listRes = await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      headers: authHeaders(token),
    });
    const { memories } = await listRes.json();
    expect(memories).toHaveLength(0);
  });

  it('limits results with query param', async () => {
    for (let i = 0; i < 5; i++) {
      await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: 'episodic',
          content: `Memory ${i}`,
          source: 'e2e',
        }),
      });
    }

    const res = await fetch(`${server.baseUrl}/api/v1/brain/memories?limit=3`, {
      headers: authHeaders(token),
    });
    const { memories } = await res.json();
    expect(memories).toHaveLength(3);
  });
});

describe('Knowledge', () => {
  it('lists knowledge (initially empty)', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/brain/knowledge`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.knowledge).toEqual([]);
  });

  it('creates a knowledge entry', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/brain/knowledge`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        topic: 'testing',
        content: 'Vitest is a fast test runner',
        source: 'e2e-test',
        confidence: 0.95,
      }),
    });
    expect(res.status).toBe(201);
    const { knowledge } = await res.json();
    expect(knowledge.topic).toBe('testing');
    expect(knowledge.content).toBe('Vitest is a fast test runner');
  });

  it('recalls created knowledge by topic', async () => {
    await fetch(`${server.baseUrl}/api/v1/brain/knowledge`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        topic: 'testing',
        content: 'Vitest uses Vite for transforms',
        source: 'e2e-test',
        confidence: 0.9,
      }),
    });

    const res = await fetch(`${server.baseUrl}/api/v1/brain/knowledge?topic=testing`, {
      headers: authHeaders(token),
    });
    const { knowledge } = await res.json();
    expect(knowledge.length).toBeGreaterThanOrEqual(1);
    expect(knowledge[0].topic).toBe('testing');
  });

  it('deletes a knowledge entry', async () => {
    const createRes = await fetch(`${server.baseUrl}/api/v1/brain/knowledge`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        topic: 'temp',
        content: 'Temporary knowledge',
        source: 'e2e-test',
        confidence: 0.5,
      }),
    });
    const { knowledge } = await createRes.json();

    const deleteRes = await fetch(`${server.baseUrl}/api/v1/brain/knowledge/${knowledge.id}`, {
      method: 'DELETE',
      headers: authDeleteHeaders(token),
    });
    expect(deleteRes.status).toBe(204);
  });
});

describe('Brain stats', () => {
  it('returns brain statistics', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/brain/stats`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('stats');
    expect(body.stats).toHaveProperty('memories');
    expect(body.stats).toHaveProperty('knowledge');
  });
});
