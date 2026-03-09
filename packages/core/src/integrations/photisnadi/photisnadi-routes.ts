/**
 * Photisnadi Routes — Dashboard widget data proxy.
 *
 * Proxies Supabase REST queries so the dashboard widget can display
 * task counts, ritual streaks, and recent activity without needing
 * direct Supabase credentials on the client side.
 */

import type { FastifyInstance } from 'fastify';
import { sendError, toErrorMessage } from '../../utils/errors.js';

interface PhotisnadiConfig {
  supabaseUrl: string;
  supabaseKey: string;
  userId: string;
}

function getPhotisnadiConfig(): PhotisnadiConfig | null {
  const supabaseUrl = process.env.PHOTISNADI_SUPABASE_URL;
  const supabaseKey = process.env.PHOTISNADI_SUPABASE_KEY;
  const userId = process.env.PHOTISNADI_USER_ID;
  if (!supabaseUrl || !supabaseKey || !userId) return null;
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ''), supabaseKey, userId };
}

async function supabaseQuery(
  config: PhotisnadiConfig,
  table: string,
  queryParams: string = ''
): Promise<unknown> {
  const url = `${config.supabaseUrl}/rest/v1/${table}?${queryParams}`;
  const res = await fetch(url, {
    headers: {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.supabaseKey}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase error: HTTP ${res.status}`);
  return await res.json();
}

export function registerPhotisnadiRoutes(app: FastifyInstance): void {
  // GET /api/v1/integrations/photisnadi/widget — aggregated widget data
  app.get('/api/v1/integrations/photisnadi/widget', async (_req, reply) => {
    const config = getPhotisnadiConfig();
    if (!config) {
      return sendError(
        reply,
        401,
        'Photisnadi not configured. Set PHOTISNADI_SUPABASE_URL, PHOTISNADI_SUPABASE_KEY, and PHOTISNADI_USER_ID.'
      );
    }

    try {
      const [tasks, rituals] = await Promise.all([
        supabaseQuery(
          config,
          'tasks',
          `user_id=eq.${config.userId}&select=id,title,status,priority,due_date,modified_at&order=modified_at.desc&limit=50`
        ) as Promise<any[]>,
        supabaseQuery(
          config,
          'rituals',
          `user_id=eq.${config.userId}&select=id,frequency,created_at`
        ) as Promise<any[]>,
      ]);

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

      // Status counts
      const statusCounts: Record<string, number> = {
        todo: 0,
        inProgress: 0,
        inReview: 0,
        blocked: 0,
        done: 0,
      };
      let overdue = 0;
      const recentlyCompleted: typeof tasks = [];

      for (const t of tasks) {
        const st: string | undefined = t.status;
        if (st && statusCounts[st] !== undefined) {
          statusCounts[st]++;
        }
        if (t.status !== 'done' && t.due_date && new Date(t.due_date) < now) {
          overdue++;
        }
        if (t.status === 'done' && t.modified_at && new Date(t.modified_at) >= weekAgo) {
          recentlyCompleted.push(t);
        }
      }

      // Priority counts
      const priorityCounts: Record<string, number> = { low: 0, medium: 0, high: 0 };
      for (const t of tasks) {
        const pr: string | undefined = t.priority;
        if (pr && priorityCounts[pr] !== undefined) {
          priorityCounts[pr]++;
        }
      }

      // Ritual counts by frequency
      const ritualCounts: Record<string, number> = { daily: 0, weekly: 0, monthly: 0 };
      for (const r of rituals) {
        const freq: string | undefined = r.frequency;
        if (freq && ritualCounts[freq] !== undefined) {
          ritualCounts[freq]++;
        }
      }

      // Recent activity (last 5 modified tasks)
      const recentActivity = tasks.slice(0, 5).map((t: any) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        modifiedAt: t.modified_at,
      }));

      return reply.send({
        tasks: {
          total: tasks.length,
          statusCounts,
          priorityCounts,
          overdue,
          completedThisWeek: recentlyCompleted.length,
        },
        rituals: {
          total: rituals.length,
          byCounts: ritualCounts,
        },
        recentActivity,
      });
    } catch (err) {
      return sendError(reply, 502, `Photisnadi error: ${toErrorMessage(err)}`);
    }
  });

  // GET /api/v1/integrations/photisnadi/health — connectivity check
  app.get('/api/v1/integrations/photisnadi/health', async (_req, reply) => {
    const config = getPhotisnadiConfig();
    if (!config) {
      return reply.code(503).send({ ok: false, message: 'Not configured' });
    }

    try {
      await supabaseQuery(config, 'tasks', `user_id=eq.${config.userId}&select=id&limit=1`);
      return reply.send({ ok: true });
    } catch (err) {
      return reply.code(502).send({ ok: false, message: toErrorMessage(err) });
    }
  });
}
