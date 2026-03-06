/**
 * E2E Test Helpers
 *
 * Boots a real Fastify server on an OS-assigned port with real DB.
 * Tests make actual HTTP requests via fetch — no inject().
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { AuthService } from '../security/auth.js';
import { AuthStorage } from '../security/auth-storage.js';
import { AuditChain, InMemoryAuditStorage } from '../logging/audit-chain.js';
import { initializeRBAC } from '../security/rbac.js';
import { createRateLimiter } from '../security/rate-limiter.js';
import { createAuthHook, createRbacHook } from '../gateway/auth-middleware.js';
import { registerAuthRoutes } from '../gateway/auth-routes.js';
import { registerSoulRoutes } from '../soul/soul-routes.js';
import { registerBrainRoutes } from '../brain/brain-routes.js';
import { registerWorkflowRoutes } from '../workflow/workflow-routes.js';
import { SoulManager } from '../soul/manager.js';
import { SoulStorage } from '../soul/storage.js';
import { BrainManager } from '../brain/manager.js';
import { BrainStorage } from '../brain/storage.js';
import { WorkflowManager } from '../workflow/workflow-manager.js';
import { WorkflowStorage } from '../workflow/workflow-storage.js';
import type { SecureLogger } from '../logging/logger.js';
import type { SecurityConfig, SoulConfig } from '@secureyeoman/shared';
import { BrainConfigSchema } from '@secureyeoman/shared';
import { sha256 } from '../utils/crypto.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

export { setupTestDb, teardownTestDb, truncateAllTables };

// ── Constants ──────────────────────────────────────────────────────

export const TEST_SIGNING_KEY = 'a]&3Gk9$mQ#vL7@pR!wZ5*xN2^bT8+dF';
export const TEST_TOKEN_SECRET = 'test-token-secret-at-least-32chars!!';
export const TEST_ADMIN_PASSWORD = 'test-admin-password-32chars!!';
export const TEST_ADMIN_PASSWORD_HASH = sha256(TEST_ADMIN_PASSWORD);

// ── Logger ─────────────────────────────────────────────────────────

export function noopLogger(): SecureLogger {
  const noop = () => {};
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => noopLogger(),
    level: 'trace' as const,
  };
}

// ── Server ─────────────────────────────────────────────────────────

export interface E2EServer {
  baseUrl: string;
  app: FastifyInstance;
  close: () => Promise<void>;
}

/**
 * Boot a real Fastify server listening on an OS-assigned port.
 * Wires auth, soul, brain, and workflow routes against real DB.
 */
export async function startE2EServer(): Promise<E2EServer> {
  const logger = noopLogger();
  const auditStorage = new InMemoryAuditStorage();
  const auditChain = new AuditChain({ storage: auditStorage, signingKey: TEST_SIGNING_KEY });
  await auditChain.initialize();

  const rbac = await initializeRBAC();
  const rateLimiter = createRateLimiter({
    rateLimiting: {
      enabled: true,
      defaultWindowMs: 60000,
      defaultMaxRequests: 100,
    },
  } as SecurityConfig);

  rateLimiter.addRule({
    name: 'auth_attempts',
    windowMs: 900000,
    maxRequests: 50,
    keyType: 'ip',
    onExceed: 'reject',
  });

  const authStorage = new AuthStorage();
  const authService = new AuthService(
    {
      tokenSecret: TEST_TOKEN_SECRET,
      tokenExpirySeconds: 3600,
      refreshTokenExpirySeconds: 86400,
      adminPassword: TEST_ADMIN_PASSWORD_HASH,
    },
    {
      storage: authStorage,
      auditChain,
      rbac,
      rateLimiter,
      logger: logger.child({ component: 'AuthService' }),
    },
  );

  // ── Domain managers (real storage, real DB) ───────────────────

  const soulStorage = new SoulStorage();
  const soulConfig: SoulConfig = {
    enabled: true,
    learningMode: ['user_authored'],
    maxSkills: 50,
    maxPromptTokens: 4096,
  };
  const soulManager = new SoulManager(soulStorage, soulConfig, { auditChain, logger });

  const brainStorage = new BrainStorage();
  const brainConfig = BrainConfigSchema.parse({ enabled: true });
  const brainManager = new BrainManager(brainStorage, brainConfig, { auditChain, logger });

  const workflowStorage = new WorkflowStorage();
  const workflowManager = new WorkflowManager({
    storage: workflowStorage,
    logger,
  });

  // ── Fastify app ────────────────────────────────────────────────

  const app = Fastify({ logger: false });

  // Auth + RBAC hooks
  app.addHook('onRequest', createAuthHook({ authService, logger, rbac }));
  app.addHook('onRequest', createRbacHook({ rbac, auditChain, logger }));

  // Auth routes
  registerAuthRoutes(app, { authService, rateLimiter, rbac });

  // Soul routes (personality CRUD)
  registerSoulRoutes(app, { soulManager, auditChain, dataDir: '/tmp/e2e-test' });

  // Brain routes (memory + knowledge CRUD)
  registerBrainRoutes(app, { brainManager });

  // Workflow routes (definition CRUD)
  registerWorkflowRoutes(app, { workflowManager });

  // Health
  app.get('/health', async () => ({
    status: 'ok',
    version: '0.1.0-e2e',
    uptime: process.uptime(),
  }));

  // Metrics (protected)
  app.get('/api/v1/metrics', async () => ({
    timestamp: Date.now(),
    tasks: { total: 0, running: 0, completed: 0 },
    memory: process.memoryUsage(),
  }));

  // Tasks (protected)
  app.get('/api/v1/tasks', async () => ({
    tasks: [],
    total: 0,
  }));

  // Audit (protected)
  app.get('/api/v1/audit', async () => auditStorage.query());

  app.post('/api/v1/audit/verify', async () => auditChain.verify());

  // Security events (protected, admin-only)
  app.get('/api/v1/security/events', async () => ({
    events: [],
    total: 0,
  }));

  await app.listen({ host: '127.0.0.1', port: 0 });

  const addr = app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    app,
    close: async () => {
      rateLimiter.stop();
      authStorage.close();
      await app.close();
    },
  };
}

// ── Fetch Helpers ──────────────────────────────────────────────────

export async function login(
  baseUrl: string,
  password = TEST_ADMIN_PASSWORD,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  return res.json() as Promise<{ accessToken: string; refreshToken: string }>;
}

/** Auth header with content-type (for GET, POST, PUT). */
export function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
}

/** Auth header only — no content-type (for DELETE with no body). */
export function authDeleteHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/** API key header with content-type (for GET, POST, PUT). */
export function apiKeyHeaders(key: string): Record<string, string> {
  return {
    'x-api-key': key,
    'content-type': 'application/json',
  };
}
