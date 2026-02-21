import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerSoulRoutes } from './soul-routes.js';
import type { SoulManager } from './manager.js';
import type { HeartbeatManager } from '../body/heartbeat.js';

const PERSONALITY = { id: 'pers-1', name: 'FRIDAY', systemPrompt: 'You are helpful.', traits: {} };
const SKILL = { id: 'skill-1', name: 'Search', status: 'enabled', source: 'builtin' };
const USER = { id: 'user-1', name: 'Alice', email: 'alice@example.com' };

function makeMockManager(overrides?: Partial<SoulManager>): SoulManager {
  return {
    getActivePersonality: vi.fn().mockResolvedValue(PERSONALITY),
    listPersonalities: vi.fn().mockResolvedValue({ personalities: [PERSONALITY], total: 1 }),
    createPersonality: vi.fn().mockResolvedValue(PERSONALITY),
    updatePersonality: vi.fn().mockResolvedValue(PERSONALITY),
    deletePersonality: vi.fn().mockResolvedValue(undefined),
    setPersonality: vi.fn().mockResolvedValue(undefined),
    listSkills: vi.fn().mockResolvedValue({ skills: [SKILL], total: 1 }),
    createSkill: vi.fn().mockResolvedValue(SKILL),
    updateSkill: vi.fn().mockResolvedValue(SKILL),
    deleteSkill: vi.fn().mockResolvedValue(undefined),
    enableSkill: vi.fn().mockResolvedValue(undefined),
    disableSkill: vi.fn().mockResolvedValue(undefined),
    approveSkill: vi.fn().mockResolvedValue(SKILL),
    rejectSkill: vi.fn().mockResolvedValue(undefined),
    listUsers: vi.fn().mockResolvedValue({ users: [USER], total: 1 }),
    getOwner: vi.fn().mockResolvedValue(USER),
    getUser: vi.fn().mockResolvedValue(USER),
    createUser: vi.fn().mockResolvedValue(USER),
    updateUser: vi.fn().mockResolvedValue(USER),
    deleteUser: vi.fn().mockResolvedValue(true),
    composeSoulPrompt: vi.fn().mockResolvedValue('You are FRIDAY.'),
    getActiveTools: vi.fn().mockResolvedValue(['search', 'code']),
    getConfig: vi.fn().mockReturnValue({ enabled: true, maxSkills: 50 }),
    getAgentName: vi.fn().mockResolvedValue('FRIDAY'),
    setAgentName: vi.fn().mockResolvedValue(undefined),
    needsOnboarding: vi.fn().mockResolvedValue(false),
    ...overrides,
  } as unknown as SoulManager;
}

function mockHeartbeatManager(): HeartbeatManager {
  return {
    setPersonalitySchedule: vi.fn(),
  } as unknown as HeartbeatManager;
}

function buildApp(overrides?: Partial<SoulManager>, heartbeatManager?: HeartbeatManager | null) {
  const app = Fastify();
  registerSoulRoutes(app, { soulManager: makeMockManager(overrides), heartbeatManager });
  return app;
}

describe('GET /api/v1/soul/personality', () => {
  it('returns active personality', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/soul/personality' });
    expect(res.statusCode).toBe(200);
    expect(res.json().personality.id).toBe('pers-1');
  });
});

describe('GET /api/v1/soul/personalities', () => {
  it('returns personalities list', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/soul/personalities' });
    expect(res.statusCode).toBe(200);
    expect(res.json().personalities).toHaveLength(1);
  });

  it('passes pagination params', async () => {
    const listMock = vi.fn().mockResolvedValue({ personalities: [], total: 0 });
    const app = buildApp({ listPersonalities: listMock });
    await app.inject({ method: 'GET', url: '/api/v1/soul/personalities?limit=5&offset=10' });
    expect(listMock).toHaveBeenCalledWith({ limit: 5, offset: 10 });
  });
});

describe('POST /api/v1/soul/personalities', () => {
  it('creates personality and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/soul/personalities',
      payload: { name: 'FRIDAY', systemPrompt: 'Be helpful.' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().personality.id).toBe('pers-1');
  });

  it('returns 400 on error', async () => {
    const app = buildApp({ createPersonality: vi.fn().mockRejectedValue(new Error('duplicate')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/soul/personalities',
      payload: { name: 'Dup' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PUT /api/v1/soul/personalities/:id', () => {
  it('updates personality', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/soul/personalities/pers-1',
      payload: { name: 'FRIDAY v2' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().personality.id).toBe('pers-1');
  });

  it('returns 404 on not found', async () => {
    const app = buildApp({ updatePersonality: vi.fn().mockRejectedValue(new Error('not found')) });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/soul/personalities/missing',
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/soul/personalities/:id', () => {
  it('deletes personality and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/soul/personalities/pers-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 400 on error', async () => {
    const app = buildApp({ deletePersonality: vi.fn().mockRejectedValue(new Error('in use')) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/soul/personalities/pers-1' });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/v1/soul/personalities/:id/activate', () => {
  it('activates personality', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/soul/personalities/pers-1/activate',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().personality.id).toBe('pers-1');
  });

  it('returns 404 on error', async () => {
    const app = buildApp({ setPersonality: vi.fn().mockRejectedValue(new Error('not found')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/soul/personalities/missing/activate',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/v1/soul/skills', () => {
  it('returns skills list', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/soul/skills' });
    expect(res.statusCode).toBe(200);
    expect(res.json().skills).toHaveLength(1);
  });

  it('passes filters to listSkills', async () => {
    const listMock = vi.fn().mockResolvedValue({ skills: [], total: 0 });
    const app = buildApp({ listSkills: listMock });
    await app.inject({
      method: 'GET',
      url: '/api/v1/soul/skills?status=enabled&source=builtin&personalityId=pers-1&limit=10&offset=0',
    });
    expect(listMock).toHaveBeenCalledWith({
      status: 'enabled',
      source: 'builtin',
      forPersonalityId: 'pers-1',
      limit: 10,
      offset: 0,
    });
  });
});

describe('POST /api/v1/soul/skills', () => {
  it('creates skill and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/soul/skills',
      payload: { name: 'My Skill' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().skill.id).toBe('skill-1');
  });

  it('returns 400 on error', async () => {
    const app = buildApp({ createSkill: vi.fn().mockRejectedValue(new Error('conflict')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/soul/skills',
      payload: { name: 'Dup' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PUT /api/v1/soul/skills/:id', () => {
  it('updates skill', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/soul/skills/skill-1',
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().skill.id).toBe('skill-1');
  });

  it('returns 404 on error', async () => {
    const app = buildApp({ updateSkill: vi.fn().mockRejectedValue(new Error('not found')) });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/soul/skills/missing',
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/soul/skills/:id', () => {
  it('deletes skill and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/soul/skills/skill-1' });
    expect(res.statusCode).toBe(204);
  });
});

describe('POST /api/v1/soul/skills/:id/enable', () => {
  it('enables skill', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/soul/skills/skill-1/enable' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 404 on error', async () => {
    const app = buildApp({ enableSkill: vi.fn().mockRejectedValue(new Error('not found')) });
    const res = await app.inject({ method: 'POST', url: '/api/v1/soul/skills/missing/enable' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/soul/skills/:id/disable', () => {
  it('disables skill', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/soul/skills/skill-1/disable' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('POST /api/v1/soul/skills/:id/approve', () => {
  it('approves skill', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/soul/skills/skill-1/approve' });
    expect(res.statusCode).toBe(200);
    expect(res.json().skill.id).toBe('skill-1');
  });
});

describe('POST /api/v1/soul/skills/:id/reject', () => {
  it('rejects skill', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/soul/skills/skill-1/reject' });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('Skill rejected');
  });
});

describe('GET /api/v1/soul/users', () => {
  it('returns users list', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/soul/users' });
    expect(res.statusCode).toBe(200);
    expect(res.json().users).toHaveLength(1);
  });
});

describe('GET /api/v1/soul/owner', () => {
  it('returns owner', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/soul/owner' });
    expect(res.statusCode).toBe(200);
    expect(res.json().owner.id).toBe('user-1');
  });
});

describe('GET /api/v1/soul/users/:id', () => {
  it('returns a user', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/soul/users/user-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe('user-1');
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ getUser: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/soul/users/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/soul/users', () => {
  it('creates user and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/soul/users',
      payload: { name: 'Bob', email: 'bob@example.com' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user.id).toBe('user-1');
  });
});

describe('PUT /api/v1/soul/users/:id', () => {
  it('updates a user', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/soul/users/user-1',
      payload: { name: 'Alice Updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe('user-1');
  });
});

describe('DELETE /api/v1/soul/users/:id', () => {
  it('deletes user and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/soul/users/user-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ deleteUser: vi.fn().mockResolvedValue(false) });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/soul/users/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/v1/soul/prompt/preview', () => {
  it('returns prompt preview', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/soul/prompt/preview' });
    expect(res.statusCode).toBe(200);
    expect(res.json().prompt).toBe('You are FRIDAY.');
    expect(res.json().tools).toHaveLength(2);
    expect(res.json().charCount).toBeGreaterThan(0);
  });
});

describe('GET /api/v1/soul/config', () => {
  it('returns soul config', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/soul/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json().config.enabled).toBe(true);
  });
});

describe('GET /api/v1/soul/agent-name', () => {
  it('returns agent name', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/soul/agent-name' });
    expect(res.statusCode).toBe(200);
    expect(res.json().agentName).toBe('FRIDAY');
  });
});

describe('PUT /api/v1/soul/agent-name', () => {
  it('sets agent name', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/soul/agent-name',
      payload: { agentName: 'JARVIS' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().agentName).toBe('FRIDAY');
  });

  it('returns 400 on error', async () => {
    const app = buildApp({ setAgentName: vi.fn().mockRejectedValue(new Error('invalid name')) });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/soul/agent-name',
      payload: { agentName: '' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/soul/onboarding/status', () => {
  it('returns onboarding status', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/soul/onboarding/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().needed).toBe(false);
    expect(res.json().agentName).toBe('FRIDAY');
  });
});

describe('POST /api/v1/soul/onboarding/complete', () => {
  it('completes onboarding and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/soul/onboarding/complete',
      payload: { agentName: 'FRIDAY', name: 'FRIDAY' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().agentName).toBe('FRIDAY');
    expect(res.json().personality.id).toBe('pers-1');
  });

  it('returns 400 on error', async () => {
    const app = buildApp({ createPersonality: vi.fn().mockRejectedValue(new Error('conflict')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/soul/onboarding/complete',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('heartbeatManager wiring', () => {
  const ACTIVE_HOURS = { enabled: true, start: '09:00', end: '17:00', daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'], timezone: 'UTC' };
  const PERSONALITY_WITH_HOURS = { ...PERSONALITY, body: { activeHours: ACTIVE_HOURS } };

  it('POST activate → calls setPersonalitySchedule with personality.body.activeHours', async () => {
    const hbm = mockHeartbeatManager();
    const app = buildApp(
      { getActivePersonality: vi.fn().mockResolvedValue(PERSONALITY_WITH_HOURS) },
      hbm
    );
    await app.inject({ method: 'POST', url: '/api/v1/soul/personalities/pers-1/activate' });
    expect(hbm.setPersonalitySchedule).toHaveBeenCalledWith(ACTIVE_HOURS);
  });

  it('POST activate → works gracefully when heartbeatManager is not provided', async () => {
    const app = buildApp(
      { getActivePersonality: vi.fn().mockResolvedValue(PERSONALITY_WITH_HOURS) },
      undefined
    );
    const res = await app.inject({ method: 'POST', url: '/api/v1/soul/personalities/pers-1/activate' });
    expect(res.statusCode).toBe(200);
  });

  it('PUT update → calls setPersonalitySchedule when updated personality is active', async () => {
    const hbm = mockHeartbeatManager();
    const updatedPersonality = { ...PERSONALITY_WITH_HOURS, id: 'pers-1' };
    const app = buildApp(
      {
        updatePersonality: vi.fn().mockResolvedValue(updatedPersonality),
        getActivePersonality: vi.fn().mockResolvedValue(updatedPersonality),
      },
      hbm
    );
    await app.inject({
      method: 'PUT',
      url: '/api/v1/soul/personalities/pers-1',
      payload: { name: 'FRIDAY' },
    });
    expect(hbm.setPersonalitySchedule).toHaveBeenCalledWith(ACTIVE_HOURS);
  });

  it('PUT update → does NOT call setPersonalitySchedule when updated personality is not active', async () => {
    const hbm = mockHeartbeatManager();
    const updatedPersonality = { ...PERSONALITY_WITH_HOURS, id: 'pers-2' };
    const app = buildApp(
      {
        updatePersonality: vi.fn().mockResolvedValue(updatedPersonality),
        getActivePersonality: vi.fn().mockResolvedValue({ ...PERSONALITY, id: 'pers-1' }),
      },
      hbm
    );
    await app.inject({
      method: 'PUT',
      url: '/api/v1/soul/personalities/pers-2',
      payload: { name: 'Alt' },
    });
    expect(hbm.setPersonalitySchedule).not.toHaveBeenCalled();
  });

  it('PUT update → works gracefully when heartbeatManager is not provided', async () => {
    const app = buildApp(undefined, undefined);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/soul/personalities/pers-1',
      payload: { name: 'FRIDAY' },
    });
    expect(res.statusCode).toBe(200);
  });
});
