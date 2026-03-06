/**
 * E2E: Cross-Domain Flows
 *
 * Tests that span multiple API domains — personality + brain,
 * auth + RBAC isolation, multi-entity scenarios.
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

describe('Personality + Memory association', () => {
  it('creates a personality and stores a memory in the same session', async () => {
    // Create personality
    const pRes = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'Cross-Bot',
        description: 'Cross-domain test',
        systemPrompt: 'You help test cross-domain flows.',
        traits: {},
        sex: 'unspecified',
        voice: '',
        preferredLanguage: '',
        defaultModel: null,
        includeArchetypes: false,
      }),
    });
    expect(pRes.status).toBe(201);
    const { personality } = await pRes.json();

    // Create a memory scoped to the personality
    const mRes = await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        type: 'episodic',
        content: `${personality.name} was activated for testing`,
        source: 'e2e-cross-domain',
      }),
    });
    expect(mRes.status).toBe(201);

    // Both exist
    const personalities = await (
      await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
        headers: authHeaders(token),
      })
    ).json();
    expect(personalities.total).toBe(1);

    const memories = await (
      await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
        headers: authHeaders(token),
      })
    ).json();
    expect(memories.memories).toHaveLength(1);
  });
});

describe('Viewer RBAC across domains', () => {
  it('viewer can read personalities but not security events', async () => {
    // Create viewer API key
    const keyRes = await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'viewer-cross', role: 'viewer' }),
    });
    const { key } = await keyRes.json();

    // Viewer CAN read personalities
    const soulRes = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      headers: apiKeyHeaders(key),
    });
    expect(soulRes.status).toBe(200);

    // Viewer CAN read memories
    const brainRes = await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
      headers: apiKeyHeaders(key),
    });
    expect(brainRes.status).toBe(200);

    // Viewer CANNOT read security events
    const secRes = await fetch(`${server.baseUrl}/api/v1/security/events`, {
      headers: apiKeyHeaders(key),
    });
    expect(secRes.status).toBe(403);
  });
});

describe('Multi-entity lifecycle', () => {
  it('creates multiple entities and cleans up properly', async () => {
    // Create 2 personalities
    const ids: string[] = [];
    for (const name of ['Alpha', 'Beta']) {
      const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name,
          systemPrompt: `I am ${name}.`,
          traits: {},
          sex: 'unspecified',
          voice: '',
          preferredLanguage: '',
          defaultModel: null,
          includeArchetypes: false,
        }),
      });
      const { personality } = await res.json();
      ids.push(personality.id);
    }

    // Create a workflow
    const wRes = await fetch(`${server.baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        name: 'Multi-Entity Workflow',
        steps: [],
        edges: [],
        triggers: [],
      }),
    });
    expect(wRes.status).toBe(201);

    // Create 3 memories
    for (let i = 0; i < 3; i++) {
      await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: 'episodic',
          content: `Cross-domain memory ${i}`,
          source: 'e2e',
        }),
      });
    }

    // Verify counts
    const pList = await (
      await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
        headers: authHeaders(token),
      })
    ).json();
    expect(pList.total).toBe(2);

    const wList = await (
      await fetch(`${server.baseUrl}/api/v1/workflows`, {
        headers: authHeaders(token),
      })
    ).json();
    expect(wList.total).toBe(1);

    const mList = await (
      await fetch(`${server.baseUrl}/api/v1/brain/memories`, {
        headers: authHeaders(token),
      })
    ).json();
    expect(mList.memories).toHaveLength(3);

    // Delete personality Alpha
    const delRes = await fetch(
      `${server.baseUrl}/api/v1/soul/personalities/${ids[0]}`,
      { method: 'DELETE', headers: authDeleteHeaders(token) },
    );
    expect(delRes.status).toBe(204);

    const pListAfter = await (
      await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
        headers: authHeaders(token),
      })
    ).json();
    expect(pListAfter.total).toBe(1);
    expect(pListAfter.personalities[0].name).toBe('Beta');
  });
});

describe('Token isolation', () => {
  it('different API keys operate independently', async () => {
    // Create two admin API keys
    const key1Res = await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'key-1', role: 'admin' }),
    });
    const { key: key1 } = await key1Res.json();

    const key2Res = await fetch(`${server.baseUrl}/api/v1/auth/api-keys`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'key-2', role: 'admin' }),
    });
    const { key: key2 } = await key2Res.json();

    // Both can read the same data
    const r1 = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      headers: apiKeyHeaders(key1),
    });
    const r2 = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      headers: apiKeyHeaders(key2),
    });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    // Key1 creates, Key2 can see it
    await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      method: 'POST',
      headers: apiKeyHeaders(key1),
      body: JSON.stringify({
        name: 'SharedBot',
        systemPrompt: 'Shared.',
        traits: {},
        sex: 'unspecified',
        voice: '',
        preferredLanguage: '',
        defaultModel: null,
        includeArchetypes: false,
      }),
    });

    const listViaKey2 = await (
      await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
        headers: apiKeyHeaders(key2),
      })
    ).json();
    expect(listViaKey2.total).toBe(1);
    expect(listViaKey2.personalities[0].name).toBe('SharedBot');
  });
});
