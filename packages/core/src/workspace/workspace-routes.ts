/**
 * Workspace Routes — REST API under /api/v1/workspaces
 *
 * Covers: workspace CRUD, member management, and user management.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { WorkspaceManager } from './manager.js';
import type { AuthService } from '../security/auth.js';

export interface WorkspaceRoutesOptions {
  workspaceManager: WorkspaceManager;
  authService: AuthService;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
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
        const ws = await workspaceManager.create(request.body as any);
        return reply.code(201).send({ workspace: ws });
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.get(
    '/api/v1/workspaces/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const ws = await workspaceManager.get(request.params.id);
      if (!ws) return reply.code(404).send({ error: 'Workspace not found' });
      return { workspace: ws };
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
        const ws = await workspaceManager.update(request.params.id, request.body);
        if (!ws) return reply.code(404).send({ error: 'Workspace not found' });
        return { workspace: ws };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.delete(
    '/api/v1/workspaces/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!(await workspaceManager.delete(request.params.id)))
        return reply.code(404).send({ error: 'Workspace not found' });
      return { message: 'Workspace deleted' };
    }
  );

  // ── Members ──────────────────────────────────────────────────────

  app.get(
    '/api/v1/workspaces/:id/members',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const ws = await workspaceManager.get(request.params.id);
      if (!ws) return reply.code(404).send({ error: 'Workspace not found' });
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
        return reply.code(400).send({ error: errorMessage(err) });
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
        return reply.code(400).send({ error: errorMessage(err) });
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
      return { message: 'Member removed' };
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
          displayName: request.body.displayName,
          isAdmin: request.body.isAdmin ?? false,
        });
        return reply.code(201).send({ user });
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
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
      return { message: 'User deleted' };
    }
  );
}
