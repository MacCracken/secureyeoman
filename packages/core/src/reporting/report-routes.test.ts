import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerReportRoutes } from './report-routes.js';
import type { AuditReportGenerator } from './audit-report.js';

const REPORT = {
  id: 'rep-1',
  title: 'Audit Report',
  format: 'json',
  generatedAt: 1000000,
  entryCount: 42,
  sizeBytes: 1024,
  content: '{"entries":[]}',
};

function makeMockGenerator(overrides?: Partial<AuditReportGenerator>): AuditReportGenerator {
  return {
    generate: vi.fn().mockResolvedValue(REPORT),
    getReport: vi.fn().mockReturnValue(REPORT),
    listReports: vi.fn().mockReturnValue([REPORT]),
    ...overrides,
  } as unknown as AuditReportGenerator;
}

function buildApp(overrides?: Partial<AuditReportGenerator>) {
  const app = Fastify();
  registerReportRoutes(app, { reportGenerator: makeMockGenerator(overrides) });
  return app;
}

describe('POST /api/v1/reports/generate', () => {
  it('generates report and returns 201', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reports/generate',
      payload: { title: 'My Report', format: 'json' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().report.id).toBe('rep-1');
    expect(res.json().report.entryCount).toBe(42);
  });

  it('returns 500 on generator error', async () => {
    const app = buildApp({ generate: vi.fn().mockRejectedValue(new Error('db error')) });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reports/generate',
      payload: {},
    });
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /api/v1/reports/:id', () => {
  it('returns report metadata', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/reports/rep-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().report.id).toBe('rep-1');
    expect(res.json().report.sizeBytes).toBe(1024);
  });

  it('returns 404 when not found', async () => {
    const app = buildApp({ getReport: vi.fn().mockReturnValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/reports/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/v1/reports/:id/download', () => {
  it('downloads json report with correct headers', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/reports/rep-1/download' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('rep-1.json');
  });

  it('downloads html report with text/html content-type', async () => {
    const htmlReport = { ...REPORT, format: 'html', content: '<html></html>' };
    const app = buildApp({ getReport: vi.fn().mockReturnValue(htmlReport) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/reports/rep-1/download' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-disposition']).toContain('rep-1.html');
  });

  it('downloads csv report with text/csv content-type', async () => {
    const csvReport = { ...REPORT, format: 'csv', content: 'a,b,c' };
    const app = buildApp({ getReport: vi.fn().mockReturnValue(csvReport) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/reports/rep-1/download' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('rep-1.csv');
  });

  it('returns 404 when report not found', async () => {
    const app = buildApp({ getReport: vi.fn().mockReturnValue(null) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/reports/missing/download' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/v1/reports', () => {
  it('returns reports list with total', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/reports' });
    expect(res.statusCode).toBe(200);
    expect(res.json().reports).toHaveLength(1);
    expect(res.json().total).toBe(1);
  });

  it('returns empty list when no reports', async () => {
    const app = buildApp({ listReports: vi.fn().mockReturnValue([]) });
    const res = await app.inject({ method: 'GET', url: '/api/v1/reports' });
    expect(res.statusCode).toBe(200);
    expect(res.json().reports).toHaveLength(0);
    expect(res.json().total).toBe(0);
  });
});
