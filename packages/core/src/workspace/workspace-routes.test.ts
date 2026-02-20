import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerWorkspaceRoutes } from './workspace-routes.js';
import type { WorkspaceManager } from './manager.js';
import type { AuthService } from '../security/auth.js';

// ── Mock data ──────────────────────────────────────────────────────

const WS = { id: 'ws-1', name: 'Team A', description: '', settings: {}, members: [], createdAt: 1000, updatedAt: 1000 };
const MEMBER = { workspaceId: 'ws-1', userId: 'u1', role: 'member', joinedAt: 1000 };
const USER = { id: 'u1', email: 'test@example.com', displayName: 'Test User', isAdmin: false, createdAt: 1000 };

function makeMockWorkspaceManager(overrides?: Partial<WorkspaceManager>): WorkspaceManager {
  return {
    list: vi.fn().mockResolvedValue({ workspaces: [WS], total: 1 }),
    create: vi.fn().mockResolvedValue(WS),
    get: vi.fn().mockResolvedValue(WS),
    update: vi.fn().mockResolvedValue(WS),
    delete: vi.fn().mockResolvedValue(true),
    listMembers: vi.fn().mockResolvedValue({ members: [MEMBER], total: 1 }),
    addMember: vi.fn().mockResolvedValue(MEMBER),
    updateMemberRole: vi.fn().mockResolvedValue(MEMBER),
    removeMember: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as WorkspaceManager;
}

function makeMockAuthService(overrides?: Partial<AuthService>): AuthService {
  return {
    listUsers: vi.fn().mockResolvedValue([USER]),
    createUser: vi.fn().mockResolvedValue(USER),
    deleteUser: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as AuthService;
}

function buildApp(wm?: WorkspaceManager, auth?: AuthService) {
  const app = Fastify();
  registerWorkspaceRoutes(app, {
    workspaceManager: wm ?? makeMockWorkspaceManager(),
    authService: auth ?? makeMockAuthService(),
  });
  return app;
}

// ── Workspace CRUD ─────────────────────────────────────────────────

describe('Workspace Routes — workspaces', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(() => { app = buildApp(); });

  it('GET /api/v1/workspaces returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces' });
    expect(res.statusCode).toBe(200);
    expect(res.json().workspaces).toHaveLength(1);
  });

  it('GET /api/v1/workspaces passes limit/offset to manager', async () => {
    const wm = makeMockWorkspaceManager();
    const a = buildApp(wm);
    await a.inject({ method: 'GET', url: '/api/v1/workspaces?limit=5&offset=10' });
    expect(wm.list).toHaveBeenCalledWith({ limit: 5, offset: 10 });
  });

  it('POST /api/v1/workspaces creates workspace', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/workspaces', payload: { name: 'Team A' } });
    expect(res.statusCode).toBe(201);
    expect(res.json().workspace.id).toBe('ws-1');
  });

  it('POST /api/v1/workspaces returns 400 on manager error', async () => {
    const wm = makeMockWorkspaceManager({ create: vi.fn().mockRejectedValue(new Error('duplicate')) });
    const a = buildApp(wm);
    const res = await a.inject({ method: 'POST', url: '/api/v1/workspaces', payload: { name: '' } });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/v1/workspaces/:id returns workspace', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces/ws-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().workspace.id).toBe('ws-1');
  });

  it('GET /api/v1/workspaces/:id returns 404 when not found', async () => {
    const wm = makeMockWorkspaceManager({ get: vi.fn().mockResolvedValue(null) });
    const a = buildApp(wm);
    const res = await a.inject({ method: 'GET', url: '/api/v1/workspaces/missing' });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /api/v1/workspaces/:id updates workspace', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/v1/workspaces/ws-1', payload: { name: 'Updated' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().workspace.id).toBe('ws-1');
  });

  it('PUT /api/v1/workspaces/:id returns 404 when not found', async () => {
    const wm = makeMockWorkspaceManager({ update: vi.fn().mockResolvedValue(null) });
    const a = buildApp(wm);
    const res = await a.inject({ method: 'PUT', url: '/api/v1/workspaces/missing', payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /api/v1/workspaces/:id returns 400 on manager error', async () => {
    const wm = makeMockWorkspaceManager({ update: vi.fn().mockRejectedValue(new Error('validation')) });
    const a = buildApp(wm);
    const res = await a.inject({ method: 'PUT', url: '/api/v1/workspaces/ws-1', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE /api/v1/workspaces/:id returns 204', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/workspaces/ws-1' });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE /api/v1/workspaces/:id returns 404 when not found', async () => {
    const wm = makeMockWorkspaceManager({ delete: vi.fn().mockResolvedValue(false) });
    const a = buildApp(wm);
    const res = await a.inject({ method: 'DELETE', url: '/api/v1/workspaces/missing' });
    expect(res.statusCode).toBe(404);
  });
});

// ── Member Management ──────────────────────────────────────────────

describe('Workspace Routes — members', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(() => { app = buildApp(); });

  it('GET /api/v1/workspaces/:id/members returns members', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces/ws-1/members' });
    expect(res.statusCode).toBe(200);
    expect(res.json().members).toHaveLength(1);
  });

  it('GET /api/v1/workspaces/:id/members returns 404 when workspace not found', async () => {
    const wm = makeMockWorkspaceManager({ get: vi.fn().mockResolvedValue(null) });
    const a = buildApp(wm);
    const res = await a.inject({ method: 'GET', url: '/api/v1/workspaces/missing/members' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/v1/workspaces/:id/members adds member', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/workspaces/ws-1/members', payload: { userId: 'u1', role: 'admin' } });
    expect(res.statusCode).toBe(201);
    expect(res.json().member.userId).toBe('u1');
  });

  it('POST /api/v1/workspaces/:id/members returns 400 on error', async () => {
    const wm = makeMockWorkspaceManager({ addMember: vi.fn().mockRejectedValue(new Error('already exists')) });
    const a = buildApp(wm);
    const res = await a.inject({ method: 'POST', url: '/api/v1/workspaces/ws-1/members', payload: { userId: 'u1' } });
    expect(res.statusCode).toBe(400);
  });

  it('PUT /api/v1/workspaces/:id/members/:userId updates role', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/v1/workspaces/ws-1/members/u1', payload: { role: 'admin' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().member.userId).toBe('u1');
  });

  it('PUT /api/v1/workspaces/:id/members/:userId returns 404 when not found', async () => {
    const wm = makeMockWorkspaceManager({ updateMemberRole: vi.fn().mockResolvedValue(null) });
    const a = buildApp(wm);
    const res = await a.inject({ method: 'PUT', url: '/api/v1/workspaces/ws-1/members/missing', payload: { role: 'member' } });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /api/v1/workspaces/:id/members/:userId returns 400 on error', async () => {
    const wm = makeMockWorkspaceManager({ updateMemberRole: vi.fn().mockRejectedValue(new Error('invalid role')) });
    const a = buildApp(wm);
    const res = await a.inject({ method: 'PUT', url: '/api/v1/workspaces/ws-1/members/u1', payload: { role: 'superadmin' } });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE /api/v1/workspaces/:id/members/:userId returns 204', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/workspaces/ws-1/members/u1' });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE /api/v1/workspaces/:id/members/:userId returns 404 when not found', async () => {
    const wm = makeMockWorkspaceManager({ removeMember: vi.fn().mockResolvedValue(false) });
    const a = buildApp(wm);
    const res = await a.inject({ method: 'DELETE', url: '/api/v1/workspaces/ws-1/members/missing' });
    expect(res.statusCode).toBe(404);
  });
});

// ── User Management ────────────────────────────────────────────────

describe('Workspace Routes — users', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(() => { app = buildApp(); });

  it('GET /api/v1/users returns users', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/users' });
    expect(res.statusCode).toBe(200);
    expect(res.json().users).toHaveLength(1);
    expect(res.json().total).toBe(1);
  });

  it('POST /api/v1/users creates user', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/users', payload: { email: 'test@example.com' } });
    expect(res.statusCode).toBe(201);
    expect(res.json().user.id).toBe('u1');
  });

  it('POST /api/v1/users returns 400 on error', async () => {
    const auth = makeMockAuthService({ createUser: vi.fn().mockRejectedValue(new Error('email taken')) });
    const a = buildApp(undefined, auth);
    const res = await a.inject({ method: 'POST', url: '/api/v1/users', payload: { email: 'dup@example.com' } });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE /api/v1/users/:id returns 204', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/users/u1' });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE /api/v1/users/admin returns 400 (protected)', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/users/admin' });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('Cannot delete built-in admin');
  });

  it('DELETE /api/v1/users/:id returns 404 when not found', async () => {
    const auth = makeMockAuthService({ deleteUser: vi.fn().mockResolvedValue(false) });
    const a = buildApp(undefined, auth);
    const res = await a.inject({ method: 'DELETE', url: '/api/v1/users/missing' });
    expect(res.statusCode).toBe(404);
  });
});
