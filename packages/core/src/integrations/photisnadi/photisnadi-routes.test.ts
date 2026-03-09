/**
 * Photisnadi Routes — unit tests
 *
 * Tests the Fastify route handlers for the Photisnadi dashboard proxy:
 *   GET /api/v1/integrations/photisnadi/widget
 *   GET /api/v1/integrations/photisnadi/health
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { registerPhotisnadiRoutes } from './photisnadi-routes.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

async function buildApp() {
  const app = Fastify({ logger: false });
  registerPhotisnadiRoutes(app);
  await app.ready();
  return app;
}

// ─── env helpers ──────────────────────────────────────────────────────────────

function setPhotisnadiEnv() {
  process.env.PHOTISNADI_SUPABASE_URL = 'https://example.supabase.co';
  process.env.PHOTISNADI_SUPABASE_KEY = 'test-key';
  process.env.PHOTISNADI_USER_ID = 'user-123';
}

function clearPhotisnadiEnv() {
  delete process.env.PHOTISNADI_SUPABASE_URL;
  delete process.env.PHOTISNADI_SUPABASE_KEY;
  delete process.env.PHOTISNADI_USER_ID;
}

// ─── sample data ──────────────────────────────────────────────────────────────

const now = new Date();
const yesterday = new Date(now.getTime() - 86_400_000);
const twoWeeksAgo = new Date(now.getTime() - 14 * 86_400_000);

const sampleTasks = [
  {
    id: '1',
    title: 'Task A',
    status: 'todo',
    priority: 'high',
    due_date: yesterday.toISOString(),
    modified_at: now.toISOString(),
  },
  {
    id: '2',
    title: 'Task B',
    status: 'inProgress',
    priority: 'medium',
    due_date: null,
    modified_at: now.toISOString(),
  },
  {
    id: '3',
    title: 'Task C',
    status: 'done',
    priority: 'low',
    due_date: null,
    modified_at: now.toISOString(),
  },
  {
    id: '4',
    title: 'Task D',
    status: 'done',
    priority: 'high',
    due_date: null,
    modified_at: twoWeeksAgo.toISOString(),
  },
  {
    id: '5',
    title: 'Task E',
    status: 'blocked',
    priority: 'medium',
    due_date: yesterday.toISOString(),
    modified_at: now.toISOString(),
  },
];

const sampleRituals = [
  { id: 'r1', frequency: 'daily', created_at: now.toISOString() },
  { id: 'r2', frequency: 'daily', created_at: now.toISOString() },
  { id: 'r3', frequency: 'weekly', created_at: now.toISOString() },
  { id: 'r4', frequency: 'monthly', created_at: now.toISOString() },
];

// ─── tests ────────────────────────────────────────────────────────────────────

describe('Photisnadi Routes', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    clearPhotisnadiEnv();
  });

  // ── Widget endpoint ─────────────────────────────────────────────────

  describe('GET /api/v1/integrations/photisnadi/widget', () => {
    it('returns 401 when not configured', async () => {
      clearPhotisnadiEnv();
      const app = await buildApp();

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/photisnadi/widget',
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.message).toContain('Photisnadi not configured');

      await app.close();
    });

    it('returns aggregated widget data on success', async () => {
      setPhotisnadiEnv();
      // First call → tasks, second call → rituals
      mockFetch
        .mockResolvedValueOnce(jsonResponse(sampleTasks))
        .mockResolvedValueOnce(jsonResponse(sampleRituals));

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/photisnadi/widget',
      });
      expect(res.statusCode).toBe(200);

      const body = res.json();

      // Task totals
      expect(body.tasks.total).toBe(5);
      expect(body.tasks.statusCounts.todo).toBe(1);
      expect(body.tasks.statusCounts.inProgress).toBe(1);
      expect(body.tasks.statusCounts.done).toBe(2);
      expect(body.tasks.statusCounts.blocked).toBe(1);
      expect(body.tasks.statusCounts.inReview).toBe(0);

      // Priority counts
      expect(body.tasks.priorityCounts.high).toBe(2);
      expect(body.tasks.priorityCounts.medium).toBe(2);
      expect(body.tasks.priorityCounts.low).toBe(1);

      // Overdue: Task A (todo, past due) and Task E (blocked, past due)
      expect(body.tasks.overdue).toBe(2);

      // Completed this week: Task C (done, modified now) — Task D is too old
      expect(body.tasks.completedThisWeek).toBe(1);

      // Rituals
      expect(body.rituals.total).toBe(4);
      expect(body.rituals.byCounts.daily).toBe(2);
      expect(body.rituals.byCounts.weekly).toBe(1);
      expect(body.rituals.byCounts.monthly).toBe(1);

      // Recent activity (first 5)
      expect(body.recentActivity).toHaveLength(5);
      expect(body.recentActivity[0].id).toBe('1');
      expect(body.recentActivity[0].modifiedAt).toBe(now.toISOString());

      await app.close();
    });

    it('returns 502 when Supabase request fails', async () => {
      setPhotisnadiEnv();
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/photisnadi/widget',
      });
      expect(res.statusCode).toBe(502);
      const body = res.json();
      expect(body.message).toContain('Photisnadi error');

      await app.close();
    });

    it('handles empty task and ritual lists', async () => {
      setPhotisnadiEnv();
      mockFetch.mockResolvedValueOnce(jsonResponse([])).mockResolvedValueOnce(jsonResponse([]));

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/photisnadi/widget',
      });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.tasks.total).toBe(0);
      expect(body.tasks.overdue).toBe(0);
      expect(body.tasks.completedThisWeek).toBe(0);
      expect(body.rituals.total).toBe(0);
      expect(body.recentActivity).toHaveLength(0);

      await app.close();
    });

    it('ignores tasks with unknown status or priority', async () => {
      setPhotisnadiEnv();
      const weirdTasks = [
        {
          id: '1',
          title: 'X',
          status: 'unknownStatus',
          priority: 'unknownPriority',
          due_date: null,
          modified_at: now.toISOString(),
        },
      ];
      mockFetch
        .mockResolvedValueOnce(jsonResponse(weirdTasks))
        .mockResolvedValueOnce(jsonResponse([]));

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/photisnadi/widget',
      });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      // Unknown statuses should not be counted
      expect(body.tasks.statusCounts.todo).toBe(0);
      expect(body.tasks.statusCounts.inProgress).toBe(0);
      expect(body.tasks.priorityCounts.high).toBe(0);
      expect(body.tasks.total).toBe(1);

      await app.close();
    });
  });

  // ── Health endpoint ─────────────────────────────────────────────────

  describe('GET /api/v1/integrations/photisnadi/health', () => {
    it('returns 503 when not configured', async () => {
      clearPhotisnadiEnv();
      const app = await buildApp();

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/photisnadi/health',
      });
      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.ok).toBe(false);
      expect(body.message).toBe('Not configured');

      await app.close();
    });

    it('returns ok:true on successful connectivity', async () => {
      setPhotisnadiEnv();
      mockFetch.mockResolvedValueOnce(jsonResponse([{ id: '1' }]));

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/photisnadi/health',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });

      await app.close();
    });

    it('returns 502 on connection error', async () => {
      setPhotisnadiEnv();
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/photisnadi/health',
      });
      expect(res.statusCode).toBe(502);
      const body = res.json();
      expect(body.ok).toBe(false);
      expect(body.message).toContain('Connection refused');

      await app.close();
    });
  });
});
