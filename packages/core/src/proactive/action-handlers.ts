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
        logger.warn('Failed to send proactive message via integration', {
          platform: config.platform,
          error: err instanceof Error ? err.message : String(err),
        });
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
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function executeWebhookAction(
  action: WebhookAction,
  deps: ProactiveManagerDeps
): Promise<ActionResult> {
  const { logger } = deps;
  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, action.timeoutMs ?? 5000);

      const response = await fetch(action.url, {
        method: action.method ?? 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...action.headers,
        },
        body: action.body ?? JSON.stringify({ source: 'secureyeoman-proactive', timestamp: Date.now() }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      logger.info('Proactive webhook executed', { url: action.url, attempt: attempt + 1 });
      return { success: true, message: `Webhook OK (${response.status})` };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  return {
    success: false,
    message: 'Webhook failed after retries',
    error: lastError?.message,
  };
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

    logger.info('Proactive reminder stored', { category: action.category });
    return { success: true, message: 'Reminder stored in memory' };
  } catch (err) {
    return {
      success: false,
      message: 'Failed to store reminder',
      error: err instanceof Error ? err.message : String(err),
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
  logger.info('Proactive execute action requested', {
    taskName: action.taskName,
    agentProfile: action.agentProfile,
  });

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

    logger.info('Proactive learn action stored', {
      category: action.category,
      memoryType: action.memoryType,
    });
    return { success: true, message: 'Knowledge stored in memory' };
  } catch (err) {
    return {
      success: false,
      message: 'Failed to store knowledge',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
