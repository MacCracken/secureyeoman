/**
 * AGNOS Runtime Client — HTTP client for the AGNOS daimon runtime API (port 8090).
 */

import type { SecureLogger } from '../../logging/logger.js';
import { toErrorMessage } from '../../utils/errors.js';

export interface AgnosClientConfig {
  runtimeUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  /** AGNOS LLM gateway URL (hoosh, default port 8088). Used for token budget APIs. */
  gatewayUrl?: string;
  /** API key for the gateway (hoosh). */
  gatewayApiKey?: string;
}

export interface AgnosAgentProfile {
  id: string;
  name: string;
  description?: string;
  capabilities?: string[];
  status?: 'active' | 'idle' | 'offline';
}

export interface AgnosDiscoverResponse {
  service: string;
  version: string;
  codename?: string;
  capabilities: string[];
  endpoints: Record<string, string>;
  companion_services?: Record<
    string,
    { default_url: string; status: string; codename?: string; env_var?: string }
  >;
  protocol_version?: string;
  uptime_seconds?: number;
  agents_registered?: number;
  auth?: { type: string; header: string };
}

export interface AgnosSandboxProfile {
  id: string;
  name: string;
  description?: string;
  seccomp?: boolean;
  landlock?: boolean;
  networkEnabled?: boolean;
  allowProcessSpawn?: boolean;
  maxMemoryMb?: number;
  allowedHosts?: string[];
}

export interface TokenCheckResult {
  allowed: boolean;
  remaining?: number;
  pool?: string;
}

export interface TokenReserveResult {
  reserved: boolean;
  reservation_id?: string;
}

export interface TokenPoolInfo {
  name: string;
  total: number;
  used: number;
  remaining: number;
  period_seconds?: number;
}

export interface RagChunk {
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface RagQueryResult {
  chunks: RagChunk[];
  total: number;
}

export interface RagStats {
  documents: number;
  chunks: number;
  index_size_bytes: number;
}

export interface ScanFinding {
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  rule?: string;
}

export interface ScanBytesResult {
  findings: ScanFinding[];
  scanned: boolean;
}

export interface ScanStatusResult {
  enabled: boolean;
  engine: string;
  definitions_updated?: string;
}

export interface ExecResult {
  exit_code: number;
  stdout: string;
  stderr: string;
}

export interface AuditRunRecord {
  run_id: string;
  playbook?: string;
  success: boolean;
  tasks: { name: string; status: string; duration_ms?: number }[];
  timestamp?: string;
}

export interface AuditChainVerification {
  valid: boolean;
  chain_length: number;
  last_verified?: string;
  errors?: string[];
}

export interface RemoteTool {
  name: string;
  description: string;
  inputSchema?: unknown;
}

export interface AttestationResult {
  pcr_values: Record<string, string>;
  signature: string;
  algorithm: string;
  timestamp: string;
}

export class AgnosClient {
  private readonly runtimeUrl: string;
  private readonly apiKey: string | undefined;
  private readonly gatewayUrl: string;
  private readonly gatewayApiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly logger: SecureLogger;

  constructor(config: AgnosClientConfig, logger: SecureLogger) {
    this.runtimeUrl = config.runtimeUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.gatewayUrl = (config.gatewayUrl ?? 'http://127.0.0.1:8088').replace(/\/+$/, '');
    this.gatewayApiKey = config.gatewayApiKey;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.logger = logger.child({ component: 'agnos-client' });
  }

  // ── Service Discovery ──────────────────────────────────────
  async discover(): Promise<AgnosDiscoverResponse> {
    return this._fetch('/v1/discover') as Promise<AgnosDiscoverResponse>;
  }

  // ── Agent Registration ──────────────────────────────────────

  /** Batch-register agent profiles (up to 100, idempotent). */
  async registerAgentsBatch(agents: AgnosAgentProfile[]): Promise<{ registered: number }> {
    return this._fetch('/v1/agents/register/batch', {
      method: 'POST',
      body: { agents, source: 'secureyeoman' },
    }) as Promise<{ registered: number }>;
  }

  async deregisterAgent(agentId: string): Promise<void> {
    await this._fetch(`/v1/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' });
  }

  /** Send heartbeat for a single agent. */
  async heartbeatAgent(agentId: string): Promise<void> {
    await this._fetch(`/v1/agents/${encodeURIComponent(agentId)}/heartbeat`, {
      method: 'POST',
      body: { source: 'secureyeoman' },
    });
  }

  /** Send heartbeats for multiple agents (per-agent, no batch endpoint). */
  async heartbeat(agentIds: string[]): Promise<void> {
    for (const id of agentIds) {
      try {
        await this.heartbeatAgent(id);
      } catch (err) {
        this.logger.debug(
          { agentId: id, error: toErrorMessage(err) },
          'AGNOS agent heartbeat failed'
        );
      }
    }
  }

  // ── MCP Tool Registration ─────────────────────────────────
  // NOTE: AGNOS MCP tools are built-in (read-only). This method is a no-op
  // against the real runtime (405). Kept for forward-compatibility if AGNOS
  // adds external tool registration in a future release.
  async registerMcpTools(
    tools: { name: string; description: string; inputSchema?: unknown }[]
  ): Promise<{ registered: number }> {
    return this._fetch('/v1/mcp/tools', {
      method: 'POST',
      body: { tools, source: 'secureyeoman' },
    }) as Promise<{ registered: number }>;
  }

  /**
   * Register MCP tools with AGNOS filtered by bridge profile.
   * Sends profile metadata so AGNOS can organize tools by category.
   */
  async registerMcpToolsByProfile(
    tools: { name: string; description: string; inputSchema?: unknown }[],
    profile: string
  ): Promise<{ registered: number }> {
    return this._fetch('/v1/mcp/tools', {
      method: 'POST',
      body: { tools, source: 'secureyeoman', profile },
    }) as Promise<{ registered: number }>;
  }

  // ── Audit Forwarding ───────────────────────────────────────
  async forwardAuditEvents(events: Record<string, unknown>[]): Promise<{ accepted: number }> {
    const withTimestamps = events.map((e) => ({
      timestamp: new Date().toISOString(),
      ...e,
    }));
    return this._fetch('/v1/audit/forward', {
      method: 'POST',
      body: { events: withTimestamps, source: 'secureyeoman' },
    }) as Promise<{ accepted: number }>;
  }

  // ── Event Pub/Sub ──────────────────────────────────────────
  async publishEvent(topic: string, data: Record<string, unknown>): Promise<void> {
    await this._fetch('/v1/events/publish', {
      method: 'POST',
      body: { topic, sender: 'secureyeoman', payload: data },
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
    const raw = (res as { profiles: Record<string, unknown>[] }).profiles ?? [];
    return raw.map((p) => ({
      id: String(p.preset ?? ''),
      name: String(p.preset ?? ''),
      description: p.app_specific ? `App-specific profile` : undefined,
      seccomp: p.seccomp_mode !== 'none' && p.seccomp_mode !== undefined,
      landlock: (p.landlock_rules_count as number) > 0,
      networkEnabled: p.network_enabled as boolean | undefined,
      allowProcessSpawn: p.allow_process_spawn as boolean | undefined,
      maxMemoryMb: p.max_memory_mb as number | undefined,
      allowedHosts: p.allowed_hosts as string[] | undefined,
    }));
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
      const res = await fetch(`${this.runtimeUrl}/v1/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Token Budget (hoosh gateway) ─────────────────────────

  async tokenCheck(project: string, tokens: number, pool: string): Promise<TokenCheckResult> {
    return this._fetchGateway('/v1/tokens/check', {
      method: 'POST',
      body: { project, tokens, pool },
    }) as Promise<TokenCheckResult>;
  }

  async tokenReserve(
    project: string,
    tokens: number,
    pool: string,
    poolTotal?: number,
    periodSeconds?: number
  ): Promise<TokenReserveResult> {
    return this._fetchGateway('/v1/tokens/reserve', {
      method: 'POST',
      body: { project, tokens, pool, pool_total: poolTotal, period_seconds: periodSeconds },
    }) as Promise<TokenReserveResult>;
  }

  async tokenReport(project: string, tokens: number, pool: string): Promise<void> {
    await this._fetchGateway('/v1/tokens/report', {
      method: 'POST',
      body: { project, tokens, pool },
    });
  }

  async tokenRelease(project: string, pool: string): Promise<void> {
    await this._fetchGateway('/v1/tokens/release', {
      method: 'POST',
      body: { project, pool },
    });
  }

  async tokenPools(): Promise<TokenPoolInfo[]> {
    const res = await this._fetchGateway('/v1/tokens/pools');
    return (res as { pools: TokenPoolInfo[] }).pools ?? [];
  }

  async tokenPoolDetail(poolName: string): Promise<TokenPoolInfo> {
    return this._fetchGateway(
      `/v1/tokens/pools/${encodeURIComponent(poolName)}`
    ) as Promise<TokenPoolInfo>;
  }

  // ── RAG (daimon runtime) ────────────────────────────────

  async ragIngest(
    text: string,
    metadata?: Record<string, unknown>,
    agentId?: string
  ): Promise<{ ingested: boolean; chunks?: number }> {
    return this._fetch('/v1/rag/ingest', {
      method: 'POST',
      body: { text, metadata, agent_id: agentId },
    }) as Promise<{ ingested: boolean; chunks?: number }>;
  }

  async ragQuery(query: string, topK?: number): Promise<RagQueryResult> {
    return this._fetch('/v1/rag/query', {
      method: 'POST',
      body: { query, top_k: topK },
    }) as Promise<RagQueryResult>;
  }

  async ragStats(): Promise<RagStats> {
    return this._fetch('/v1/rag/stats') as Promise<RagStats>;
  }

  // ── Phylax Scanning (daimon runtime) ────────────────────

  async scanBytes(data: string, targetName?: string): Promise<ScanBytesResult> {
    return this._fetch('/v1/scan/bytes', {
      method: 'POST',
      body: { data, target_name: targetName },
    }) as Promise<ScanBytesResult>;
  }

  async scanStatus(): Promise<ScanStatusResult> {
    return this._fetch('/v1/scan/status') as Promise<ScanStatusResult>;
  }

  // ── Remote Execution (daimon runtime) ───────────────────

  async execOnAgent(agentId: string, command: string, timeoutSecs?: number): Promise<ExecResult> {
    return this._fetch(`/v1/agents/${encodeURIComponent(agentId)}/exec`, {
      method: 'POST',
      body: { command, timeout_secs: timeoutSecs },
    }) as Promise<ExecResult>;
  }

  async writeFile(agentId: string, filePath: string, content: string): Promise<void> {
    const safePath = filePath.replace(/^\/+/, '');
    await this._fetch(`/v1/agents/${encodeURIComponent(agentId)}/files/${safePath}`, {
      method: 'PUT',
      body: { content },
    });
  }

  async readFile(agentId: string, filePath: string): Promise<{ content: string }> {
    const safePath = filePath.replace(/^\/+/, '');
    return this._fetch(`/v1/agents/${encodeURIComponent(agentId)}/files/${safePath}`) as Promise<{
      content: string;
    }>;
  }

  // ── Audit Runs (daimon runtime) ─────────────────────────

  async forwardAuditRun(run: AuditRunRecord): Promise<{ accepted: boolean }> {
    return this._fetch('/v1/audit/runs', {
      method: 'POST',
      body: { ...run, source: 'secureyeoman' },
    }) as Promise<{ accepted: boolean }>;
  }

  async verifyAuditChain(): Promise<AuditChainVerification> {
    return this._fetch('/v1/audit/chain/verify') as Promise<AuditChainVerification>;
  }

  // ── MCP Remote Tools (daimon runtime) ───────────────────

  async listRemoteTools(): Promise<RemoteTool[]> {
    const res = await this._fetch('/v1/mcp/tools');
    return (res as { tools: RemoteTool[] }).tools ?? [];
  }

  async registerRemoteTool(tool: RemoteTool): Promise<{ registered: number }> {
    return this._fetch('/v1/mcp/tools', {
      method: 'POST',
      body: { tools: [tool], source: 'secureyeoman' },
    }) as Promise<{ registered: number }>;
  }

  async callRemoteTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this._fetch('/v1/mcp/tools/call', {
      method: 'POST',
      body: { name, arguments: args },
    });
  }

  // ── Attestation (daimon runtime) ────────────────────────

  async getAttestation(): Promise<AttestationResult> {
    return this._fetch('/v1/attestation') as Promise<AttestationResult>;
  }

  // ── Internal ───────────────────────────────────────────────

  private async _fetchGateway(
    path: string,
    opts?: { method?: string; body?: unknown; signal?: AbortSignal }
  ): Promise<unknown> {
    const url = `${this.gatewayUrl}${path}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.gatewayApiKey) headers['X-API-Key'] = this.gatewayApiKey;

    const res = await fetch(url, {
      method: opts?.method ?? 'GET',
      headers,
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
      signal: opts?.signal ?? AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `AGNOS Gateway ${opts?.method ?? 'GET'} ${path} failed: ${res.status} ${text.slice(0, 200)}`
      );
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return res.json();
    }
    return {};
  }

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
