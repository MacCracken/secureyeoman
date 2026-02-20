/**
 * Workspace Routes — REST API under /api/v1/workspaces
 *
 * Covers: workspace CRUD, member management, and user management.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { WorkspaceManager } from './manager.js';
import type { AuthService } from '../security/auth.js';
import { toErrorMessage, sendError } from '../utils/errors.js';
import { WorkspaceRoleSchema } from '@secureyeoman/shared';

export interface WorkspaceRoutesOptions {
  workspaceManager: WorkspaceManager;
  authService: AuthService;
}

/**
 * Workspace-scoped admin check.
 * Returns true (and sends a 403) if the requesting user is neither a global admin
 * nor a workspace owner/admin. Returns false when the caller may proceed.
 */
async function requireWorkspaceAdmin(
  workspaceManager: WorkspaceManager,
  workspaceId: string,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  const userId = (request as any).authUser?.userId;
  const globalRole = (request as any).authUser?.role;

  // Global admins always pass
  if (globalRole === 'admin') return false;

  if (!userId) {
    sendError(reply, 401, 'Not authenticated');
    return true;
  }

  const membership = await workspaceManager.getMember(workspaceId, userId);
  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
    sendError(reply, 403, 'Only workspace admins can perform this action');
    return true;
  }

  return false;
}

export function registerWorkspaceRoutes(app: FastifyInstance, opts: WorkspaceRoutesOptions): void {
  const { workspaceManager, authService } = opts;

  // ── Workspaces ───────────────────────────────────────────────────

  app.get(
    '/api/v1/workspaces',
    async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>) => {
      const limit = request.query.limit ? Number(request.query.limit) : undefined;
      const offset = request.query.offset ? Number(request.query.offset) : undefined;
      return workspaceManager.list({ limit, offset });
    }
  );

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
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.get(
    '/api/v1/workspaces/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const workspace = await workspaceManager.get(request.params.id);
      if (!workspace) return sendError(reply, 404, 'Workspace not found');
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
        const denied = await requireWorkspaceAdmin(workspaceManager, request.params.id, request, reply);
        if (denied) return;
        const workspace = await workspaceManager.update(request.params.id, request.body);
        if (!workspace) return sendError(reply, 404, 'Workspace not found');
        return { workspace };
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.delete(
    '/api/v1/workspaces/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!(await workspaceManager.delete(request.params.id)))
        return sendError(reply, 404, 'Workspace not found');
      return reply.code(204).send();
    }
  );

  // ── Members ──────────────────────────────────────────────────────

  app.get(
    '/api/v1/workspaces/:id/members',
    async (request: FastifyRequest<{ Params: { id: string }; Querystring: { limit?: string; offset?: string } }>, reply: FastifyReply) => {
      const workspace = await workspaceManager.get(request.params.id);
      if (!workspace) return sendError(reply, 404, 'Workspace not found');
      const limit = request.query.limit ? Number(request.query.limit) : undefined;
      const offset = request.query.offset ? Number(request.query.offset) : undefined;
      return workspaceManager.listMembers(request.params.id, { limit, offset });
    }
  );

  app.post(
    '/api/v1/workspaces/:id/members',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { userId: string; role?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const workspace = await workspaceManager.get(request.params.id);
        if (!workspace) return sendError(reply, 404, 'Workspace not found');

        const denied = await requireWorkspaceAdmin(workspaceManager, request.params.id, request, reply);
        if (denied) return;

        const role = request.body.role ?? 'member';
        const roleResult = WorkspaceRoleSchema.safeParse(role);
        if (!roleResult.success) {
          return sendError(reply, 400, `Invalid role. Must be one of: owner, admin, member, viewer`);
        }

        const member = await workspaceManager.addMember(
          request.params.id,
          request.body.userId,
          roleResult.data
        );
        return reply.code(201).send({ member });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
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
        const denied = await requireWorkspaceAdmin(workspaceManager, request.params.id, request, reply);
        if (denied) return;

        const roleResult = WorkspaceRoleSchema.safeParse(request.body.role);
        if (!roleResult.success) {
          return sendError(reply, 400, `Invalid role. Must be one of: owner, admin, member, viewer`);
        }

        const member = await workspaceManager.updateMemberRole(
          request.params.id,
          request.params.userId,
          roleResult.data
        );
        if (!member) return sendError(reply, 404, 'Member not found');
        return { member };
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.delete(
    '/api/v1/workspaces/:id/members/:userId',
    async (
      request: FastifyRequest<{ Params: { id: string; userId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const denied = await requireWorkspaceAdmin(workspaceManager, request.params.id, request, reply);
        if (denied) return;

        const { members } = await workspaceManager.listMembers(request.params.id);
        const admins = members.filter((m) => m.role === 'owner' || m.role === 'admin');
        const target = members.find((m) => m.userId === request.params.userId);
        if (!target) return sendError(reply, 404, 'Member not found');

        const isLastAdmin = (target.role === 'owner' || target.role === 'admin') && admins.length <= 1;
        if (isLastAdmin) {
          return sendError(reply, 400, 'Cannot remove the last admin/owner from a workspace');
        }

        if (!(await workspaceManager.removeMember(request.params.id, request.params.userId)))
          return sendError(reply, 404, 'Member not found');
        return reply.code(204).send();
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
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
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.delete(
    '/api/v1/users/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (request.params.id === 'admin')
        return sendError(reply, 400, 'Cannot delete built-in admin user');
      if (!(await authService.deleteUser(request.params.id)))
        return sendError(reply, 404, 'User not found');
      return reply.code(204).send();
    }
  );
}
