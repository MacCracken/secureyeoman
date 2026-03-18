/**
 * E2E: Optimistic Locking on Personalities & Skills
 *
 * Tests version-based conflict detection: updates with correct version
 * succeed and increment, stale versions return 409 Conflict.
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

const TEST_PERSONALITY = {
  name: 'Locking-Bot',
  description: 'Optimistic locking test personality',
  systemPrompt: 'You are a test bot.',
  traits: {},
  sex: 'unspecified',
  voice: '',
  preferredLanguage: '',
  defaultModel: null,
  includeArchetypes: true,
};

const TEST_SKILL = {
  name: 'locking-skill',
  description: 'Optimistic locking test skill',
  instructions: 'Test instructions',
  tools: [],
  triggerPatterns: [],
};

async function createPersonality(): Promise<Record<string, unknown>> {
  const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(TEST_PERSONALITY),
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  return body.personality;
}

async function createSkill(): Promise<Record<string, unknown>> {
  const res = await fetch(`${server.baseUrl}/api/v1/soul/skills`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(TEST_SKILL),
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  return body.skill;
}

// ═════════════════════════════════════════════════════════════════
// Personality optimistic locking
// ═════════════════════════════════════════════════════════════════

describe('Personality optimistic locking', () => {
  it('newly created personality has version 1', async () => {
    const personality = await createPersonality();
    expect(personality.version).toBe(1);
  });

  it('update with correct version succeeds and increments', async () => {
    const personality = await createPersonality();
    const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities/${personality.id}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Updated-Bot', version: 1 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.personality.name).toBe('Updated-Bot');
    expect(body.personality.version).toBe(2);
  });

  it('update with stale version returns 409', async () => {
    const personality = await createPersonality();

    // First update succeeds (version 1 → 2)
    const res1 = await fetch(`${server.baseUrl}/api/v1/soul/personalities/${personality.id}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'First-Edit', version: 1 }),
    });
    expect(res1.status).toBe(200);

    // Second update with stale version 1 fails
    const res2 = await fetch(`${server.baseUrl}/api/v1/soul/personalities/${personality.id}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Stale-Edit', version: 1 }),
    });
    expect(res2.status).toBe(409);
    const body = await res2.json();
    expect(body.error || body.message).toBeDefined();
  });

  it('update without version still succeeds (backwards-compatible)', async () => {
    const personality = await createPersonality();
    const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities/${personality.id}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'No-Version-Edit' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.personality.name).toBe('No-Version-Edit');
    expect(body.personality.version).toBe(2);
  });

  it('version is returned in list response', async () => {
    await createPersonality();
    const res = await fetch(`${server.baseUrl}/api/v1/soul/personalities`, {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.personalities.length).toBeGreaterThanOrEqual(1);
    expect(body.personalities[0].version).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════
// Skill optimistic locking
// ═════════════════════════════════════════════════════════════════

describe('Skill optimistic locking', () => {
  it('newly created skill has version 1', async () => {
    const skill = await createSkill();
    expect(skill.version).toBe(1);
  });

  it('update with correct version succeeds and increments', async () => {
    const skill = await createSkill();
    const res = await fetch(`${server.baseUrl}/api/v1/soul/skills/${skill.id}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'updated-skill', version: 1 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skill.name).toBe('updated-skill');
    expect(body.skill.version).toBe(2);
  });

  it('update with stale version returns 409', async () => {
    const skill = await createSkill();

    // First update (version 1 → 2)
    await fetch(`${server.baseUrl}/api/v1/soul/skills/${skill.id}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'first-edit', version: 1 }),
    });

    // Stale update with version 1
    const res = await fetch(`${server.baseUrl}/api/v1/soul/skills/${skill.id}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'stale-edit', version: 1 }),
    });
    expect(res.status).toBe(409);
  });

  it('update without version still succeeds (backwards-compatible)', async () => {
    const skill = await createSkill();
    const res = await fetch(`${server.baseUrl}/api/v1/soul/skills/${skill.id}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'no-version-edit' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skill.name).toBe('no-version-edit');
    expect(body.skill.version).toBe(2);
  });
});
