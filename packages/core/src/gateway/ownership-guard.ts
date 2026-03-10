/**
 * Ownership guard — prevents IDOR by verifying the requesting user
 * has access to the resource being operated on.
 *
 * Admin and operator roles bypass ownership checks (they manage all resources).
 * Viewer and user roles must own the resource (via createdBy, userId, or personalityId).
 */
import type { FastifyRequest } from 'fastify';

/** Roles that bypass ownership checks (they administer all resources). */
const ADMIN_ROLES = new Set(['admin', 'operator', 'service']);

export interface OwnedResource {
  createdBy?: string | null;
  userId?: string | null;
  personalityId?: string | null;
}

/**
 * Returns true if the requesting user may access the given resource.
 * Admin/operator/service roles always pass. Other roles must match
 * createdBy, userId, or personalityId on the resource.
 */
export function canAccessResource(request: FastifyRequest, resource: OwnedResource): boolean {
  const authUser = (request as any).authUser;
  if (!authUser) return false;

  // Admin roles bypass ownership checks
  if (ADMIN_ROLES.has(authUser.role)) return true;

  // Check ownership via createdBy or userId
  const userId = authUser.userId;
  if (resource.createdBy && resource.createdBy === userId) return true;
  if (resource.userId && resource.userId === userId) return true;

  // Check ownership via personalityId — user must own the personality
  if (resource.personalityId && authUser.personalityId === resource.personalityId) return true;

  return false;
}

/**
 * Throws a 403-style error object if the user cannot access the resource.
 * Use with sendError() in route handlers.
 */
export function assertResourceAccess(request: FastifyRequest, resource: OwnedResource): void {
  if (!canAccessResource(request, resource)) {
    const err = new Error('Access denied: you do not own this resource');
    (err as any).statusCode = 403;
    throw err;
  }
}
