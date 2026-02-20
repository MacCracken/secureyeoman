import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerAgentRoutes } from './agent-routes.js';
import type { SubAgentManager } from './manager.js';

// ── Mock data ────────────────────────────────────────────────────────

const PROFILE = {
  id: 'builtin-researcher',
  type: 'llm',
  name: 'researcher',
  description: 'Research specialist',
  systemPrompt: 'You are a researcher.',
  maxTokenBudget: 50000,
  allowedTools: [],
  defaultModel: null,
  isBuiltin: true,
  createdAt: 1000,
  updatedAt: 1000,
};

const DELEGATION = {
  id: 'del-1',
  profileId: 'builtin-researcher',
  task: 'Research TypeScript',
  status: 'completed',
  depth: 0,
  maxDepth: 3,
  tokenBudget: 50000,
  timeoutMs: 300000,
  initiatedBy: 'user',
  createdAt: 1000,
  startedAt: 1000,
  completedAt: 2000,
  result: 'TypeScript is awesome',
  error: null,
  tokensUsedPrompt: 100,
  tokensUsedCompletion: 50,
  parentDelegationId: null,
  correlationId: null,
  context: null,
};

function makeMockManager(overrides?: Partial<SubAgentManager>): SubAgentManager {
  return {
    listProfiles: vi.fn().mockResolvedValue({ profiles: [PROFILE], total: 1 }),
    getProfile: vi.fn().mockResolvedValue(PROFILE),
    createProfile: vi.fn().mockResolvedValue(PROFILE),
    updateProfile: vi.fn().mockResolvedValue(PROFILE),
    deleteProfile: vi.fn().mockResolvedValue(true),
    delegate: vi.fn().mockResolvedValue({
      delegationId: 'del-1',
      profile: 'researcher',
      status: 'completed',
      result: 'Done',
      error: null,
      tokenUsage: { prompt: 100, completion: 50, total: 150 },
      durationMs: 1000,
      subDelegations: [],
    }),
    listDelegations: vi.fn().mockResolvedValue({ delegations: [DELEGATION], total: 1 }),
    listActive: vi.fn().mockResolvedValue([]),
    getDelegation: vi.fn().mockResolvedValue(DELEGATION),
    getDelegationTree: vi.fn().mockResolvedValue([DELEGATION]),
    getDelegationMessages: vi.fn().mockResolvedValue([]),
    cancel: vi.fn().mockResolvedValue(undefined),
    getConfig: vi.fn().mockReturnValue({ enabled: true, maxDepth: 3, maxConcurrent: 5, defaultTimeout: 300000, tokenBudget: { default: 50000, max: 200000 }, context: { sealOnComplete: true, brainWriteScope: 'delegated' } }),
    isAllowedBySecurityPolicy: vi.fn().mockReturnValue(true),
    ...overrides,
  } as unknown as SubAgentManager;
}

function buildApp(overrides?: Partial<SubAgentManager>) {
  const app = Fastify();
  registerAgentRoutes(app, { subAgentManager: makeMockManager(overrides) });
  return app;
}

// ── Profile routes ───────────────────────────────────────────────────

describe('GET /api/v1/agents/profiles', () => {
  it('returns list of profiles', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/profiles' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.profiles).toHaveLength(1);
    expect(body.profiles[0].name).toBe('researcher');
  });
});

describe('GET /api/v1/agents/profiles/:id', () => {
  it('returns profile by ID', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/profiles/builtin-researcher' });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('researcher');
  });

  it('returns 404 when profile not found', async () => {
    const app = buildApp({ getProfile: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/profiles/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/agents/profiles', () => {
  it('creates a profile and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/profiles',
      payload: { name: 'custom', systemPrompt: 'You are custom.' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().profile.name).toBe('researcher');
  });

  it('returns 400 on storage error', async () => {
    const app = buildApp({ createProfile: vi.fn().mockRejectedValue(new Error('duplicate name')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/profiles',
      payload: { name: 'dup', systemPrompt: 'You are dup.' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PUT /api/v1/agents/profiles/:id', () => {
  it('updates profile', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/agents/profiles/builtin-researcher',
      payload: { name: 'updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().profile.name).toBe('researcher');
  });

  it('returns 404 when profile not found', async () => {
    const app = buildApp({ updateProfile: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/agents/profiles/missing',
      payload: { name: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/agents/profiles/:id', () => {
  it('deletes non-builtin profile and returns 204', async () => {
    const customProfile = { ...PROFILE, isBuiltin: false };
    const app = buildApp({ getProfile: vi.fn().mockResolvedValue(customProfile) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/agents/profiles/custom-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when profile not found', async () => {
    const app = buildApp({ getProfile: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/agents/profiles/missing' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when trying to delete a builtin profile', async () => {
    const app = buildApp(); // PROFILE.isBuiltin = true
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/agents/profiles/builtin-researcher' });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 when deleteProfile returns false', async () => {
    const customProfile = { ...PROFILE, isBuiltin: false };
    const app = buildApp({
      getProfile: vi.fn().mockResolvedValue(customProfile),
      deleteProfile: vi.fn().mockResolvedValue(false),
    });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/agents/profiles/custom-1' });
    expect(res.statusCode).toBe(500);
  });
});

// ── Delegation routes ────────────────────────────────────────────────

describe('POST /api/v1/agents/delegate', () => {
  it('creates delegation and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/delegate',
      payload: { profile: 'researcher', task: 'Research TypeScript' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('completed');
  });

  it('returns 400 when delegation fails', async () => {
    const app = buildApp({ delegate: vi.fn().mockRejectedValue(new Error('disabled')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/delegate',
      payload: { profile: 'researcher', task: 'task' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/agents/delegations', () => {
  it('lists delegations', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/delegations' });
    expect(res.statusCode).toBe(200);
    expect(res.json().delegations).toHaveLength(1);
  });
});

describe('GET /api/v1/agents/delegations/active', () => {
  it('returns active delegations', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/delegations/active' });
    expect(res.statusCode).toBe(200);
    expect(res.json().delegations).toEqual([]);
    expect(res.json().total).toBe(0);
  });
});

describe('GET /api/v1/agents/delegations/:id', () => {
  it('returns delegation with tree', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/delegations/del-1' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.delegation.id).toBe('del-1');
    expect(body.tree).toHaveLength(1);
  });

  it('returns 404 when delegation not found', async () => {
    const app = buildApp({ getDelegation: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/delegations/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/agents/delegations/:id/cancel', () => {
  it('cancels delegation', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/agents/delegations/del-1/cancel' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /api/v1/agents/delegations/:id/messages', () => {
  it('returns messages', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/delegations/del-1/messages' });
    expect(res.statusCode).toBe(200);
    expect(res.json().messages).toEqual([]);
  });
});

describe('GET /api/v1/agents/config', () => {
  it('returns agent config and policy info', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/config' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.config.enabled).toBe(true);
    expect(body.allowedBySecurityPolicy).toBe(true);
  });
});
