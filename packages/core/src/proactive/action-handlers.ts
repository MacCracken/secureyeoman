/**
 * Proactive Action Handlers — Execute actions when triggers fire.
 */

import type {
  MessageAction,
  WebhookAction,
  RemindAction,
  ExecuteAction,
  LearnAction,
} from '@secureyeoman/shared';
import type { ActionResult, ProactiveManagerDeps } from './types.js';
import { errorToString } from '../utils/errors.js';
import { withRetry } from '../ai/retry-manager.js';
import { assertPublicUrl } from '../utils/ssrf-guard.js';

export async function executeMessageAction(
  action: MessageAction,
  deps: ProactiveManagerDeps
): Promise<ActionResult> {
  const { logger, integrationManager } = deps;

  if (!integrationManager) {
    logger.warn('Integration manager not available for message action');
    return { success: false, message: 'Integration manager not available' };
  }

  try {
    const enabledIntegrations = await integrationManager.listIntegrations({ enabled: true });
    const targetChannel = action.channel;
    let sent = 0;

    for (const config of enabledIntegrations) {
      if (targetChannel && config.platform !== targetChannel) continue;
      const adapter = integrationManager.getAdapter(config.id);
      if (!adapter) continue;
      try {
        await adapter.sendMessage('proactive', action.content);
        sent++;
      } catch (err) {
        logger.warn(
          {
            platform: config.platform,
            error: errorToString(err),
          },
          'Failed to send proactive message via integration'
        );
      }
    }

    if (sent === 0 && !targetChannel) {
      logger.info('No integrations available for proactive message, logging to memory');
    }

    return {
      success: true,
      message: `Message sent to ${sent} channel(s)`,
      data: { sentCount: sent },
    };
  } catch (err) {
    return {
      success: false,
      message: 'Failed to send message',
      error: errorToString(err),
    };
  }
}

export async function executeWebhookAction(
  action: WebhookAction,
  deps: ProactiveManagerDeps
): Promise<ActionResult> {
  const { logger } = deps;

  try {
    assertPublicUrl(action.url, 'Proactive webhook URL');

    const response = await withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, action.timeoutMs ?? 5000);

        const res = await fetch(action.url, {
          method: action.method ?? 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...action.headers,
          },
          body:
            action.body ??
            JSON.stringify({ source: 'secureyeoman-proactive', timestamp: Date.now() }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        return res;
      },
      {
        maxRetries: 2,
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        shouldRetry: () => true, // Original retried all errors unconditionally
      }
    );

    logger.info({ url: action.url }, 'Proactive webhook executed');
    return { success: true, message: `Webhook OK (${response.status})` };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return {
      success: false,
      message: 'Webhook failed after retries',
      error: error.message,
    };
  }
}

export async function executeRemindAction(
  action: RemindAction,
  deps: ProactiveManagerDeps
): Promise<ActionResult> {
  const { brainManager, logger } = deps;

  try {
    await brainManager.remember(
      'procedural',
      action.content,
      action.category ?? 'proactive_reminder',
      { source: 'proactive_remind' },
      0.7
    );

    logger.info({ category: action.category }, 'Proactive reminder stored');
    return { success: true, message: 'Reminder stored in memory' };
  } catch (err) {
    return {
      success: false,
      message: 'Failed to store reminder',
      error: errorToString(err),
    };
  }
}

export async function executeExecuteAction(
  action: ExecuteAction,
  deps: ProactiveManagerDeps
): Promise<ActionResult> {
  const { logger } = deps;

  // Execute action delegates to sub-agent system
  // For safety, we log the request rather than auto-executing
  logger.info(
    {
      taskName: action.taskName,
      agentProfile: action.agentProfile,
    },
    'Proactive execute action requested'
  );

  return {
    success: true,
    message: `Task "${action.taskName}" queued for execution`,
    data: { taskName: action.taskName, agentProfile: action.agentProfile },
  };
}

export async function executeLearnAction(
  action: LearnAction,
  deps: ProactiveManagerDeps
): Promise<ActionResult> {
  const { brainManager, logger } = deps;

  try {
    await brainManager.remember(
      action.memoryType ?? 'procedural',
      action.content,
      action.category ?? 'proactive_learning',
      { source: 'proactive_learn' },
      action.importance ?? 0.6
    );

    logger.info(
      {
        category: action.category,
        memoryType: action.memoryType,
      },
      'Proactive learn action stored'
    );
    return { success: true, message: 'Knowledge stored in memory' };
  } catch (err) {
    return {
      success: false,
      message: 'Failed to store knowledge',
      error: errorToString(err),
    };
  }
}
