/**
 * E2E: Concurrent Operations
 *
 * Tests race conditions, parallel writes, and data consistency
 * under concurrent access over real HTTP.
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

const makePersonality = (name: string) => ({
  name,
  systemPrompt: `I am ${name}.`,
  traits: {},
  sex: 'unspecified',
  voice: '',
  preferredLanguage: '',
  defaultModel: null,
  includeArchetypes: false,
});

describe('Concurrent personality creation', () => {
  it('creates 10 personalities concurrently without data loss', async () => {
    const names = Array.from({ length: 10 }, (_, i) => `Concurrent-Bot-${i}`);
    const results = await Promise.all(
      names.map((name) =>
        fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify(makePersonality(name)),
        })
      )
    );

    // All should succeed
    for (const res of results) {
      expect(res.status).toBe(201);
    }

    // All 10 should exist
    const listRes = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      headers: authHeaders(token),
    });
    const body = await listRes.json();
    expect(body.total).toBe(10);

    // All names should be unique
    const listedNames = body.personalities.map((p: { name: string }) => p.name);
    expect(new Set(listedNames).size).toBe(10);
  });
});

describe('Concurrent memory creation', () => {
  it('creates 20 memories concurrently without data loss', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        fetch(`${server.baseUrl}/api/v1/brain/memories`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            type: i % 2 === 0 ? 'episodic' : 'semantic',
            content: `Concurrent memory ${i}`,
            source: 'e2e-concurrent',
          }),
        })
      )
    );

    for (const res of results) {
      expect(res.status).toBe(201);
    }

    const listRes = await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      headers: authHeaders(token),
    });
    const body = await listRes.json();
    expect(body.memories).toHaveLength(20);
  });
});

describe('Concurrent read-write mix', () => {
  it('handles reads and writes simultaneously', async () => {
    // Seed some data
    for (let i = 0; i < 3; i++) {
      await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(makePersonality(`Seed-${i}`)),
      });
    }

    // Now do concurrent reads + writes
    const ops = [
      // Reads
      fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
        headers: authHeaders(token),
      }),
      fetch(`${server.baseUrl}/api/v1/brain/memories`, {
        headers: authHeaders(token),
      }),
      fetch(`${server.baseUrl}/api/v1/workflows`, {
        headers: authHeaders(token),
      }),
      // Writes
      fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(makePersonality('During-Read-1')),
      }),
      fetch(`${server.baseUrl}/api/v1/brain/memories`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: 'episodic',
          content: 'Created during concurrent reads',
          source: 'e2e-mixed',
        }),
      }),
    ];

    const results = await Promise.all(ops);
    // All should succeed
    for (const res of results) {
      expect(res.status).toBeLessThan(500);
    }
  });
});

describe('Concurrent delete + read', () => {
  it('handles deletion while listing is in progress', async () => {
    // Create items
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(makePersonality(`Delete-Race-${i}`)),
      });
      const { personality } = await res.json();
      ids.push(personality.id);
    }

    // Concurrently delete some + list
    const ops = [
      fetch(`${server.baseUrl}/api/v1/soul/personalities/${ids[0]}`, {
        method: 'DELETE',
        headers: authDeleteHeaders(token),
      }),
      fetch(`${server.baseUrl}/api/v1/soul/personalities/${ids[1]}`, {
        method: 'DELETE',
        headers: authDeleteHeaders(token),
      }),
      fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
        headers: authHeaders(token),
      }),
    ];

    const results = await Promise.all(ops);
    // Deletes should succeed
    expect(results[0].status).toBe(204);
    expect(results[1].status).toBe(204);
    // List should return a valid response (count may vary due to race)
    expect(results[2].status).toBe(200);

    // After settling, exactly 3 should remain
    const finalList = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      headers: authHeaders(token),
    });
    const body = await finalList.json();
    expect(body.total).toBe(3);
  });
});

describe('Concurrent updates to same entity', () => {
  it('last-write-wins on concurrent personality updates', async () => {
    const createRes = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(makePersonality('Race-Target')),
    });
    const { personality } = await createRes.json();

    // Two concurrent updates
    const [r1, r2] = await Promise.all([
      fetch(`${server.baseUrl}/api/v1/soul/personalities/${personality.id}`, {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Writer-A' }),
      }),
      fetch(`${server.baseUrl}/api/v1/soul/personalities/${personality.id}`, {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Writer-B' }),
      }),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    // Final state should be one of the two
    const listRes = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      headers: authHeaders(token),
    });
    const body = await listRes.json();
    expect(body.total).toBe(1);
    expect(['Writer-A', 'Writer-B']).toContain(body.personalities[0].name);
  });
});

describe('Rapid create-delete cycles', () => {
  it('survives rapid create-then-delete without leaking rows', async () => {
    for (let i = 0; i < 5; i++) {
      const createRes = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(makePersonality(`Ephemeral-${i}`)),
      });
      const { personality } = await createRes.json();

      const deleteRes = await fetch(
        `${server.baseUrl}/api/v1/soul/personalities/${personality.id}`,
        {
          method: 'DELETE',
          headers: authDeleteHeaders(token),
        }
      );
      expect(deleteRes.status).toBe(204);
    }

    // No rows should remain
    const listRes = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      headers: authHeaders(token),
    });
    const body = await listRes.json();
    expect(body.total).toBe(0);
  });
});
