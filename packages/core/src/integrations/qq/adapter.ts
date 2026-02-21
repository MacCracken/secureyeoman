/**
 * QQ Integration
 *
 * Connects to QQ via OneBot v11 (CQ-HTTP) HTTP API.
 * Polls for new messages and group events; sends messages via the REST API.
 * Requires a running CQ-HTTP / go-cqhttp instance.
 */

import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
import type { Integration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

interface QQConfig {
  httpUrl: string;
  accessToken?: string;
  selfId?: string;
  pollIntervalMs?: number;
}

interface OneBotMessage {
  message_id: number;
  user_id: number;
  group_id?: number;
  message: string;
  raw_message: string;
  sender: { user_id: number; nickname: string; card?: string };
  time: number;
  message_type: 'private' | 'group';
}

interface OneBotResponse<T> {
  status: 'ok' | 'failed';
  retcode: number;
  data: T;
}

const DEFAULT_POLL_MS = 5_000;

export class QQIntegration implements Integration {
  readonly platform: Platform = 'qq';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 30 };

  private config: IntegrationConfig | null = null;
  private qqConfig: QQConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastMsgId = 0;

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;
    const qc = config.config as unknown as QQConfig;
    this.qqConfig = qc;
    if (!qc.httpUrl) throw new Error('QQ integration requires httpUrl (CQ-HTTP endpoint)');
    this.logger?.info('QQ integration initialized', { httpUrl: qc.httpUrl });
  }

  async start(): Promise<void> {
    if (!this.qqConfig) throw new Error('Integration not initialized');
    if (this.running) return;
    this.running = true;
    const interval = this.qqConfig.pollIntervalMs ?? DEFAULT_POLL_MS;
    this.pollTimer = setInterval(() => void this.poll(), interval);
    this.logger?.info('QQ integration started');
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.logger?.info('QQ integration stopped');
  }

  async sendMessage(
    chatId: string,
    text: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const isGroup = metadata?.group === true || chatId.startsWith('group_');
    const id = chatId.replace(/^group_/, '');
    const endpoint = isGroup ? '/send_group_msg' : '/send_private_msg';
    const body = isGroup
      ? { group_id: parseInt(id), message: text }
      : { user_id: parseInt(id), message: text };
    const resp = await this.oneBotFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
    if (!resp.ok) throw new Error(`QQ send failed: ${resp.status}`);
    const result = (await resp.json()) as OneBotResponse<{ message_id: number }>;
    return String(result.data?.message_id ?? Date.now());
  }

  isHealthy(): boolean {
    return this.running;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const resp = await this.oneBotFetch('/get_login_info');
      if (!resp.ok) return { ok: false, message: `CQ-HTTP error: ${resp.status}` };
      const result = (await resp.json()) as OneBotResponse<{ user_id: number; nickname: string }>;
      return {
        ok: result.status === 'ok',
        message: `Connected as ${result.data?.nickname} (${result.data?.user_id})`,
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  private async poll(): Promise<void> {
    if (!this.running || !this.deps || !this.qqConfig) return;
    try {
      // Use get_friend_msg_history or direct polling via forward events
      // OneBot v11 push: listen via HTTP POST callback (webhook mode)
      // Here we use get_forward_msg or just poll recent messages if available
      const resp = await this.oneBotFetch('/get_friend_list');
      if (!resp.ok) return;
      // Friend list polling is informational; actual message delivery requires
      // OneBot HTTP event push configured to point at our webhook endpoint.
      // This poll keeps the connection alive and logs health.
    } catch (err) {
      this.logger?.warn('QQ poll error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  handleInboundEvent(event: OneBotMessage): void {
    if (!this.deps) return;
    const chatId =
      event.message_type === 'group' ? `group_${event.group_id}` : String(event.user_id);
    const unified: UnifiedMessage = {
      id: `qq_${event.message_id}`,
      integrationId: this.config!.id,
      platform: 'qq',
      direction: 'inbound',
      senderId: String(event.user_id),
      senderName: event.sender.card ?? event.sender.nickname,
      chatId,
      text: event.raw_message,
      attachments: [],
      platformMessageId: String(event.message_id),
      metadata: {
        messageType: event.message_type,
        groupId: event.group_id,
        cqMessage: event.message,
      },
      timestamp: event.time * 1000,
    };
    void this.deps.onMessage(unified);
  }

  private async oneBotFetch(path: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.qqConfig?.accessToken) headers.Authorization = `Bearer ${this.qqConfig.accessToken}`;
    return fetch(`${this.qqConfig!.httpUrl}${path}`, {
      ...init,
      headers: { ...headers, ...((init?.headers ?? {}) as Record<string, string>) },
    });
  }
}
