/**
 * Workspace Routes — REST API under /api/v1/workspaces
 *
 * Covers: workspace CRUD, member management, and user management.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { WorkspaceManager } from './manager.js';
import type { AuthService } from '../security/auth.js';
import { toErrorMessage } from '../utils/errors.js';

export interface WorkspaceRoutesOptions {
  workspaceManager: WorkspaceManager;
  authService: AuthService;
}

export function registerWorkspaceRoutes(app: FastifyInstance, opts: WorkspaceRoutesOptions): void {
  const { workspaceManager, authService } = opts;

  // ── Workspaces ───────────────────────────────────────────────────

  app.get('/api/v1/workspaces', async () => {
    const workspaces = await workspaceManager.list();
    return { workspaces, total: workspaces.length };
  });

  app.post(
    '/api/v1/workspaces',
    async (
      request: FastifyRequest<{
        Body: { name: string; description?: string; settings?: Record<string, unknown> };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const workspace = await workspaceManager.create(request.body as any);
        return reply.code(201).send({ workspace });
      } catch (err) {
        return reply.code(400).send({ error: toErrorMessage(err) });
      }
    }
  );

  app.get(
    '/api/v1/workspaces/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const workspace = await workspaceManager.get(request.params.id);
      if (!workspace) return reply.code(404).send({ error: 'Workspace not found' });
      return { workspace };
    }
  );

  app.put(
    '/api/v1/workspaces/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { name?: string; description?: string; settings?: Record<string, unknown> };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const workspace = await workspaceManager.update(request.params.id, request.body);
        if (!workspace) return reply.code(404).send({ error: 'Workspace not found' });
        return { workspace };
      } catch (err) {
        return reply.code(400).send({ error: toErrorMessage(err) });
      }
    }
  );

  app.delete(
    '/api/v1/workspaces/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!(await workspaceManager.delete(request.params.id)))
        return reply.code(404).send({ error: 'Workspace not found' });
      return reply.code(204).send();
    }
  );

  // ── Members ──────────────────────────────────────────────────────

  app.get(
    '/api/v1/workspaces/:id/members',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const workspace = await workspaceManager.get(request.params.id);
      if (!workspace) return reply.code(404).send({ error: 'Workspace not found' });
      const members = await workspaceManager.listMembers(request.params.id);
      return { members, total: members.length };
    }
  );

  app.post(
    '/api/v1/workspaces/:id/members',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { userId: string; role?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const member = await workspaceManager.addMember(
          request.params.id,
          request.body.userId,
          request.body.role
        );
        return reply.code(201).send({ member });
      } catch (err) {
        return reply.code(400).send({ error: toErrorMessage(err) });
      }
    }
  );

  app.put(
    '/api/v1/workspaces/:id/members/:userId',
    async (
      request: FastifyRequest<{
        Params: { id: string; userId: string };
        Body: { role: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const member = await workspaceManager.updateMemberRole(
          request.params.id,
          request.params.userId,
          request.body.role
        );
        if (!member) return reply.code(404).send({ error: 'Member not found' });
        return { member };
      } catch (err) {
        return reply.code(400).send({ error: toErrorMessage(err) });
      }
    }
  );

  app.delete(
    '/api/v1/workspaces/:id/members/:userId',
    async (
      request: FastifyRequest<{ Params: { id: string; userId: string } }>,
      reply: FastifyReply
    ) => {
      if (!(await workspaceManager.removeMember(request.params.id, request.params.userId)))
        return reply.code(404).send({ error: 'Member not found' });
      return reply.code(204).send();
    }
  );

  // ── Users (admin only) ───────────────────────────────────────────

  app.get('/api/v1/users', async () => {
    const users = await authService.listUsers();
    return { users, total: users.length };
  });

  app.post(
    '/api/v1/users',
    async (
      request: FastifyRequest<{
        Body: { email: string; displayName?: string; isAdmin?: boolean };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const user = await authService.createUser({
          email: request.body.email,
          displayName: request.body.displayName ?? '',
          isAdmin: request.body.isAdmin ?? false,
        });
        return reply.code(201).send({ user });
      } catch (err) {
        return reply.code(400).send({ error: toErrorMessage(err) });
      }
    }
  );

  app.delete(
    '/api/v1/users/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (request.params.id === 'admin')
        return reply.code(400).send({ error: 'Cannot delete built-in admin user' });
      if (!(await authService.deleteUser(request.params.id)))
        return reply.code(404).send({ error: 'User not found' });
      return reply.code(204).send();
    }
  );
}
