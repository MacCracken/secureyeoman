/**
 * Notion Integration
 *
 * Polling-based Notion adapter using the Notion API with an internal
 * integration token. Polls for database changes and page updates.
 */

import type { IntegrationConfig, UnifiedMessage, Platform } from '@friday/shared';
import type { Integration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ─── Config & API types ─────────────────────────────────────

interface NotionConfig {
  apiKey: string;
  databaseId?: string;
  pollIntervalMs?: number;
}

interface NotionPage {
  id: string;
  created_time: string;
  last_edited_time: string;
  created_by?: { id: string };
  properties?: Record<string, NotionProperty>;
  url?: string;
}

interface NotionProperty {
  type: string;
  title?: Array<{ plain_text: string }>;
  rich_text?: Array<{ plain_text: string }>;
  [key: string]: unknown;
}

interface NotionSearchResponse {
  results: NotionPage[];
  has_more: boolean;
  next_cursor?: string;
}

interface NotionUser {
  id: string;
  name?: string;
  type: string;
}

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const DEFAULT_POLL_INTERVAL_MS = 60_000;

export class NotionIntegration implements Integration {
  readonly platform: Platform = 'notion';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 3 };

  private config: IntegrationConfig | null = null;
  private notionConfig: NotionConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastPollTime: string | null = null;
  private apiKey = '';
  private databaseId: string | null = null;

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;

    const nc = config.config as unknown as NotionConfig;
    this.notionConfig = nc;
    this.apiKey = nc.apiKey;
    this.databaseId = nc.databaseId ?? null;

    if (!this.apiKey) {
      throw new Error('Notion integration requires an apiKey (internal integration token)');
    }

    this.logger?.info('Notion integration initialized');
  }

  async start(): Promise<void> {
    if (!this.notionConfig) throw new Error('Integration not initialized');
    if (this.running) return;
    this.running = true;

    this.lastPollTime = new Date().toISOString();

    const interval = this.notionConfig.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.pollTimer = setInterval(() => void this.poll(), interval);

    this.logger?.info('Notion integration started');
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.logger?.info('Notion integration stopped');
  }

  /**
   * Create a page in the specified database or append blocks to a page.
   */
  async sendMessage(chatId: string, text: string, _metadata?: Record<string, unknown>): Promise<string> {
    const targetDb = chatId || this.databaseId;

    if (targetDb) {
      // Create a new page in the database
      const resp = await this.notionFetch('/pages', {
        method: 'POST',
        body: JSON.stringify({
          parent: { database_id: targetDb },
          properties: {
            title: {
              title: [{ text: { content: text.slice(0, 100) } }],
            },
          },
          children: [
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [{ type: 'text', text: { content: text } }],
              },
            },
          ],
        }),
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Failed to create Notion page: ${err}`);
      }

      const page = (await resp.json()) as NotionPage;
      return page.id;
    }

    throw new Error('No database ID configured for sending messages');
  }

  isHealthy(): boolean {
    return this.running;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const resp = await this.notionFetch('/users/me');

      if (!resp.ok) {
        const err = await resp.text();
        return { ok: false, message: `Notion API error: ${err}` };
      }

      const user = (await resp.json()) as NotionUser;
      return { ok: true, message: `Connected as ${user.name ?? user.id}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  // ─── Polling ─────────────────────────────────────────────

  private async poll(): Promise<void> {
    if (!this.running || !this.deps) return;

    try {
      const body: Record<string, unknown> = {
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 20,
      };

      if (this.lastPollTime) {
        body.filter = {
          timestamp: 'last_edited_time',
          last_edited_time: { after: this.lastPollTime },
        };
      }

      let resp: Response;

      if (this.databaseId) {
        // Poll specific database
        resp = await this.notionFetch(`/databases/${this.databaseId}/query`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      } else {
        // Search for recently updated pages
        resp = await this.notionFetch('/search', {
          method: 'POST',
          body: JSON.stringify({
            sort: { direction: 'descending', timestamp: 'last_edited_time' },
            page_size: 20,
          }),
        });
      }

      if (!resp.ok) {
        this.logger?.warn('Notion poll failed', { status: resp.status });
        return;
      }

      const data = (await resp.json()) as NotionSearchResponse;
      this.lastPollTime = new Date().toISOString();

      for (const page of data.results) {
        const title = this.extractTitle(page);
        const unified: UnifiedMessage = {
          id: `notion_${page.id}_${Date.now()}`,
          integrationId: this.config!.id,
          platform: 'notion',
          direction: 'inbound',
          senderId: page.created_by?.id ?? '',
          senderName: 'Notion',
          chatId: this.databaseId ?? 'workspace',
          text: `Page updated: ${title}`,
          attachments: [],
          platformMessageId: page.id,
          metadata: {
            pageId: page.id,
            title,
            url: page.url,
            lastEdited: page.last_edited_time,
          },
          timestamp: new Date(page.last_edited_time).getTime(),
        };
        await this.deps.onMessage(unified);
      }
    } catch (err) {
      this.logger?.warn('Notion poll error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private extractTitle(page: NotionPage): string {
    if (!page.properties) return 'Untitled';
    for (const prop of Object.values(page.properties)) {
      if (prop.type === 'title' && prop.title?.length) {
        return prop.title.map((t) => t.plain_text).join('');
      }
    }
    return 'Untitled';
  }

  // ─── API helper ─────────────────────────────────────────

  private async notionFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${NOTION_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  }
}
