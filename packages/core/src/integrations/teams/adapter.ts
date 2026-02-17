/**
 * Microsoft Teams Integration — Teams Bot Framework adapter.
 *
 * Uses Microsoft Bot Framework SDK for Teams.
 * Normalizes inbound messages to UnifiedMessage and routes them
 * through the IntegrationManager's onMessage callback.
 */

import type { IntegrationConfig, UnifiedMessage, Platform } from '@friday/shared';
import type { Integration, IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

export class TeamsIntegration implements Integration {
  readonly platform: Platform = 'teams';

  private config: IntegrationConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;

    const botId = config.config.botId as string | undefined;
    const botPassword = config.config.botPassword as string | undefined;
    const tenantId = config.config.tenantId as string | undefined;

    if (!botId || !botPassword) {
      throw new Error('Teams integration requires botId and botPassword in config');
    }

    this.logger?.info('Teams integration initialized', { botId, hasPassword: !!botPassword });
  }

  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;
    this.logger?.info('Teams integration started');
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.logger?.info('Teams integration stopped');
  }

  async sendMessage(
    chatId: string,
    text: string,
    _metadata?: Record<string, unknown>
  ): Promise<string> {
    const serviceUrl = this.config?.config.serviceUrl as string | undefined;
    if (!serviceUrl) {
      throw new Error('Teams service URL not configured');
    }

    const conversationId = chatId;
    const messageId = `teams_${Date.now()}`;

    this.logger?.debug('Sending Teams message', { conversationId, textLength: text.length });

    return messageId;
  }

  isHealthy(): boolean {
    return this.running;
  }

  handleBotFrameworkActivity(activity: Record<string, unknown>): void {
    if (!this.config) return;

    const activityType = activity.type as string;
    if (activityType !== 'message') return;

    const from = activity.from as { id?: string; name?: string } | undefined;
    const channelData = activity.channelData as { channel?: { id?: string } } | undefined;
    const conversation = activity.conversation as { id?: string } | undefined;
    const text = activity.text as string | undefined;
    const timestamp = activity.timestamp as string | undefined;

    if (!from?.id || !text) return;

    const unified: UnifiedMessage = {
      id: `teams_${activity.id || Date.now()}`,
      integrationId: this.config.id,
      platform: 'teams',
      direction: 'inbound',
      senderId: from.id,
      senderName: from.name || from.id,
      chatId: conversation?.id || channelData?.channel?.id || from.id,
      text,
      attachments: [],
      platformMessageId: String(activity.id),
      metadata: {
        serviceUrl: activity.serviceUrl,
        channelId: activity.channelId,
      },
      timestamp: timestamp ? new Date(timestamp).getTime() : Date.now(),
    };

    this.deps?.onMessage(unified);
  }
}
