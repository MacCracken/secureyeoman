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
import type { TokenFederationService } from '../integrations/token-federation.js';
import { sendError, toErrorMessage } from '../utils/errors.js';

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
  tokenFederation?: TokenFederationService;
}

export function registerAuthRoutes(app: FastifyInstance, opts: AuthRoutesOptions): void {
  const { authService, rateLimiter, rbac, tokenFederation } = opts;

  // ── POST /api/v1/auth/login ───────────────────────────────────────
  app.post(
    '/api/v1/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          additionalProperties: false,
          properties: {
            password: { type: 'string', minLength: 1 },
            rememberMe: { type: 'boolean' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { password: string; rememberMe?: boolean } }>,
      reply: FastifyReply
    ) => {
      // Rate-limit by IP: max 5 attempts per 15 minutes (configurable via SecurityConfig)
      const rl = await rateLimiter.check('auth_attempts', request.ip, { ipAddress: request.ip });
      if (!rl.allowed) {
        reply.header('Retry-After', String(rl.retryAfter ?? 60));
        return sendError(reply, 429, 'Too many login attempts. Please try again later.');
      }

      const { password, rememberMe } = request.body;

      try {
        const result = await authService.login(password, request.ip, !!rememberMe);
        return result;
      } catch (err) {
        if (err instanceof AuthError) {
          return sendError(reply, err.statusCode, err.message);
        }
        return sendError(reply, 500, 'Internal server error');
      }
    }
  );

  // ── POST /api/v1/auth/refresh ─────────────────────────────────────
  app.post(
    '/api/v1/auth/refresh',
    {
      schema: {
        body: {
          type: 'object',
          required: ['refreshToken'],
          additionalProperties: false,
          properties: {
            refreshToken: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: { refreshToken: string } }>, reply: FastifyReply) => {
      // Rate-limit by IP: max 10 per minute (blocks token-stuffing loops)
      const rl = await rateLimiter.check('auth_refresh', request.ip, { ipAddress: request.ip });
      if (!rl.allowed) {
        reply.header('Retry-After', String(rl.retryAfter ?? 60));
        return sendError(reply, 429, 'Too many refresh attempts. Please try again later.');
      }

      const { refreshToken } = request.body;

      try {
        const result = await authService.refresh(refreshToken);
        return result;
      } catch (err) {
        if (err instanceof AuthError) {
          return sendError(reply, err.statusCode, err.message);
        }
        return sendError(reply, 500, 'Internal server error');
      }
    }
  );

  // ── POST /api/v1/auth/logout ──────────────────────────────────────
  app.post('/api/v1/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.authUser;
    if (!user?.jti || !user.exp) {
      return sendError(reply, 400, 'No active JWT session');
    }

    await authService.logout(user.jti, user.userId, user.exp);
    return { message: 'Logged out' };
  });

  // ── POST /api/v1/auth/reset-password ─────────────────────────────
  app.post(
    '/api/v1/auth/reset-password',
    {
      schema: {
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          additionalProperties: false,
          properties: {
            currentPassword: { type: 'string', minLength: 1 },
            newPassword: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { currentPassword: string; newPassword: string } }>,
      reply: FastifyReply
    ) => {
      // Rate-limit by IP: max 3 per hour (high-value credential operation)
      const rl = await rateLimiter.check('auth_reset_password', request.ip, {
        ipAddress: request.ip,
      });
      if (!rl.allowed) {
        reply.header('Retry-After', String(rl.retryAfter ?? 3600));
        return sendError(reply, 429, 'Too many password reset attempts. Please try again later.');
      }

      const { currentPassword, newPassword } = request.body;

      try {
        await authService.resetPassword(currentPassword, newPassword);
        return { message: 'Password reset successfully. All sessions have been invalidated.' };
      } catch (err) {
        if (err instanceof AuthError) {
          return sendError(reply, err.statusCode, err.message);
        }
        return sendError(reply, 500, 'Internal server error');
      }
    }
  );

  // ── POST /api/v1/auth/api-keys ────────────────────────────────────
  app.post(
    '/api/v1/auth/api-keys',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'role'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1 },
            role: { type: 'string', minLength: 1 },
            expiresInDays: { type: 'number' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { name: string; role: Role; expiresInDays?: number };
      }>,
      reply: FastifyReply
    ) => {
      const { name, role, expiresInDays } = request.body;

      try {
        const result = await authService.createApiKey({
          name,
          role: role,
          userId: request.authUser!.userId,
          expiresInDays,
        });
        return reply.code(201).send({
          id: result.id,
          name: result.name,
          key: result.key,
          rawKey: result.key,
          prefix: result.keyPrefix,
          role: result.role,
          createdAt: new Date(result.createdAt).toISOString(),
          expiresAt: result.expiresAt ? new Date(result.expiresAt).toISOString() : undefined,
        });
      } catch (err) {
        if (err instanceof AuthError) {
          return sendError(reply, err.statusCode, err.message);
        }
        return sendError(reply, 500, 'Internal server error');
      }
    }
  );

  // ── GET /api/v1/auth/api-keys ─────────────────────────────────────
  app.get('/api/v1/auth/api-keys', async (request: FastifyRequest) => {
    const rows = await authService.listApiKeys(request.authUser?.userId);
    const keys = rows.map((r) => ({
      id: r.id,
      name: r.name,
      prefix: r.key_prefix,
      role: r.role,
      createdAt: new Date(r.created_at).toISOString(),
      expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : undefined,
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : undefined,
    }));
    return { keys };
  });

  // ── POST /api/v1/auth/verify ──────────────────────────────────
  // Accepts both JWT session tokens AND long-lived API keys (sck_… prefix).
  // This allows MCP clients to authenticate with either token type.
  app.post(
    '/api/v1/auth/verify',
    {
      schema: {
        body: {
          type: 'object',
          required: ['token'],
          additionalProperties: false,
          properties: {
            token: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: { token: string } }>, reply: FastifyReply) => {
      const { token } = request.body;

      // Try JWT first, then fall back to API key validation
      try {
        const user = await authService.validateToken(token);
        return { valid: true, userId: user.userId, role: user.role, permissions: user.permissions };
      } catch {
        // JWT failed — try as an API key (sck_… prefix or any non-JWT token)
        try {
          const user = await authService.validateApiKey(token);
          return {
            valid: true,
            userId: user.userId,
            role: user.role,
            permissions: user.permissions,
          };
        } catch {
          return { valid: false };
        }
      }
    }
  );

  // ── DELETE /api/v1/auth/api-keys/:id ──────────────────────────────
  app.delete(
    '/api/v1/auth/api-keys/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const ok = await authService.revokeApiKey(request.params.id, request.authUser!.userId);
      if (!ok) {
        return sendError(reply, 404, 'API key not found or already revoked');
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
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'permissions'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            permissions: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
            inheritFrom: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
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
      const { name, description, permissions, inheritFrom } = request.body;

      const id = `role_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
      const role = { id, name, description, permissions, inheritFrom };

      const parsed = RoleDefinitionSchema.safeParse(role);
      if (!parsed.success) {
        return sendError(reply, 400, 'Invalid role definition', {
          extra: { details: parsed.error.format() },
        });
      }

      try {
        await rbac.defineRole(parsed.data);
        return reply.code(201).send({ role: { ...parsed.data, isBuiltin: false } });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
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
        return sendError(reply, 403, 'Cannot modify built-in roles');
      }

      const existing = rbac.getRole(id);
      if (!existing) {
        return sendError(reply, 404, 'Role not found');
      }

      const updated = {
        ...existing,
        ...request.body,
        id, // Preserve original ID
      };

      const parsed = RoleDefinitionSchema.safeParse(updated);
      if (!parsed.success) {
        return sendError(reply, 400, 'Invalid role definition', {
          extra: { details: parsed.error.format() },
        });
      }

      try {
        await rbac.defineRole(parsed.data);
        return { role: { ...parsed.data, isBuiltin: false } };
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── DELETE /api/v1/auth/roles/:id ──────────────────────────────────
  app.delete(
    '/api/v1/auth/roles/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      if (BUILTIN_ROLE_IDS.has(id)) {
        return sendError(reply, 403, 'Cannot delete built-in roles');
      }

      const removed = await rbac.removeRole(id);
      if (!removed) {
        return sendError(reply, 404, 'Role not found');
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
    {
      schema: {
        body: {
          type: 'object',
          required: ['userId', 'roleId'],
          additionalProperties: false,
          properties: {
            userId: { type: 'string', minLength: 1 },
            roleId: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { userId: string; roleId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { userId, roleId } = request.body;

      const role = rbac.getRole(roleId);
      if (!role) {
        return sendError(reply, 404, `Role '${roleId}' not found`);
      }

      try {
        const assignedBy = request.authUser?.userId ?? 'system';
        await rbac.assignUserRole(userId, roleId, assignedBy);
        return reply.code(201).send({ assignment: { userId, roleId } });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── DELETE /api/v1/auth/assignments/:userId ────────────────────────
  app.delete(
    '/api/v1/auth/assignments/:userId',
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const revoked = await rbac.revokeUserRole(request.params.userId);
      if (!revoked) {
        return sendError(reply, 404, 'No active assignment for this user');
      }
      return { message: 'Assignment revoked' };
    }
  );

  // ── POST /api/v1/auth/federation/token — Issue cross-project JWT ──
  app.post(
    '/api/v1/auth/federation/token',
    async (
      request: FastifyRequest<{
        Body: {
          audience: string;
          scopes?: string[];
          ttlSeconds?: number;
          metadata?: Record<string, unknown>;
        };
      }>,
      reply: FastifyReply
    ) => {
      if (!tokenFederation) {
        return sendError(reply, 503, 'Token federation not configured');
      }
      try {
        const authUser = (request as any).authUser;
        if (!authUser) {
          return sendError(reply, 401, 'Authentication required');
        }
        const result = await tokenFederation.issueToken({
          audience: request.body.audience,
          subject: authUser.userId,
          role: authUser.role,
          scopes: request.body.scopes,
          ttlSeconds: request.body.ttlSeconds,
          metadata: request.body.metadata,
        });
        return result;
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  // ── POST /api/v1/auth/federation/verify — Verify inbound federation token ──
  app.post(
    '/api/v1/auth/federation/verify',
    async (
      request: FastifyRequest<{
        Body: { token: string; expectedAudience?: string };
      }>,
      reply: FastifyReply
    ) => {
      if (!tokenFederation) {
        return sendError(reply, 503, 'Token federation not configured');
      }
      try {
        const payload = await tokenFederation.verifyToken(
          request.body.token,
          request.body.expectedAudience
        );
        return { valid: true, payload };
      } catch (err) {
        return sendError(reply, 401, toErrorMessage(err));
      }
    }
  );
}
