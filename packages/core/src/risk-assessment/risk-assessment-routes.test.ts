/**
 * Risk Assessment Routes Tests — Phase 53
 *
 * Fastify inject tests with mocked RiskAssessmentManager.
 * No database required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerRiskAssessmentRoutes } from './risk-assessment-routes.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;
const ASSESS_ID = 'assess-abc';
const FEED_ID = 'feed-xyz';
const FINDING_ID = 'finding-001';

function makeAssessment(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSESS_ID,
    name: 'Q1 Assessment',
    status: 'completed',
    assessmentTypes: ['security', 'external'],
    windowDays: 7,
    compositeScore: 35,
    riskLevel: 'medium',
    domainScores: { security: 40, external: 20 },
    findings: [],
    findingsCount: 0,
    createdAt: NOW,
    completedAt: NOW + 5000,
    ...overrides,
  };
}

function makeFeed(overrides: Record<string, unknown> = {}) {
  return {
    id: FEED_ID,
    name: 'CVE Feed',
    sourceType: 'manual',
    category: 'cyber',
    enabled: true,
    recordCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeFinding(overrides: Record<string, unknown> = {}) {
  return {
    id: FINDING_ID,
    feedId: FEED_ID,
    category: 'cyber',
    severity: 'high',
    title: 'Critical RCE',
    status: 'open',
    importedAt: NOW,
    ...overrides,
  };
}

function makeManager(overrides: Record<string, unknown> = {}) {
  return {
    runAssessment: vi.fn().mockResolvedValue(makeAssessment({ status: 'completed' })),
    getAssessment: vi.fn().mockResolvedValue(makeAssessment()),
    listAssessments: vi.fn().mockResolvedValue({ items: [makeAssessment()], total: 1 }),
    generateReport: vi.fn().mockResolvedValue('report content'),
    createFeed: vi.fn().mockResolvedValue(makeFeed()),
    listFeeds: vi.fn().mockResolvedValue([makeFeed()]),
    deleteFeed: vi.fn().mockResolvedValue(undefined),
    ingestFindings: vi.fn().mockResolvedValue({ created: 3, skipped: 1 }),
    listFindings: vi.fn().mockResolvedValue({ items: [makeFinding()], total: 1 }),
    createFinding: vi.fn().mockResolvedValue(makeFinding()),
    acknowledgeFinding: vi.fn().mockResolvedValue(makeFinding({ status: 'acknowledged' })),
    resolveFinding: vi.fn().mockResolvedValue(makeFinding({ status: 'resolved' })),
    ...overrides,
  };
}

function buildApp(managerOverrides: Record<string, unknown> = {}) {
  const app = Fastify({ logger: false });
  const mgr = makeManager(managerOverrides);
  registerRiskAssessmentRoutes(app, { riskAssessmentManager: mgr as any });
  return { app, mgr };
}

// ─── POST /api/v1/risk/assessments ────────────────────────────────────────────

describe('POST /api/v1/risk/assessments', () => {
  it('returns 201 with assessment', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/risk/assessments',
      payload: { name: 'My Assessment', windowDays: 14 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.assessment).toBeDefined();
    expect(body.assessment.id).toBe(ASSESS_ID);
  });

  it('returns 400 when name is missing', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/risk/assessments',
      payload: { assessmentTypes: ['security'] },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.message).toContain('name');
  });

  it('passes options to manager', async () => {
    const { app, mgr } = buildApp();
    await app.inject({
      method: 'POST',
      url: '/api/v1/risk/assessments',
      payload: {
        name: 'Custom',
        assessmentTypes: ['security', 'autonomy'],
        windowDays: 30,
      },
    });
    expect(mgr.runAssessment).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Custom', windowDays: 30 }),
      undefined
    );
  });

  it('returns 500 on manager error', async () => {
    const { app } = buildApp({
      runAssessment: vi.fn().mockRejectedValue(new Error('DB down')),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/risk/assessments',
      payload: { name: 'Test' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /api/v1/risk/assessments ────────────────────────────────────────────

describe('GET /api/v1/risk/assessments', () => {
  it('returns items and total', async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/risk/assessments' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('passes limit, offset, status query params', async () => {
    const { app, mgr } = buildApp();
    await app.inject({
      method: 'GET',
      url: '/api/v1/risk/assessments?limit=10&offset=5&status=completed',
    });
    expect(mgr.listAssessments).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 5, status: 'completed' })
    );
  });

  it('caps limit at 100', async () => {
    const { app, mgr } = buildApp();
    await app.inject({ method: 'GET', url: '/api/v1/risk/assessments?limit=999' });
    expect(mgr.listAssessments).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 })
    );
  });
});

// ─── GET /api/v1/risk/assessments/:id ────────────────────────────────────────

describe('GET /api/v1/risk/assessments/:id', () => {
  it('returns assessment', async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: 'GET', url: `/api/v1/risk/assessments/${ASSESS_ID}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.assessment.id).toBe(ASSESS_ID);
  });

  it('returns 404 when not found', async () => {
    const { app } = buildApp({ getAssessment: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/risk/assessments/nonexistent' });
    expect(res.statusCode).toBe(404);
  });
});

// ─── GET /api/v1/risk/assessments/:id/report/:fmt ────────────────────────────

describe('GET /api/v1/risk/assessments/:id/report/:fmt', () => {
  it('returns markdown report with correct content-type', async () => {
    const { app, mgr } = buildApp({
      generateReport: vi.fn().mockResolvedValue('# Report'),
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/risk/assessments/${ASSESS_ID}/report/markdown`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(mgr.generateReport).toHaveBeenCalledWith(
      expect.objectContaining({ id: ASSESS_ID }),
      'markdown'
    );
  });

  it('returns json report', async () => {
    const { app } = buildApp({ generateReport: vi.fn().mockResolvedValue('{}') });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/risk/assessments/${ASSESS_ID}/report/json`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('returns csv with content-disposition', async () => {
    const { app } = buildApp({ generateReport: vi.fn().mockResolvedValue('id,domain') });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/risk/assessments/${ASSESS_ID}/report/csv`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
  });

  it('returns 400 for invalid format', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/risk/assessments/${ASSESS_ID}/report/pdf`,
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when assessment not found', async () => {
    const { app } = buildApp({ getAssessment: vi.fn().mockResolvedValue(null) });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/risk/assessments/${ASSESS_ID}/report/json`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when assessment not completed', async () => {
    const { app } = buildApp({
      getAssessment: vi.fn().mockResolvedValue(makeAssessment({ status: 'running' })),
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/risk/assessments/${ASSESS_ID}/report/json`,
    });
    expect(res.statusCode).toBe(409);
  });
});

// ─── GET /api/v1/risk/feeds ──────────────────────────────────────────────────

describe('GET /api/v1/risk/feeds', () => {
  it('returns feeds array', async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/risk/feeds' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.feeds).toHaveLength(1);
    expect(body.feeds[0].id).toBe(FEED_ID);
  });
});

// ─── POST /api/v1/risk/feeds ─────────────────────────────────────────────────

describe('POST /api/v1/risk/feeds', () => {
  it('returns 201 with feed', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/risk/feeds',
      payload: { name: 'CVE Feed', sourceType: 'manual', category: 'cyber' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.feed.id).toBe(FEED_ID);
  });

  it('returns 400 when name is missing', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/risk/feeds',
      payload: { sourceType: 'manual', category: 'cyber' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when sourceType is missing', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/risk/feeds',
      payload: { name: 'Test', category: 'cyber' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── DELETE /api/v1/risk/feeds/:feedId ───────────────────────────────────────

describe('DELETE /api/v1/risk/feeds/:feedId', () => {
  it('returns 204', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/risk/feeds/${FEED_ID}`,
    });
    expect(res.statusCode).toBe(204);
  });
});

// ─── POST /api/v1/risk/feeds/:feedId/ingest ──────────────────────────────────

describe('POST /api/v1/risk/feeds/:feedId/ingest', () => {
  it('returns created and skipped counts', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/risk/feeds/${FEED_ID}/ingest`,
      payload: [{ title: 'CVE-2024-001', severity: 'high', category: 'cyber' }],
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.created).toBe(3);
    expect(body.skipped).toBe(1);
  });

  it('returns 400 when body is not an array', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/risk/feeds/${FEED_ID}/ingest`,
      payload: { title: 'not an array' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── GET /api/v1/risk/findings ────────────────────────────────────────────────

describe('GET /api/v1/risk/findings', () => {
  it('returns findings and total', async () => {
    const { app } = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/risk/findings' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('passes filters to manager', async () => {
    const { app, mgr } = buildApp();
    await app.inject({
      method: 'GET',
      url: '/api/v1/risk/findings?feedId=f1&status=open&severity=critical',
    });
    expect(mgr.listFindings).toHaveBeenCalledWith(
      expect.objectContaining({ feedId: 'f1', status: 'open', severity: 'critical' })
    );
  });
});

// ─── POST /api/v1/risk/findings ───────────────────────────────────────────────

describe('POST /api/v1/risk/findings', () => {
  it('returns 201 with finding', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/risk/findings',
      payload: { category: 'cyber', severity: 'high', title: 'Critical RCE' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.finding.id).toBe(FINDING_ID);
  });

  it('returns 400 when required fields missing', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/risk/findings',
      payload: { category: 'cyber', severity: 'high' }, // missing title
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── PATCH /api/v1/risk/findings/:id/acknowledge ─────────────────────────────

describe('PATCH /api/v1/risk/findings/:id/acknowledge', () => {
  it('returns acknowledged finding', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/risk/findings/${FINDING_ID}/acknowledge`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.finding.status).toBe('acknowledged');
  });

  it('returns 404 when finding not found', async () => {
    const { app } = buildApp({
      acknowledgeFinding: vi.fn().mockResolvedValue(null),
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/risk/findings/${FINDING_ID}/acknowledge`,
    });
    expect(res.statusCode).toBe(404);
  });
});

// ─── PATCH /api/v1/risk/findings/:id/resolve ─────────────────────────────────

describe('PATCH /api/v1/risk/findings/:id/resolve', () => {
  it('returns resolved finding', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/risk/findings/${FINDING_ID}/resolve`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.finding.status).toBe('resolved');
  });

  it('returns 404 when finding not found', async () => {
    const { app } = buildApp({
      resolveFinding: vi.fn().mockResolvedValue(null),
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/risk/findings/${FINDING_ID}/resolve`,
    });
    expect(res.statusCode).toBe(404);
  });
});
