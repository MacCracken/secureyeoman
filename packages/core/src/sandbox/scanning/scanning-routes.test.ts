import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerScanningRoutes, type ScanningRoutesOptions } from './scanning-routes.js';
import { randomUUID } from 'node:crypto';

function makeOpts(overrides: Partial<ScanningRoutesOptions> = {}): ScanningRoutesOptions {
  return {
    scanHistoryStore: {
      list: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
      getById: vi.fn().mockResolvedValue(null),
      getStats: vi.fn().mockResolvedValue({ total: 0, byVerdict: {}, bySeverity: {} }),
      record: vi.fn().mockResolvedValue(undefined),
    } as any,
    quarantineStorage: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      approve: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as any,
    pipeline: {
      scan: vi.fn().mockResolvedValue({
        artifactId: randomUUID(),
        verdict: 'pass',
        findings: [],
        worstSeverity: 'info',
        scanDurationMs: 10,
        scannerVersions: {},
        scannedAt: Date.now(),
      }),
    } as any,
    policy: { enabled: true, maxArtifactSizeBytes: 10_000_000, redactSecrets: true },
    auditChain: { record: vi.fn().mockResolvedValue(undefined) },
    ...overrides,
  };
}

describe('Scanning Routes', () => {
  let app: FastifyInstance;
  let opts: ReturnType<typeof makeOpts>;

  beforeEach(async () => {
    app = Fastify();
    opts = makeOpts();
    registerScanningRoutes(app, opts);
    await app.ready();
  });

  // ── Scan History ────────────────────────────────────────────────

  describe('GET /api/v1/sandbox/scans', () => {
    it('returns scan history', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/sandbox/scans' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toEqual({ rows: [], total: 0 });
      expect(opts.scanHistoryStore!.list).toHaveBeenCalled();
    });

    it('passes query params', async () => {
      await app.inject({
        method: 'GET',
        url: '/api/v1/sandbox/scans?limit=10&offset=5&verdict=block',
      });
      expect(opts.scanHistoryStore!.list).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 5, verdict: 'block' })
      );
    });

    it('caps limit at 100', async () => {
      await app.inject({ method: 'GET', url: '/api/v1/sandbox/scans?limit=999' });
      expect(opts.scanHistoryStore!.list).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 })
      );
    });

    it('returns 503 when store unavailable', async () => {
      const app2 = Fastify();
      registerScanningRoutes(app2, makeOpts({ scanHistoryStore: null }));
      await app2.ready();
      const res = await app2.inject({ method: 'GET', url: '/api/v1/sandbox/scans' });
      expect(res.statusCode).toBe(503);
    });
  });

  describe('GET /api/v1/sandbox/scans/stats', () => {
    it('returns stats', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/sandbox/scans/stats' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).stats).toBeDefined();
    });
  });

  describe('GET /api/v1/sandbox/scans/:id', () => {
    it('returns 404 for missing record', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/sandbox/scans/${randomUUID()}` });
      expect(res.statusCode).toBe(404);
    });

    it('returns record when found', async () => {
      const record = { id: randomUUID(), verdict: 'pass' };
      (opts.scanHistoryStore!.getById as any).mockResolvedValue(record);
      const res = await app.inject({ method: 'GET', url: `/api/v1/sandbox/scans/${record.id}` });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).record).toEqual(record);
    });
  });

  // ── Quarantine ──────────────────────────────────────────────────

  describe('GET /api/v1/sandbox/quarantine', () => {
    it('returns quarantine items', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/sandbox/quarantine' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).items).toEqual([]);
    });

    it('returns 503 when storage unavailable', async () => {
      const app2 = Fastify();
      registerScanningRoutes(app2, makeOpts({ quarantineStorage: null }));
      await app2.ready();
      const res = await app2.inject({ method: 'GET', url: '/api/v1/sandbox/quarantine' });
      expect(res.statusCode).toBe(503);
    });
  });

  describe('GET /api/v1/sandbox/quarantine/:id', () => {
    it('returns 404 for missing entry', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/sandbox/quarantine/${randomUUID()}`,
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns entry when found', async () => {
      const entry = { id: randomUUID(), status: 'quarantined' };
      (opts.quarantineStorage!.get as any).mockResolvedValue(entry);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/sandbox/quarantine/${entry.id}`,
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).entry).toEqual(entry);
    });
  });

  describe('POST /api/v1/sandbox/quarantine/:id/approve', () => {
    it('returns 404 for missing entry', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sandbox/quarantine/${randomUUID()}/approve`,
      });
      expect(res.statusCode).toBe(404);
    });

    it('approves existing entry', async () => {
      const id = randomUUID();
      (opts.quarantineStorage!.get as any).mockResolvedValue({ id, status: 'quarantined' });
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sandbox/quarantine/${id}/approve`,
      });
      expect(res.statusCode).toBe(200);
      expect(opts.quarantineStorage!.approve).toHaveBeenCalledWith(id, 'unknown');
      expect(opts.auditChain!.record).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/v1/sandbox/quarantine/:id', () => {
    it('returns 404 for missing entry', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/sandbox/quarantine/${randomUUID()}`,
      });
      expect(res.statusCode).toBe(404);
    });

    it('deletes existing entry', async () => {
      const id = randomUUID();
      (opts.quarantineStorage!.get as any).mockResolvedValue({ id, status: 'quarantined' });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/sandbox/quarantine/${id}`,
      });
      expect(res.statusCode).toBe(204);
      expect(opts.quarantineStorage!.delete).toHaveBeenCalledWith(id);
    });
  });

  // ── Threats ─────────────────────────────────────────────────────

  describe('GET /api/v1/sandbox/threats', () => {
    it('returns threat intelligence summary', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/sandbox/threats' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.patternCount).toBeGreaterThan(0);
      expect(body.categories).toBeInstanceOf(Array);
      expect(body.stages).toBeInstanceOf(Array);
      expect(body.patterns).toBeInstanceOf(Array);
      // Ensure no regex objects are leaked
      for (const p of body.patterns) {
        expect(p.indicatorCount).toBeGreaterThan(0);
        expect(p.indicators).toBeUndefined();
      }
    });
  });

  // ── Manual Scan ─────────────────────────────────────────────────

  describe('POST /api/v1/sandbox/scan', () => {
    it('returns 400 for missing content', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sandbox/scan',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('scans content and returns result', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sandbox/scan',
        payload: { content: 'console.log("hello")' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.scanResult).toBeDefined();
      expect(body.scanResult.verdict).toBe('pass');
      expect(opts.pipeline!.scan).toHaveBeenCalled();
      expect(opts.scanHistoryStore!.record).toHaveBeenCalled();
    });

    it('accepts custom type and sourceContext', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/sandbox/scan',
        payload: { content: 'test', type: 'text/javascript', sourceContext: 'cli' },
      });
      const scanCall = (opts.pipeline!.scan as any).mock.calls[0][0];
      expect(scanCall.type).toBe('text/javascript');
      expect(scanCall.sourceContext).toBe('cli');
    });

    it('returns 503 when pipeline unavailable', async () => {
      const app2 = Fastify();
      registerScanningRoutes(app2, makeOpts({ pipeline: null }));
      await app2.ready();
      const res = await app2.inject({
        method: 'POST',
        url: '/api/v1/sandbox/scan',
        payload: { content: 'test' },
      });
      expect(res.statusCode).toBe(503);
    });
  });

  // ── Policy ──────────────────────────────────────────────────────

  describe('GET /api/v1/sandbox/policy', () => {
    it('returns current policy', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/sandbox/policy' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.policy.enabled).toBe(true);
    });

    it('returns default disabled policy when none configured', async () => {
      const app2 = Fastify();
      registerScanningRoutes(app2, makeOpts({ policy: null }));
      await app2.ready();
      const res = await app2.inject({ method: 'GET', url: '/api/v1/sandbox/policy' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).policy.enabled).toBe(false);
    });
  });

  // ── Error handling ──────────────────────────────────────────────

  describe('error handling', () => {
    it('returns 500 on scan history error', async () => {
      (opts.scanHistoryStore!.list as any).mockRejectedValue(new Error('db error'));
      const res = await app.inject({ method: 'GET', url: '/api/v1/sandbox/scans' });
      expect(res.statusCode).toBe(500);
    });

    it('returns 500 on quarantine error', async () => {
      (opts.quarantineStorage!.list as any).mockRejectedValue(new Error('fs error'));
      const res = await app.inject({ method: 'GET', url: '/api/v1/sandbox/quarantine' });
      expect(res.statusCode).toBe(500);
    });

    it('returns 500 on pipeline scan error', async () => {
      (opts.pipeline!.scan as any).mockRejectedValue(new Error('scan error'));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sandbox/scan',
        payload: { content: 'test' },
      });
      expect(res.statusCode).toBe(500);
    });
  });
});
