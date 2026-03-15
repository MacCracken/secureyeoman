import { vi, describe, it, expect, beforeEach } from 'vitest';
import type {
  MemoryAuditReport,
  MemoryHealthMetrics,
  MemoryAuditScope,
} from '@secureyeoman/shared';

vi.mock('../../utils/errors.js', () => ({
  toErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
  sendError: vi.fn((_reply: unknown, status: number, msg: string) => {
    return { error: msg, statusCode: status, message: msg };
  }),
}));

import { registerAuditRoutes, rateLimitWindows } from './audit-routes.js';
import { sendError } from '../../utils/errors.js';

// ── Mock Fastify app and route capture ────────────────────────

type Handler = (req: unknown, reply: unknown) => Promise<unknown>;

const routes: Record<string, Record<string, Handler>> = {};

function makeMockApp() {
  const register = (method: string) =>
    vi.fn((path: string, handler: Handler) => {
      routes[path] = routes[path] ?? {};
      routes[path][method] = handler;
    });

  return {
    get: register('GET'),
    post: register('POST'),
    put: register('PUT'),
  };
}

function makeReply() {
  let sentStatus = 200;
  let sentBody: unknown = undefined;
  const reply = {
    code: (n: number) => {
      sentStatus = n;
      return reply;
    },
    send: (b: unknown) => {
      sentBody = b;
      return reply;
    },
    get sentStatus() {
      return sentStatus;
    },
    get sentBody() {
      return sentBody;
    },
  };
  return reply;
}

async function callRoute(
  method: string,
  path: string,
  opts?: {
    query?: Record<string, string>;
    params?: Record<string, string>;
    body?: unknown;
  }
) {
  const handler = routes[path]?.[method];
  if (!handler) throw new Error(`No handler for ${method} ${path}`);

  const reply = makeReply();
  const request = {
    query: opts?.query ?? {},
    params: opts?.params ?? {},
    body: opts?.body ?? {},
  };

  const result = await handler(request, reply);
  return result;
}

// ── Mock scheduler and storage ────────────────────────────────

function makeMockReport(overrides: Partial<MemoryAuditReport> = {}): MemoryAuditReport {
  return {
    id: 'rpt-1',
    tenantId: 'default',
    personalityId: null,
    scope: 'daily',
    startedAt: 1000,
    completedAt: 2000,
    preSnapshot: null,
    postSnapshot: null,
    compressionSummary: null,
    reorganizationSummary: null,
    maintenanceSummary: null,
    status: 'completed',
    approvedBy: null,
    approvedAt: null,
    error: null,
    ...overrides,
  };
}

function makeMockHealthMetrics(overrides: Partial<MemoryHealthMetrics> = {}): MemoryHealthMetrics {
  return {
    healthScore: 85,
    totalMemories: 120,
    totalKnowledge: 30,
    avgImportance: 0.65,
    expiringWithin7Days: 3,
    lowImportanceRatio: 0.1,
    duplicateEstimate: 0,
    lastAuditAt: 1000,
    lastAuditScope: 'daily',
    compressionSavings: 5,
    ...overrides,
  };
}

let mockScheduler: {
  runManualAudit: ReturnType<typeof vi.fn>;
  getSchedules: ReturnType<typeof vi.fn>;
  setSchedule: ReturnType<typeof vi.fn>;
};

let mockStorage: {
  listReports: ReturnType<typeof vi.fn>;
  getReport: ReturnType<typeof vi.fn>;
  approveReport: ReturnType<typeof vi.fn>;
  getHealthMetrics: ReturnType<typeof vi.fn>;
};

// ── Tests ─────────────────────────────────────────────────────

describe('registerAuditRoutes', () => {
  beforeEach(() => {
    // Clear routes and rate limiter between tests
    for (const key of Object.keys(routes)) delete routes[key];
    rateLimitWindows.clear();

    mockScheduler = {
      runManualAudit: vi.fn(),
      getSchedules: vi.fn(),
      setSchedule: vi.fn(),
    };

    mockStorage = {
      listReports: vi.fn(),
      getReport: vi.fn(),
      approveReport: vi.fn(),
      getHealthMetrics: vi.fn(),
    };

    vi.mocked(sendError).mockClear();

    const app = makeMockApp();
    registerAuditRoutes(app as never, {
      auditScheduler: mockScheduler as never,
      auditStorage: mockStorage as never,
    });
  });

  // ── Route registration ────────────────────────────────────

  it('registers POST /api/v1/brain/audit/run', () => {
    expect(routes['/api/v1/brain/audit/run']?.POST).toBeDefined();
  });

  it('registers GET /api/v1/brain/audit/reports', () => {
    expect(routes['/api/v1/brain/audit/reports']?.GET).toBeDefined();
  });

  it('registers GET /api/v1/brain/audit/reports/:id', () => {
    expect(routes['/api/v1/brain/audit/reports/:id']?.GET).toBeDefined();
  });

  it('registers POST /api/v1/brain/audit/reports/:id/approve', () => {
    expect(routes['/api/v1/brain/audit/reports/:id/approve']?.POST).toBeDefined();
  });

  it('registers GET /api/v1/brain/audit/schedule', () => {
    expect(routes['/api/v1/brain/audit/schedule']?.GET).toBeDefined();
  });

  it('registers PUT /api/v1/brain/audit/schedule', () => {
    expect(routes['/api/v1/brain/audit/schedule']?.PUT).toBeDefined();
  });

  it('registers GET /api/v1/brain/audit/health', () => {
    expect(routes['/api/v1/brain/audit/health']?.GET).toBeDefined();
  });

  // ── POST /run ─────────────────────────────────────────────

  describe('POST /api/v1/brain/audit/run', () => {
    it('triggers audit with default scope when no body provided', async () => {
      const report = makeMockReport();
      mockScheduler.runManualAudit.mockResolvedValue(report);

      const result = await callRoute('POST', '/api/v1/brain/audit/run');
      expect(result).toEqual({ report });
      expect(mockScheduler.runManualAudit).toHaveBeenCalledWith('daily', undefined);
    });

    it('uses provided scope and personalityId', async () => {
      const report = makeMockReport({ scope: 'weekly', personalityId: 'p-1' });
      mockScheduler.runManualAudit.mockResolvedValue(report);

      const result = await callRoute('POST', '/api/v1/brain/audit/run', {
        body: { scope: 'weekly', personalityId: 'p-1' },
      });
      expect(result).toEqual({ report });
      expect(mockScheduler.runManualAudit).toHaveBeenCalledWith('weekly', 'p-1');
    });

    it('uses monthly scope', async () => {
      const report = makeMockReport({ scope: 'monthly' });
      mockScheduler.runManualAudit.mockResolvedValue(report);

      const result = await callRoute('POST', '/api/v1/brain/audit/run', {
        body: { scope: 'monthly' },
      });
      expect(result).toEqual({ report });
      expect(mockScheduler.runManualAudit).toHaveBeenCalledWith('monthly', undefined);
    });

    it('rejects invalid scope', async () => {
      const _result = await callRoute('POST', '/api/v1/brain/audit/run', {
        body: { scope: 'hourly' },
      });
      expect(sendError).toHaveBeenCalledWith(
        expect.anything(),
        400,
        'Scope must be daily, weekly, or monthly'
      );
      expect(mockScheduler.runManualAudit).not.toHaveBeenCalled();
    });

    it('returns 500 on engine error', async () => {
      mockScheduler.runManualAudit.mockRejectedValue(new Error('Engine failure'));

      const _result = await callRoute('POST', '/api/v1/brain/audit/run', {
        body: { scope: 'daily' },
      });
      expect(sendError).toHaveBeenCalledWith(expect.anything(), 500, 'Engine failure');
    });

    it('returns 500 with non-Error thrown value', async () => {
      mockScheduler.runManualAudit.mockRejectedValue('string error');

      await callRoute('POST', '/api/v1/brain/audit/run', {
        body: { scope: 'daily' },
      });
      expect(sendError).toHaveBeenCalledWith(expect.anything(), 500, 'string error');
    });

    it('rate limits after 3 calls within a minute', async () => {
      const report = makeMockReport();
      mockScheduler.runManualAudit.mockResolvedValue(report);

      // First 3 should succeed
      for (let i = 0; i < 3; i++) {
        await callRoute('POST', '/api/v1/brain/audit/run');
      }
      expect(mockScheduler.runManualAudit).toHaveBeenCalledTimes(3);

      // 4th should be rate limited
      const _result = await callRoute('POST', '/api/v1/brain/audit/run');
      expect(sendError).toHaveBeenCalledWith(
        expect.anything(),
        429,
        'Rate limit exceeded for audit runs'
      );
      expect(mockScheduler.runManualAudit).toHaveBeenCalledTimes(3);
    });
  });

  // ── GET /reports ──────────────────────────────────────────

  describe('GET /api/v1/brain/audit/reports', () => {
    it('lists reports with default options', async () => {
      const reports = [makeMockReport()];
      mockStorage.listReports.mockResolvedValue(reports);

      const result = await callRoute('GET', '/api/v1/brain/audit/reports');
      expect(result).toEqual({ reports });
      expect(mockStorage.listReports).toHaveBeenCalledWith({
        scope: undefined,
        personalityId: undefined,
        status: undefined,
        limit: 50,
        offset: 0,
      });
    });

    it('passes filter params', async () => {
      mockStorage.listReports.mockResolvedValue([]);

      await callRoute('GET', '/api/v1/brain/audit/reports', {
        query: {
          scope: 'weekly',
          personalityId: 'p-1',
          status: 'completed',
          limit: '10',
          offset: '5',
        },
      });
      expect(mockStorage.listReports).toHaveBeenCalledWith({
        scope: 'weekly',
        personalityId: 'p-1',
        status: 'completed',
        limit: 10,
        offset: 5,
      });
    });

    it('caps limit at 200', async () => {
      mockStorage.listReports.mockResolvedValue([]);

      await callRoute('GET', '/api/v1/brain/audit/reports', {
        query: { limit: '999' },
      });
      expect(mockStorage.listReports).toHaveBeenCalledWith(expect.objectContaining({ limit: 200 }));
    });

    it('returns empty array when no reports exist', async () => {
      mockStorage.listReports.mockResolvedValue([]);

      const result = await callRoute('GET', '/api/v1/brain/audit/reports');
      expect(result).toEqual({ reports: [] });
    });

    it('filters by scope only', async () => {
      mockStorage.listReports.mockResolvedValue([]);

      await callRoute('GET', '/api/v1/brain/audit/reports', {
        query: { scope: 'monthly' },
      });
      expect(mockStorage.listReports).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'monthly', personalityId: undefined })
      );
    });
  });

  // ── GET /reports/:id ──────────────────────────────────────

  describe('GET /api/v1/brain/audit/reports/:id', () => {
    it('returns report when found', async () => {
      const report = makeMockReport({ id: 'rpt-123' });
      mockStorage.getReport.mockResolvedValue(report);

      const result = await callRoute('GET', '/api/v1/brain/audit/reports/:id', {
        params: { id: 'rpt-123' },
      });
      expect(result).toEqual({ report });
      expect(mockStorage.getReport).toHaveBeenCalledWith('rpt-123');
    });

    it('returns 404 when report not found', async () => {
      mockStorage.getReport.mockResolvedValue(null);

      await callRoute('GET', '/api/v1/brain/audit/reports/:id', {
        params: { id: 'nonexistent' },
      });
      expect(sendError).toHaveBeenCalledWith(expect.anything(), 404, 'Audit report not found');
    });
  });

  // ── POST /reports/:id/approve ─────────────────────────────

  describe('POST /api/v1/brain/audit/reports/:id/approve', () => {
    it('approves report with provided approvedBy', async () => {
      const report = makeMockReport({ status: 'completed', approvedBy: 'user-1' });
      mockStorage.approveReport.mockResolvedValue(report);

      const result = await callRoute('POST', '/api/v1/brain/audit/reports/:id/approve', {
        params: { id: 'rpt-1' },
        body: { approvedBy: 'user-1' },
      });
      expect(result).toEqual({ report });
      expect(mockStorage.approveReport).toHaveBeenCalledWith('rpt-1', 'user-1');
    });

    it('defaults approvedBy to admin when not provided', async () => {
      const report = makeMockReport({ approvedBy: 'admin' });
      mockStorage.approveReport.mockResolvedValue(report);

      await callRoute('POST', '/api/v1/brain/audit/reports/:id/approve', {
        params: { id: 'rpt-1' },
      });
      expect(mockStorage.approveReport).toHaveBeenCalledWith('rpt-1', 'admin');
    });

    it('returns 404 when report not found or not pending', async () => {
      mockStorage.approveReport.mockResolvedValue(null);

      await callRoute('POST', '/api/v1/brain/audit/reports/:id/approve', {
        params: { id: 'nonexistent' },
        body: { approvedBy: 'user-1' },
      });
      expect(sendError).toHaveBeenCalledWith(
        expect.anything(),
        404,
        'Report not found or not pending approval'
      );
    });
  });

  // ── GET /schedule ─────────────────────────────────────────

  describe('GET /api/v1/brain/audit/schedule', () => {
    it('returns schedules from scheduler', async () => {
      const schedules: Record<MemoryAuditScope, string> = {
        daily: '30 3 * * *',
        weekly: '0 4 * * 0',
        monthly: '0 5 1 * *',
      };
      mockScheduler.getSchedules.mockReturnValue(schedules);

      const result = await callRoute('GET', '/api/v1/brain/audit/schedule');
      expect(result).toEqual({ schedules });
      expect(mockScheduler.getSchedules).toHaveBeenCalled();
    });

    it('returns empty schedules object', async () => {
      mockScheduler.getSchedules.mockReturnValue({});

      const result = await callRoute('GET', '/api/v1/brain/audit/schedule');
      expect(result).toEqual({ schedules: {} });
    });
  });

  // ── PUT /schedule ─────────────────────────────────────────

  describe('PUT /api/v1/brain/audit/schedule', () => {
    it('updates schedule for valid scope', async () => {
      const schedules = { daily: '0 2 * * *', weekly: '0 4 * * 0', monthly: '0 5 1 * *' };
      mockScheduler.getSchedules.mockReturnValue(schedules);

      const result = await callRoute('PUT', '/api/v1/brain/audit/schedule', {
        body: { scope: 'daily', schedule: '0 2 * * *' },
      });
      expect(mockScheduler.setSchedule).toHaveBeenCalledWith('daily', '0 2 * * *');
      expect(result).toEqual({ schedules });
    });

    it('updates weekly schedule', async () => {
      const schedules = { daily: '30 3 * * *', weekly: '0 6 * * 1', monthly: '0 5 1 * *' };
      mockScheduler.getSchedules.mockReturnValue(schedules);

      const result = await callRoute('PUT', '/api/v1/brain/audit/schedule', {
        body: { scope: 'weekly', schedule: '0 6 * * 1' },
      });
      expect(mockScheduler.setSchedule).toHaveBeenCalledWith('weekly', '0 6 * * 1');
      expect(result).toEqual({ schedules });
    });

    it('updates monthly schedule', async () => {
      const schedules = { daily: '30 3 * * *', weekly: '0 4 * * 0', monthly: '0 3 15 * *' };
      mockScheduler.getSchedules.mockReturnValue(schedules);

      const _result = await callRoute('PUT', '/api/v1/brain/audit/schedule', {
        body: { scope: 'monthly', schedule: '0 3 15 * *' },
      });
      expect(mockScheduler.setSchedule).toHaveBeenCalledWith('monthly', '0 3 15 * *');
    });

    it('rejects invalid scope', async () => {
      await callRoute('PUT', '/api/v1/brain/audit/schedule', {
        body: { scope: 'yearly', schedule: '0 0 1 1 *' },
      });
      expect(sendError).toHaveBeenCalledWith(
        expect.anything(),
        400,
        'Scope must be daily, weekly, or monthly'
      );
      expect(mockScheduler.setSchedule).not.toHaveBeenCalled();
    });

    it('rejects missing schedule', async () => {
      await callRoute('PUT', '/api/v1/brain/audit/schedule', {
        body: { scope: 'daily' },
      });
      expect(sendError).toHaveBeenCalledWith(
        expect.anything(),
        400,
        'Schedule cron expression is required'
      );
      expect(mockScheduler.setSchedule).not.toHaveBeenCalled();
    });

    it('rejects empty string schedule', async () => {
      await callRoute('PUT', '/api/v1/brain/audit/schedule', {
        body: { scope: 'daily', schedule: '' },
      });
      expect(sendError).toHaveBeenCalledWith(
        expect.anything(),
        400,
        'Schedule cron expression is required'
      );
      expect(mockScheduler.setSchedule).not.toHaveBeenCalled();
    });

    it('rejects non-string schedule', async () => {
      await callRoute('PUT', '/api/v1/brain/audit/schedule', {
        body: { scope: 'daily', schedule: 123 },
      });
      expect(sendError).toHaveBeenCalledWith(
        expect.anything(),
        400,
        'Schedule cron expression is required'
      );
      expect(mockScheduler.setSchedule).not.toHaveBeenCalled();
    });

    it('rejects missing scope', async () => {
      await callRoute('PUT', '/api/v1/brain/audit/schedule', {
        body: { schedule: '0 2 * * *' },
      });
      expect(sendError).toHaveBeenCalledWith(
        expect.anything(),
        400,
        'Scope must be daily, weekly, or monthly'
      );
    });
  });

  // ── GET /health ───────────────────────────────────────────

  describe('GET /api/v1/brain/audit/health', () => {
    it('returns health metrics without personalityId', async () => {
      const health = makeMockHealthMetrics();
      mockStorage.getHealthMetrics.mockResolvedValue(health);

      const result = await callRoute('GET', '/api/v1/brain/audit/health');
      expect(result).toEqual({ health });
      expect(mockStorage.getHealthMetrics).toHaveBeenCalledWith(undefined);
    });

    it('passes personalityId query param', async () => {
      const health = makeMockHealthMetrics({ healthScore: 92 });
      mockStorage.getHealthMetrics.mockResolvedValue(health);

      const result = await callRoute('GET', '/api/v1/brain/audit/health', {
        query: { personalityId: 'p-42' },
      });
      expect(result).toEqual({ health });
      expect(mockStorage.getHealthMetrics).toHaveBeenCalledWith('p-42');
    });

    it('returns low health score', async () => {
      const health = makeMockHealthMetrics({ healthScore: 10, lowImportanceRatio: 0.8 });
      mockStorage.getHealthMetrics.mockResolvedValue(health);

      const result = await callRoute('GET', '/api/v1/brain/audit/health');
      expect(result).toEqual({ health });
    });
  });
});
