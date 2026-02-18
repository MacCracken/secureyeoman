/**
 * Jira Integration
 *
 * Jira adapter using the REST API v3 + webhook verification.
 * Handles issue and comment events.
 * Normalizes inbound webhook payloads to UnifiedMessage.
 */

import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
import type { WebhookIntegration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ─── Config types ─────────────────────────────────────────

interface JiraConfig {
  instanceUrl: string;
  email: string;
  apiToken: string;
  projectKey?: string;
  webhookSecret?: string;
}

// ─── Webhook payload types ────────────────────────────────

interface JiraIssuePayload {
  webhookEvent: 'jira:issue_created' | 'jira:issue_updated';
  user: { displayName: string; accountId: string };
  issue: {
    key: string;
    fields: {
      summary: string;
      status: { name: string };
      issuetype: { name: string };
    };
  };
  changelog?: {
    items: { field: string; fromString: string; toString: string }[];
  };
}

interface JiraCommentPayload {
  webhookEvent: 'comment_created' | 'comment_updated';
  comment: {
    id: string;
    body: string;
    author: { displayName: string; accountId: string };
    created: string;
  };
  issue: {
    key: string;
    fields: { summary: string };
  };
}

type JiraWebhookPayload = JiraIssuePayload | JiraCommentPayload;

export class JiraIntegration implements WebhookIntegration {
  readonly platform: Platform = 'jira';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 10 };

  private config: IntegrationConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;
  private instanceUrl = '';
  private email = '';
  private apiToken = '';
  private webhookSecret = '';

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;

    const jc = config.config as unknown as JiraConfig;
    this.instanceUrl = (jc.instanceUrl ?? '').replace(/\/$/, '');
    this.email = jc.email;
    this.apiToken = jc.apiToken;
    this.webhookSecret = jc.webhookSecret ?? '';

    if (!this.instanceUrl) {
      throw new Error('Jira integration requires an instanceUrl');
    }
    if (!this.email || !this.apiToken) {
      throw new Error('Jira integration requires email and apiToken');
    }

    this.logger?.info('Jira integration initialized');
  }

  async start(): Promise<void> {
    if (!this.config) throw new Error('Integration not initialized');
    if (this.running) return;
    this.running = true;
    this.logger?.info('Jira integration started (webhook listener ready)');
  }

  async stop(): Promise<void> {
    this.running = false;
    this.logger?.info('Jira integration stopped');
  }

  /**
   * Send a message to Jira by posting a comment on an issue.
   * chatId = issue key (e.g. "PROJ-123")
   */
  async sendMessage(
    chatId: string,
    text: string,
    _metadata?: Record<string, unknown>
  ): Promise<string> {
    const resp = await fetch(
      `${this.instanceUrl}/rest/api/3/issue/${encodeURIComponent(chatId)}/comment`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.email}:${this.apiToken}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          body: {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
          },
        }),
      }
    );

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Failed to post Jira comment: ${err}`);
    }

    const comment = (await resp.json()) as { id: string };
    return comment.id;
  }

  isHealthy(): boolean {
    return this.running;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const resp = await fetch(`${this.instanceUrl}/rest/api/3/myself`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.email}:${this.apiToken}`).toString('base64')}`,
          Accept: 'application/json',
        },
      });

      if (!resp.ok) {
        const err = await resp.text();
        return { ok: false, message: `Jira API error: ${err}` };
      }

      const user = (await resp.json()) as { displayName: string; emailAddress: string };
      return { ok: true, message: `Connected as ${user.displayName} (${user.emailAddress})` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  // ── WebhookIntegration methods ─────────────────────────

  getWebhookPath(): string {
    return `/api/v1/webhooks/jira/${this.config?.id ?? 'unknown'}`;
  }

  verifyWebhook(_payload: string, signature: string): boolean {
    if (!this.webhookSecret) return true;
    return signature === this.webhookSecret;
  }

  async handleWebhook(eventName: string, payloadStr: string, token: string): Promise<void> {
    if (this.webhookSecret && token !== this.webhookSecret) {
      throw new Error('Invalid webhook token');
    }

    const payload = JSON.parse(payloadStr) as JiraWebhookPayload;
    let unified: UnifiedMessage | null = null;

    if ('webhookEvent' in payload) {
      if (
        payload.webhookEvent === 'jira:issue_created' ||
        payload.webhookEvent === 'jira:issue_updated'
      ) {
        unified = this.handleIssueEvent(payload);
      } else if (
        payload.webhookEvent === 'comment_created' ||
        payload.webhookEvent === 'comment_updated'
      ) {
        unified = this.handleCommentEvent(payload);
      }
    }

    if (unified && this.deps) {
      await this.deps.onMessage(unified);
    }
  }

  // ─── Event handlers ────────────────────────────────────

  private handleIssueEvent(payload: JiraIssuePayload): UnifiedMessage {
    const issue = payload.issue;
    const action = payload.webhookEvent === 'jira:issue_created' ? 'created' : 'updated';
    const changes = payload.changelog?.items
      .map((i) => `${i.field}: ${i.fromString} → ${i.toString}`)
      .join(', ');

    return {
      id: `jira_issue_${issue.key}_${Date.now()}`,
      integrationId: this.config!.id,
      platform: 'jira',
      direction: 'inbound',
      senderId: payload.user.accountId,
      senderName: payload.user.displayName,
      chatId: issue.key,
      text: `Issue ${issue.key} ${action}: ${issue.fields.summary}${changes ? ` (${changes})` : ''}`,
      attachments: [],
      platformMessageId: issue.key,
      metadata: {
        event: payload.webhookEvent,
        issueKey: issue.key,
        issueType: issue.fields.issuetype.name,
        status: issue.fields.status.name,
      },
      timestamp: Date.now(),
    };
  }

  private handleCommentEvent(payload: JiraCommentPayload): UnifiedMessage {
    const comment = payload.comment;
    return {
      id: `jira_comment_${comment.id}_${Date.now()}`,
      integrationId: this.config!.id,
      platform: 'jira',
      direction: 'inbound',
      senderId: comment.author.accountId,
      senderName: comment.author.displayName,
      chatId: payload.issue.key,
      text: `Comment on ${payload.issue.key}: ${comment.body}`,
      attachments: [],
      platformMessageId: comment.id,
      metadata: {
        event: payload.webhookEvent,
        issueKey: payload.issue.key,
        commentId: comment.id,
      },
      timestamp: new Date(comment.created).getTime(),
    };
  }
}
