/**
 * AGNOSTIC QA Hook Integration (Phase B)
 *
 * Registers extension hooks that auto-trigger AGNOSTIC QA tasks when
 * certain SecureYeoman events occur (agent delegation, task completion,
 * swarm execution). Configurable per-personality and per-workflow.
 *
 * Configure via:
 *   AGNOSTIC_HOOKS_ENABLED=true
 *   AGNOSTIC_URL=http://127.0.0.1:8000
 *   AGNOSTIC_API_KEY=<key>
 *   AGNOSTIC_WEBHOOK_SECRET=<secret>   (for outbound HMAC signing)
 */

import { createHmac } from 'node:crypto';
import type { ExtensionManager } from '../extensions/manager.js';
import type { SecureLogger } from '../logging/logger.js';

export interface AgnosticHooksConfig {
  enabled: boolean;
  agnosticUrl: string;
  apiKey?: string;
  webhookSecret?: string;
  /** Hook points that trigger QA tasks. Default: agent:after-delegate, swarm:after-execute */
  triggerHookPoints?: string[];
  /** Default priority for auto-created QA tasks */
  defaultPriority?: 'critical' | 'high' | 'medium' | 'low';
  /** Default agents to invoke (empty = all) */
  defaultAgents?: string[];
  /** Default compliance standards to check */
  defaultStandards?: string[];
}

export interface AgnosticHooksDeps {
  extensionManager: ExtensionManager;
  logger: SecureLogger;
}

/**
 * Registers extension hooks that auto-trigger AGNOSTIC QA tasks.
 * Returns an unregister function to remove all hooks.
 */
export function registerAgnosticHooks(
  config: AgnosticHooksConfig,
  deps: AgnosticHooksDeps
): () => void {
  if (!config.enabled) {
    deps.logger.debug('AGNOSTIC hooks disabled');
    return () => {};
  }

  const hookIds: string[] = [];
  const hookPoints = config.triggerHookPoints ?? ['agent:after-delegate', 'swarm:after-execute'];

  for (const hookPoint of hookPoints) {
    const id = deps.extensionManager.registerHook(
      hookPoint as any,
      async (context) => {
        try {
          await submitQATask(config, deps.logger, hookPoint, context.data);
        } catch (err) {
          deps.logger.warn(
            {
              hookPoint,
              error: err instanceof Error ? err.message : String(err),
            },
            'AGNOSTIC QA trigger failed'
          );
        }
        return { vetoed: false, errors: [] };
      },
      { priority: 200, semantics: 'observe', extensionId: 'agnostic-qa-hooks' }
    );
    hookIds.push(id);
  }

  deps.logger.info(
    {
      hookPoints,
      agnosticUrl: config.agnosticUrl,
    },
    'AGNOSTIC hooks registered'
  );

  return () => {
    for (const id of hookIds) {
      deps.extensionManager.unregisterHook(id);
    }
  };
}

// ─── QA Task Submission ────────────────────────────────────────────────────────

async function submitQATask(
  config: AgnosticHooksConfig,
  logger: SecureLogger,
  hookPoint: string,
  data: unknown
): Promise<void> {
  const context = data as Record<string, unknown> | undefined;
  const title = buildTitle(hookPoint, context);
  const description = buildDescription(hookPoint, context);

  const payload = {
    title,
    description,
    priority: config.defaultPriority ?? 'high',
    agents: config.defaultAgents ?? [],
    standards: config.defaultStandards ?? [],
    callback_url: undefined as string | undefined,
    callback_secret: undefined as string | undefined,
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['X-API-Key'] = config.apiKey;

  const res = await fetch(`${config.agnosticUrl}/api/tasks`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.warn(
      {
        hookPoint,
        status: res.status,
        body: body.slice(0, 500),
      },
      'AGNOSTIC QA task submission failed'
    );
    return;
  }

  const result = (await res.json()) as { task_id?: string; session_id?: string };
  logger.info(
    {
      hookPoint,
      taskId: result.task_id,
      sessionId: result.session_id,
    },
    'AGNOSTIC QA task submitted'
  );
}

// ─── Outbound Webhook Dispatcher ────────────────────────────────────────────

/**
 * Sends a SecureYeoman hook event to AGNOSTIC's webhook receiver endpoint.
 * Used for event-driven QA triggers (after-deploy, on-pr-merge, etc.).
 */
export async function dispatchToAgnostic(
  config: AgnosticHooksConfig,
  event: string,
  data: Record<string, unknown>
): Promise<{ accepted: boolean; taskId?: string }> {
  const payload = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    source: 'secureyeoman',
    data,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Yeoman-Event': event,
  };

  if (config.apiKey) headers['X-API-Key'] = config.apiKey;

  if (config.webhookSecret) {
    const sig = createHmac('sha256', config.webhookSecret).update(payload).digest('hex');
    headers['X-Yeoman-Signature'] = `sha256=${sig}`;
  }

  const res = await fetch(`${config.agnosticUrl}/api/v1/yeoman/webhooks`, {
    method: 'POST',
    headers,
    body: payload,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) return { accepted: false };

  const result = (await res.json()) as { accepted?: boolean; task_id?: string };
  return { accepted: result.accepted ?? false, taskId: result.task_id };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTitle(hookPoint: string, context?: Record<string, unknown>): string {
  const profileName = context?.profileName as string | undefined;
  const delegationId = context?.delegationId as string | undefined;

  switch (hookPoint) {
    case 'agent:after-delegate':
      return `Post-delegation QA: ${profileName ?? delegationId ?? 'unknown'}`;
    case 'swarm:after-execute':
      return `Post-swarm QA: ${context?.swarmId ?? 'unknown'}`;
    case 'task:after-execute':
      return `Post-task QA: ${context?.taskId ?? 'unknown'}`;
    default:
      return `Auto QA: ${hookPoint}`;
  }
}

function buildDescription(hookPoint: string, context?: Record<string, unknown>): string {
  const parts = [`Automated QA triggered by SecureYeoman hook: ${hookPoint}`];

  if (context?.profileName) parts.push(`Agent profile: ${context.profileName}`);
  if (context?.delegationId) parts.push(`Delegation ID: ${context.delegationId}`);
  if (context?.status) parts.push(`Status: ${context.status}`);
  if (context?.durationMs) parts.push(`Duration: ${context.durationMs}ms`);

  return parts.join('\n');
}
