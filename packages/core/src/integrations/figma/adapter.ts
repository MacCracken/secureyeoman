/**
 * Figma Integration
 *
 * Polling-based adapter using the Figma REST API.
 * Polls for new comments on a configured file; sends comments via the Figma API.
 */

import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
import type { Integration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

interface FigmaConfig {
  accessToken: string;
  fileKey?: string;
  pollIntervalMs?: number;
}

interface FigmaComment {
  id: string;
  message: string;
  created_at: string;
  resolved_at?: string | null;
  user?: { handle: string; id: string };
  client_meta?: { node_id?: string };
}

interface FigmaUser {
  id: string;
  handle: string;
  email?: string;
}

const FIGMA_API = 'https://api.figma.com/v1';
const DEFAULT_POLL_MS = 60_000;

export class FigmaIntegration implements Integration {
  readonly platform: Platform = 'figma';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 5 };

  private config: IntegrationConfig | null = null;
  private figmaConfig: FigmaConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private seenCommentIds = new Set<string>();
  private accessToken = '';

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;
    const fc = config.config as unknown as FigmaConfig;
    this.figmaConfig = fc;
    this.accessToken = fc.accessToken;
    if (!this.accessToken) throw new Error('Figma integration requires an accessToken');
    this.logger?.info('Figma integration initialized');
  }

  async start(): Promise<void> {
    if (!this.figmaConfig) throw new Error('Integration not initialized');
    if (this.running) return;
    this.running = true;
    const interval = this.figmaConfig.pollIntervalMs ?? DEFAULT_POLL_MS;
    this.pollTimer = setInterval(() => void this.poll(), interval);
    this.logger?.info('Figma integration started');
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    this.logger?.info('Figma integration stopped');
  }

  async sendMessage(chatId: string, text: string, _metadata?: Record<string, unknown>): Promise<string> {
    const fileKey = chatId || this.figmaConfig?.fileKey;
    if (!fileKey) throw new Error('No Figma file key configured');
    const resp = await this.figmaFetch(`/files/${fileKey}/comments`, {
      method: 'POST',
      body: JSON.stringify({ message: text }),
    });
    if (!resp.ok) throw new Error(`Failed to post Figma comment: ${await resp.text()}`);
    const data = (await resp.json()) as { id: string };
    return data.id;
  }

  isHealthy(): boolean { return this.running; }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const resp = await this.figmaFetch('/me');
      if (!resp.ok) return { ok: false, message: `Figma API error: ${await resp.text()}` };
      const user = (await resp.json()) as FigmaUser;
      return { ok: true, message: `Connected as ${user.handle} (${user.email ?? user.id})` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  private async poll(): Promise<void> {
    if (!this.running || !this.deps || !this.figmaConfig?.fileKey) return;
    try {
      const resp = await this.figmaFetch(`/files/${this.figmaConfig.fileKey}/comments`);
      if (!resp.ok) { this.logger?.warn('Figma poll failed', { status: resp.status }); return; }
      const data = (await resp.json()) as { comments: FigmaComment[] };
      for (const comment of data.comments) {
        if (comment.resolved_at || this.seenCommentIds.has(comment.id)) continue;
        this.seenCommentIds.add(comment.id);
        const unified: UnifiedMessage = {
          id: `figma_comment_${comment.id}`,
          integrationId: this.config!.id,
          platform: 'figma',
          direction: 'inbound',
          senderId: comment.user?.id ?? '',
          senderName: comment.user?.handle ?? 'Figma',
          chatId: this.figmaConfig.fileKey!,
          text: comment.message,
          attachments: [],
          platformMessageId: comment.id,
          metadata: {
            commentId: comment.id,
            nodeId: comment.client_meta?.node_id,
            createdAt: comment.created_at,
          },
          timestamp: new Date(comment.created_at).getTime(),
        };
        await this.deps.onMessage(unified);
      }
    } catch (err) {
      this.logger?.warn('Figma poll error', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async figmaFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${FIGMA_API}${path}`, {
      ...init,
      headers: {
        'X-Figma-Token': this.accessToken,
        'Content-Type': 'application/json',
        ...((init?.headers ?? {}) as Record<string, string>),
      },
    });
  }
}
