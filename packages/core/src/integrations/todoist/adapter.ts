/**
 * Todoist Integration
 *
 * REST polling adapter using the Todoist REST API v2.
 * Polls for new tasks and creates tasks via sendMessage().
 */

import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
import type { Integration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

interface TodoistConfig {
  apiToken: string;
  projectId?: string;
  pollIntervalMs?: number;
}

interface TodoistTask {
  id: string;
  content: string;
  description?: string;
  project_id?: string;
  created_at?: string;
}

interface TodoistProject {
  id: string;
  name: string;
}

const TODOIST_API = 'https://api.todoist.com/rest/v2';
const DEFAULT_POLL_INTERVAL_MS = 60_000;

export class TodoistIntegration implements Integration {
  readonly platform: Platform = 'todoist';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 10 };

  private config: IntegrationConfig | null = null;
  private todoistConfig: TodoistConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private apiToken = '';
  private projectId: string | null = null;
  private seenTaskIds = new Set<string>();

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;

    const tc = config.config as unknown as TodoistConfig;
    this.todoistConfig = tc;
    this.apiToken = tc.apiToken;
    this.projectId = tc.projectId ?? null;

    if (!this.apiToken) throw new Error('Todoist integration requires an apiToken');
    this.logger?.info('Todoist integration initialized');
  }

  async start(): Promise<void> {
    if (!this.todoistConfig) throw new Error('Integration not initialized');
    if (this.running) return;
    this.running = true;

    await this.seedSeenTasks();
    const interval = this.todoistConfig.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.pollTimer = setInterval(() => void this.poll(), interval);

    this.logger?.info('Todoist integration started');
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.logger?.info('Todoist integration stopped');
  }

  async sendMessage(chatId: string, text: string): Promise<string> {
    const body: Record<string, unknown> = { content: text };
    const projectId = chatId || this.projectId;
    if (projectId) body.project_id = projectId;

    const resp = await this.todoistFetch('/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!resp.ok) throw new Error(`Todoist create task failed: ${await resp.text()}`);
    const task = (await resp.json()) as TodoistTask;
    return task.id;
  }

  isHealthy(): boolean {
    return this.running;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const resp = await this.todoistFetch('/projects');
      if (!resp.ok) return { ok: false, message: `Todoist API error: ${resp.statusText}` };
      const projects = (await resp.json()) as TodoistProject[];
      return { ok: true, message: `Connected — ${projects.length} project(s) accessible` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  private async seedSeenTasks(): Promise<void> {
    try {
      const url = this.projectId ? `/tasks?project_id=${this.projectId}` : '/tasks';
      const resp = await this.todoistFetch(url);
      if (!resp.ok) return;
      const tasks = (await resp.json()) as TodoistTask[];
      for (const t of tasks) this.seenTaskIds.add(t.id);
    } catch {
      // best-effort
    }
  }

  private async poll(): Promise<void> {
    if (!this.running || !this.deps) return;

    try {
      const url = this.projectId ? `/tasks?project_id=${this.projectId}` : '/tasks';
      const resp = await this.todoistFetch(url);
      if (!resp.ok) {
        this.logger?.warn('Todoist poll failed', { status: resp.status });
        return;
      }

      const tasks = (await resp.json()) as TodoistTask[];
      for (const task of tasks) {
        if (this.seenTaskIds.has(task.id)) continue;
        this.seenTaskIds.add(task.id);

        const unified: UnifiedMessage = {
          id: `todoist_${task.id}_${Date.now()}`,
          integrationId: this.config!.id,
          platform: 'todoist',
          direction: 'inbound',
          senderId: '',
          senderName: 'Todoist',
          chatId: task.project_id ?? 'inbox',
          text: task.content + (task.description ? `\n${task.description}` : ''),
          attachments: [],
          platformMessageId: task.id,
          metadata: { taskId: task.id, projectId: task.project_id },
          timestamp: task.created_at ? new Date(task.created_at).getTime() : Date.now(),
        };
        await this.deps.onMessage(unified);
      }
    } catch (err) {
      this.logger?.warn('Todoist poll error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private todoistFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${TODOIST_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        ...((init?.headers ?? {}) as Record<string, string>),
      },
    });
  }
}
