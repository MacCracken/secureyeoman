/**
 * AGNOS Runtime Client — HTTP client for the AGNOS daimon runtime API (port 8090).
 */

import type { SecureLogger } from '../../logging/logger.js';
import { toErrorMessage } from '../../utils/errors.js';

export interface AgnosClientConfig {
  runtimeUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface AgnosAgentProfile {
  id: string;
  name: string;
  description?: string;
  capabilities?: string[];
  status?: 'active' | 'idle' | 'offline';
}

export interface AgnosDiscoverResponse {
  name: string;
  version: string;
  capabilities: string[];
  endpoints: Record<string, string>;
  companions?: Record<string, { url: string; status: string }>;
}

export interface AgnosSandboxProfile {
  id: string;
  name: string;
  description?: string;
  seccomp?: boolean;
  landlock?: boolean;
}

export class AgnosClient {
  private readonly runtimeUrl: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly logger: SecureLogger;

  constructor(config: AgnosClientConfig, logger: SecureLogger) {
    this.runtimeUrl = config.runtimeUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.logger = logger.child({ component: 'agnos-client' });
  }

  // ── Service Discovery ──────────────────────────────────────
  async discover(): Promise<AgnosDiscoverResponse> {
    return this._fetch('/v1/discover') as Promise<AgnosDiscoverResponse>;
  }

  // ── Agent Registration ──────────────────────────────────────
  async registerAgentsBatch(agents: AgnosAgentProfile[]): Promise<{ registered: number }> {
    return this._fetch('/v1/agents/register/batch', {
      method: 'POST',
      body: { agents, source: 'secureyeoman' },
    }) as Promise<{ registered: number }>;
  }

  async deregisterAgent(agentId: string): Promise<void> {
    await this._fetch(`/v1/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' });
  }

  async heartbeat(agentIds: string[]): Promise<void> {
    await this._fetch('/v1/agents/heartbeat', {
      method: 'POST',
      body: { agentIds, source: 'secureyeoman' },
    });
  }

  // ── MCP Tool Registration ─────────────────────────────────
  async registerMcpTools(
    tools: { name: string; description: string; inputSchema?: unknown }[]
  ): Promise<{ registered: number }> {
    return this._fetch('/v1/mcp/tools', {
      method: 'POST',
      body: { tools, source: 'secureyeoman' },
    }) as Promise<{ registered: number }>;
  }

  // ── Audit Forwarding ───────────────────────────────────────
  async forwardAuditEvents(events: Record<string, unknown>[]): Promise<{ accepted: number }> {
    return this._fetch('/v1/audit/forward', {
      method: 'POST',
      body: { events, source: 'secureyeoman' },
    }) as Promise<{ accepted: number }>;
  }

  // ── Event Pub/Sub ──────────────────────────────────────────
  async publishEvent(topic: string, data: Record<string, unknown>): Promise<void> {
    await this._fetch('/v1/events/publish', {
      method: 'POST',
      body: { topic, data, source: 'secureyeoman', timestamp: new Date().toISOString() },
    });
  }

  /** Subscribe to AGNOS events via SSE. Returns an AbortController to stop. */
  subscribeEvents(
    topics: string[],
    onEvent: (event: { topic: string; data: unknown; timestamp: string }) => void
  ): AbortController {
    const controller = new AbortController();
    const url = `${this.runtimeUrl}/v1/events/subscribe?topics=${topics.join(',')}`;

    const connect = async () => {
      try {
        const headers: Record<string, string> = { Accept: 'text/event-stream' };
        if (this.apiKey) headers['X-API-Key'] = this.apiKey;

        const res = await fetch(url, { headers, signal: controller.signal });
        if (!res.ok || !res.body) return;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('data:')) {
              try {
                const parsed = JSON.parse(line.slice(5).trim());
                onEvent(parsed);
              } catch {
                /* skip malformed */
              }
            }
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          this.logger.debug({ error: toErrorMessage(err) }, 'AGNOS SSE connection closed');
        }
      }
    };

    connect().catch(() => {});
    return controller;
  }

  // ── Sandbox Profiles ───────────────────────────────────────
  async listSandboxProfiles(): Promise<AgnosSandboxProfile[]> {
    const res = await this._fetch('/v1/sandbox/profiles/list');
    return (res as { profiles: AgnosSandboxProfile[] }).profiles ?? [];
  }

  // ── Vector Store Bridge ────────────────────────────────────
  async vectorInsert(
    vectors: { id: string; vector: number[]; metadata?: Record<string, unknown> }[]
  ): Promise<void> {
    await this._fetch('/v1/vectors/insert', { method: 'POST', body: { vectors } });
  }

  async vectorSearch(
    vector: number[],
    limit: number,
    threshold?: number
  ): Promise<{ id: string; score: number; metadata?: Record<string, unknown> }[]> {
    const res = await this._fetch('/v1/vectors/search', {
      method: 'POST',
      body: { vector, limit, threshold },
    });
    return (
      (res as { results: { id: string; score: number; metadata?: Record<string, unknown> }[] })
        .results ?? []
    );
  }

  // ── Health ─────────────────────────────────────────────────
  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.runtimeUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Internal ───────────────────────────────────────────────
  private async _fetch(
    path: string,
    opts?: { method?: string; body?: unknown; signal?: AbortSignal }
  ): Promise<unknown> {
    const url = `${this.runtimeUrl}${path}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;

    const res = await fetch(url, {
      method: opts?.method ?? 'GET',
      headers,
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
      signal: opts?.signal ?? AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `AGNOS ${opts?.method ?? 'GET'} ${path} failed: ${res.status} ${text.slice(0, 200)}`
      );
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return res.json();
    }
    return {};
  }
}
