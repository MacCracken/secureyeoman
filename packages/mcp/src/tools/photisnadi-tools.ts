/**
 * Photisnadi Tools — Task management & ritual tracking integration for MCP.
 *
 * Wraps Photisnadi's Supabase-backed API as MCP tools so any MCP client
 * can query tasks, rituals, and analytics through natural language.
 *
 * ## Configuration
 *   MCP_EXPOSE_PHOTISNADI_TOOLS=true
 *   PHOTISNADI_SUPABASE_URL    – Supabase project URL
 *   PHOTISNADI_SUPABASE_KEY    – Supabase service role key
 *   PHOTISNADI_USER_ID         – Photis user ID
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import {
  wrapToolHandler,
  jsonResponse,
  textResponse,
  registerDisabledStub,
  createHttpClient,
} from './tool-utils.js';

const DISABLED_MSG =
  'Photisnadi tools are disabled. Set MCP_EXPOSE_PHOTISNADI_TOOLS=true to enable.';

const NO_SUPABASE_MSG =
  'Photisnadi Supabase backend is not configured. Set PHOTISNADI_SUPABASE_URL, PHOTISNADI_SUPABASE_KEY, and PHOTISNADI_USER_ID to enable backend task/ritual access. ' +
  'Photisnadi can still be used via its web UI without Supabase.';

function getSupabaseConfig(): { url: string; key: string; userId: string } | null {
  const url = process.env.PHOTISNADI_SUPABASE_URL;
  const key = process.env.PHOTISNADI_SUPABASE_KEY;
  const userId = process.env.PHOTISNADI_USER_ID;
  if (!url || !key || !userId) return null;
  return { url: url.replace(/\/$/, ''), key, userId };
}

function createSupabaseClient(sb: { url: string; key: string }) {
  return createHttpClient(sb.url + '/rest/v1', {
    apikey: sb.key,
    Authorization: `Bearer ${sb.key}`,
    Prefer: 'return=representation',
  });
}

export function registerPhotisnadiTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  if (!config.exposePhotisnadiTools) {
    registerDisabledStub(server, middleware, 'photisnadi_status', DISABLED_MSG);
    return;
  }

  // ── List Tasks ────────────────────────────────────────────────────────────

  server.registerTool(
    'photisnadi_list_tasks',
    {
      description:
        'List tasks from Photisnadi task manager. Filter by project, status, or priority. ' +
        'Returns tasks with status, priority, due dates, tags, and dependencies.',
      inputSchema: {
        project_id: z.string().uuid().optional().describe('Filter by project UUID'),
        status: z
          .enum(['todo', 'inProgress', 'inReview', 'blocked', 'done'])
          .optional()
          .describe('Filter by task status'),
        priority: z.enum(['low', 'medium', 'high']).optional().describe('Filter by priority level'),
        limit: z.number().int().min(1).max(200).optional().describe('Max results (default 50)'),
      },
    },
    wrapToolHandler('photisnadi_list_tasks', middleware, async (args) => {
      const sb = getSupabaseConfig();
      if (!sb) return textResponse(NO_SUPABASE_MSG);

      const client = createSupabaseClient(sb);
      const params = [`user_id=eq.${sb.userId}`, 'order=modified_at.desc'];
      if (args.project_id) params.push(`project_id=eq.${args.project_id}`);
      if (args.status) params.push(`status=eq.${args.status}`);
      if (args.priority) params.push(`priority=eq.${args.priority}`);
      params.push(`limit=${args.limit ?? 50}`);

      const res = await client.get(`/tasks?${params.join('&')}`);
      if (!res.ok)
        throw new Error(
          `Photisnadi Supabase error (HTTP ${res.status}): ${JSON.stringify(res.body)}`
        );
      return jsonResponse(res.body);
    })
  );

  // ── Create Task ───────────────────────────────────────────────────────────

  server.registerTool(
    'photisnadi_create_task',
    {
      description:
        'Create a new task in Photisnadi. Specify title, optional description, project, ' +
        'priority, status, due date, and tags.',
      inputSchema: {
        title: z.string().min(1).max(500).describe('Task title'),
        description: z.string().max(5000).optional().describe('Task description'),
        project_id: z.string().uuid().optional().describe('Project UUID to assign to'),
        priority: z
          .enum(['low', 'medium', 'high'])
          .optional()
          .describe('Priority level (default: medium)'),
        status: z
          .enum(['todo', 'inProgress', 'inReview', 'blocked', 'done'])
          .optional()
          .describe('Initial status (default: todo)'),
        due_date: z.string().optional().describe('Due date in ISO 8601 format'),
        tags: z.array(z.string().max(50)).max(10).optional().describe('Tags for categorization'),
      },
    },
    wrapToolHandler('photisnadi_create_task', middleware, async (args) => {
      const sb = getSupabaseConfig();
      if (!sb) return textResponse(NO_SUPABASE_MSG);

      const client = createSupabaseClient(sb);
      const task: Record<string, unknown> = {
        user_id: sb.userId,
        title: args.title,
        status: args.status ?? 'todo',
        priority: args.priority ?? 'medium',
      };
      if (args.description) task.description = args.description;
      if (args.project_id) task.project_id = args.project_id;
      if (args.due_date) task.due_date = args.due_date;
      if (args.tags) task.tags = args.tags;

      const res = await client.post('/tasks', task);
      if (!res.ok)
        throw new Error(
          `Photisnadi Supabase error (HTTP ${res.status}): ${JSON.stringify(res.body)}`
        );
      return jsonResponse(res.body);
    })
  );

  // ── Update Task ───────────────────────────────────────────────────────────

  server.registerTool(
    'photisnadi_update_task',
    {
      description:
        'Update an existing Photisnadi task. Change status, priority, title, description, ' +
        'due date, or tags by task ID.',
      inputSchema: {
        task_id: z.string().uuid().describe('Task UUID to update'),
        title: z.string().min(1).max(500).optional().describe('New title'),
        description: z.string().max(5000).optional().describe('New description'),
        status: z
          .enum(['todo', 'inProgress', 'inReview', 'blocked', 'done'])
          .optional()
          .describe('New status'),
        priority: z.enum(['low', 'medium', 'high']).optional().describe('New priority'),
        due_date: z.string().optional().describe('New due date (ISO 8601)'),
        tags: z.array(z.string().max(50)).max(10).optional().describe('New tags'),
      },
    },
    wrapToolHandler('photisnadi_update_task', middleware, async (args) => {
      const sb = getSupabaseConfig();
      if (!sb) return textResponse(NO_SUPABASE_MSG);

      const client = createSupabaseClient(sb);
      const updates: Record<string, unknown> = { modified_at: new Date().toISOString() };
      if (args.title !== undefined) updates.title = args.title;
      if (args.description !== undefined) updates.description = args.description;
      if (args.status !== undefined) updates.status = args.status;
      if (args.priority !== undefined) updates.priority = args.priority;
      if (args.due_date !== undefined) updates.due_date = args.due_date;
      if (args.tags !== undefined) updates.tags = args.tags;

      const query = `id=eq.${args.task_id}&user_id=eq.${sb.userId}`;
      const res = await client.patch(`/tasks?${query}`, updates);
      if (!res.ok)
        throw new Error(
          `Photisnadi Supabase error (HTTP ${res.status}): ${JSON.stringify(res.body)}`
        );
      return jsonResponse(res.body);
    })
  );

  // ── List Rituals ──────────────────────────────────────────────────────────

  server.registerTool(
    'photisnadi_get_rituals',
    {
      description:
        'List rituals (recurring habits) from Photisnadi. Shows completion status, ' +
        'streak counts, and frequency. Use to track daily habits and routines.',
      inputSchema: {
        frequency: z
          .enum(['daily', 'weekly', 'monthly'])
          .optional()
          .describe('Filter by ritual frequency'),
      },
    },
    wrapToolHandler('photisnadi_get_rituals', middleware, async (args) => {
      const sb = getSupabaseConfig();
      if (!sb) return textResponse(NO_SUPABASE_MSG);

      const client = createSupabaseClient(sb);
      const params = [`user_id=eq.${sb.userId}`, 'order=created_at.asc'];
      if (args.frequency) params.push(`frequency=eq.${args.frequency}`);

      const res = await client.get(`/rituals?${params.join('&')}`);
      if (!res.ok)
        throw new Error(
          `Photisnadi Supabase error (HTTP ${res.status}): ${JSON.stringify(res.body)}`
        );
      return jsonResponse(res.body);
    })
  );

  // ── Task Analytics ────────────────────────────────────────────────────────

  server.registerTool(
    'photisnadi_analytics',
    {
      description:
        'Get task analytics from Photisnadi: status distribution, priority breakdown, ' +
        'overdue count, blocked tasks, and tasks completed this week.',
      inputSchema: {},
    },
    wrapToolHandler('photisnadi_analytics', middleware, async () => {
      const sb = getSupabaseConfig();
      if (!sb) return textResponse(NO_SUPABASE_MSG);

      const client = createSupabaseClient(sb);
      const res = await client.get(
        `/tasks?user_id=eq.${sb.userId}&select=status,priority,due_date`
      );
      if (!res.ok)
        throw new Error(
          `Photisnadi Supabase error (HTTP ${res.status}): ${JSON.stringify(res.body)}`
        );
      const tasks = res.body as { status: string; priority: string; due_date: string | null }[];

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86400000);

      const statusCounts: Record<string, number> = {};
      const priorityCounts: Record<string, number> = {};
      let overdue = 0;
      let blocked = 0;

      for (const t of tasks) {
        statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
        priorityCounts[t.priority] = (priorityCounts[t.priority] ?? 0) + 1;
        if (t.status === 'blocked') blocked++;
        if (t.due_date && new Date(t.due_date) < now && t.status !== 'done') overdue++;
      }

      const completedThisWeek = tasks.filter(
        (t) => t.status === 'done' && t.due_date && new Date(t.due_date) >= weekAgo
      ).length;

      const analytics = {
        total: tasks.length,
        statusDistribution: statusCounts,
        priorityBreakdown: priorityCounts,
        overdue,
        blocked,
        completedThisWeek,
      };

      return jsonResponse(analytics);
    })
  );

  // ── Sync Status ───────────────────────────────────────────────────────────

  server.registerTool(
    'photisnadi_sync',
    {
      description:
        'Check Photisnadi connection status and get a summary of tasks and rituals. ' +
        'Useful to verify the integration is working.',
      inputSchema: {},
    },
    wrapToolHandler('photisnadi_sync', middleware, async () => {
      const sb = getSupabaseConfig();

      // Check Photisnadi web UI availability (raw fetch — one-off HEAD check)
      let webUiStatus: string;
      try {
        const uiRes = await fetch('http://photisnadi:8080/', {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000),
        });
        webUiStatus = uiRes.ok ? 'reachable' : `HTTP ${uiRes.status}`;
      } catch {
        webUiStatus = 'unreachable';
      }

      if (!sb) {
        return jsonResponse({
          status: 'partial',
          webUi: webUiStatus,
          supabase: 'not configured',
          message: NO_SUPABASE_MSG,
          syncedAt: new Date().toISOString(),
        });
      }

      const client = createSupabaseClient(sb);
      const [tasksRes, ritualsRes] = await Promise.all([
        client.get(`/tasks?user_id=eq.${sb.userId}&select=id`),
        client.get(`/rituals?user_id=eq.${sb.userId}&select=id`),
      ]);
      if (!tasksRes.ok)
        throw new Error(
          `Photisnadi Supabase error (HTTP ${tasksRes.status}): ${JSON.stringify(tasksRes.body)}`
        );
      if (!ritualsRes.ok)
        throw new Error(
          `Photisnadi Supabase error (HTTP ${ritualsRes.status}): ${JSON.stringify(ritualsRes.body)}`
        );
      const tasks = tasksRes.body as unknown[];
      const rituals = ritualsRes.body as unknown[];

      return jsonResponse({
        status: 'connected',
        webUi: webUiStatus,
        supabaseUrl: sb.url,
        taskCount: tasks.length,
        ritualCount: rituals.length,
        syncedAt: new Date().toISOString(),
      });
    })
  );
}
