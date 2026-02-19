/**
 * MessageRouter — Routes inbound UnifiedMessages to the task executor
 * and sends responses back to the originating platform.
 *
 * Flow: Platform → Integration.onMessage → MessageRouter → TaskExecutor → response → Integration.sendMessage
 */

import type { UnifiedMessage } from '@secureyeoman/shared';
import { TaskType } from '@secureyeoman/shared';
import type { TaskExecutor, ExecutionContext } from '../task/executor.js';
import type { IntegrationManager } from './manager.js';
import type { IntegrationStorage } from './storage.js';
import type { SecureLogger } from '../logging/logger.js';
import type { OutboundWebhookDispatcher } from './outbound-webhook-dispatcher.js';

export interface MessageRouterDeps {
  logger: SecureLogger;
  taskExecutor: TaskExecutor;
  integrationManager: IntegrationManager;
  integrationStorage: IntegrationStorage;
  multimodalManager?: {
    synthesizeSpeech: (req: {
      text: string;
      voice?: string;
      model?: string;
      responseFormat?: string;
    }) => Promise<{ audioBase64: string; format: string }>;
  } | null;
  /** Resolve the active personality for TTS voice selection and integration access enforcement */
  getActivePersonality?: () => Promise<{
    voice?: string | null;
    selectedIntegrations?: string[];
  } | null>;
  /** Optional outbound webhook dispatcher — fires message.inbound events */
  outboundWebhookDispatcher?: OutboundWebhookDispatcher | null;
}

export class MessageRouter {
  private readonly deps: MessageRouterDeps;

  constructor(deps: MessageRouterDeps) {
    this.deps = deps;
  }

  /** Inject multimodal + personality deps after construction (avoids init-order issues). */
  setMultimodalDeps(deps: {
    multimodalManager: MessageRouterDeps['multimodalManager'];
    getActivePersonality?: MessageRouterDeps['getActivePersonality'];
  }): void {
    (this.deps).multimodalManager = deps.multimodalManager;
    if (deps.getActivePersonality) {
      (this.deps).getActivePersonality = deps.getActivePersonality;
    }
  }

  /** Inject outbound webhook dispatcher after construction (avoids init-order issues). */
  setOutboundWebhookDispatcher(dispatcher: OutboundWebhookDispatcher | null): void {
    (this.deps).outboundWebhookDispatcher = dispatcher;
  }

  /**
   * Handle an inbound message from any platform.
   * This is the callback given to IntegrationDeps.onMessage.
   */
  async handleInbound(message: UnifiedMessage): Promise<void> {
    const { logger, taskExecutor, integrationManager, integrationStorage } = this.deps;

    logger.info(
      `Inbound message from ${message.platform}:${message.chatId} by ${message.senderName}`
    );

    // Fire outbound webhook event (non-blocking)
    this.deps.outboundWebhookDispatcher?.dispatch('message.inbound', {
      integrationId: message.integrationId,
      platform: message.platform,
      senderId: message.senderId,
      senderName: message.senderName,
      chatId: message.chatId,
      text: message.text,
      timestamp: message.timestamp,
    });

    // Store the inbound message
    await integrationStorage.storeMessage({
      integrationId: message.integrationId,
      platform: message.platform,
      direction: 'inbound',
      senderId: message.senderId,
      senderName: message.senderName,
      chatId: message.chatId,
      text: message.text,
      attachments: message.attachments,
      replyToMessageId: message.replyToMessageId,
      platformMessageId: message.platformMessageId,
      metadata: message.metadata,
      timestamp: message.timestamp,
    });

    // Skip empty messages
    if (!message.text.trim()) {
      logger.debug('Skipping empty inbound message');
      return;
    }

    // Integration access enforcement — gate inbound routing by active personality's allowlist.
    // An empty `selectedIntegrations` array means "allow all" (default / no restriction).
    if (this.deps.getActivePersonality) {
      const personality = await this.deps.getActivePersonality();
      const allowedIntegrations = personality?.selectedIntegrations ?? [];
      if (allowedIntegrations.length > 0 && !allowedIntegrations.includes(message.integrationId)) {
        logger.info(
          `Inbound message from integration ${message.integrationId} (${message.platform}) ` +
            `blocked — not in active personality's integration allowlist`
        );
        return;
      }
    }

    // Create execution context for the task
    const context: ExecutionContext = {
      userId: `${message.platform}:${message.senderId}`,
      role: 'operator', // platform users get operator role by default
      correlationId: message.id,
    };

    try {
      // Submit as a "query" task to the executor
      const task = await taskExecutor.submit(
        {
          type: TaskType.QUERY,
          name: `${message.platform} message from ${message.senderName}`,
          description: message.text,
          input: {
            text: message.text,
            platform: message.platform,
            chatId: message.chatId,
            senderId: message.senderId,
            senderName: message.senderName,
            attachments: message.attachments,
          },
        },
        context
      );

      // Wait for the task to complete (the executor handles this)
      // For now, we respond with the task ID. The actual AI response
      // will be sent when the task completes via the task completion hook.
      logger.info(`Task created for inbound message: ${task.id}`);

      // If the task completed synchronously, send a response back
      if (task.status === 'completed' && task.result?.success) {
        const responseText = `Task ${task.id} completed successfully.`;
        const metadata: Record<string, unknown> = {
          taskId: task.id,
          replyToMessageId: message.platformMessageId,
        };

        // Synthesize TTS audio if multimodal manager is available
        if (this.deps.multimodalManager) {
          try {
            // Per-personality voice selection
            const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
            let voice: string | undefined;
            if (this.deps.getActivePersonality) {
              const personality = await this.deps.getActivePersonality();
              if (personality?.voice && OPENAI_VOICES.includes(personality.voice)) {
                voice = personality.voice;
              }
            }
            const ttsResult = await this.deps.multimodalManager.synthesizeSpeech({
              text: responseText,
              voice,
            });
            metadata.audioBase64 = ttsResult.audioBase64;
            metadata.audioFormat = ttsResult.format;
          } catch (err) {
            logger.warn(`TTS synthesis failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        await integrationManager.sendMessage(
          message.integrationId,
          message.chatId,
          responseText,
          metadata
        );
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to process inbound message: ${errorMsg}`);

      // Send error response back to the platform
      try {
        await integrationManager.sendMessage(
          message.integrationId,
          message.chatId,
          `Sorry, I encountered an error processing your message. Please try again.`,
          { error: errorMsg }
        );
      } catch (sendErr) {
        logger.error(
          `Failed to send error response: ${sendErr instanceof Error ? sendErr.message : String(sendErr)}`
        );
      }
    }
  }
}
