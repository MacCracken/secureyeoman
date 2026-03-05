/**
 * Auth Middleware — Fastify onRequest hooks for JWT / API-key auth and RBAC.
 */

import type { TLSSocket } from 'node:tls';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthService, AuthUser } from '../security/auth.js';
import { AuthError } from '../security/auth.js';
import type { RBAC } from '../security/rbac.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { SecureLogger } from '../logging/logger.js';
import { sendError } from '../utils/errors.js';
import { resolvePermission } from './route-permissions.js';

// ── Fastify augmentation ─────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

// ROUTE_PERMISSIONS removed — see route-permissions.ts
// Permissions are now resolved via convention (prefix→resource, method→action)
// with explicit overrides for non-standard routes.
//
// To add a new route: if it follows the convention (GET=read, POST=write,
// resource derived from URL prefix), no action needed. For special cases,
// call permit() in route-permissions.ts.

const PUBLIC_ROUTES = new Set([
  '/health',
  '/health/live',
  '/health/ready',
  '/health/deep',
  '/metrics',
  '/prom/metrics',
  '/api/v1/auth/login',
  '/ws/metrics',
  '/api/v1/auth/oauth/:provider',
  '/api/v1/auth/oauth/:provider/callback',
  '/api/v1/auth/oauth/config',
  '/api/v1/auth/oauth/claim',
  // Federation peer-incoming routes — use custom preHandler (shared-secret Bearer auth)
  '/api/v1/federation/knowledge/search',
  '/api/v1/federation/marketplace',
  '/api/v1/federation/marketplace/:skillId',
]);
const TOKEN_ONLY_ROUTES = new Set([
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/reset-password',
]);

// ── Helpers ──────────────────────────────────────────────────────────

function routeKey(request: FastifyRequest): string {
  // Fastify stores the route schema path (with :param placeholders) in routeOptions
  return (request.routeOptions?.url ?? request.url.split('?')[0])!;
}

// ── Auth extraction hook ─────────────────────────────────────────────

export interface AuthHookOptions {
  authService: AuthService;
  logger: SecureLogger;
  rbac?: RBAC;
}

export function createAuthHook(opts: AuthHookOptions) {
  return async function authHook(request: FastifyRequest, reply: FastifyReply) {
    const path = routeKey(request);

    if (PUBLIC_ROUTES.has(path)) return;

    // Personality avatar images are loaded by browsers as <img src> without auth headers
    if (
      request.method === 'GET' &&
      path.startsWith('/api/v1/soul/personalities/') &&
      path.endsWith('/avatar')
    )
      return;

    // SPA routes and static assets don't require auth — only API and WS paths do
    if (!path.startsWith('/api/') && !path.startsWith('/ws/')) return;

    // Try client certificate (mTLS)
    const socket = request.raw.socket as TLSSocket;
    if (typeof socket.authorized === 'boolean' && socket.authorized) {
      try {
        const cert = socket.getPeerCertificate();
        if (cert?.subject?.CN) {
          const assignedRole = (opts.rbac?.getUserRole(cert.subject.CN) ??
            'operator') as AuthUser['role'];
          request.authUser = {
            userId: cert.subject.CN,
            role: assignedRole,
            permissions: [],
            authMethod: 'certificate',
          };
          return;
        }
      } catch {
        // Fall through to JWT/API-key auth
      }
    }

    // Try Bearer token
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        request.authUser = await opts.authService.validateToken(token);
        request.log = request.log.child({
          userId: request.authUser.userId,
          role: request.authUser.role,
        });
        return;
      } catch (err) {
        if (err instanceof AuthError) {
          return sendError(reply, err.statusCode, err.message);
        }
        return sendError(reply, 401, 'Authentication failed');
      }
    }

    // Try API key
    const apiKey = request.headers['x-api-key'] as string | undefined;
    if (apiKey) {
      try {
        request.authUser = await opts.authService.validateApiKey(apiKey);
        request.log = request.log.child({
          userId: request.authUser.userId,
          role: request.authUser.role,
        });
        return;
      } catch (err) {
        if (err instanceof AuthError) {
          return sendError(reply, err.statusCode, err.message);
        }
        return sendError(reply, 401, 'Authentication failed');
      }
    }

    return sendError(reply, 401, 'Missing authentication credentials');
  };
}

// ── RBAC enforcement hook ────────────────────────────────────────────

export interface RbacHookOptions {
  rbac: RBAC;
  auditChain: AuditChain;
  logger: SecureLogger;
}

export function createRbacHook(opts: RbacHookOptions) {
  return async function rbacHook(request: FastifyRequest, reply: FastifyReply) {
    const path = routeKey(request);

    // Skip public + token-only routes
    if (PUBLIC_ROUTES.has(path) || TOKEN_ONLY_ROUTES.has(path)) return;

    // Personality avatar images are public (no auth set by auth hook)
    if (
      request.method === 'GET' &&
      path.startsWith('/api/v1/soul/personalities/') &&
      path.endsWith('/avatar')
    )
      return;

    // SPA routes and static assets are not subject to RBAC
    if (!path.startsWith('/api/') && !path.startsWith('/ws/')) return;

    const user = request.authUser;
    if (!user) {
      return sendError(reply, 401, 'Not authenticated');
    }

    // Look up required permission (convention + overrides)
    const perm = resolvePermission(path, request.method);

    if (!perm) {
      // Unmapped route — admin only (default-deny)
      if (user.role !== 'admin') {
        await auditDenial(opts, user, path, request.method);
        return sendError(reply, 403, 'Forbidden');
      }
      return;
    }

    const result = opts.rbac.checkPermission(
      user.role,
      {
        resource: perm.resource,
        action: perm.action,
      },
      user.userId
    );

    if (!result.granted) {
      await auditDenial(opts, user, path, request.method);
      return sendError(reply, 403, 'Forbidden');
    }
  };
}

async function auditDenial(
  opts: RbacHookOptions,
  user: AuthUser,
  path: string,
  method: string
): Promise<void> {
  try {
    await opts.auditChain.record({
      event: 'permission_denied',
      level: 'warn',
      message: `RBAC denied ${method} ${path}`,
      userId: user.userId,
      metadata: { role: user.role, path, method },
    });
  } catch {
    opts.logger.error('Failed to audit RBAC denial');
  }
}
