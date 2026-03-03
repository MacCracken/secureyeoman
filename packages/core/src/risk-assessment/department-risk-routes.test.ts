/**
 * DepartmentRiskRoutes Tests — Phase 111
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerDepartmentRiskRoutes } from './department-risk-routes.js';
import type { DepartmentRiskManager } from './department-risk-manager.js';

function makeMockManager(): DepartmentRiskManager {
  return {
    createDepartment: vi.fn(),
    getDepartment: vi.fn(),
    updateDepartment: vi.fn(),
    deleteDepartment: vi.fn(),
    listDepartments: vi.fn(),
    getDepartmentTree: vi.fn(),
    createRegisterEntry: vi.fn(),
    getRegisterEntry: vi.fn(),
    updateRegisterEntry: vi.fn(),
    deleteRegisterEntry: vi.fn(),
    listRegisterEntries: vi.fn(),
    closeRegisterEntry: vi.fn(),
    snapshotDepartmentScore: vi.fn(),
    snapshotAllDepartments: vi.fn(),
    getDepartmentScorecard: vi.fn(),
    getHeatmap: vi.fn(),
    getTrend: vi.fn(),
    getExecutiveSummary: vi.fn(),
  } as unknown as DepartmentRiskManager;
}

describe('DepartmentRiskRoutes', () => {
  let app: FastifyInstance;
  let mgr: ReturnType<typeof makeMockManager>;

  beforeAll(async () => {
    app = Fastify();
    mgr = makeMockManager();
    registerDepartmentRiskRoutes(app, { departmentRiskManager: mgr });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Department CRUD ──────────────────────────────────────────

  describe('POST /api/v1/risk/departments', () => {
    it('creates a department (201)', async () => {
      const dept = { id: 'd1', name: 'Engineering' };
      (mgr.createDepartment as any).mockResolvedValue(dept);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/risk/departments',
        payload: { name: 'Engineering' },
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.payload).department.name).toBe('Engineering');
    });

    it('returns 400 for missing name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/risk/departments',
        payload: { description: 'no name' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/risk/departments', () => {
    it('lists departments', async () => {
      (mgr.listDepartments as any).mockResolvedValue({ items: [], total: 0 });
      const res = await app.inject({ method: 'GET', url: '/api/v1/risk/departments' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).items).toEqual([]);
    });
  });

  describe('GET /api/v1/risk/departments/tree', () => {
    it('returns department tree', async () => {
      (mgr.getDepartmentTree as any).mockResolvedValue([]);
      const res = await app.inject({ method: 'GET', url: '/api/v1/risk/departments/tree' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).departments).toEqual([]);
    });
  });

  describe('GET /api/v1/risk/departments/:id', () => {
    it('returns department (200)', async () => {
      (mgr.getDepartment as any).mockResolvedValue({ id: 'd1', name: 'Eng' });
      const res = await app.inject({ method: 'GET', url: '/api/v1/risk/departments/d1' });
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 for missing department', async () => {
      (mgr.getDepartment as any).mockResolvedValue(null);
      const res = await app.inject({ method: 'GET', url: '/api/v1/risk/departments/missing' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/v1/risk/departments/:id', () => {
    it('updates department', async () => {
      (mgr.updateDepartment as any).mockResolvedValue({ id: 'd1', name: 'Updated' });
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/risk/departments/d1',
        payload: { name: 'Updated' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 for missing department', async () => {
      (mgr.updateDepartment as any).mockResolvedValue(null);
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/risk/departments/d1',
        payload: { name: 'Updated' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/risk/departments/:id', () => {
    it('deletes department', async () => {
      (mgr.deleteDepartment as any).mockResolvedValue(true);
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/risk/departments/d1' });
      expect(res.statusCode).toBe(200);
    });

    it('returns 409 when open entries exist', async () => {
      (mgr.deleteDepartment as any).mockRejectedValue(new Error('Cannot delete department with 3 open risk entries'));
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/risk/departments/d1' });
      expect(res.statusCode).toBe(409);
    });

    it('passes force flag', async () => {
      (mgr.deleteDepartment as any).mockResolvedValue(true);
      await app.inject({ method: 'DELETE', url: '/api/v1/risk/departments/d1?force=true' });
      expect(mgr.deleteDepartment).toHaveBeenCalledWith('d1', true);
    });
  });

  // ── Scorecard & Snapshot ─────────────────────────────────────

  describe('GET /api/v1/risk/departments/:id/scorecard', () => {
    it('returns scorecard', async () => {
      (mgr.getDepartmentScorecard as any).mockResolvedValue({
        department: { id: 'd1', name: 'Eng' },
        openRisks: 3,
      });
      const res = await app.inject({ method: 'GET', url: '/api/v1/risk/departments/d1/scorecard' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).scorecard.openRisks).toBe(3);
    });

    it('returns 404 for missing department', async () => {
      (mgr.getDepartmentScorecard as any).mockRejectedValue(new Error('Department d1 not found'));
      const res = await app.inject({ method: 'GET', url: '/api/v1/risk/departments/d1/scorecard' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/risk/departments/:id/snapshot', () => {
    it('creates a score snapshot (201)', async () => {
      (mgr.snapshotDepartmentScore as any).mockResolvedValue({ id: 's1', overallScore: 42 });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/risk/departments/d1/snapshot',
        payload: {},
      });
      expect(res.statusCode).toBe(201);
    });
  });

  describe('POST /api/v1/risk/departments/snapshot-all', () => {
    it('snapshots all departments (201)', async () => {
      (mgr.snapshotAllDepartments as any).mockResolvedValue([{ id: 's1' }]);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/risk/departments/snapshot-all',
        payload: {},
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.payload).count).toBe(1);
    });
  });

  // ── Register Entry CRUD ──────────────────────────────────────

  describe('POST /api/v1/risk/register', () => {
    it('creates a register entry (201)', async () => {
      (mgr.createRegisterEntry as any).mockResolvedValue({
        id: 'e1', title: 'SQL Injection', riskScore: 20,
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/risk/register',
        payload: {
          departmentId: 'd1',
          title: 'SQL Injection',
          category: 'security',
          severity: 'critical',
          likelihood: 4,
          impact: 5,
        },
      });
      expect(res.statusCode).toBe(201);
    });

    it('returns 400 for invalid payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/risk/register',
        payload: { title: 'No department' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/risk/register', () => {
    it('lists register entries', async () => {
      (mgr.listRegisterEntries as any).mockResolvedValue({ items: [], total: 0 });
      const res = await app.inject({ method: 'GET', url: '/api/v1/risk/register' });
      expect(res.statusCode).toBe(200);
    });

    it('passes filter params', async () => {
      (mgr.listRegisterEntries as any).mockResolvedValue({ items: [], total: 0 });
      await app.inject({
        method: 'GET',
        url: '/api/v1/risk/register?departmentId=d1&status=open&overdue=true',
      });
      expect(mgr.listRegisterEntries).toHaveBeenCalledWith(expect.objectContaining({
        departmentId: 'd1',
        status: 'open',
        overdue: true,
      }));
    });
  });

  describe('GET /api/v1/risk/register/:id', () => {
    it('returns 404 for missing entry', async () => {
      (mgr.getRegisterEntry as any).mockResolvedValue(null);
      const res = await app.inject({ method: 'GET', url: '/api/v1/risk/register/missing' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/v1/risk/register/:id/close', () => {
    it('closes a register entry', async () => {
      (mgr.closeRegisterEntry as any).mockResolvedValue({ id: 'e1', status: 'closed' });
      const res = await app.inject({ method: 'PATCH', url: '/api/v1/risk/register/e1/close' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('DELETE /api/v1/risk/register/:id', () => {
    it('deletes entry', async () => {
      (mgr.deleteRegisterEntry as any).mockResolvedValue(true);
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/risk/register/e1' });
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 for missing entry', async () => {
      (mgr.deleteRegisterEntry as any).mockResolvedValue(false);
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/risk/register/missing' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Cross-department views ───────────────────────────────────

  describe('GET /api/v1/risk/heatmap', () => {
    it('returns heatmap cells', async () => {
      (mgr.getHeatmap as any).mockResolvedValue([{ departmentId: 'd1', domain: 'security', score: 60, threshold: 50, breached: true }]);
      const res = await app.inject({ method: 'GET', url: '/api/v1/risk/heatmap' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).cells).toHaveLength(1);
    });
  });

  describe('GET /api/v1/risk/summary', () => {
    it('returns executive summary', async () => {
      (mgr.getExecutiveSummary as any).mockResolvedValue({
        totalDepartments: 3,
        totalOpenRisks: 10,
      });
      const res = await app.inject({ method: 'GET', url: '/api/v1/risk/summary' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).summary.totalDepartments).toBe(3);
    });
  });
});
