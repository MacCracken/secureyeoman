/**
 * AAS (Agnostic Agentics Systems) Tools — MCP tools that bridge to the Agnostic REST API.
 *
 * Agnostic is a general-purpose agent platform (CrewAI) supporting any domain:
 * QA, data-engineering, DevOps, or custom crews. These tools let YEOMAN agents
 * submit tasks, run crews, manage agent definitions/presets, monitor status,
 * retrieve session results, and generate reports.
 *
 * Configure via:
 *   MCP_EXPOSE_AGNOSTIC_TOOLS=true
 *   AGNOSTIC_URL=http://127.0.0.1:8000   (default)
 *
 * Authentication (choose one):
 *   AGNOSTIC_API_KEY=<key>               (preferred — static or Redis-backed key)
 *   AGNOSTIC_EMAIL + AGNOSTIC_PASSWORD   (fallback — JWT login)
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import {
  wrapToolHandler,
  registerApiProxyTool,
  labelledResponse,
  errorResponse,
  checkHttpOk,
  registerDisabledStub,
  createHttpClient,
} from './tool-utils.js';
import type { HttpResult } from './tool-utils.js';
import type { CoreApiClient as ICoreApiClient } from '../core-client.js';

const DISABLED_MSG =
  'Agnostic tools are disabled. Set MCP_EXPOSE_AGNOSTIC_TOOLS=true and either AGNOSTIC_API_KEY or AGNOSTIC_EMAIL + AGNOSTIC_PASSWORD.';

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/** In-process JWT token cache — used only when falling back to email/password auth. */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const TOKEN_CACHE_MAX = 50;

/** Evict expired entries from tokenCache to prevent unbounded growth. */
function evictExpiredTokens(): void {
  const now = Date.now();
  for (const [key, entry] of tokenCache) {
    if (entry.expiresAt <= now) tokenCache.delete(key);
  }
  // Hard cap: if still over limit, drop oldest
  if (tokenCache.size > TOKEN_CACHE_MAX) {
    const iter = tokenCache.keys();
    while (tokenCache.size > TOKEN_CACHE_MAX) {
      const { value, done } = iter.next();
      if (done) break;
      tokenCache.delete(value);
    }
  }
}

/**
 * Returns the appropriate auth headers for a request.
 * Prefers X-API-Key (AGNOSTIC_API_KEY) over JWT login (email+password).
 */
async function getAuthHeaders(config: McpServiceConfig): Promise<Record<string, string>> {
  // Prefer static/Redis API key
  if (config.agnosticApiKey) {
    return { 'X-API-Key': config.agnosticApiKey };
  }

  // Fall back to JWT login
  if (!config.agnosticEmail || !config.agnosticPassword) return {};

  const cacheKey = config.agnosticUrl ?? '';
  evictExpiredTokens();
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return { Authorization: `Bearer ${cached.token}` };
  }

  try {
    const res = await fetch(`${config.agnosticUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: config.agnosticEmail, password: config.agnosticPassword }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { access_token: string; expires_in: number };
    tokenCache.set(cacheKey, {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    });
    return { Authorization: `Bearer ${data.access_token}` };
  } catch {
    return {};
  }
}

/**
 * Make an authenticated request to the Agnostic API. Creates a fresh
 * httpClient per call so that async JWT token refresh is handled correctly.
 */
async function agnosticRequest(
  config: McpServiceConfig,
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  payload?: unknown
): Promise<HttpResult> {
  const authHeaders = await getAuthHeaders(config);
  const client = createHttpClient(config.agnosticUrl, authHeaders);
  return client[method](path, payload);
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerAgnosticTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  if (!config.exposeAgnosticTools) {
    registerDisabledStub(server, middleware, 'agnostic_status', DISABLED_MSG);
    return;
  }

  // ── agnostic_health ────────────────────────────────────────────────────────

  server.registerTool(
    'agnostic_health',
    {
      description: 'Check if the Agnostic platform is reachable and healthy',
      inputSchema: {},
    },
    wrapToolHandler('agnostic_health', middleware, async () => {
      try {
        const res = await fetch(`${config.agnosticUrl}/health`);
        const body = await res.json().catch(() => ({}));
        return labelledResponse('Agnostic Health', body);
      } catch (err) {
        return errorResponse(
          `Cannot reach Agnostic at ${config.agnosticUrl}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );

  // ── agnostic_agents_status ─────────────────────────────────────────────────

  server.registerTool(
    'agnostic_agents_status',
    {
      description: 'List all Agnostic agents and their current status',
      inputSchema: {},
    },
    wrapToolHandler('agnostic_agents_status', middleware, async () => {
      const result = await agnosticRequest(config, 'get', '/api/agents');
      return (
        checkHttpOk(result, 'Agents status failed') ??
        labelledResponse('Agnostic Agents', result.body)
      );
    })
  );

  // ── agnostic_agents_queues ────────────────────────────────────────────────

  server.registerTool(
    'agnostic_agents_queues',
    {
      description: 'Get current queue depths for each Agnostic agent',
      inputSchema: {},
    },
    wrapToolHandler('agnostic_agents_queues', middleware, async () => {
      const result = await agnosticRequest(config, 'get', '/api/agents/queues');
      return (
        checkHttpOk(result, 'Queue depths failed') ??
        labelledResponse('Agnostic Queue Depths', result.body)
      );
    })
  );

  // ── agnostic_dashboard ────────────────────────────────────────────────────

  server.registerTool(
    'agnostic_dashboard',
    {
      description:
        'Get the Agnostic platform dashboard overview (active sessions, metrics, agent status)',
      inputSchema: {},
    },
    wrapToolHandler('agnostic_dashboard', middleware, async () => {
      const result = await agnosticRequest(config, 'get', '/api/dashboard');
      return (
        checkHttpOk(result, 'Dashboard failed') ??
        labelledResponse('Agnostic Dashboard', result.body)
      );
    })
  );

  // ── agnostic_session_list ─────────────────────────────────────────────────

  server.registerTool(
    'agnostic_session_list',
    {
      description: 'List recent QA sessions from the Agnostic platform',
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(20).describe('Max sessions to return'),
        offset: z.number().int().min(0).default(0).describe('Pagination offset'),
      },
    },
    wrapToolHandler('agnostic_session_list', middleware, async (args) => {
      const limit = args.limit ?? 20;
      const offset = args.offset ?? 0;
      const result = await agnosticRequest(
        config,
        'get',
        `/api/sessions?limit=${limit}&offset=${offset}`
      );
      return (
        checkHttpOk(result, 'Sessions failed') ?? labelledResponse('Agnostic Sessions', result.body)
      );
    })
  );

  // ── agnostic_session_detail ───────────────────────────────────────────────

  server.registerTool(
    'agnostic_session_detail',
    {
      description: 'Get full details and results for a specific Agnostic session',
      inputSchema: {
        session_id: z.string().describe('The session ID to retrieve'),
      },
    },
    wrapToolHandler('agnostic_session_detail', middleware, async (args) => {
      const result = await agnosticRequest(
        config,
        'get',
        `/api/sessions/${encodeURIComponent(args.session_id)}`
      );
      return (
        checkHttpOk(result, 'Session not found') ??
        labelledResponse(`Session: ${args.session_id}`, result.body)
      );
    })
  );

  // ── agnostic_generate_report ──────────────────────────────────────────────

  server.registerTool(
    'agnostic_generate_report',
    {
      description: 'Generate a QA report for a completed Agnostic session',
      inputSchema: {
        session_id: z.string().describe('Session ID to generate the report for'),
        report_type: z
          .enum(['executive_summary', 'full', 'security', 'performance', 'compliance'])
          .default('executive_summary')
          .describe('Report type'),
        format: z.enum(['json', 'markdown', 'pdf']).default('json').describe('Output format'),
      },
    },
    wrapToolHandler('agnostic_generate_report', middleware, async (args) => {
      const result = await agnosticRequest(config, 'post', '/api/reports/generate', {
        session_id: args.session_id,
        report_type: args.report_type,
        format: args.format,
      });
      return (
        checkHttpOk(result, 'Report generation failed') ??
        labelledResponse('Report Generated', result.body)
      );
    })
  );

  // ── agnostic_submit_qa ────────────────────────────────────────────────────

  server.registerTool(
    'agnostic_submit_qa',
    {
      description:
        'Submit a QA task to the Agnostic 6-agent team (security, performance, regression, ' +
        'analysis). Returns a task_id for polling with agnostic_task_status, or supply a ' +
        'callback_url to receive the result via webhook when complete.',
      inputSchema: {
        title: z.string().describe('Short title for the QA task'),
        description: z
          .string()
          .describe('What to test — feature description, PR summary, or acceptance criteria'),
        target_url: z.string().optional().describe('Primary URL to test against'),
        priority: z
          .enum(['critical', 'high', 'medium', 'low'])
          .default('high')
          .describe('Task priority'),
        agents: z
          .array(
            z.enum(['security_compliance', 'performance', 'senior_qa', 'junior_qa', 'qa_analyst'])
          )
          .default([])
          .describe('Agents to invoke (empty = all agents)'),
        standards: z
          .array(z.string())
          .default([])
          .describe('Compliance standards to check, e.g. ["OWASP", "GDPR", "PCI DSS"]'),
        business_goals: z
          .string()
          .optional()
          .describe('Business goals context for the QA assessment'),
        constraints: z.string().optional().describe('Testing constraints or environment notes'),
        callback_url: z
          .string()
          .url()
          .optional()
          .describe('Webhook URL — Agnostic will POST the completed TaskStatusResponse here'),
        callback_secret: z
          .string()
          .optional()
          .describe('HMAC-SHA256 signing secret for the webhook payload (X-Signature header)'),
      },
    },
    wrapToolHandler('agnostic_submit_qa', middleware, async (args) => {
      const { ok, status, body } = await agnosticRequest(config, 'post', '/api/tasks', {
        title: args.title,
        description: args.description,
        target_url: args.target_url,
        priority: args.priority,
        agents: args.agents,
        standards: args.standards,
        business_goals: args.business_goals,
        constraints: args.constraints,
        callback_url: args.callback_url,
        callback_secret: args.callback_secret,
      });

      const err = checkHttpOk({ ok, status, body }, 'Task submission failed');
      if (err) return err;
      return labelledResponse('Task Submitted', body);
    })
  );

  // ── agnostic_task_status ──────────────────────────────────────────────────

  server.registerTool(
    'agnostic_task_status',
    {
      description:
        'Poll the status of a submitted Agnostic task. ' +
        'Returns status (pending | running | completed | failed) and the result when complete.',
      inputSchema: {
        task_id: z.string().describe('Task ID returned by agnostic_submit_qa'),
      },
    },
    wrapToolHandler('agnostic_task_status', middleware, async (args) => {
      const result = await agnosticRequest(
        config,
        'get',
        `/api/tasks/${encodeURIComponent(args.task_id)}`
      );
      return (
        checkHttpOk(result, 'Task status failed') ??
        labelledResponse(`Task: ${args.task_id}`, result.body)
      );
    })
  );

  // ── agnostic_delegate_a2a ─────────────────────────────────────────────────

  server.registerTool(
    'agnostic_delegate_a2a',
    {
      description:
        'Delegate a task to Agnostic via the A2A (Agent-to-Agent) protocol. ' +
        'Constructs a structured a2a:delegate message and sends it to the Agnostic A2A ' +
        'receive endpoint. Supports both legacy QA tasks (via agents array) and ' +
        'multi-domain crew tasks (via preset or agent_definitions).',
      inputSchema: {
        title: z.string().describe('Short title for the task'),
        description: z
          .string()
          .describe('What to accomplish — feature description, PR summary, or acceptance criteria'),
        target_url: z.string().optional().describe('Primary URL to target'),
        priority: z
          .enum(['critical', 'high', 'medium', 'low'])
          .default('high')
          .describe('Task priority'),
        preset: z
          .string()
          .optional()
          .describe(
            'Crew preset to run (e.g. "qa-standard", "data-engineering", "devops"). ' +
              'When set, routes to the crew builder instead of the QA pipeline.'
          ),
        agents: z
          .array(z.string())
          .default([])
          .describe(
            'Agents to invoke (empty = all agents). For QA: security_compliance, performance, etc.'
          ),
        agent_definitions: z
          .array(z.record(z.string(), z.unknown()))
          .default([])
          .describe('Inline agent definitions for ad-hoc crews'),
        standards: z
          .array(z.string())
          .default([])
          .describe('Compliance standards to check, e.g. ["OWASP", "GDPR", "PCI DSS"]'),
        from_peer_id: z
          .string()
          .default('yeoman')
          .describe('Sender peer ID — identifies this YEOMAN instance to Agnostic'),
      },
    },
    wrapToolHandler('agnostic_delegate_a2a', middleware, async (args) => {
      const messageId = randomUUID();
      const payload: Record<string, unknown> = {
        title: args.title,
        description: args.description,
        target_url: args.target_url,
        priority: args.priority,
        agents: args.agents,
        standards: args.standards,
      };
      // Add crew-specific fields when using preset or inline definitions
      if (args.preset) payload.preset = args.preset;
      if (args.agent_definitions?.length) payload.agent_definitions = args.agent_definitions;

      const message = {
        id: messageId,
        type: 'a2a:delegate',
        fromPeerId: args.from_peer_id,
        toPeerId: 'agnostic',
        payload,
        timestamp: Date.now(),
      };

      const { ok, status, body } = await agnosticRequest(
        config,
        'post',
        '/api/v1/a2a/receive',
        message
      );

      if (!ok) {
        if (status === 404) {
          return errorResponse(
            `A2A endpoint not found (HTTP 404). Agnostic P8 (POST /api/v1/a2a/receive) ` +
              `is not yet implemented on the Agnostic side.\n` +
              `Use agnostic_submit_qa for REST-based submission.\n\n` +
              `A2A message that would be sent:\n${JSON.stringify(message, null, 2)}`
          );
        }
        return errorResponse(`A2A delegation failed: HTTP ${status}\n${JSON.stringify(body)}`);
      }

      return labelledResponse(`A2A Delegation Sent (message_id: ${messageId})`, body);
    })
  );

  // ── agnostic_session_diff ───────────────────────────────────────────────

  server.registerTool(
    'agnostic_session_diff',
    {
      description:
        'Compare test results between two Agnostic sessions to detect regressions, ' +
        'fixes, new tests, and removed tests. Returns pass-rate and timing deltas. ' +
        'Requires DATABASE_ENABLED=true on the Agnostic side.',
      inputSchema: {
        base_session_id: z.string().describe('Base session ID (the "before" — e.g. main branch)'),
        compare_session_id: z
          .string()
          .describe('Compare session ID (the "after" — e.g. PR branch)'),
      },
    },
    wrapToolHandler('agnostic_session_diff', middleware, async (args) => {
      const result = await agnosticRequest(
        config,
        'get',
        `/api/test-sessions/diff?base=${encodeURIComponent(args.base_session_id)}&compare=${encodeURIComponent(args.compare_session_id)}`
      );
      return (
        checkHttpOk(result, 'Session diff failed') ??
        labelledResponse(
          `Session Diff: ${args.base_session_id} → ${args.compare_session_id}`,
          result.body
        )
      );
    })
  );

  // ── agnostic_structured_results ─────────────────────────────────────────

  server.registerTool(
    'agnostic_structured_results',
    {
      description:
        'Get typed structured results for a completed QA session. Returns SecurityResult, ' +
        'PerformanceResult, and/or TestExecutionResult objects that can be used for ' +
        'programmatic actions (auto-create issues, block PRs, alert on flaky tests).',
      inputSchema: {
        session_id: z.string().describe('Session ID to retrieve structured results for'),
        result_type: z
          .enum(['security', 'performance', 'test_execution'])
          .optional()
          .describe('Filter to a specific result type (omit for all)'),
      },
    },
    wrapToolHandler('agnostic_structured_results', middleware, async (args) => {
      const query = args.result_type ? `?result_type=${args.result_type}` : '';
      const result = await agnosticRequest(
        config,
        'get',
        `/api/results/structured/${encodeURIComponent(args.session_id)}${query}`
      );
      return (
        checkHttpOk(result, 'Structured results failed') ??
        labelledResponse(`Structured Results: ${args.session_id}`, result.body)
      );
    })
  );

  // ── agnostic_quality_trends ─────────────────────────────────────────────

  server.registerTool(
    'agnostic_quality_trends',
    {
      description:
        'Get quality trends over time — pass rates, coverage, flakiness, and timing metrics. ' +
        'Useful for tracking quality trajectory across releases. ' +
        'Requires DATABASE_ENABLED=true on the Agnostic side.',
      inputSchema: {
        days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .default(30)
          .describe('Number of days of trend data to return'),
      },
    },
    wrapToolHandler('agnostic_quality_trends', middleware, async (args) => {
      const result = await agnosticRequest(
        config,
        'get',
        `/api/test-metrics/trends?days=${args.days}`
      );
      return (
        checkHttpOk(result, 'Quality trends failed') ??
        labelledResponse(`Quality Trends (${args.days} days)`, result.body)
      );
    })
  );

  // ── agnostic_security_findings ──────────────────────────────────────────

  server.registerTool(
    'agnostic_security_findings',
    {
      description:
        'Extract security findings from a QA session with severity, CWE IDs, and CVSS scores. ' +
        'Use this to auto-create GitHub/Jira issues for critical vulnerabilities or feed into ' +
        'DLP/compliance pipelines.',
      inputSchema: {
        session_id: z.string().describe('Session ID to extract security findings from'),
      },
    },
    wrapToolHandler('agnostic_security_findings', middleware, async (args) => {
      const result = await agnosticRequest(
        config,
        'get',
        `/api/results/structured/${encodeURIComponent(args.session_id)}?result_type=security`
      );
      const httpErr = checkHttpOk(result, 'Security findings failed');
      if (httpErr) return httpErr;

      // Extract findings array for easier consumption
      const data = result.body as Record<string, unknown>;
      const action = data?.action as Record<string, unknown> | undefined;
      const results = action?.results as Record<string, unknown> | undefined;
      const security = results?.security as Record<string, unknown> | undefined;
      const findings = security?.findings ?? [];

      return labelledResponse(`Security Findings: ${args.session_id}`, {
        session_id: args.session_id,
        total_findings: Array.isArray(findings) ? findings.length : 0,
        overall_score: security?.overall_score,
        risk_level: security?.risk_level,
        findings,
      });
    })
  );

  // ── agnostic_qa_orchestrate ─────────────────────────────────────────────

  server.registerTool(
    'agnostic_qa_orchestrate',
    {
      description:
        'Submit a QA task with fine-grained agent selection. Allows SecureYeoman ' +
        'personalities to trigger targeted QA runs conversationally — e.g. run only ' +
        'security + performance agents, or a full 6-agent pipeline.',
      inputSchema: {
        title: z.string().describe('Short title for the QA task'),
        description: z
          .string()
          .describe('What to test — feature description, PR summary, or acceptance criteria'),
        target_url: z.string().optional().describe('Primary URL to test against'),
        priority: z
          .enum(['critical', 'high', 'medium', 'low'])
          .default('high')
          .describe('Task priority'),
        run_security: z.boolean().default(true).describe('Include security-compliance agent'),
        run_performance: z.boolean().default(true).describe('Include performance agent'),
        run_senior_qa: z.boolean().default(false).describe('Include senior-qa agent'),
        run_junior_qa: z.boolean().default(false).describe('Include junior-qa agent'),
        run_qa_analyst: z.boolean().default(false).describe('Include qa-analyst agent'),
        run_qa_manager: z.boolean().default(false).describe('Include qa-manager agent'),
        standards: z.array(z.string()).default([]).describe('Compliance standards to check'),
      },
    },
    wrapToolHandler('agnostic_qa_orchestrate', middleware, async (args) => {
      const agents: string[] = [];
      if (args.run_security) agents.push('security-compliance');
      if (args.run_performance) agents.push('performance');
      if (args.run_senior_qa) agents.push('senior-qa');
      if (args.run_junior_qa) agents.push('junior-qa');
      if (args.run_qa_analyst) agents.push('qa-analyst');
      if (args.run_qa_manager) agents.push('qa-manager');

      const result = await agnosticRequest(config, 'post', '/api/tasks', {
        title: args.title,
        description: args.description,
        target_url: args.target_url,
        priority: args.priority,
        agents: agents.length === 6 ? [] : agents, // empty = all
        standards: args.standards,
      });
      return (
        checkHttpOk(result, 'QA orchestration failed') ??
        labelledResponse(
          `QA Orchestrated (agents: ${agents.length ? agents.join(', ') : 'all'})`,
          result.body
        )
      );
    })
  );

  // ── agnostic_quality_dashboard ──────────────────────────────────────────

  server.registerTool(
    'agnostic_quality_dashboard',
    {
      description:
        'Get a unified quality dashboard: recent sessions, pass rates, agent queue depths, ' +
        'and LLM usage metrics in a single call. Feed into SecureYeoman observability or ' +
        'use for quality gate decisions.',
      inputSchema: {
        session_limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe('Max recent sessions to include'),
        trend_days: z
          .number()
          .int()
          .min(1)
          .max(90)
          .default(7)
          .describe('Days of trend data to include'),
      },
    },
    wrapToolHandler('agnostic_quality_dashboard', middleware, async (args) => {
      // Fetch multiple endpoints in parallel
      const [dashRes, sessRes, trendsRes, llmRes] = await Promise.all([
        agnosticRequest(config, 'get', '/api/dashboard/metrics'),
        agnosticRequest(config, 'get', `/api/sessions?limit=${args.session_limit}&offset=0`),
        agnosticRequest(config, 'get', `/api/test-metrics/trends?days=${args.trend_days}`).catch(
          () => ({
            ok: false as const,
            status: 503,
            body: { message: 'Database not enabled' },
          })
        ),
        agnosticRequest(config, 'get', '/api/dashboard/llm'),
      ]);

      const dashboard: Record<string, unknown> = {
        metrics: dashRes.ok ? dashRes.body : { error: `HTTP ${dashRes.status}` },
        recent_sessions: sessRes.ok ? sessRes.body : { error: `HTTP ${sessRes.status}` },
        quality_trends: trendsRes.ok
          ? trendsRes.body
          : { unavailable: 'Requires DATABASE_ENABLED=true' },
        llm_usage: llmRes.ok ? llmRes.body : { error: `HTTP ${llmRes.status}` },
      };

      return labelledResponse('Quality Dashboard', dashboard);
    })
  );

  // ── agnostic_run_crew ──────────────────────────────────────────────────

  server.registerTool(
    'agnostic_run_crew',
    {
      description:
        'Run an agent crew on the Agnostic platform. Provide a preset name ' +
        '(e.g. "qa-standard", "data-engineering", "devops"), a list of agent keys, ' +
        'or inline agent definitions. Returns a crew_id + task_id for polling.',
      inputSchema: {
        title: z.string().describe('Short title for the crew task'),
        description: z.string().describe('Task description — what the crew should accomplish'),
        preset: z
          .string()
          .optional()
          .describe('Preset name (e.g. "qa-standard", "data-engineering", "devops")'),
        agent_keys: z
          .array(z.string())
          .default([])
          .describe('Agent definition keys from the Agnostic definitions directory'),
        agent_definitions: z
          .array(z.record(z.string(), z.unknown()))
          .default([])
          .describe('Inline agent definitions (agent_key, name, role, goal, backstory)'),
        target_url: z.string().optional().describe('Target application URL'),
        priority: z
          .enum(['critical', 'high', 'medium', 'low'])
          .default('high')
          .describe('Task priority'),
        callback_url: z
          .string()
          .url()
          .optional()
          .describe('Webhook URL for completion notification'),
        callback_secret: z.string().optional().describe('HMAC-SHA256 secret for webhook signature'),
        process: z
          .enum(['sequential', 'hierarchical'])
          .default('sequential')
          .describe('Crew execution process — sequential (one at a time) or hierarchical (manager delegates)'),
        team: z
          .object({
            members: z.array(z.object({
              role: z.string().describe('Role title (e.g. "UX Researcher", "Backend Engineer")'),
              context: z.string().optional().describe('Focus area for this member'),
              lead: z.boolean().default(false).describe('Whether this member leads the team'),
              tools: z.array(z.string()).default([]).describe('Tool names to attach'),
            })),
            project_context: z.string().optional().describe('Overall project description'),
          })
          .optional()
          .describe('Custom team composition — alternative to presets. Describe roles and the system matches or generates agents.'),
      },
    },
    wrapToolHandler('agnostic_run_crew', middleware, async (args) => {
      const payload: Record<string, unknown> = {
        title: args.title,
        description: args.description,
        priority: args.priority,
      };
      if (args.preset) payload.preset = args.preset;
      if (args.agent_keys?.length) payload.agent_keys = args.agent_keys;
      if (args.agent_definitions?.length) payload.agent_definitions = args.agent_definitions;
      if (args.target_url) payload.target_url = args.target_url;
      if (args.callback_url) payload.callback_url = args.callback_url;
      if (args.callback_secret) payload.callback_secret = args.callback_secret;
      if (args.process) payload.process = args.process;
      if (args.team) payload.team = args.team;

      const result = await agnosticRequest(config, 'post', '/api/v1/crews', payload);
      return (
        checkHttpOk(result, 'Crew run failed') ?? labelledResponse('Crew Started', result.body)
      );
    })
  );

  // ── agnostic_crew_status ────────────────────────────────────────────────

  server.registerTool(
    'agnostic_crew_status',
    {
      description:
        'Get the status of a running or completed crew. Returns status, agent results, ' +
        'and completion data. Use the crew_id from agnostic_run_crew.',
      inputSchema: {
        crew_id: z.string().describe('Crew ID returned by agnostic_run_crew'),
      },
    },
    wrapToolHandler('agnostic_crew_status', middleware, async (args) => {
      const result = await agnosticRequest(
        config,
        'get',
        `/api/v1/crews/${encodeURIComponent(args.crew_id)}`
      );
      return (
        checkHttpOk(result, 'Crew status failed') ??
        labelledResponse(`Crew: ${args.crew_id}`, result.body)
      );
    })
  );

  // ── agnostic_list_presets ───────────────────────────────────────────────

  server.registerTool(
    'agnostic_list_presets',
    {
      description:
        'List available agent crew presets on the Agnostic platform. ' +
        'Presets follow {domain}-{size} naming: quality, software-engineering, design, ' +
        'data-engineering, devops, complete. Sizes: lean (2 agents), standard (3-6), large (extended). ' +
        'Returns agent summaries per preset.',
      inputSchema: {
        domain: z
          .string()
          .optional()
          .describe('Filter presets by domain (e.g. "qa", "data-engineering", "devops")'),
        size: z
          .string()
          .optional()
          .describe('Filter by size: lean, standard, or large'),
      },
    },
    wrapToolHandler('agnostic_list_presets', middleware, async (args) => {
      const params = new URLSearchParams();
      if (args.domain) params.set('domain', args.domain);
      if (args.size) params.set('size', args.size);
      const query = params.toString() ? `?${params.toString()}` : '';
      const result = await agnosticRequest(config, 'get', `/api/v1/presets${query}`);
      return (
        checkHttpOk(result, 'List presets failed') ??
        labelledResponse('Available Presets', result.body)
      );
    })
  );

  // ── agnostic_list_definitions ──────────────────────────────────────────

  server.registerTool(
    'agnostic_list_definitions',
    {
      description:
        'List individual agent definitions available on the Agnostic platform. ' +
        'These are the building blocks for custom crews.',
      inputSchema: {
        domain: z.string().optional().describe('Filter definitions by domain'),
      },
    },
    wrapToolHandler('agnostic_list_definitions', middleware, async (args) => {
      const query = args.domain ? `?domain=${encodeURIComponent(args.domain)}` : '';
      const result = await agnosticRequest(config, 'get', `/api/v1/definitions${query}`);
      return (
        checkHttpOk(result, 'List definitions failed') ??
        labelledResponse('Agent Definitions', result.body)
      );
    })
  );

  // ── agnostic_create_agent ──────────────────────────────────────────────

  server.registerTool(
    'agnostic_create_agent',
    {
      description:
        'Create a new agent definition on the Agnostic platform via A2A. ' +
        'The agent will be available for inclusion in crews and presets.',
      inputSchema: {
        agent_key: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]*$/)
          .describe('Unique agent key (kebab-case, e.g. "my-custom-agent")'),
        name: z.string().describe('Display name for the agent'),
        role: z.string().describe('Agent role description (used as CrewAI role)'),
        goal: z.string().describe('Agent goal (used as CrewAI goal)'),
        backstory: z.string().describe('Agent backstory (used as CrewAI backstory)'),
        domain: z
          .string()
          .default('general')
          .describe('Domain the agent belongs to (e.g. "qa", "data-engineering", "devops")'),
        tools: z
          .array(z.string())
          .default([])
          .describe('Tool names to attach (must be registered in Agnostic tool registry)'),
        from_peer_id: z.string().default('yeoman').describe('Sender peer ID'),
      },
    },
    wrapToolHandler('agnostic_create_agent', middleware, async (args) => {
      const messageId = randomUUID();
      const message = {
        id: messageId,
        type: 'a2a:create_agent',
        fromPeerId: args.from_peer_id,
        toPeerId: 'agnostic',
        payload: {
          agent_key: args.agent_key,
          name: args.name,
          role: args.role,
          goal: args.goal,
          backstory: args.backstory,
          domain: args.domain,
          tools: args.tools,
        },
        timestamp: Date.now(),
      };

      const result = await agnosticRequest(config, 'post', '/api/v1/a2a/receive', message);
      return (
        checkHttpOk(result, 'Agent creation failed') ??
        labelledResponse(`Agent Created: ${args.agent_key} (message_id: ${messageId})`, result.body)
      );
    })
  );

  // ── agnostic_provision_credentials ─────────────────────────────────────

  server.registerTool(
    'agnostic_provision_credentials',
    {
      description:
        'Provision LLM API credentials for Agnostic at runtime. ' +
        'SecureYeoman/AGNOS pushes credentials via A2A when CREDENTIAL_PROVISIONING_ENABLED=true on the Agnostic side. ' +
        'Valid providers: openai, anthropic, google, ollama, lm_studio, custom_local, agnos_gateway.',
      inputSchema: {
        provider: z
          .enum([
            'openai',
            'anthropic',
            'google',
            'ollama',
            'lm_studio',
            'custom_local',
            'agnos_gateway',
          ])
          .describe('LLM provider name'),
        api_key: z.string().describe('The API key or token'),
        base_url: z
          .string()
          .optional()
          .describe('Override base URL for the provider (e.g. custom endpoint)'),
        model: z.string().optional().describe('Default model to use with this credential'),
        expires_in_seconds: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Optional TTL — credential auto-expires after this many seconds'),
        metadata: z
          .record(z.string(), z.string())
          .default({})
          .describe('Optional metadata — e.g. { "scope": "read", "note": "rotated key" }'),
        from_peer_id: z
          .string()
          .default('yeoman')
          .describe('Sender peer ID — identifies this YEOMAN instance'),
      },
    },
    wrapToolHandler('agnostic_provision_credentials', middleware, async (args) => {
      const messageId = randomUUID();
      const payload: Record<string, unknown> = {
        provider: args.provider,
        api_key: args.api_key,
        metadata: args.metadata,
      };
      if (args.base_url) payload.base_url = args.base_url;
      if (args.model) payload.model = args.model;
      if (args.expires_in_seconds) payload.expires_in_seconds = args.expires_in_seconds;

      const message = {
        id: messageId,
        type: 'a2a:provision_credentials',
        fromPeerId: args.from_peer_id,
        toPeerId: 'agnostic',
        payload,
        timestamp: Date.now(),
      };

      const result = await agnosticRequest(config, 'post', '/api/v1/a2a/receive', message);
      return (
        checkHttpOk(result, 'Credential provisioning failed') ??
        labelledResponse(
          `Credentials provisioned for "${args.provider}" (message_id: ${messageId})`,
          result.body
        )
      );
    })
  );

  // ── agnostic_revoke_credentials ──────────────────────────────────────

  server.registerTool(
    'agnostic_revoke_credentials',
    {
      description:
        'Revoke previously provisioned LLM credentials for a provider. ' +
        'Use provider="*" to revoke all. Sends an a2a:revoke_credentials message to Agnostic.',
      inputSchema: {
        provider: z
          .string()
          .default('*')
          .describe('Provider to revoke (e.g. "openai", "anthropic"), or "*" to revoke all'),
        reason: z
          .string()
          .default('rotation')
          .describe('Reason for revocation (e.g. "rotation", "compromised", "decommission")'),
        from_peer_id: z
          .string()
          .default('yeoman')
          .describe('Sender peer ID — identifies this YEOMAN instance'),
      },
    },
    wrapToolHandler('agnostic_revoke_credentials', middleware, async (args) => {
      const messageId = randomUUID();
      const message = {
        id: messageId,
        type: 'a2a:revoke_credentials',
        fromPeerId: args.from_peer_id,
        toPeerId: 'agnostic',
        payload: {
          provider: args.provider,
          reason: args.reason,
        },
        timestamp: Date.now(),
      };

      const result = await agnosticRequest(config, 'post', '/api/v1/a2a/receive', message);
      return (
        checkHttpOk(result, 'Credential revocation failed') ??
        labelledResponse(
          `Credentials revoked for "${args.provider}" (message_id: ${messageId})`,
          result.body
        )
      );
    })
  );

  // ── agnostic_smart_submit ─────────────────────────────────────────────────

  server.registerTool(
    'agnostic_smart_submit',
    {
      description:
        'Submit a task to the best-matching Agnostic crew. Automatically recommends the ' +
        'optimal preset (domain + size) based on your task description, then kicks off the crew. ' +
        'Replaces domain-specific submit tools — works for QA, design, software engineering, ' +
        'data engineering, and DevOps without hardcoding preset names.',
      inputSchema: {
        title: z.string().describe('Short title for the task'),
        description: z
          .string()
          .describe('What to accomplish — the more detail, the better the preset recommendation'),
        target_url: z.string().optional().describe('Target URL (app, repo, PR, etc.)'),
        priority: z
          .enum(['critical', 'high', 'medium', 'low'])
          .default('high')
          .describe('Task priority'),
        domain: z
          .string()
          .optional()
          .describe(
            'Override domain (quality, software-engineering, design, data-engineering, devops). ' +
            'If omitted, auto-recommended from description.'
          ),
        size: z
          .enum(['lean', 'standard', 'large'])
          .default('standard')
          .describe('Crew size — lean (2 agents), standard (3-6), large (extended)'),
        callback_url: z
          .string()
          .url()
          .optional()
          .describe('Webhook URL for completion notification'),
        callback_secret: z
          .string()
          .optional()
          .describe('HMAC-SHA256 secret for webhook signature'),
      },
    },
    wrapToolHandler('agnostic_smart_submit', middleware, async (args) => {
      let domain = args.domain;

      // If no domain specified, ask Agnostic to recommend one
      if (!domain) {
        try {
          const recResult = await agnosticRequest(
            config,
            'post',
            '/api/v1/mcp/invoke',
            {
              tool: 'agnostic_preset_recommend',
              arguments: { description: args.description },
            }
          );
          if (recResult.ok) {
            const rec = recResult.body as Record<string, unknown>;
            const result = rec?.result as Record<string, unknown> | undefined;
            // Extract domain from recommended preset name (e.g. "design-standard" → "design")
            const presetName = (result?.preset ?? '') as string;
            domain = presetName.includes('-')
              ? presetName.slice(0, presetName.lastIndexOf('-'))
              : presetName;
          }
        } catch {
          // Recommendation failed — fall back to complete
        }
      }

      // Build preset name: {domain}-{size}
      const preset = `${domain || 'complete'}-${args.size}`;

      const payload: Record<string, unknown> = {
        title: args.title,
        description: args.description,
        preset,
        priority: args.priority,
      };
      if (args.target_url) payload.target_url = args.target_url;
      if (args.callback_url) payload.callback_url = args.callback_url;
      if (args.callback_secret) payload.callback_secret = args.callback_secret;

      const result = await agnosticRequest(config, 'post', '/api/v1/crews', payload);
      return (
        checkHttpOk(result, 'Smart submit failed') ??
        labelledResponse(`Crew Started (preset: ${preset})`, result.body)
      );
    })
  );

  // ── agnostic_preset_detail ────────────────────────────────────────────────

  server.registerTool(
    'agnostic_preset_detail',
    {
      description:
        'Get full details of an Agnostic preset including all agent definitions, roles, ' +
        'goals, and tool assignments. Use to inspect what a preset does before running it.',
      inputSchema: {
        preset_name: z
          .string()
          .describe('Preset name (e.g. "design-standard", "quality-lean", "software-engineering-large")'),
      },
    },
    wrapToolHandler('agnostic_preset_detail', middleware, async (args) => {
      const result = await agnosticRequest(
        config,
        'get',
        `/api/v1/presets/${encodeURIComponent(args.preset_name)}`
      );
      return (
        checkHttpOk(result, 'Preset detail failed') ??
        labelledResponse(`Preset: ${args.preset_name}`, result.body)
      );
    })
  );

  // ── agnostic_council_review ───────────────────────────────────────────────

  server.registerTool(
    'agnostic_council_review',
    {
      description:
        'Submit Agnostic crew results to a SecureYeoman council for deliberation. ' +
        'The council members review the crew output and produce a consensus decision. ' +
        'Use this to validate crew findings before acting on them.',
      inputSchema: {
        crew_id: z.string().describe('Agnostic crew ID whose results to review'),
        council_template: z
          .string()
          .default('risk-committee')
          .describe('Council template name (e.g. "risk-committee", "incident-response-council")'),
        topic: z.string().optional().describe('Override topic for the council deliberation'),
      },
    },
    wrapToolHandler('agnostic_council_review', middleware, async (args) => {
      // 1. Fetch crew results from Agnostic
      const crewResult = await agnosticRequest(
        config,
        'get',
        `/api/v1/crews/${encodeURIComponent(args.crew_id)}`
      );
      const crewErr = checkHttpOk(crewResult, 'Failed to fetch crew results');
      if (crewErr) return crewErr;

      const crewData = crewResult.body as Record<string, unknown>;
      const status = crewData.status as string;
      if (status !== 'completed' && status !== 'partial') {
        return errorResponse(
          `Crew ${args.crew_id} is "${status}" — council review requires completed or partial results.`
        );
      }

      // 2. Convene a council via the SY core API
      const topic = args.topic ?? `Review crew results: ${(crewData.title as string) ?? args.crew_id}`;
      const context = JSON.stringify(crewData, null, 2);

      try {
        // Use the MCP service's core client to call the council API
        const { globalToolRegistry } = await import('./tool-utils.js');

        // Check if council tools are available
        const conveneHandler = globalToolRegistry.get('council_convene');
        if (!conveneHandler) {
          return errorResponse(
            'Council tools are not available. Ensure councils are enabled in SecureYeoman.'
          );
        }

        const councilResult = await conveneHandler({
          template: args.council_template,
          topic,
          context,
        });

        return labelledResponse(`Council Review of Crew ${args.crew_id}`, {
          crew_id: args.crew_id,
          crew_status: status,
          council_template: args.council_template,
          council_decision: councilResult,
        });
      } catch (err) {
        return errorResponse(
          `Council convocation failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );

  // ── REST API Proxy Tools ────────────────────────────────────────────────
  // Zero-code MCP integration via registerApiProxyTool() for high-value
  // Agnostic endpoints. Uses an adapter that wraps agnosticRequest
  // to implement the CoreApiClient interface.

  const agnosticClient = createAgnosticApiClient(config);
  registerAgnosticProxyTools(server, agnosticClient, middleware);
}

// ── AgnosticApiClient Adapter ───────────────────────────────────────────────

/**
 * Adapts agnosticRequest to the CoreApiClient interface so that
 * registerApiProxyTool() can proxy Agnostic REST endpoints as MCP tools.
 */
function createAgnosticApiClient(config: McpServiceConfig): ICoreApiClient {
  return {
    async get<T = unknown>(path: string, query?: Record<string, string>): Promise<T> {
      let fullPath = path;
      if (query) {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(query)) {
          if (v !== undefined && v !== '') params.set(k, v);
        }
        const qs = params.toString();
        if (qs) fullPath += `?${qs}`;
      }
      const { ok, status, body } = await agnosticRequest(config, 'get', fullPath);
      if (!ok) throw new Error(`Agnostic API error ${status}: ${JSON.stringify(body)}`);
      return body as T;
    },
    async post<T = unknown>(path: string, payload?: unknown): Promise<T> {
      const { ok, status, body } = await agnosticRequest(config, 'post', path, payload);
      if (!ok) throw new Error(`Agnostic API error ${status}: ${JSON.stringify(body)}`);
      return body as T;
    },
    async put<T = unknown>(path: string, payload?: unknown): Promise<T> {
      const { ok, status, body } = await agnosticRequest(config, 'put', path, payload);
      if (!ok) throw new Error(`Agnostic API error ${status}: ${JSON.stringify(body)}`);
      return body as T;
    },
    async delete<T = unknown>(path: string): Promise<T> {
      const { ok, status, body } = await agnosticRequest(config, 'delete', path);
      if (!ok) throw new Error(`Agnostic API error ${status}: ${JSON.stringify(body)}`);
      return body as T;
    },
    async healthCheck(): Promise<boolean> {
      try {
        const res = await fetch(`${config.agnosticUrl}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  } as ICoreApiClient;
}

// ── Proxy Tool Definitions ──────────────────────────────────────────────────

/**
 * Register high-value Agnostic REST endpoints as proxy tools using the
 * registerApiProxyTool() factory — zero-code MCP integration.
 */
function registerAgnosticProxyTools(
  server: McpServer,
  client: ICoreApiClient,
  middleware: ToolMiddleware
): void {
  // Session management
  registerApiProxyTool(server, client, middleware, {
    name: 'agnostic_proxy_sessions',
    description: 'List recent QA sessions with pagination (proxy)',
    inputSchema: {
      limit: z.string().default('20').describe('Max sessions'),
      offset: z.string().default('0').describe('Pagination offset'),
    },
    method: 'get',
    buildPath: () => '/api/sessions',
    buildQuery: (args) => ({ limit: args.limit as string, offset: args.offset as string }),
  });

  // Session search
  registerApiProxyTool(server, client, middleware, {
    name: 'agnostic_proxy_session_search',
    description: 'Search QA sessions by keyword (proxy)',
    inputSchema: {
      q: z.string().describe('Search query'),
      limit: z.string().default('20').describe('Max results'),
    },
    method: 'get',
    buildPath: () => '/api/sessions/search',
    buildQuery: (args) => ({ q: args.q as string, limit: args.limit as string }),
  });

  // Task management
  registerApiProxyTool(server, client, middleware, {
    name: 'agnostic_proxy_task_list',
    description: 'List all QA tasks with status (proxy)',
    inputSchema: {},
    method: 'get',
    buildPath: () => '/api/tasks',
  });

  // Agent status
  registerApiProxyTool(server, client, middleware, {
    name: 'agnostic_proxy_agent_detail',
    description: 'Get detailed status for a specific agent (proxy)',
    inputSchema: {
      agent_name: z.string().describe('Agent name (e.g. security-compliance, performance)'),
    },
    method: 'get',
    buildPath: (args) => `/api/agents/${encodeURIComponent(args.agent_name as string)}`,
  });

  // Agent registration status
  registerApiProxyTool(server, client, middleware, {
    name: 'agnostic_proxy_agent_registration',
    description: 'Get agent registry status — which agents are registered and active (proxy)',
    inputSchema: {},
    method: 'get',
    buildPath: () => '/api/agents/registration-status',
  });

  // Dashboard overview
  registerApiProxyTool(server, client, middleware, {
    name: 'agnostic_proxy_dashboard_overview',
    description: 'Get full dashboard overview including active sessions and agent status (proxy)',
    inputSchema: {},
    method: 'get',
    buildPath: () => '/api/dashboard',
  });

  // LLM gateway health
  registerApiProxyTool(server, client, middleware, {
    name: 'agnostic_proxy_llm_gateway',
    description: 'Check AGNOS LLM Gateway health and status (proxy)',
    inputSchema: {},
    method: 'get',
    buildPath: () => '/api/dashboard/llm-gateway',
  });

  // Reports listing
  registerApiProxyTool(server, client, middleware, {
    name: 'agnostic_proxy_reports',
    description: 'List available QA reports (proxy)',
    inputSchema: {},
    method: 'get',
    buildPath: () => '/api/reports',
  });

  // Alerts
  registerApiProxyTool(server, client, middleware, {
    name: 'agnostic_proxy_alerts',
    description: 'Query recent system alerts with optional severity filter (proxy)',
    inputSchema: {
      limit: z.string().default('50').describe('Max alerts'),
      severity: z.string().optional().describe('Filter by severity'),
    },
    method: 'get',
    buildPath: () => '/api/alerts',
    buildQuery: (args) => {
      const q: Record<string, string> = { limit: args.limit as string };
      if (args.severity) q.severity = args.severity as string;
      return q;
    },
  });
}
