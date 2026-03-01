/**
 * Team Routes tests — Fastify injection-based, no database required.
 */
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerTeamRoutes } from './team-routes.js';
import type { TeamManager } from './team-manager.js';

// ── Mock data ─────────────────────────────────────────────────────────────────

const TEAM = {
  id: 'team-1',
  name: 'Research Team',
  description: 'Research and analysis',
  members: [{ role: 'Researcher', profileName: 'researcher', description: 'Gathers info' }],
  coordinatorProfileName: 'researcher',
  isBuiltin: false,
  createdAt: 1000,
  updatedAt: 1000,
};

const RUN = {
  id: 'run-1',
  teamId: 'team-1',
  teamName: 'Research Team',
  task: 'Research AI trends',
  status: 'pending',
  result: null,
  error: null,
  coordinatorReasoning: null,
  assignedMembers: [],
  tokenBudget: 100000,
  tokensUsed: 0,
  createdAt: 1000,
  startedAt: null,
  completedAt: null,
};

function makeMockManager(overrides: Partial<TeamManager> = {}): TeamManager {
  return {
    listTeams: vi.fn().mockResolvedValue({ teams: [TEAM], total: 1 }),
    getTeam: vi.fn().mockResolvedValue(TEAM),
    createTeam: vi.fn().mockResolvedValue(TEAM),
    updateTeam: vi.fn().mockResolvedValue({ ...TEAM, name: 'Updated' }),
    deleteTeam: vi.fn().mockResolvedValue(undefined),
    run: vi.fn().mockResolvedValue(RUN),
    getRun: vi.fn().mockResolvedValue(RUN),
    listRuns: vi.fn().mockResolvedValue({ runs: [RUN], total: 1 }),
    ...overrides,
  } as unknown as TeamManager;
}

function buildApp(overrides: Partial<TeamManager> = {}) {
  const app = Fastify({ logger: false });
  registerTeamRoutes(app, { teamManager: makeMockManager(overrides) });
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/agents/teams', () => {
  it('returns teams list', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/teams' });
    expect(res.statusCode).toBe(200);
    expect(res.json().teams).toHaveLength(1);
    expect(res.json().total).toBe(1);
  });
});

describe('POST /api/v1/agents/teams', () => {
  it('creates team and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/teams',
      payload: {
        name: 'New Team',
        members: [{ role: 'Dev', profileName: 'coder' }],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().team.id).toBe('team-1');
  });

  it('returns 400 on validation failure', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/teams',
      payload: { name: '' }, // missing members
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 on manager error', async () => {
    const app = buildApp({
      createTeam: vi.fn().mockRejectedValue(new Error('duplicate name')),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/teams',
      payload: { name: 'Team', members: [{ role: 'Dev', profileName: 'coder' }] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/agents/teams/:id', () => {
  it('returns team by ID', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/teams/team-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().team.name).toBe('Research Team');
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ getTeam: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents/teams/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /api/v1/agents/teams/:id', () => {
  it('updates team', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/agents/teams/team-1',
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().team.name).toBe('Updated');
  });

  it('returns 403 when trying to modify builtin', async () => {
    const app = buildApp({
      updateTeam: vi.fn().mockRejectedValue(new Error('Cannot modify a builtin team')),
    });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/agents/teams/builtin-1',
      payload: { name: 'Hacked' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when team not found', async () => {
    const app = buildApp({
      updateTeam: vi.fn().mockRejectedValue(new Error('Team not found: x')),
    });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/agents/teams/x',
      payload: { name: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/agents/teams/:id', () => {
  it('deletes team and returns 204', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/agents/teams/team-1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 403 when trying to delete builtin', async () => {
    const app = buildApp({
      deleteTeam: vi.fn().mockRejectedValue(new Error('Cannot delete a builtin team')),
    });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/agents/teams/builtin-1' });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /api/v1/agents/teams/:id/run', () => {
  it('starts a team run and returns 202', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/teams/team-1/run',
      payload: { task: 'Research AI trends', tokenBudget: 50000 },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().run.id).toBe('run-1');
    expect(res.json().run.status).toBe('pending');
  });

  it('returns 400 on missing task', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/teams/team-1/run',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when team not found', async () => {
    const app = buildApp({
      run: vi.fn().mockRejectedValue(new Error('Team not found: missing')),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/teams/missing/run',
      payload: { task: 'test' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/v1/agents/teams/runs/:runId', () => {
  it('returns run by ID', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/agents/teams/runs/run-1',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().run.id).toBe('run-1');
  });

  it('returns 404 when run not found', async () => {
    const app = buildApp({ getRun: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/agents/teams/runs/missing',
    });
    expect(res.statusCode).toBe(404);
  });
});
