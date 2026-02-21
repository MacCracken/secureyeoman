/**
 * Linear Integration
 *
 * Webhook-based adapter receiving Linear issue and comment events.
 * Normalizes issue.created, issue.updated, comment.created events to UnifiedMessage.
 * sendMessage() creates a new issue via the Linear GraphQL API.
 */

import { createHmac } from 'crypto';
import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
import type { WebhookIntegration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

interface LinearConfig {
  apiKey: string;
  webhookSecret?: string;
  teamId?: string;
}

interface LinearWebhookPayload {
  action: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
  organizationId?: string;
  webhookId?: string;
}

const LINEAR_API = 'https://api.linear.app/graphql';

export class LinearIntegration implements WebhookIntegration {
  readonly platform: Platform = 'linear';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 10 };

  private config: IntegrationConfig | null = null;
  private linearConfig: LinearConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;
    const lc = config.config as unknown as LinearConfig;
    this.linearConfig = lc;
    if (!lc.apiKey) throw new Error('Linear integration requires an apiKey');
    this.logger?.info('Linear integration initialized');
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.logger?.info('Linear integration started — awaiting webhooks');
  }

  async stop(): Promise<void> {
    this.running = false;
    this.logger?.info('Linear integration stopped');
  }

  async sendMessage(
    _chatId: string,
    text: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    if (!this.linearConfig?.apiKey) return 'linear_noop';
    const teamId = (metadata?.['teamId'] as string | undefined) ?? this.linearConfig.teamId ?? '';
    if (!teamId) return 'linear_noop_no_team';
    try {
      const mutation = `
        mutation CreateIssue($teamId: String!, $title: String!) {
          issueCreate(input: { teamId: $teamId, title: $title }) {
            success
            issue { id identifier }
          }
        }
      `;
      const resp = await fetch(LINEAR_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.linearConfig.apiKey,
        },
        body: JSON.stringify({ query: mutation, variables: { teamId, title: text } }),
      });
      const body = (await resp.json()) as {
        data?: { issueCreate?: { issue?: { identifier?: string; id?: string } } };
      };
      const issue = body.data?.issueCreate?.issue;
      return issue?.identifier ?? issue?.id ?? `linear_${Date.now()}`;
    } catch (err) {
      this.logger?.warn('Linear sendMessage error', {
        error: err instanceof Error ? err.message : String(err),
      });
      return 'linear_error';
    }
  }

  isHealthy(): boolean {
    return this.running;
  }

  getWebhookPath(): string {
    return '/webhooks/linear';
  }

  verifyWebhook(payload: string, signature: string): boolean {
    if (!this.linearConfig?.webhookSecret) return true; // no secret configured — allow
    try {
      const computed = createHmac('sha256', this.linearConfig.webhookSecret)
        .update(payload)
        .digest('hex');
      return computed === signature;
    } catch {
      return false;
    }
  }

  async handleWebhook(payload: string, _signature: string): Promise<void> {
    if (!this.deps) return;
    try {
      const event = JSON.parse(payload) as LinearWebhookPayload;
      const data = event.data;
      const id = (data['id'] as string | undefined) ?? `linear_${Date.now()}`;
      const title = (data['title'] as string | undefined) ?? '';
      const identifier = (data['identifier'] as string | undefined) ?? '';
      const state = (data['state'] as Record<string, unknown> | undefined)?.['name'] as
        | string
        | undefined;
      const assignee = (data['assignee'] as Record<string, unknown> | undefined)?.['name'] as
        | string
        | undefined;
      const commentBody = (data['body'] as string | undefined) ?? '';
      const userId = (data['userId'] as string | undefined) ?? event.organizationId ?? 'linear';

      let text: string;
      switch (event.type) {
        case 'Issue':
          if (event.action === 'create') {
            text = `New issue created: ${identifier ? `${identifier} ` : ''}${title}${state ? ` [${state}]` : ''}${assignee ? ` → ${assignee}` : ''}`;
          } else if (event.action === 'update') {
            text = `Issue updated: ${identifier ? `${identifier} ` : ''}${title}${state ? ` [${state}]` : ''}`;
          } else if (event.action === 'remove') {
            text = `Issue removed: ${identifier ? `${identifier} ` : ''}${title}`;
          } else {
            text = `Linear issue event (${event.action}): ${identifier || id}`;
          }
          break;
        case 'Comment':
          text = `New comment on ${identifier || 'issue'}: ${commentBody}`;
          break;
        default:
          text = `Linear event: ${event.type}/${event.action}`;
      }

      const unified: UnifiedMessage = {
        id: `linear_${id}`,
        integrationId: this.config!.id,
        platform: 'linear',
        direction: 'inbound',
        senderId: userId,
        senderName: assignee ?? 'Linear',
        chatId: id,
        text,
        attachments: [],
        platformMessageId: id,
        metadata: {
          action: event.action,
          type: event.type,
          identifier,
          title,
          state,
          assignee,
          organizationId: event.organizationId,
        },
        timestamp: new Date(event.createdAt).getTime(),
      };
      await this.deps.onMessage(unified);
    } catch (err) {
      this.logger?.warn('Linear webhook parse error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const query = `{ viewer { id name email organization { name } } }`;
      const resp = await fetch(LINEAR_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.linearConfig?.apiKey ?? '',
        },
        body: JSON.stringify({ query }),
      });
      if (!resp.ok) return { ok: false, message: `Linear API error: ${resp.status}` };
      const body = (await resp.json()) as {
        data?: { viewer?: { name?: string; organization?: { name?: string } } };
        errors?: unknown[];
      };
      if (body.errors) return { ok: false, message: 'Linear API returned errors' };
      const viewer = body.data?.viewer;
      return {
        ok: true,
        message: `Connected to Linear as ${viewer?.name ?? 'unknown'}${viewer?.organization?.name ? ` (${viewer.organization.name})` : ''}`,
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }
}
