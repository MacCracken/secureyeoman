/**
 * Azure DevOps Integration
 *
 * Azure DevOps adapter using the REST API + webhook verification.
 * Handles work item and build events.
 * Normalizes inbound webhook payloads to UnifiedMessage.
 */

import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
import type { WebhookIntegration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ─── Config types ─────────────────────────────────────────

interface AzureDevOpsConfig {
  organizationUrl: string;
  personalAccessToken: string;
  project: string;
  webhookSecret?: string;
}

// ─── Webhook payload types ────────────────────────────────

interface AzureWorkItemPayload {
  eventType: 'workitem.created' | 'workitem.updated';
  resource: {
    id: number;
    fields: {
      'System.Title': string;
      'System.State': string;
      'System.WorkItemType': string;
      'System.ChangedBy': string;
    };
    url: string;
  };
  resourceContainers: {
    project: { id: string; baseUrl: string };
  };
}

interface AzureBuildPayload {
  eventType: 'build.complete';
  resource: {
    id: number;
    buildNumber: string;
    status: string;
    result: string;
    definition: { name: string };
    requestedFor: { displayName: string; uniqueName: string };
    url: string;
  };
}

type AzureWebhookPayload = AzureWorkItemPayload | AzureBuildPayload;

export class AzureDevOpsIntegration implements WebhookIntegration {
  readonly platform: Platform = 'azure';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 10 };

  private config: IntegrationConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;
  private organizationUrl = '';
  private personalAccessToken = '';
  private project = '';
  private webhookSecret = '';

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;

    const ac = config.config as unknown as AzureDevOpsConfig;
    this.organizationUrl = (ac.organizationUrl ?? '').replace(/\/$/, '');
    this.personalAccessToken = ac.personalAccessToken;
    this.project = ac.project;
    this.webhookSecret = ac.webhookSecret ?? '';

    if (!this.organizationUrl) {
      throw new Error('Azure DevOps integration requires an organizationUrl');
    }
    if (!this.personalAccessToken) {
      throw new Error('Azure DevOps integration requires a personalAccessToken');
    }
    if (!this.project) {
      throw new Error('Azure DevOps integration requires a project name');
    }

    this.logger?.info('Azure DevOps integration initialized');
  }

  async start(): Promise<void> {
    if (!this.config) throw new Error('Integration not initialized');
    if (this.running) return;
    this.running = true;
    this.logger?.info('Azure DevOps integration started (webhook listener ready)');
  }

  async stop(): Promise<void> {
    this.running = false;
    this.logger?.info('Azure DevOps integration stopped');
  }

  /**
   * Send a message by posting a comment on a work item.
   * chatId = work item ID (numeric string)
   */
  async sendMessage(
    chatId: string,
    text: string,
    _metadata?: Record<string, unknown>
  ): Promise<string> {
    const workItemId = parseInt(chatId, 10);
    if (isNaN(workItemId)) {
      throw new Error(`Invalid work item ID: ${chatId}`);
    }

    const url = `${this.organizationUrl}/${encodeURIComponent(this.project)}/_apis/wit/workitems/${workItemId}/comments?api-version=7.1-preview.4`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`:${this.personalAccessToken}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Failed to post Azure DevOps comment: ${err}`);
    }

    const comment = (await resp.json()) as { id: number };
    return String(comment.id);
  }

  isHealthy(): boolean {
    return this.running;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const url = `${this.organizationUrl}/_apis/projects/${encodeURIComponent(this.project)}?api-version=7.1`;
      const resp = await fetch(url, {
        headers: {
          Authorization: `Basic ${Buffer.from(`:${this.personalAccessToken}`).toString('base64')}`,
          Accept: 'application/json',
        },
      });

      if (!resp.ok) {
        const err = await resp.text();
        return { ok: false, message: `Azure DevOps API error: ${err}` };
      }

      const project = (await resp.json()) as { name: string; state: string };
      return { ok: true, message: `Connected to project: ${project.name} (${project.state})` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  // ── WebhookIntegration methods ─────────────────────────

  getWebhookPath(): string {
    return `/api/v1/webhooks/azure/${this.config?.id ?? 'unknown'}`;
  }

  verifyWebhook(_payload: string, signature: string): boolean {
    if (!this.webhookSecret) return true;
    return signature === this.webhookSecret;
  }

  async handleWebhook(eventName: string, payloadStr: string, token: string): Promise<void> {
    if (this.webhookSecret && token !== this.webhookSecret) {
      throw new Error('Invalid webhook token');
    }

    const payload = JSON.parse(payloadStr) as AzureWebhookPayload;
    let unified: UnifiedMessage | null = null;

    if ('eventType' in payload) {
      if (
        payload.eventType === 'workitem.created' ||
        payload.eventType === 'workitem.updated'
      ) {
        unified = this.handleWorkItemEvent(payload);
      } else if (payload.eventType === 'build.complete') {
        unified = this.handleBuildEvent(payload);
      }
    }

    if (unified && this.deps) {
      await this.deps.onMessage(unified);
    }
  }

  // ─── Event handlers ────────────────────────────────────

  private handleWorkItemEvent(payload: AzureWorkItemPayload): UnifiedMessage {
    const wi = payload.resource;
    const action = payload.eventType === 'workitem.created' ? 'created' : 'updated';

    return {
      id: `azure_wi_${wi.id}_${Date.now()}`,
      integrationId: this.config!.id,
      platform: 'azure',
      direction: 'inbound',
      senderId: wi.fields['System.ChangedBy'],
      senderName: wi.fields['System.ChangedBy'],
      chatId: String(wi.id),
      text: `Work Item #${wi.id} ${action}: ${wi.fields['System.Title']} [${wi.fields['System.State']}]`,
      attachments: [],
      platformMessageId: String(wi.id),
      metadata: {
        event: payload.eventType,
        workItemId: wi.id,
        workItemType: wi.fields['System.WorkItemType'],
        state: wi.fields['System.State'],
        url: wi.url,
      },
      timestamp: Date.now(),
    };
  }

  private handleBuildEvent(payload: AzureBuildPayload): UnifiedMessage {
    const build = payload.resource;

    return {
      id: `azure_build_${build.id}_${Date.now()}`,
      integrationId: this.config!.id,
      platform: 'azure',
      direction: 'inbound',
      senderId: build.requestedFor.uniqueName,
      senderName: build.requestedFor.displayName,
      chatId: `build-${build.id}`,
      text: `Build ${build.buildNumber} (${build.definition.name}) ${build.result}: ${build.status}`,
      attachments: [],
      platformMessageId: String(build.id),
      metadata: {
        event: 'build.complete',
        buildId: build.id,
        buildNumber: build.buildNumber,
        result: build.result,
        status: build.status,
        url: build.url,
      },
      timestamp: Date.now(),
    };
  }
}
