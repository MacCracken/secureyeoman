/**
 * Route Permission Registry — Convention-based RBAC permission resolution.
 *
 * Instead of maintaining 500+ hardcoded path→permission entries, permissions
 * are derived from two rules:
 *
 * 1. **Convention**: The URL prefix determines the RBAC resource, and the
 *    HTTP method determines the action (GET→read, POST/PUT/PATCH/DELETE→write).
 *
 * 2. **Overrides**: Routes that deviate from the convention (e.g. POST→execute,
 *    POST→read, or cross-domain resource mappings) are registered explicitly
 *    via `permit()`.
 *
 * Unmapped routes (no prefix match, no override) default to admin-only access.
 */

export interface RoutePermission {
  resource: string;
  action: string;
}

// ── Convention: method → default action ──────────────────────────────

const DEFAULT_METHOD_ACTIONS: Readonly<Record<string, string>> = {
  GET: 'read',
  POST: 'write',
  PUT: 'write',
  PATCH: 'write',
  DELETE: 'write',
};

// ── Convention: URL prefix → RBAC resource ───────────────────────────
// Ordered most-specific first. First matching prefix wins.

const PREFIX_RESOURCE_MAP: readonly [prefix: string, resource: string][] = [
  // Sub-domain resources (must precede their parent prefix)
  ['/api/v1/security/athi', 'security_athi'],
  ['/api/v1/security/sra', 'security_sra'],
  ['/api/v1/security/dlp', 'security'],
  ['/api/v1/security/tee', 'security'],
  ['/api/v1/security/events', 'security_events'],
  ['/api/v1/brain/logs', 'audit'],

  // Cross-domain mappings (route prefix ≠ resource name)
  ['/api/v1/conversations', 'chat'],
  ['/api/v1/replay-jobs', 'chat'],
  ['/api/v1/terminal', 'execution'],
  ['/api/v1/users', 'auth'],
  ['/api/v1/gmail', 'integrations'],
  ['/api/v1/twitter', 'integrations'],
  ['/api/v1/github', 'integrations'],
  ['/api/v1/webhooks', 'integrations'],
  ['/api/v1/webhook-transforms', 'integrations'],
  ['/api/v1/outbound-webhooks', 'integrations'],
  ['/api/v1/internal', 'integrations'],
  ['/api/v1/a2a', 'agents'],
  ['/api/v1/desktop', 'capture.screen'],
  ['/api/v1/capture', 'capture.screen'],
  ['/api/v1/gateway', 'chat'],
  ['/api/v1/alerts', 'notifications'],
  ['/api/v1/provider-accounts', 'ai'],

  // 1:1 domain mappings (first path segment = resource)
  ['/api/v1/metrics', 'metrics'],
  ['/api/v1/tasks', 'tasks'],
  ['/api/v1/audit', 'audit'],
  ['/api/v1/auth', 'auth'],
  ['/api/v1/soul', 'soul'],
  ['/api/v1/integrations', 'integrations'],
  ['/api/v1/brain', 'brain'],
  ['/api/v1/comms', 'comms'],
  ['/api/v1/model', 'model'],
  ['/api/v1/mcp', 'mcp'],
  ['/api/v1/reports', 'reports'],
  ['/api/v1/dashboards', 'dashboards'],
  ['/api/v1/workspaces', 'workspaces'],
  ['/api/v1/secrets', 'secrets'],
  ['/api/v1/experiments', 'experiments'],
  ['/api/v1/marketplace', 'marketplace'],
  ['/api/v1/multimodal', 'multimodal'],
  ['/api/v1/spirit', 'spirit'],
  ['/api/v1/chat', 'chat'],
  ['/api/v1/execution', 'execution'],
  ['/api/v1/agents', 'agents'],
  ['/api/v1/proactive', 'proactive'],
  ['/api/v1/browser', 'browser'],
  ['/api/v1/extensions', 'extensions'],
  ['/api/v1/federation', 'federation'],
  ['/api/v1/training', 'training'],
  ['/api/v1/eval', 'eval'],
  ['/api/v1/analytics', 'analytics'],
  ['/api/v1/license', 'license'],
  ['/api/v1/risk', 'risk'],
  ['/api/v1/workflows', 'workflows'],
  ['/api/v1/sandbox', 'sandbox'],
  ['/api/v1/responsible-ai', 'responsible_ai'],
  ['/api/v1/ai', 'ai'],
  ['/api/v1/events', 'events'],
];

// ── Explicit overrides ───────────────────────────────────────────────
// Routes that deviate from the convention above.

const overrides = new Map<string, RoutePermission>();

function overrideKey(path: string, method: string): string {
  return `${method}:${path}`;
}

/**
 * Register an explicit permission for a route that deviates from convention.
 * Called at module load time for built-in overrides and available for route
 * files to declare non-standard permissions.
 */
export function permit(path: string, method: string, resource: string, action: string): void {
  overrides.set(overrideKey(path, method), { resource, action });
}

// ── Built-in overrides (non-standard action or cross-resource) ───────

// POST → verify (custom RBAC action)
permit('/api/v1/audit/verify', 'POST', 'audit', 'verify');

// POST → read (read-only operations that accept a request body)
permit('/api/v1/auth/verify', 'POST', 'auth', 'read');
permit('/api/v1/brain/documents/form-fields', 'POST', 'brain', 'read');
permit('/api/v1/a2a/discover', 'POST', 'agents', 'read');
permit('/api/v1/extensions/discover', 'POST', 'extensions', 'read');
permit('/api/v1/federation/peers/:id/health', 'POST', 'federation', 'read');
permit('/api/v1/federation/personalities/:id/export', 'POST', 'federation', 'read');
permit('/api/v1/training/preferences/export', 'POST', 'training', 'read');
permit('/api/v1/training/curated-datasets/preview', 'POST', 'training', 'read');

// POST → execute (high-privilege operations)
permit('/api/v1/chat', 'POST', 'chat', 'execute');
permit('/api/v1/gateway', 'POST', 'chat', 'execute');
permit('/api/v1/conversations/:id/replay', 'POST', 'chat', 'execute');
permit('/api/v1/conversations/replay-batch', 'POST', 'chat', 'execute');
permit('/api/v1/execution/run', 'POST', 'execution', 'execute');
permit('/api/v1/terminal/execute', 'POST', 'execution', 'execute');
permit('/api/v1/terminal/worktrees', 'POST', 'execution', 'execute');
permit('/api/v1/mcp/tools/call', 'POST', 'mcp', 'execute');
permit('/api/v1/sandbox/scan', 'POST', 'sandbox', 'execute');

// DELETE → execute
permit('/api/v1/terminal/worktrees/:id', 'DELETE', 'execution', 'execute');

// Cross-resource override (route prefix maps to different resource than convention)
permit('/api/v1/auth/oauth/reload', 'POST', 'secrets', 'write');

// ── Desktop / Capture routes — non-standard RBAC actions ─────────────
// These use capture, configure, and stream instead of read/write.

permit('/api/v1/desktop/screenshot', 'POST', 'capture.screen', 'capture');
permit('/api/v1/desktop/windows', 'GET', 'capture.screen', 'capture');
permit('/api/v1/desktop/displays', 'GET', 'capture.screen', 'capture');
permit('/api/v1/desktop/camera', 'POST', 'capture.camera', 'capture');
permit('/api/v1/desktop/mouse/move', 'POST', 'capture.screen', 'configure');
permit('/api/v1/desktop/mouse/click', 'POST', 'capture.screen', 'configure');
permit('/api/v1/desktop/mouse/scroll', 'POST', 'capture.screen', 'configure');
permit('/api/v1/desktop/keyboard/type', 'POST', 'capture.screen', 'configure');
permit('/api/v1/desktop/keyboard/key', 'POST', 'capture.screen', 'configure');
permit('/api/v1/desktop/window/focus', 'POST', 'capture.screen', 'configure');
permit('/api/v1/desktop/window/resize', 'POST', 'capture.screen', 'configure');
permit('/api/v1/desktop/clipboard', 'GET', 'capture.clipboard', 'capture');
permit('/api/v1/desktop/clipboard', 'POST', 'capture.clipboard', 'configure');
permit('/api/v1/desktop/input/sequence', 'POST', 'capture.screen', 'configure');
permit('/api/v1/desktop/recording/start', 'POST', 'capture.screen', 'stream');
permit('/api/v1/desktop/recording/stop', 'POST', 'capture.screen', 'configure');
permit('/api/v1/desktop/recording/active', 'GET', 'capture.screen', 'capture');
permit('/api/v1/capture/consent/request', 'POST', 'capture.screen', 'capture');
permit('/api/v1/capture/consent/pending', 'GET', 'capture.screen', 'capture');
permit('/api/v1/capture/consent/:id', 'GET', 'capture.screen', 'capture');
permit('/api/v1/capture/consent/:id/grant', 'POST', 'capture.screen', 'configure');
permit('/api/v1/capture/consent/:id/deny', 'POST', 'capture.screen', 'configure');
permit('/api/v1/capture/consent/:id/revoke', 'POST', 'capture.screen', 'configure');

// ── Resolver ─────────────────────────────────────────────────────────

/**
 * Resolve the RBAC permission required for a given route path + HTTP method.
 *
 * Resolution order:
 * 1. Explicit override registered via `permit()`
 * 2. Convention: resource from PREFIX_RESOURCE_MAP, action from HTTP method
 *
 * Returns `null` for unmapped routes (which default to admin-only in the
 * RBAC hook).
 */
export function resolvePermission(path: string, method: string): RoutePermission | null {
  // 1. Explicit override
  const override = overrides.get(overrideKey(path, method));
  if (override) return override;

  // 2. Convention-based resolution
  let resource: string | null = null;
  for (const [prefix, res] of PREFIX_RESOURCE_MAP) {
    if (path === prefix || path.startsWith(prefix + '/')) {
      resource = res;
      break;
    }
  }
  if (!resource) return null;

  const action = DEFAULT_METHOD_ACTIONS[method];
  if (!action) return null;

  return { resource, action };
}

/**
 * Return the full override map for testing / inspection.
 * Convention-based entries are NOT included — use resolvePermission() instead.
 */
export function getOverrides(): ReadonlyMap<string, RoutePermission> {
  return overrides;
}

/**
 * Return the prefix → resource mapping for testing / inspection.
 */
export function getPrefixResourceMap(): readonly [string, string][] {
  return PREFIX_RESOURCE_MAP;
}
