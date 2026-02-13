/**
 * Capture Permission Middleware
 *
 * RBAC permission enforcement for screen capture operations.
 *
 * @see ADR 015: RBAC Permissions for Capture
 * @see NEXT_STEP_01: RBAC Permissions for Screen Capture
 */

import { getRBAC, PermissionDeniedError } from '../security/rbac.js';
import { getLogger, type SecureLogger } from '../logging/logger.js';
import type { CaptureResource, CaptureAction, CaptureScope } from './types.js';

/**
 * Context for capture permission checks
 */
export interface CapturePermissionContext {
  /** User ID making the request */
  userId: string;
  /** Role ID of the user */
  roleId: string;
  /** Session ID for audit trail */
  sessionId?: string;
  /** IP address of the requester */
  ipAddress?: string;
  /** User agent string */
  userAgent?: string;
}

/**
 * Result of a capture permission check
 */
export interface CapturePermissionResult {
  granted: boolean;
  reason?: string;
  maxDuration?: number;
  allowedActions?: CaptureAction[];
}

/**
 * Cache for capture permission checks
 * Format: `${roleId}:${resource}:${action}:${contextHash}` -> result
 */
const permissionCache = new Map<string, CapturePermissionResult>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000;

/**
 * Get logger for capture permissions
 */
function getCaptureLogger(): SecureLogger {
  try {
    return getLogger().child({ component: 'CapturePermissions' });
  } catch {
    // Return a minimal logger interface if logger not available
    return {
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      fatal: () => {},
      child: () => getCaptureLogger(),
      level: 'info',
    } as unknown as SecureLogger;
  }
}

/**
 * Generate cache key for permission check
 */
function generateCacheKey(
  roleId: string,
  resource: CaptureResource,
  action: CaptureAction,
  context?: Partial<CaptureScope>
): string {
  const contextHash = context
    ? Buffer.from(JSON.stringify(context)).toString('base64').slice(0, 16)
    : 'nocontext';
  return `capture:${roleId}:${resource}:${action}:${contextHash}`;
}

/**
 * Clean expired cache entries
 */
function cleanCache(): void {
  if (permissionCache.size >= MAX_CACHE_SIZE) {
    // LRU eviction - remove oldest 20% of entries
    const entriesToRemove = Math.floor(MAX_CACHE_SIZE * 0.2);
    const keys = Array.from(permissionCache.keys()).slice(0, entriesToRemove);
    keys.forEach((key) => permissionCache.delete(key));
  }
}

/**
 * Check if user has permission for a capture operation
 *
 * @param resource - The capture resource (screen, camera, etc.)
 * @param action - The action to perform
 * @param context - Capture scope context for condition evaluation
 * @param userContext - User and session context
 * @returns Permission result with grant status and limits
 *
 * @example
 * ```typescript
 * const result = await checkCapturePermission(
 *   'capture.screen',
 *   'capture',
 *   { duration: 60, quality: '720p', purpose: 'debugging' },
 *   { userId: 'user123', roleId: 'role_operator' }
 * );
 *
 * if (!result.granted) {
 *   throw new PermissionDeniedError('capture.screen', 'capture', result.reason);
 * }
 * ```
 */
export async function checkCapturePermission(
  resource: CaptureResource,
  action: CaptureAction,
  context: Partial<CaptureScope>,
  userContext: CapturePermissionContext
): Promise<CapturePermissionResult> {
  const logger = getCaptureLogger();
  const { userId, roleId } = userContext;

  // Generate cache key
  const cacheKey = generateCacheKey(roleId, resource, action, context);

  // Check cache
  const cached = permissionCache.get(cacheKey);
  if (cached) {
    logger.debug('Capture permission cache hit', {
      userId,
      roleId,
      resource,
      action,
    });
    return cached;
  }

  // Perform RBAC check
  const rbac = getRBAC();
  const result = rbac.checkPermission(roleId, { resource, action, context }, userId);

  // Build result
  const captureResult: CapturePermissionResult = {
    granted: result.granted,
    reason: result.reason,
    maxDuration: result.matchedPermission?.conditions?.find(
      (c) => c.field === 'duration' && c.operator === 'lte'
    )?.value as number | undefined,
    allowedActions: result.granted
      ? (rbac.getRole(roleId)?.permissions.find((p) => p.resource === resource)?.actions as
          | CaptureAction[]
          | undefined)
      : undefined,
  };

  // Cache the result
  cleanCache();
  permissionCache.set(cacheKey, captureResult);

  // Log the check
  const logLevel = result.granted ? 'debug' : 'warn';
  logger[logLevel]('Capture permission check', {
    userId,
    roleId,
    resource,
    action,
    granted: result.granted,
    reason: result.reason,
    context,
  });

  return captureResult;
}

/**
 * Require capture permission or throw PermissionDeniedError
 *
 * @throws PermissionDeniedError if permission is not granted
 *
 * @example
 * ```typescript
 * await requireCapturePermission(
 *   'capture.screen',
 *   'capture',
 *   { duration: 60 },
 *   { userId, roleId }
 * );
 * // Proceed with capture...
 * ```
 */
export async function requireCapturePermission(
  resource: CaptureResource,
  action: CaptureAction,
  context: Partial<CaptureScope>,
  userContext: CapturePermissionContext
): Promise<CapturePermissionResult> {
  const result = await checkCapturePermission(resource, action, context, userContext);

  if (!result.granted) {
    throw new PermissionDeniedError(resource, action, result.reason || 'Permission denied');
  }

  return result;
}

/**
 * Express/Connect middleware factory for capture permissions
 *
 * @param resource - The capture resource to check
 * @param action - The action to check
 *
 * @example
 * ```typescript
 * router.post('/capture/screen',
 *   requireCapturePermissionMiddleware('capture.screen', 'capture'),
 *   captureHandler
 * );
 * ```
 */
export function requireCapturePermissionMiddleware(
  resource: CaptureResource,
  action: CaptureAction
) {
  return async (
    req: Request & {
      user?: { id: string; role: string };
      body?: Partial<CaptureScope>;
    },
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new PermissionDeniedError(resource, action, 'Authentication required');
      }

      const userContext: CapturePermissionContext = {
        userId: req.user.id,
        roleId: req.user.role,
        // @ts-expect-error - Express request extensions
        sessionId: req.session?.id,
        // @ts-expect-error - Express request extensions
        ipAddress: req.ip,
        // @ts-expect-error - Express request extensions
        userAgent: req.get('user-agent'),
      };

      await requireCapturePermission(resource, action, req.body || {}, userContext);

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Clear the permission cache
 * Call this when roles are modified
 */
export function clearCapturePermissionCache(): void {
  permissionCache.clear();
  getCaptureLogger().info('Capture permission cache cleared');
}

/**
 * Get cache statistics for monitoring
 */
export function getCaptureCacheStats(): {
  size: number;
  maxSize: number;
  ttlMs: number;
} {
  return {
    size: permissionCache.size,
    maxSize: MAX_CACHE_SIZE,
    ttlMs: CACHE_TTL_MS,
  };
}

// Type imports for Express middleware
import type { Response, NextFunction } from 'express';
