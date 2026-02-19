/**
 * Airtable Integration
 *
 * REST polling adapter using a Personal Access Token.
 * Polls for record changes in a configured base and table.
 */

import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
import type { Integration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

interface AirtableConfig {
  apiKey: string;
  baseId?: string;
  pollIntervalMs?: number;
}

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime?: string;
}

interface AirtableListResponse {
  records: AirtableRecord[];
}

interface AirtableWhoAmI {
  id: string;
  email?: string;
}

const AIRTABLE_API = 'https://api.airtable.com/v0';
const DEFAULT_POLL_INTERVAL_MS = 60_000;

export class AirtableIntegration implements Integration {
  readonly platform: Platform = 'airtable';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 5 };

  private config: IntegrationConfig | null = null;
  private airtableConfig: AirtableConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private apiKey = '';
  private baseId: string | null = null;
  private seenRecordIds = new Set<string>();

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;

    const ac = config.config as unknown as AirtableConfig;
    this.airtableConfig = ac;
    this.apiKey = ac.apiKey;
    this.baseId = ac.baseId ?? null;

    if (!this.apiKey) throw new Error('Airtable integration requires an apiKey');
    this.logger?.info('Airtable integration initialized');
  }

  async start(): Promise<void> {
    if (!this.airtableConfig) throw new Error('Integration not initialized');
    if (this.running) return;
    this.running = true;

    if (this.baseId) {
      await this.seedSeenRecords();
      const interval = this.airtableConfig.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
      this.pollTimer = setInterval(() => void this.poll(), interval);
    }

    this.logger?.info('Airtable integration started');
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.logger?.info('Airtable integration stopped');
  }

  /**
   * Create a record. chatId format: "{baseId}/{tableIdOrName}".
   * Falls back to configured baseId + "Tasks" table.
   */
  async sendMessage(chatId: string, text: string): Promise<string> {
    const target = chatId || (this.baseId ? `${this.baseId}/Tasks` : null);
    if (!target) throw new Error('No base/table configured for Airtable sendMessage');

    const parts = target.includes('/') ? target.split('/') : [target, 'Tasks'];
    const base = parts[0] ?? target;
    const table = parts[1] ?? 'Tasks';
    const resp = await this.airtableFetch(`/${base}/${encodeURIComponent(table)}`, {
      method: 'POST',
      body: JSON.stringify({ fields: { Name: text } }),
    });

    if (!resp.ok) throw new Error(`Airtable create record failed: ${await resp.text()}`);
    const record = (await resp.json()) as AirtableRecord;
    return record.id;
  }

  isHealthy(): boolean {
    return this.running;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const resp = await fetch('https://api.airtable.com/v0/meta/whoami', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!resp.ok) return { ok: false, message: `Airtable API error: ${resp.statusText}` };
      const data = (await resp.json()) as AirtableWhoAmI;
      return { ok: true, message: `Connected as ${data.email ?? data.id}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  private async seedSeenRecords(): Promise<void> {
    if (!this.baseId) return;
    try {
      const resp = await this.airtableFetch(`/${this.baseId}/Tasks?maxRecords=100`);
      if (!resp.ok) return;
      const data = (await resp.json()) as AirtableListResponse;
      for (const r of data.records) this.seenRecordIds.add(r.id);
    } catch {
      // best-effort
    }
  }

  private async poll(): Promise<void> {
    if (!this.running || !this.deps || !this.baseId) return;

    try {
      const resp = await this.airtableFetch(`/${this.baseId}/Tasks?maxRecords=50`);
      if (!resp.ok) {
        this.logger?.warn('Airtable poll failed', { status: resp.status });
        return;
      }

      const data = (await resp.json()) as AirtableListResponse;

      for (const record of data.records) {
        if (this.seenRecordIds.has(record.id)) continue;
        this.seenRecordIds.add(record.id);

        const name = String(record.fields['Name'] ?? record.id);
        const unified: UnifiedMessage = {
          id: `airtable_${record.id}_${Date.now()}`,
          integrationId: this.config!.id,
          platform: 'airtable',
          direction: 'inbound',
          senderId: '',
          senderName: 'Airtable',
          chatId: this.baseId,
          text: `New record: ${name}`,
          attachments: [],
          platformMessageId: record.id,
          metadata: { recordId: record.id, fields: record.fields },
          timestamp: record.createdTime ? new Date(record.createdTime).getTime() : Date.now(),
        };
        await this.deps.onMessage(unified);
      }
    } catch (err) {
      this.logger?.warn('Airtable poll error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private airtableFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${AIRTABLE_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...((init?.headers ?? {}) as Record<string, string>),
      },
    });
  }
}
