/**
 * Auth Routes — login, refresh, logout, API-key CRUD.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuthService } from '../security/auth.js';
import { AuthError } from '../security/auth.js';
import type { RateLimiterLike } from '../security/rate-limiter.js';
import type { Role } from '@secureyeoman/shared';
import { RoleDefinitionSchema } from '@secureyeoman/shared';
import type { RBAC } from '../security/rbac.js';

/** Built-in role IDs that cannot be mutated or deleted via the API. */
const BUILTIN_ROLE_IDS = new Set([
  'role_admin',
  'role_operator',
  'role_auditor',
  'role_viewer',
  'role_capture_operator',
  'role_security_auditor',
  'role_voice_operator',
]);

export interface AuthRoutesOptions {
  authService: AuthService;
  rateLimiter: RateLimiterLike;
  rbac: RBAC;
}

export function registerAuthRoutes(app: FastifyInstance, opts: AuthRoutesOptions): void {
  const { authService, rateLimiter, rbac } = opts;

  // ── POST /api/v1/auth/login ───────────────────────────────────────
  app.post(
    '/api/v1/auth/login',
    async (
      request: FastifyRequest<{ Body: { password: string; rememberMe?: boolean } }>,
      reply: FastifyReply
    ) => {
      const { password, rememberMe } = request.body ?? {};
      if (!password || typeof password !== 'string') {
        return reply.code(400).send({ error: 'Password is required' });
      }

      try {
        const result = await authService.login(password, request.ip, !!rememberMe);
        return result;
      } catch (err) {
        if (err instanceof AuthError) {
          return reply.code(err.statusCode).send({ error: err.message });
        }
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // ── POST /api/v1/auth/refresh ─────────────────────────────────────
  app.post(
    '/api/v1/auth/refresh',
    async (request: FastifyRequest<{ Body: { refreshToken: string } }>, reply: FastifyReply) => {
      const { refreshToken } = request.body ?? {};
      if (!refreshToken || typeof refreshToken !== 'string') {
        return reply.code(400).send({ error: 'Refresh token is required' });
      }

      try {
        const result = await authService.refresh(refreshToken);
        return result;
      } catch (err) {
        if (err instanceof AuthError) {
          return reply.code(err.statusCode).send({ error: err.message });
        }
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // ── POST /api/v1/auth/logout ──────────────────────────────────────
  app.post('/api/v1/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.authUser;
    if (!user?.jti || !user.exp) {
      return reply.code(400).send({ error: 'No active JWT session' });
    }

    await authService.logout(user.jti, user.userId, user.exp);
    return { message: 'Logged out' };
  });

  // ── POST /api/v1/auth/reset-password ─────────────────────────────
  app.post(
    '/api/v1/auth/reset-password',
    async (
      request: FastifyRequest<{ Body: { currentPassword: string; newPassword: string } }>,
      reply: FastifyReply
    ) => {
      const { currentPassword, newPassword } = request.body ?? {};
      if (!currentPassword || typeof currentPassword !== 'string') {
        return reply.code(400).send({ error: 'Current password is required' });
      }
      if (!newPassword || typeof newPassword !== 'string') {
        return reply.code(400).send({ error: 'New password is required' });
      }

      try {
        await authService.resetPassword(currentPassword, newPassword);
        return { message: 'Password reset successfully. All sessions have been invalidated.' };
      } catch (err) {
        if (err instanceof AuthError) {
          return reply.code(err.statusCode).send({ error: err.message });
        }
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // ── POST /api/v1/auth/api-keys ────────────────────────────────────
  app.post(
    '/api/v1/auth/api-keys',
    async (
      request: FastifyRequest<{
        Body: { name: string; role: Role; expiresInDays?: number };
      }>,
      reply: FastifyReply
    ) => {
      const { name, role, expiresInDays } = request.body ?? {};
      if (!name || typeof name !== 'string') {
        return reply.code(400).send({ error: 'Name is required' });
      }
      if (!role || typeof role !== 'string') {
        return reply.code(400).send({ error: 'Role is required' });
      }

      try {
        const result = await authService.createApiKey({
          name,
          role: role,
          userId: request.authUser!.userId,
          expiresInDays,
        });
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof AuthError) {
          return reply.code(err.statusCode).send({ error: err.message });
        }
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // ── GET /api/v1/auth/api-keys ─────────────────────────────────────
  app.get('/api/v1/auth/api-keys', async (request: FastifyRequest) => {
    const keys = authService.listApiKeys(request.authUser?.userId);
    return { keys };
  });

  // ── POST /api/v1/auth/verify ──────────────────────────────────
  app.post(
    '/api/v1/auth/verify',
    async (request: FastifyRequest<{ Body: { token: string } }>, reply: FastifyReply) => {
      const { token } = request.body ?? {};
      if (!token || typeof token !== 'string') {
        return reply.code(400).send({ error: 'Token is required' });
      }

      try {
        const user = await authService.validateToken(token);
        return { valid: true, userId: user.userId, role: user.role, permissions: user.permissions };
      } catch {
        return { valid: false };
      }
    }
  );

  // ── DELETE /api/v1/auth/api-keys/:id ──────────────────────────────
  app.delete(
    '/api/v1/auth/api-keys/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const ok = await authService.revokeApiKey(request.params.id, request.authUser!.userId);
      if (!ok) {
        return reply.code(404).send({ error: 'API key not found or already revoked' });
      }
      return { message: 'API key revoked' };
    }
  );

  // ── GET /api/v1/auth/roles ─────────────────────────────────────────
  app.get('/api/v1/auth/roles', async () => {
    const roles = rbac.getAllRoles().map((r) => ({
      ...r,
      isBuiltin: BUILTIN_ROLE_IDS.has(r.id),
    }));
    return { roles };
  });

  // ── POST /api/v1/auth/roles ────────────────────────────────────────
  app.post(
    '/api/v1/auth/roles',
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          description?: string;
          permissions: { resource: string; action: string }[];
          inheritFrom?: string[];
        };
      }>,
      reply: FastifyReply
    ) => {
      const { name, description, permissions, inheritFrom } = request.body ?? {};
      if (!name || typeof name !== 'string') {
        return reply.code(400).send({ error: 'Name is required' });
      }
      if (!permissions || !Array.isArray(permissions)) {
        return reply.code(400).send({ error: 'Permissions array is required' });
      }

      const id = `role_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
      const role = { id, name, description, permissions, inheritFrom };

      const parsed = RoleDefinitionSchema.safeParse(role);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'Invalid role definition', details: parsed.error.format() });
      }

      try {
        await rbac.defineRole(parsed.data);
        return reply.code(201).send({ role: { ...parsed.data, isBuiltin: false } });
      } catch (err) {
        return reply
          .code(500)
          .send({ error: err instanceof Error ? err.message : 'Failed to create role' });
      }
    }
  );

  // ── PUT /api/v1/auth/roles/:id ─────────────────────────────────────
  app.put(
    '/api/v1/auth/roles/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          name?: string;
          description?: string;
          permissions?: { resource: string; action: string }[];
          inheritFrom?: string[];
        };
      }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      if (BUILTIN_ROLE_IDS.has(id)) {
        return reply.code(403).send({ error: 'Cannot modify built-in roles' });
      }

      const existing = rbac.getRole(id);
      if (!existing) {
        return reply.code(404).send({ error: 'Role not found' });
      }

      const updated = {
        ...existing,
        ...request.body,
        id, // Preserve original ID
      };

      const parsed = RoleDefinitionSchema.safeParse(updated);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'Invalid role definition', details: parsed.error.format() });
      }

      try {
        await rbac.defineRole(parsed.data);
        return { role: { ...parsed.data, isBuiltin: false } };
      } catch (err) {
        return reply
          .code(500)
          .send({ error: err instanceof Error ? err.message : 'Failed to update role' });
      }
    }
  );

  // ── DELETE /api/v1/auth/roles/:id ──────────────────────────────────
  app.delete(
    '/api/v1/auth/roles/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      if (BUILTIN_ROLE_IDS.has(id)) {
        return reply.code(403).send({ error: 'Cannot delete built-in roles' });
      }

      const removed = await rbac.removeRole(id);
      if (!removed) {
        return reply.code(404).send({ error: 'Role not found' });
      }
      return { message: 'Role deleted' };
    }
  );

  // ── GET /api/v1/auth/assignments ───────────────────────────────────
  app.get('/api/v1/auth/assignments', async () => {
    const assignments = rbac.listUserAssignments();
    return { assignments };
  });

  // ── POST /api/v1/auth/assignments ──────────────────────────────────
  app.post(
    '/api/v1/auth/assignments',
    async (
      request: FastifyRequest<{
        Body: { userId: string; roleId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { userId, roleId } = request.body ?? {};
      if (!userId || typeof userId !== 'string') {
        return reply.code(400).send({ error: 'userId is required' });
      }
      if (!roleId || typeof roleId !== 'string') {
        return reply.code(400).send({ error: 'roleId is required' });
      }

      const role = rbac.getRole(roleId);
      if (!role) {
        return reply.code(404).send({ error: `Role '${roleId}' not found` });
      }

      try {
        const assignedBy = request.authUser?.userId ?? 'system';
        await rbac.assignUserRole(userId, roleId, assignedBy);
        return reply.code(201).send({ assignment: { userId, roleId } });
      } catch (err) {
        return reply
          .code(500)
          .send({ error: err instanceof Error ? err.message : 'Failed to assign role' });
      }
    }
  );

  // ── DELETE /api/v1/auth/assignments/:userId ────────────────────────
  app.delete(
    '/api/v1/auth/assignments/:userId',
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const revoked = await rbac.revokeUserRole(request.params.userId);
      if (!revoked) {
        return reply.code(404).send({ error: 'No active assignment for this user' });
      }
      return { message: 'Assignment revoked' };
    }
  );
}
