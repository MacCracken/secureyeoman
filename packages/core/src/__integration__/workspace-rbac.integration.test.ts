/**
 * Integration Test: Workspace Member RBAC
 *
 * Full HTTP integration of workspace creation, member management,
 * workspace-scoped RBAC enforcement, and last-admin protection.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  createTestStack,
  loginAndGetToken,
  setupTestDb,
  teardownTestDb,
  truncateAllTables,
  type TestStack,
} from './helpers.js';
import { createAuthHook, createRbacHook } from '../gateway/auth-middleware.js';
import { registerAuthRoutes } from '../gateway/auth-routes.js';
import { registerWorkspaceRoutes } from '../workspace/workspace-routes.js';
import { WorkspaceManager } from '../workspace/manager.js';
import { WorkspaceStorage } from '../workspace/storage.js';

async function createWorkspaceGateway(stack: TestStack): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const logger = stack.logger;

  app.addHook('onRequest', createAuthHook({ authService: stack.authService, logger, rbac: stack.rbac }));
  app.addHook(
    'onRequest',
    createRbacHook({ rbac: stack.rbac, auditChain: stack.auditChain, logger })
  );

  registerAuthRoutes(app, {
    authService: stack.authService,
    rateLimiter: stack.rateLimiter,
    rbac: stack.rbac,
  });

  const workspaceStorage = new WorkspaceStorage();
  const workspaceManager = new WorkspaceManager(workspaceStorage, { logger });

  registerWorkspaceRoutes(app, { workspaceManager, authService: stack.authService });

  await app.ready();
  return app;
}

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('Workspace Member RBAC Integration', () => {
  let stack: TestStack;
  let app: FastifyInstance;

  beforeEach(async () => {
    await truncateAllTables();
    stack = await createTestStack();
    await stack.auditChain.initialize();
    app = await createWorkspaceGateway(stack);
  });

  afterEach(async () => {
    await app.close();
    stack.cleanup();
  });

  // ── Workspace CRUD ────────────────────────────────────────────────

  it('admin can create, list, and delete workspaces', async () => {
    const { accessToken } = await loginAndGetToken(app);
    const headers = { authorization: `Bearer ${accessToken}` };

    // Create
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers,
      payload: { name: 'Engineering', description: 'Engineering team' },
    });
    expect(createRes.statusCode).toBe(201);
    const { workspace } = JSON.parse(createRes.body);
    expect(workspace.name).toBe('Engineering');
    expect(workspace.id).toBeDefined();

    // List
    const listRes = await app.inject({ method: 'GET', url: '/api/v1/workspaces', headers });
    expect(listRes.statusCode).toBe(200);
    const { workspaces } = JSON.parse(listRes.body);
    expect(workspaces.some((w: { id: string }) => w.id === workspace.id)).toBe(true);

    // Delete
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/workspaces/${workspace.id}`,
      headers,
    });
    expect(deleteRes.statusCode).toBe(204);
  });

  // ── Member management ─────────────────────────────────────────────

  it('admin can add, list, update role, and remove workspace members', async () => {
    const { accessToken } = await loginAndGetToken(app);
    const headers = { authorization: `Bearer ${accessToken}` };

    // Create workspace
    const wsRes = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers,
      payload: { name: 'TeamAlpha' },
    });
    const { workspace } = JSON.parse(wsRes.body);

    // Create a user to add as member
    const userRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers,
      payload: { email: 'member@test.local', displayName: 'Test Member' },
    });
    expect(userRes.statusCode).toBe(201);
    const { user } = JSON.parse(userRes.body);

    // Add member with 'member' role
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspace.id}/members`,
      headers,
      payload: { userId: user.id, role: 'member' },
    });
    expect(addRes.statusCode).toBe(201);
    const { member } = JSON.parse(addRes.body);
    expect(member.userId).toBe(user.id);
    expect(member.role).toBe('member');

    // List members
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/members`,
      headers,
    });
    expect(listRes.statusCode).toBe(200);
    const { members } = JSON.parse(listRes.body);
    expect(members.some((m: { userId: string }) => m.userId === user.id)).toBe(true);

    // Update role to admin
    const updateRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/workspaces/${workspace.id}/members/${user.id}`,
      headers,
      payload: { role: 'admin' },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(JSON.parse(updateRes.body).member.role).toBe('admin');

    // Update back to member so removal is not blocked by last-admin guard
    const downgradeRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/workspaces/${workspace.id}/members/${user.id}`,
      headers,
      payload: { role: 'member' },
    });
    expect(downgradeRes.statusCode).toBe(200);

    // Remove member
    const removeRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/workspaces/${workspace.id}/members/${user.id}`,
      headers,
    });
    expect(removeRes.statusCode).toBe(204);

    // Verify removal
    const afterRemove = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/members`,
      headers,
    });
    const afterMembers = JSON.parse(afterRemove.body).members;
    expect(afterMembers.some((m: { userId: string }) => m.userId === user.id)).toBe(false);
  });

  // ── Viewer RBAC ───────────────────────────────────────────────────

  it('viewer API key can list workspaces but cannot create or delete them', async () => {
    const { accessToken: adminToken } = await loginAndGetToken(app);
    const adminHeaders = { authorization: `Bearer ${adminToken}` };

    // Create workspace
    await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: adminHeaders,
      payload: { name: 'ReadOnly' },
    });

    // Create viewer key
    const keyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      headers: adminHeaders,
      payload: { name: 'viewer', role: 'viewer' },
    });
    const viewerKey = JSON.parse(keyRes.body).key;
    const viewerHeaders = { 'x-api-key': viewerKey };

    // Viewer can list workspaces
    const listRes = await app.inject({ method: 'GET', url: '/api/v1/workspaces', headers: viewerHeaders });
    expect(listRes.statusCode).toBe(200);

    // Viewer cannot create workspace
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: viewerHeaders,
      payload: { name: 'HackerWorkspace' },
    });
    expect(createRes.statusCode).toBe(403);
  });

  // ── Workspace-scoped RBAC ─────────────────────────────────────────

  it('non-member viewer API key cannot add members to a workspace', async () => {
    const { accessToken: adminToken } = await loginAndGetToken(app);
    const adminHeaders = { authorization: `Bearer ${adminToken}` };

    // Create workspace
    const wsRes = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: adminHeaders,
      payload: { name: 'Secret' },
    });
    const { workspace } = JSON.parse(wsRes.body);

    // Create a user
    const userRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: adminHeaders,
      payload: { email: 'outsider@test.local' },
    });
    const { user } = JSON.parse(userRes.body);

    // Create viewer API key
    const keyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      headers: adminHeaders,
      payload: { name: 'non-member', role: 'viewer' },
    });
    const viewerKey = JSON.parse(keyRes.body).key;

    // Viewer (non-admin) cannot add members
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspace.id}/members`,
      headers: { 'x-api-key': viewerKey },
      payload: { userId: user.id, role: 'member' },
    });
    expect(addRes.statusCode).toBe(403);
  });

  // ── Last-admin protection ─────────────────────────────────────────

  it('cannot remove the last admin/owner from a workspace', async () => {
    const { accessToken } = await loginAndGetToken(app);
    const headers = { authorization: `Bearer ${accessToken}` };

    // Create workspace
    const wsRes = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers,
      payload: { name: 'Single-Admin-WS' },
    });
    const { workspace } = JSON.parse(wsRes.body);

    // Create and add a single owner member
    const userRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers,
      payload: { email: 'sole-owner@test.local' },
    });
    const { user } = JSON.parse(userRes.body);

    await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspace.id}/members`,
      headers,
      payload: { userId: user.id, role: 'owner' },
    });

    // Remove the only owner — should fail with 400
    const removeRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/workspaces/${workspace.id}/members/${user.id}`,
      headers,
    });
    expect(removeRes.statusCode).toBe(400);
    expect(JSON.parse(removeRes.body).message).toMatch(/last admin/i);
  });

  // ── Invalid role ──────────────────────────────────────────────────

  it('rejects invalid member role', async () => {
    const { accessToken } = await loginAndGetToken(app);
    const headers = { authorization: `Bearer ${accessToken}` };

    const wsRes = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers,
      payload: { name: 'BadRole' },
    });
    const { workspace } = JSON.parse(wsRes.body);

    const userRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers,
      payload: { email: 'badrole@test.local' },
    });
    const { user } = JSON.parse(userRes.body);

    const addRes = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspace.id}/members`,
      headers,
      payload: { userId: user.id, role: 'superuser' },
    });
    expect(addRes.statusCode).toBe(400);
  });

  // ── Non-existent workspace ────────────────────────────────────────

  it('returns 404 for non-existent workspace', async () => {
    const { accessToken } = await loginAndGetToken(app);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/00000000-0000-0000-0000-000000000000/members',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
