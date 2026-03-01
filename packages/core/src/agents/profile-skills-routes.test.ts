/**
 * Profile Skills Routes — unit tests (Phase 89)
 *
 * Tests CRUD for skills attached to sub-agent profiles.
 * No database — SwarmStorage and SubAgentStorage are mocked.
 */
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerProfileSkillsRoutes } from './profile-skills-routes.js';
import type { SwarmStorage } from './swarm-storage.js';
import type { SubAgentStorage } from './storage.js';

const PROFILE = {
  id: 'profile-1',
  name: 'coder',
  description: 'A coding agent',
  systemPrompt: 'You are a coder.',
  maxTokenBudget: 50000,
  allowedTools: [],
  isBuiltin: false,
  createdAt: 1000,
  updatedAt: 1000,
};

const SKILL = {
  id: 'skill-1',
  name: 'SQL Expert',
  description: 'Database query specialist',
  version: '1.0.0',
  author: 'community',
  category: 'development',
  tags: ['sql'],
  downloadCount: 0,
  installed: true,
  source: 'community',
  origin: 'community',
  instructions: 'You are a SQL expert.',
  triggerPatterns: [],
  useWhen: '',
  doNotUseWhen: '',
  successCriteria: '',
  mcpToolsAllowed: [],
  routing: 'fuzzy',
  autonomyLevel: 'L1',
  tools: [],
  createdAt: 1000,
  updatedAt: 1000,
};

function mockSwarmStorage(overrides?: Partial<SwarmStorage>): SwarmStorage {
  return {
    getProfileSkills: vi.fn().mockResolvedValue([SKILL]),
    addProfileSkill: vi.fn().mockResolvedValue(undefined),
    removeProfileSkill: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SwarmStorage;
}

function mockSubAgentStorage(overrides?: Partial<SubAgentStorage>): SubAgentStorage {
  return {
    getProfile: vi.fn().mockResolvedValue(PROFILE),
    ...overrides,
  } as unknown as SubAgentStorage;
}

function buildApp(
  swarmOverrides?: Partial<SwarmStorage>,
  subAgentOverrides?: Partial<SubAgentStorage>
) {
  const app = Fastify({ logger: false });
  registerProfileSkillsRoutes(app, {
    swarmStorage: mockSwarmStorage(swarmOverrides),
    subAgentStorage: mockSubAgentStorage(subAgentOverrides),
  });
  return app;
}

// ── GET /api/v1/agents/profiles/:id/skills ──────────────────────────────────

describe('GET /api/v1/agents/profiles/:id/skills', () => {
  it('returns skills for a valid profile', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/agents/profiles/profile-1/skills',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.skills).toHaveLength(1);
    expect(body.skills[0].id).toBe('skill-1');
  });

  it('returns 404 when profile not found', async () => {
    const app = buildApp(undefined, { getProfile: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/agents/profiles/missing/skills',
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── POST /api/v1/agents/profiles/:id/skills ─────────────────────────────────

describe('POST /api/v1/agents/profiles/:id/skills', () => {
  it('adds a skill and returns 201', async () => {
    const addMock = vi.fn().mockResolvedValue(undefined);
    const app = buildApp({ addProfileSkill: addMock });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/profiles/profile-1/skills',
      headers: { 'content-type': 'application/json' },
      payload: { skillId: 'skill-1' },
    });
    expect(res.statusCode).toBe(201);
    expect(addMock).toHaveBeenCalledWith('profile-1', 'skill-1');
    const body = res.json();
    expect(body.skill).toBeDefined();
    expect(body.skill.id).toBe('skill-1');
  });

  it('returns 400 when skillId is missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/profiles/profile-1/skills',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when profile not found', async () => {
    const app = buildApp(undefined, { getProfile: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/profiles/missing/skills',
      headers: { 'content-type': 'application/json' },
      payload: { skillId: 'skill-1' },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── DELETE /api/v1/agents/profiles/:id/skills/:skillId ──────────────────────

describe('DELETE /api/v1/agents/profiles/:id/skills/:skillId', () => {
  it('removes a skill and returns 204', async () => {
    const removeMock = vi.fn().mockResolvedValue(undefined);
    const app = buildApp({ removeProfileSkill: removeMock });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/agents/profiles/profile-1/skills/skill-1',
    });
    expect(res.statusCode).toBe(204);
    expect(removeMock).toHaveBeenCalledWith('profile-1', 'skill-1');
  });

  it('returns 404 when profile not found', async () => {
    const app = buildApp(undefined, { getProfile: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/agents/profiles/missing/skills/skill-1',
    });
    expect(res.statusCode).toBe(404);
  });
});
