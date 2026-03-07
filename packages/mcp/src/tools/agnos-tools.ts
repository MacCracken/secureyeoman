/**
 * AGNOS (AI-Native OS) Tools — MCP tools that bridge to the AGNOS agent runtime
 * and LLM gateway REST APIs.
 *
 * AGNOS provides OS-level agent management, sandboxing, audit logging, persistent
 * memory, LLM gateway with token accounting, and fleet management.
 *
 * Configure via:
 *   MCP_EXPOSE_AGNOS_TOOLS=true
 *   AGNOS_RUNTIME_URL=http://127.0.0.1:8090   (agent runtime, default)
 *   AGNOS_GATEWAY_URL=http://127.0.0.1:8088   (LLM gateway, default)
 *   AGNOS_RUNTIME_API_KEY=<key>                (optional)
 *   AGNOS_GATEWAY_API_KEY=<key>                (optional)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

const DISABLED_MSG =
  'AGNOS tools are disabled. Set MCP_EXPOSE_AGNOS_TOOLS=true and optionally AGNOS_RUNTIME_API_KEY / AGNOS_GATEWAY_API_KEY.';

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function runtimeHeaders(config: McpServiceConfig): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.agnosRuntimeApiKey) h.Authorization = `Bearer ${config.agnosRuntimeApiKey}`;
  return h;
}

function gatewayHeaders(config: McpServiceConfig): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.agnosGatewayApiKey) h.Authorization = `Bearer ${config.agnosGatewayApiKey}`;
  return h;
}

async function agnosGet(
  baseUrl: string,
  path: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  let body: unknown;
  try { body = await res.json(); } catch { body = await res.text().catch(() => ''); }
  return { ok: res.ok, status: res.status, body };
}

async function agnosPost(
  baseUrl: string,
  path: string,
  payload: unknown,
  headers: Record<string, string>
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  let body: unknown;
  try { body = await res.json(); } catch { body = await res.text().catch(() => ''); }
  return { ok: res.ok, status: res.status, body };
}

async function agnosPut(
  baseUrl: string,
  path: string,
  payload: unknown,
  headers: Record<string, string>
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });
  let body: unknown;
  try { body = await res.json(); } catch { body = await res.text().catch(() => ''); }
  return { ok: res.ok, status: res.status, body };
}

async function agnosDelete(
  baseUrl: string,
  path: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, { method: 'DELETE', headers });
  let body: unknown;
  try { body = await res.json(); } catch { body = await res.text().catch(() => ''); }
  return { ok: res.ok, status: res.status, body };
}

function fmt(label: string, body: unknown): string {
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  return `${label}\n---\n${text}`;
}

function errResult(msg: string) {
  return { content: [{ type: 'text' as const, text: msg }], isError: true as const };
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerAgnosTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  if (!config.exposeAgnosTools) {
    server.registerTool(
      'agnos_status',
      { description: `AGNOS tools (disabled). ${DISABLED_MSG}`, inputSchema: {} },
      wrapToolHandler('agnos_status', middleware, async () => ({
        content: [{ type: 'text' as const, text: DISABLED_MSG }],
        isError: true,
      }))
    );
    return;
  }

  const rtUrl = config.agnosRuntimeUrl;
  const gwUrl = config.agnosGatewayUrl;
  const rtH = () => runtimeHeaders(config);
  const gwH = () => gatewayHeaders(config);

  // ── agnos_runtime_health ──────────────────────────────────────────────────

  server.registerTool(
    'agnos_runtime_health',
    {
      description: 'Check AGNOS agent runtime health, component status, and system info',
      inputSchema: {},
    },
    wrapToolHandler('agnos_runtime_health', middleware, async () => {
      try {
        const { ok, status, body } = await agnosGet(rtUrl, '/v1/health', rtH());
        if (!ok) return errResult(`AGNOS runtime health failed: HTTP ${status}\n${JSON.stringify(body)}`);
        return { content: [{ type: 'text' as const, text: fmt('AGNOS Runtime Health', body) }] };
      } catch (err) {
        return errResult(`Cannot reach AGNOS runtime at ${rtUrl}: ${err instanceof Error ? err.message : String(err)}`);
      }
    })
  );

  // ── agnos_gateway_health ──────────────────────────────────────────────────

  server.registerTool(
    'agnos_gateway_health',
    {
      description: 'Check AGNOS LLM gateway health and provider availability',
      inputSchema: {},
    },
    wrapToolHandler('agnos_gateway_health', middleware, async () => {
      try {
        const { ok, status, body } = await agnosGet(gwUrl, '/v1/health', gwH());
        if (!ok) return errResult(`AGNOS gateway health failed: HTTP ${status}\n${JSON.stringify(body)}`);
        return { content: [{ type: 'text' as const, text: fmt('AGNOS LLM Gateway Health', body) }] };
      } catch (err) {
        return errResult(`Cannot reach AGNOS gateway at ${gwUrl}: ${err instanceof Error ? err.message : String(err)}`);
      }
    })
  );

  // ── agnos_agents_list ─────────────────────────────────────────────────────

  server.registerTool(
    'agnos_agents_list',
    {
      description: 'List all agents registered with the AGNOS runtime (native + external)',
      inputSchema: {},
    },
    wrapToolHandler('agnos_agents_list', middleware, async () => {
      const { ok, status, body } = await agnosGet(rtUrl, '/v1/agents', rtH());
      if (!ok) return errResult(`AGNOS agents list failed: HTTP ${status}\n${JSON.stringify(body)}`);
      return { content: [{ type: 'text' as const, text: fmt('AGNOS Agents', body) }] };
    })
  );

  // ── agnos_agent_detail ────────────────────────────────────────────────────

  server.registerTool(
    'agnos_agent_detail',
    {
      description: 'Get details of a specific AGNOS agent (status, capabilities, memory, heartbeat)',
      inputSchema: {
        agent_id: z.string().describe('Agent ID'),
      },
    },
    wrapToolHandler('agnos_agent_detail', middleware, async (args) => {
      const { ok, status, body } = await agnosGet(rtUrl, `/v1/agents/${encodeURIComponent(args.agent_id)}`, rtH());
      if (!ok) return errResult(`AGNOS agent detail failed: HTTP ${status}\n${JSON.stringify(body)}`);
      return { content: [{ type: 'text' as const, text: fmt(`AGNOS Agent: ${args.agent_id}`, body) }] };
    })
  );

  // ── agnos_agent_register ──────────────────────────────────────────────────

  server.registerTool(
    'agnos_agent_register',
    {
      description: 'Register a new agent with the AGNOS runtime. Returns agent ID for subsequent operations.',
      inputSchema: {
        name: z.string().describe('Unique agent name'),
        capabilities: z.array(z.string()).default([]).describe('List of capability strings'),
        metadata: z.record(z.string(), z.unknown()).default({}).describe('Arbitrary metadata'),
      },
    },
    wrapToolHandler('agnos_agent_register', middleware, async (args) => {
      const { ok, status, body } = await agnosPost(rtUrl, '/v1/agents/register', {
        name: args.name,
        capabilities: args.capabilities,
        metadata: args.metadata,
      }, rtH());
      if (!ok) return errResult(`AGNOS agent register failed: HTTP ${status}\n${JSON.stringify(body)}`);
      return { content: [{ type: 'text' as const, text: fmt('AGNOS Agent Registered', body) }] };
    })
  );

  // ── agnos_agent_deregister ────────────────────────────────────────────────

  server.registerTool(
    'agnos_agent_deregister',
    {
      description: 'Deregister (remove) an agent from the AGNOS runtime',
      inputSchema: {
        agent_id: z.string().describe('Agent ID to deregister'),
      },
    },
    wrapToolHandler('agnos_agent_deregister', middleware, async (args) => {
      const { ok, status, body } = await agnosDelete(rtUrl, `/v1/agents/${encodeURIComponent(args.agent_id)}`, rtH());
      if (!ok) return errResult(`AGNOS agent deregister failed: HTTP ${status}\n${JSON.stringify(body)}`);
      return { content: [{ type: 'text' as const, text: fmt('AGNOS Agent Deregistered', body) }] };
    })
  );

  // ── agnos_agent_memory_list ───────────────────────────────────────────────

  server.registerTool(
    'agnos_agent_memory_list',
    {
      description: 'List all memory keys for an AGNOS agent (persistent KV store)',
      inputSchema: {
        agent_id: z.string().describe('Agent ID'),
      },
    },
    wrapToolHandler('agnos_agent_memory_list', middleware, async (args) => {
      const { ok, status, body } = await agnosGet(rtUrl, `/v1/agents/${encodeURIComponent(args.agent_id)}/memory`, rtH());
      if (!ok) return errResult(`AGNOS memory list failed: HTTP ${status}\n${JSON.stringify(body)}`);
      return { content: [{ type: 'text' as const, text: fmt(`Agent Memory Keys: ${args.agent_id}`, body) }] };
    })
  );

  // ── agnos_agent_memory_get ────────────────────────────────────────────────

  server.registerTool(
    'agnos_agent_memory_get',
    {
      description: 'Retrieve a specific memory entry from an AGNOS agent KV store',
      inputSchema: {
        agent_id: z.string().describe('Agent ID'),
        key: z.string().describe('Memory key to retrieve'),
      },
    },
    wrapToolHandler('agnos_agent_memory_get', middleware, async (args) => {
      const { ok, status, body } = await agnosGet(
        rtUrl,
        `/v1/agents/${encodeURIComponent(args.agent_id)}/memory/${encodeURIComponent(args.key)}`,
        rtH()
      );
      if (!ok) return errResult(`AGNOS memory get failed: HTTP ${status}\n${JSON.stringify(body)}`);
      return { content: [{ type: 'text' as const, text: fmt(`Memory: ${args.key}`, body) }] };
    })
  );

  // ── agnos_agent_memory_set ────────────────────────────────────────────────

  server.registerTool(
    'agnos_agent_memory_set',
    {
      description: 'Store a value in an AGNOS agent persistent KV store',
      inputSchema: {
        agent_id: z.string().describe('Agent ID'),
        key: z.string().describe('Memory key'),
        value: z.unknown().describe('JSON value to store'),
        tags: z.array(z.string()).default([]).describe('Optional tags'),
      },
    },
    wrapToolHandler('agnos_agent_memory_set', middleware, async (args) => {
      const { ok, status, body } = await agnosPut(
        rtUrl,
        `/v1/agents/${encodeURIComponent(args.agent_id)}/memory/${encodeURIComponent(args.key)}`,
        { value: args.value, tags: args.tags },
        rtH()
      );
      if (!ok) return errResult(`AGNOS memory set failed: HTTP ${status}\n${JSON.stringify(body)}`);
      return { content: [{ type: 'text' as const, text: fmt(`Memory Stored: ${args.key}`, body) }] };
    })
  );

  // ── agnos_agent_memory_delete ─────────────────────────────────────────────

  server.registerTool(
    'agnos_agent_memory_delete',
    {
      description: 'Delete a memory entry from an AGNOS agent KV store',
      inputSchema: {
        agent_id: z.string().describe('Agent ID'),
        key: z.string().describe('Memory key to delete'),
      },
    },
    wrapToolHandler('agnos_agent_memory_delete', middleware, async (args) => {
      const { ok, status, body } = await agnosDelete(
        rtUrl,
        `/v1/agents/${encodeURIComponent(args.agent_id)}/memory/${encodeURIComponent(args.key)}`,
        rtH()
      );
      if (!ok) return errResult(`AGNOS memory delete failed: HTTP ${status}\n${JSON.stringify(body)}`);
      return { content: [{ type: 'text' as const, text: fmt(`Memory Deleted: ${args.key}`, body) }] };
    })
  );

  // ── agnos_runtime_metrics ─────────────────────────────────────────────────

  server.registerTool(
    'agnos_runtime_metrics',
    {
      description: 'Get AGNOS agent runtime aggregate metrics (agent counts, CPU, memory usage)',
      inputSchema: {},
    },
    wrapToolHandler('agnos_runtime_metrics', middleware, async () => {
      const { ok, status, body } = await agnosGet(rtUrl, '/v1/metrics', rtH());
      if (!ok) return errResult(`AGNOS metrics failed: HTTP ${status}\n${JSON.stringify(body)}`);
      return { content: [{ type: 'text' as const, text: fmt('AGNOS Runtime Metrics', body) }] };
    })
  );

  // ── agnos_gateway_metrics ─────────────────────────────────────────────────

  server.registerTool(
    'agnos_gateway_metrics',
    {
      description: 'Get AGNOS LLM gateway metrics (cache stats, token accounting, provider health)',
      inputSchema: {},
    },
    wrapToolHandler('agnos_gateway_metrics', middleware, async () => {
      const { ok, status, body } = await agnosGet(gwUrl, '/v1/metrics', gwH());
      if (!ok) return errResult(`AGNOS gateway metrics failed: HTTP ${status}\n${JSON.stringify(body)}`);
      return { content: [{ type: 'text' as const, text: fmt('AGNOS LLM Gateway Metrics', body) }] };
    })
  );

  // ── agnos_gateway_models ──────────────────────────────────────────────────

  server.registerTool(
    'agnos_gateway_models',
    {
      description: 'List available models on the AGNOS LLM gateway (Ollama, llama.cpp, OpenAI, Anthropic)',
      inputSchema: {},
    },
    wrapToolHandler('agnos_gateway_models', middleware, async () => {
      const { ok, status, body } = await agnosGet(gwUrl, '/v1/models', gwH());
      if (!ok) return errResult(`AGNOS models failed: HTTP ${status}\n${JSON.stringify(body)}`);
      return { content: [{ type: 'text' as const, text: fmt('AGNOS LLM Models', body) }] };
    })
  );

  // ── agnos_gateway_chat ────────────────────────────────────────────────────

  server.registerTool(
    'agnos_gateway_chat',
    {
      description:
        'Send a chat completion request through the AGNOS LLM gateway (OpenAI-compatible). ' +
        'Routes to local or cloud providers with caching, rate limiting, and token accounting.',
      inputSchema: {
        model: z.string().describe('Model name (e.g. llama3, gpt-4o, claude-3-opus)'),
        messages: z.array(z.object({
          role: z.enum(['user', 'assistant', 'system']),
          content: z.string(),
        })).describe('Chat messages'),
        temperature: z.number().min(0).max(2).default(0.7).describe('Sampling temperature'),
        max_tokens: z.number().int().min(1).max(128000).default(1024).describe('Max tokens to generate'),
        agent_id: z.string().optional().describe('Agent ID for token accounting (x-agent-id header)'),
      },
    },
    wrapToolHandler('agnos_gateway_chat', middleware, async (args) => {
      const headers = gwH();
      if (args.agent_id) headers['x-agent-id'] = args.agent_id;

      const { ok, status, body } = await agnosPost(gwUrl, '/v1/chat/completions', {
        model: args.model,
        messages: args.messages,
        temperature: args.temperature,
        max_tokens: args.max_tokens,
      }, headers);

      if (!ok) return errResult(`AGNOS chat failed: HTTP ${status}\n${JSON.stringify(body)}`);
      return { content: [{ type: 'text' as const, text: fmt('AGNOS Chat Completion', body) }] };
    })
  );

  // ── agnos_audit_forward ───────────────────────────────────────────────────

  server.registerTool(
    'agnos_audit_forward',
    {
      description:
        'Forward audit events to the AGNOS cryptographic audit chain. Events are appended ' +
        'to the immutable, HMAC-signed log with correlation IDs for cross-project tracing.',
      inputSchema: {
        events: z.array(z.object({
          timestamp: z.string().describe('ISO8601 timestamp'),
          action: z.string().describe('Action type (e.g. file.write, auth.login)'),
          agent: z.string().optional().describe('Agent that performed the action'),
          details: z.record(z.string(), z.unknown()).default({}).describe('Event details'),
          outcome: z.enum(['success', 'failure', 'unknown']).default('success'),
        })).describe('Audit events to forward'),
        source: z.string().default('secureyeoman').describe('Source system identifier'),
        correlation_id: z.string().optional().describe('Correlation ID for cross-project tracing'),
      },
    },
    wrapToolHandler('agnos_audit_forward', middleware, async (args) => {
      const { ok, status, body } = await agnosPost(rtUrl, '/v1/audit/forward', {
        events: args.events,
        source: args.source,
        correlation_id: args.correlation_id,
      }, rtH());
      if (!ok) return errResult(`AGNOS audit forward failed: HTTP ${status}\n${JSON.stringify(body)}`);
      return { content: [{ type: 'text' as const, text: fmt('Audit Events Forwarded', body) }] };
    })
  );

  // ── agnos_audit_query ─────────────────────────────────────────────────────

  server.registerTool(
    'agnos_audit_query',
    {
      description: 'Query the AGNOS audit log with optional filters by agent or action',
      inputSchema: {
        agent: z.string().optional().describe('Filter by agent ID'),
        action: z.string().optional().describe('Filter by action type'),
        limit: z.number().int().min(1).max(1000).default(50).describe('Max results'),
      },
    },
    wrapToolHandler('agnos_audit_query', middleware, async (args) => {
      const params = new URLSearchParams();
      if (args.agent) params.set('agent', args.agent);
      if (args.action) params.set('action', args.action);
      if (args.limit) params.set('limit', String(args.limit));
      const qs = params.toString();
      const path = `/v1/audit${qs ? `?${qs}` : ''}`;
      const { ok, status, body } = await agnosGet(rtUrl, path, rtH());
      if (!ok) return errResult(`AGNOS audit query failed: HTTP ${status}\n${JSON.stringify(body)}`);
      return { content: [{ type: 'text' as const, text: fmt('AGNOS Audit Log', body) }] };
    })
  );

  // ── agnos_traces_submit ───────────────────────────────────────────────────

  server.registerTool(
    'agnos_traces_submit',
    {
      description:
        'Submit reasoning traces to AGNOS for cross-project visibility. Traces show ' +
        'decision chains (chain-of-thought) from SecureYeoman agent executions.',
      inputSchema: {
        agent_id: z.string().describe('Agent ID that produced the trace'),
        input: z.string().describe('Input that triggered the reasoning'),
        steps: z.array(z.object({
          name: z.string().describe('Step name'),
          rationale: z.string().describe('Why this step was taken'),
          tool: z.string().optional().describe('Tool used (if any)'),
          output: z.string().optional().describe('Step output'),
          duration_ms: z.number().int().default(0).describe('Step duration in ms'),
          success: z.boolean().default(true),
        })).describe('Reasoning steps'),
        result: z.string().optional().describe('Final result'),
        duration_ms: z.number().int().default(0).describe('Total duration in ms'),
      },
    },
    wrapToolHandler('agnos_traces_submit', middleware, async (args) => {
      const { ok, status, body } = await agnosPost(rtUrl, '/v1/traces', {
        agent_id: args.agent_id,
        input: args.input,
        steps: args.steps,
        result: args.result,
        duration_ms: args.duration_ms,
      }, rtH());
      if (!ok) return errResult(`AGNOS trace submit failed: HTTP ${status}\n${JSON.stringify(body)}`);
      return { content: [{ type: 'text' as const, text: fmt('Reasoning Trace Submitted', body) }] };
    })
  );

  // ── agnos_traces_query ────────────────────────────────────────────────────

  server.registerTool(
    'agnos_traces_query',
    {
      description: 'Query submitted reasoning traces from the AGNOS runtime',
      inputSchema: {
        agent_id: z.string().optional().describe('Filter by agent ID'),
      },
    },
    wrapToolHandler('agnos_traces_query', middleware, async (args) => {
      const path = args.agent_id
        ? `/v1/traces?agent_id=${encodeURIComponent(args.agent_id)}`
        : '/v1/traces';
      const { ok, status, body } = await agnosGet(rtUrl, path, rtH());
      if (!ok) return errResult(`AGNOS traces query failed: HTTP ${status}\n${JSON.stringify(body)}`);
      return { content: [{ type: 'text' as const, text: fmt('AGNOS Reasoning Traces', body) }] };
    })
  );

  // ── agnos_webhooks_register ───────────────────────────────────────────────

  server.registerTool(
    'agnos_webhooks_register',
    {
      description: 'Register a webhook with the AGNOS runtime to receive agent events',
      inputSchema: {
        url: z.string().url().describe('Webhook URL to receive POST events'),
        events: z.array(z.string()).default([]).describe('Event types to subscribe to'),
        secret: z.string().optional().describe('HMAC signing secret'),
      },
    },
    wrapToolHandler('agnos_webhooks_register', middleware, async (args) => {
      const { ok, status, body } = await agnosPost(rtUrl, '/v1/webhooks', {
        url: args.url,
        events: args.events,
        secret: args.secret,
      }, rtH());
      if (!ok) return errResult(`AGNOS webhook register failed: HTTP ${status}\n${JSON.stringify(body)}`);
      return { content: [{ type: 'text' as const, text: fmt('AGNOS Webhook Registered', body) }] };
    })
  );

  // ── agnos_overview ────────────────────────────────────────────────────────

  server.registerTool(
    'agnos_overview',
    {
      description:
        'Get a unified AGNOS platform overview: runtime health, gateway health, agent list, ' +
        'runtime metrics, gateway metrics, and models — all in a single call.',
      inputSchema: {},
    },
    wrapToolHandler('agnos_overview', middleware, async () => {
      const [rtHealth, gwHealth, agents, rtMetrics, gwMetrics, models] = await Promise.all([
        agnosGet(rtUrl, '/v1/health', rtH()).catch(() => ({ ok: false, status: 0, body: { error: 'unreachable' } })),
        agnosGet(gwUrl, '/v1/health', gwH()).catch(() => ({ ok: false, status: 0, body: { error: 'unreachable' } })),
        agnosGet(rtUrl, '/v1/agents', rtH()).catch(() => ({ ok: false, status: 0, body: { error: 'unreachable' } })),
        agnosGet(rtUrl, '/v1/metrics', rtH()).catch(() => ({ ok: false, status: 0, body: { error: 'unreachable' } })),
        agnosGet(gwUrl, '/v1/metrics', gwH()).catch(() => ({ ok: false, status: 0, body: { error: 'unreachable' } })),
        agnosGet(gwUrl, '/v1/models', gwH()).catch(() => ({ ok: false, status: 0, body: { error: 'unreachable' } })),
      ]);

      const overview = {
        runtime: {
          health: rtHealth.ok ? rtHealth.body : { error: `HTTP ${rtHealth.status}` },
          agents: agents.ok ? agents.body : { error: `HTTP ${agents.status}` },
          metrics: rtMetrics.ok ? rtMetrics.body : { error: `HTTP ${rtMetrics.status}` },
        },
        gateway: {
          health: gwHealth.ok ? gwHealth.body : { error: `HTTP ${gwHealth.status}` },
          metrics: gwMetrics.ok ? gwMetrics.body : { error: `HTTP ${gwMetrics.status}` },
          models: models.ok ? models.body : { error: `HTTP ${models.status}` },
        },
      };

      return { content: [{ type: 'text' as const, text: fmt('AGNOS Platform Overview', overview) }] };
    })
  );
}
