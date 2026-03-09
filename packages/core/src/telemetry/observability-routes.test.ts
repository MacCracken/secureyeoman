import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerObservabilityRoutes } from './observability-routes.js';
import { CostAttributionTracker } from './cost-attribution.js';
import { SloMonitor } from './slo-monitor.js';

vi.mock('../licensing/license-guard.js', () => ({
  licenseGuard: () => ({}),
}));

const mockLogger = {
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: 'info' as const,
};

describe('Observability Routes', () => {
  let app: FastifyInstance;
  let costTracker: CostAttributionTracker;
  let sloMonitor: SloMonitor;

  beforeEach(async () => {
    app = Fastify();
    costTracker = new CostAttributionTracker(mockLogger);
    sloMonitor = new SloMonitor(mockLogger);

    registerObservabilityRoutes(app, { costTracker, sloMonitor });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/observability/cost-attribution', () => {
    it('should return cost summary', async () => {
      const now = Date.now();
      costTracker.record({
        timestamp: now,
        tenantId: 'default',
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.01,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/cost-attribution',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.summary.totalCostUsd).toBeCloseTo(0.01);
    });
  });

  describe('GET /api/v1/observability/cost-attribution/csv', () => {
    it('should return CSV file', async () => {
      costTracker.record({
        timestamp: Date.now(),
        tenantId: 'default',
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 500,
        outputTokens: 200,
        costUsd: 0.05,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/cost-attribution/csv',
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/csv');
      expect(res.payload).toContain('timestamp,tenant_id');
      expect(res.payload).toContain('openai');
    });
  });

  describe('POST/GET/DELETE /api/v1/observability/budgets', () => {
    it('should create and list budgets', async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/api/v1/observability/budgets',
        payload: {
          id: 'b1',
          tenantId: 'default',
          period: 'daily',
          limitUsd: 100,
          enabled: true,
        },
      });
      expect(create.statusCode).toBe(201);

      const list = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/budgets',
      });
      expect(list.statusCode).toBe(200);
      const body = JSON.parse(list.payload);
      expect(body.budgets).toHaveLength(1);
    });

    it('should delete budget', async () => {
      costTracker.setBudget({
        id: 'b1',
        tenantId: 'default',
        period: 'daily',
        limitUsd: 100,
        enabled: true,
      });

      const del = await app.inject({
        method: 'DELETE',
        url: '/api/v1/observability/budgets/b1',
      });
      expect(del.statusCode).toBe(204);
    });

    it('should return 404 for unknown budget', async () => {
      const del = await app.inject({
        method: 'DELETE',
        url: '/api/v1/observability/budgets/unknown',
      });
      expect(del.statusCode).toBe(404);
    });
  });

  describe('POST/GET/DELETE /api/v1/observability/slos', () => {
    it('should create and evaluate SLOs', async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/api/v1/observability/slos',
        payload: {
          id: 'slo-1',
          name: 'Tool Success',
          metricType: 'tool_success_rate',
          target: 95,
          windowMs: 3600000,
          burnRateThreshold: 2.0,
        },
      });
      expect(create.statusCode).toBe(201);

      const list = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/slos',
      });
      expect(list.statusCode).toBe(200);
      const body = JSON.parse(list.payload);
      expect(body.slos).toHaveLength(1);
      expect(body.slos[0].name).toBe('Tool Success');
    });

    it('should delete SLO', async () => {
      sloMonitor.addDefinition({
        id: 'slo-1',
        name: 'Test',
        metricType: 'tool_success_rate',
        target: 95,
        windowMs: 3600000,
        burnRateThreshold: 2.0,
      });

      const del = await app.inject({
        method: 'DELETE',
        url: '/api/v1/observability/slos/slo-1',
      });
      expect(del.statusCode).toBe(204);
    });

    it('should return 404 for unknown SLO', async () => {
      const del = await app.inject({
        method: 'DELETE',
        url: '/api/v1/observability/slos/unknown',
      });
      expect(del.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/observability/siem/status', () => {
    it('should return disabled when no forwarder', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/siem/status',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.enabled).toBe(false);
    });
  });
});
