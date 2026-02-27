/**
 * Autonomy Audit Tests — Phase 49
 *
 * Unit tests for AutonomyAuditStorage, AutonomyAuditManager, and routes.
 * No database required — uses mocked storage/managers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import {
  AutonomyAuditManager,
  AutonomyAuditStorage,
  DEFAULT_CHECKLIST_ITEMS,
  type AuditRun,
  type ChecklistItem,
  type AutonomyOverview,
} from './autonomy-audit.js';
import { registerAutonomyRoutes } from './autonomy-routes.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;
const RUN_ID = 'run-1';

function makeAuditRun(overrides: Partial<AuditRun> = {}): AuditRun {
  return {
    id: RUN_ID,
    name: 'Test Audit',
    status: 'in_progress',
    items: DEFAULT_CHECKLIST_ITEMS.map((i) => ({ ...i })),
    createdAt: NOW,
    ...overrides,
  };
}

function makeOverview(): AutonomyOverview {
  return {
    byLevel: {
      L1: [{ id: 's1', name: 'Summarize', type: 'skill', autonomyLevel: 'L1' }],
      L2: [{ id: 'w1', name: 'Daily Report', type: 'workflow', autonomyLevel: 'L2' }],
      L3: [],
      L4: [],
      L5: [
        {
          id: 's5',
          name: 'AutoDeploy',
          type: 'skill',
          autonomyLevel: 'L5',
          emergencyStopProcedure: 'Disable in settings',
        },
      ],
    },
    totals: { L1: 1, L2: 1, L3: 0, L4: 0, L5: 1 },
  };
}

// ─── DEFAULT_CHECKLIST_ITEMS ──────────────────────────────────────────────────

describe('DEFAULT_CHECKLIST_ITEMS', () => {
  it('has 16 items across 4 sections', () => {
    expect(DEFAULT_CHECKLIST_ITEMS).toHaveLength(16);
    const sections = new Set(DEFAULT_CHECKLIST_ITEMS.map((i) => i.section));
    expect(sections).toEqual(new Set(['A', 'B', 'C', 'D']));
  });

  it('has 4 A items, 4 B items, 5 C items, 3 D items', () => {
    const counts = { A: 0, B: 0, C: 0, D: 0 };
    for (const item of DEFAULT_CHECKLIST_ITEMS) counts[item.section]++;
    expect(counts).toEqual({ A: 4, B: 4, C: 5, D: 3 });
  });

  it('all items start as pending with empty note', () => {
    for (const item of DEFAULT_CHECKLIST_ITEMS) {
      expect(item.status).toBe('pending');
      expect(item.note).toBe('');
    }
  });

  it('each item has a unique id', () => {
    const ids = DEFAULT_CHECKLIST_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(DEFAULT_CHECKLIST_ITEMS.length);
  });
});

// ─── AutonomyAuditManager ─────────────────────────────────────────────────────

function makeStorage(overrides: Record<string, unknown> = {}) {
  return {
    createAuditRun: vi.fn().mockResolvedValue(makeAuditRun()),
    updateAuditItem: vi.fn().mockResolvedValue(makeAuditRun()),
    finalizeRun: vi
      .fn()
      .mockResolvedValue(makeAuditRun({ status: 'completed', reportMarkdown: '# Report' })),
    listAuditRuns: vi.fn().mockResolvedValue([makeAuditRun()]),
    getAuditRun: vi.fn().mockResolvedValue(makeAuditRun()),
    getOverview: vi.fn().mockResolvedValue(makeOverview()),
    ...overrides,
  };
}

function makeSoulManager(overrides: Record<string, unknown> = {}) {
  return {
    updateSkill: vi.fn().mockResolvedValue({ id: 's1', enabled: false }),
    ...overrides,
  };
}

function makeWorkflowManager(overrides: Record<string, unknown> = {}) {
  return {
    updateDefinition: vi.fn().mockResolvedValue({ id: 'w1', isEnabled: false }),
    ...overrides,
  };
}

function makeAuditChain() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

describe('AutonomyAuditManager.getOverview()', () => {
  it('returns overview from storage', async () => {
    const storage = makeStorage();
    const mgr = new AutonomyAuditManager(storage as any, null, null);
    const overview = await mgr.getOverview();
    expect(overview.totals.L1).toBe(1);
    expect(overview.byLevel.L5).toHaveLength(1);
    expect(storage.getOverview).toHaveBeenCalledOnce();
  });
});

describe('AutonomyAuditManager.createAuditRun()', () => {
  it('creates run with DEFAULT_CHECKLIST_ITEMS clone', async () => {
    const storage = makeStorage();
    const mgr = new AutonomyAuditManager(storage as any, null, null);
    const run = await mgr.createAuditRun('Q1 Audit', 'alice');
    expect(storage.createAuditRun).toHaveBeenCalledWith(
      'Q1 Audit',
      expect.arrayContaining([expect.objectContaining({ id: 'A1', status: 'pending', note: '' })]),
      'alice'
    );
    expect(run.id).toBe(RUN_ID);
  });

  it('clones items (does not mutate DEFAULT_CHECKLIST_ITEMS)', async () => {
    const capturedItems: ChecklistItem[] = [];
    const storage = makeStorage({
      createAuditRun: vi.fn().mockImplementation((_name: string, items: ChecklistItem[]) => {
        capturedItems.push(...items);
        return Promise.resolve(makeAuditRun());
      }),
    });
    const mgr = new AutonomyAuditManager(storage as any, null, null);
    await mgr.createAuditRun('Test');
    capturedItems[0].status = 'pass';
    expect(DEFAULT_CHECKLIST_ITEMS[0].status).toBe('pending');
  });
});

describe('AutonomyAuditManager.updateAuditItem()', () => {
  it('delegates to storage', async () => {
    const storage = makeStorage();
    const mgr = new AutonomyAuditManager(storage as any, null, null);
    await mgr.updateAuditItem(RUN_ID, 'A1', { status: 'pass', note: 'OK' });
    expect(storage.updateAuditItem).toHaveBeenCalledWith(RUN_ID, 'A1', {
      status: 'pass',
      note: 'OK',
    });
  });

  it('returns null when storage returns null (item not found)', async () => {
    const storage = makeStorage({ updateAuditItem: vi.fn().mockResolvedValue(null) });
    const mgr = new AutonomyAuditManager(storage as any, null, null);
    const result = await mgr.updateAuditItem(RUN_ID, 'nonexistent', { status: 'pass', note: '' });
    expect(result).toBeNull();
  });
});

describe('AutonomyAuditManager.finalizeRun()', () => {
  it('calls storage.finalizeRun with markdown and json', async () => {
    const storage = makeStorage();
    const mgr = new AutonomyAuditManager(storage as any, null, null);
    const run = await mgr.finalizeRun(RUN_ID);
    expect(storage.finalizeRun).toHaveBeenCalledWith(
      RUN_ID,
      expect.stringContaining('# Autonomy Audit Report'),
      expect.objectContaining({ runId: RUN_ID, summary: expect.any(Object) })
    );
    expect(run?.status).toBe('completed');
  });

  it('returns null when run not found', async () => {
    const storage = makeStorage({ getAuditRun: vi.fn().mockResolvedValue(null) });
    const mgr = new AutonomyAuditManager(storage as any, null, null);
    const result = await mgr.finalizeRun('nonexistent');
    expect(result).toBeNull();
  });

  it('report markdown contains all four sections', async () => {
    const capturedMarkdown: string[] = [];
    const storage = makeStorage({
      finalizeRun: vi.fn().mockImplementation((_id: string, md: string) => {
        capturedMarkdown.push(md);
        return Promise.resolve(makeAuditRun({ status: 'completed', reportMarkdown: md }));
      }),
    });
    const mgr = new AutonomyAuditManager(storage as any, null, null);
    await mgr.finalizeRun(RUN_ID);
    const md = capturedMarkdown[0];
    expect(md).toContain('Section A');
    expect(md).toContain('Section B');
    expect(md).toContain('Section C');
    expect(md).toContain('Section D');
    expect(md).toContain('## Summary');
  });
});

describe('AutonomyAuditManager.emergencyStop()', () => {
  it('disables skill via soulManager', async () => {
    const storage = makeStorage();
    const soulMgr = makeSoulManager();
    const auditChain = makeAuditChain();
    const mgr = new AutonomyAuditManager(storage as any, soulMgr as any, null, auditChain as any);
    await mgr.emergencyStop('skill', 's1', 'admin');
    expect(soulMgr.updateSkill).toHaveBeenCalledWith('s1', { enabled: false });
    expect(auditChain.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'autonomy_emergency_stop', level: 'warn' })
    );
  });

  it('disables workflow via workflowManager', async () => {
    const storage = makeStorage();
    const wfMgr = makeWorkflowManager();
    const auditChain = makeAuditChain();
    const mgr = new AutonomyAuditManager(storage as any, null, wfMgr as any, auditChain as any);
    await mgr.emergencyStop('workflow', 'w1', 'admin');
    expect(wfMgr.updateDefinition).toHaveBeenCalledWith('w1', { isEnabled: false });
    expect(auditChain.record).toHaveBeenCalledOnce();
  });

  it('throws when soulManager not available for skill stop', async () => {
    const storage = makeStorage();
    const mgr = new AutonomyAuditManager(storage as any, null, null);
    await expect(mgr.emergencyStop('skill', 's1')).rejects.toThrow('SoulManager not available');
  });

  it('throws when workflowManager not available for workflow stop', async () => {
    const storage = makeStorage();
    const mgr = new AutonomyAuditManager(storage as any, null, null);
    await expect(mgr.emergencyStop('workflow', 'w1')).rejects.toThrow(
      'WorkflowManager not available'
    );
  });
});

// ─── Routes ──────────────────────────────────────────────────────────────────

function buildApp(managerOverrides: Record<string, unknown> = {}, isAdmin = false) {
  const storage = makeStorage(managerOverrides);
  const soulMgr = makeSoulManager();
  const wfMgr = makeWorkflowManager();
  const mgr = new AutonomyAuditManager(
    storage as any,
    soulMgr as any,
    wfMgr as any,
    makeAuditChain() as any
  );

  const app = Fastify({ logger: false });

  // Inject auth user for admin tests
  app.addHook('preHandler', (req, _reply, done) => {
    (req as any).authUser = isAdmin ? { userId: 'admin-1', role: 'admin' } : null;
    done();
  });

  registerAutonomyRoutes(app, { autonomyAuditManager: mgr });
  return app;
}

describe('GET /api/v1/autonomy/overview', () => {
  it('returns overview', async () => {
    const res = await buildApp().inject({ method: 'GET', url: '/api/v1/autonomy/overview' });
    expect(res.statusCode).toBe(200);
    expect(res.json().overview.totals.L1).toBe(1);
  });
});

describe('GET /api/v1/autonomy/audits', () => {
  it('returns list of runs', async () => {
    const res = await buildApp().inject({ method: 'GET', url: '/api/v1/autonomy/audits' });
    expect(res.statusCode).toBe(200);
    expect(res.json().runs).toHaveLength(1);
  });
});

describe('POST /api/v1/autonomy/audits', () => {
  it('creates a new run and returns 201', async () => {
    const res = await buildApp().inject({
      method: 'POST',
      url: '/api/v1/autonomy/audits',
      payload: { name: 'Q1 Audit' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().run.id).toBe(RUN_ID);
  });

  it('returns 400 when name is missing', async () => {
    const res = await buildApp().inject({
      method: 'POST',
      url: '/api/v1/autonomy/audits',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/autonomy/audits/:id', () => {
  it('returns run by id', async () => {
    const res = await buildApp().inject({
      method: 'GET',
      url: `/api/v1/autonomy/audits/${RUN_ID}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().run.id).toBe(RUN_ID);
  });

  it('returns 404 when not found', async () => {
    const res = await buildApp({ getAuditRun: vi.fn().mockResolvedValue(null) }).inject({
      method: 'GET',
      url: '/api/v1/autonomy/audits/nonexistent',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /api/v1/autonomy/audits/:id/items/:itemId', () => {
  it('updates item status', async () => {
    const res = await buildApp().inject({
      method: 'PUT',
      url: `/api/v1/autonomy/audits/${RUN_ID}/items/A1`,
      payload: { status: 'pass', note: 'Looks good' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().run.id).toBe(RUN_ID);
  });

  it('returns 400 for invalid status', async () => {
    const res = await buildApp().inject({
      method: 'PUT',
      url: `/api/v1/autonomy/audits/${RUN_ID}/items/A1`,
      payload: { status: 'unknown', note: '' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/v1/autonomy/audits/:id/finalize', () => {
  it('finalizes the run', async () => {
    const res = await buildApp().inject({
      method: 'POST',
      url: `/api/v1/autonomy/audits/${RUN_ID}/finalize`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().run.status).toBe('completed');
  });

  it('returns 404 when run not found', async () => {
    const res = await buildApp({ finalizeRun: vi.fn().mockResolvedValue(null) }).inject({
      method: 'POST',
      url: `/api/v1/autonomy/audits/nonexistent/finalize`,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/autonomy/emergency-stop/:type/:id', () => {
  it('returns 403 for non-admin user', async () => {
    const res = await buildApp({}, false).inject({
      method: 'POST',
      url: '/api/v1/autonomy/emergency-stop/skill/s1',
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 for invalid type', async () => {
    const res = await buildApp({}, true).inject({
      method: 'POST',
      url: '/api/v1/autonomy/emergency-stop/invalid/s1',
    });
    expect(res.statusCode).toBe(400);
  });

  it('disables skill for admin', async () => {
    const res = await buildApp({}, true).inject({
      method: 'POST',
      url: '/api/v1/autonomy/emergency-stop/skill/s1',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('disables workflow for admin', async () => {
    const res = await buildApp({}, true).inject({
      method: 'POST',
      url: '/api/v1/autonomy/emergency-stop/workflow/w1',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().type).toBe('workflow');
  });
});

// ─── AutonomyAuditStorage ─────────────────────────────────────────────────────

const ITEMS = DEFAULT_CHECKLIST_ITEMS.map((i) => ({ ...i }));

function makeAuditRunRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    name: 'Test Audit',
    status: 'in_progress',
    items: ITEMS,
    report_markdown: null,
    report_json: null,
    created_by: null,
    created_at: NOW,
    completed_at: null,
    ...overrides,
  };
}

describe('AutonomyAuditStorage.createAuditRun()', () => {
  it('inserts and returns a run', async () => {
    const storage = new AutonomyAuditStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(makeAuditRunRow());

    const run = await storage.createAuditRun('Test Audit', ITEMS);
    expect(run.id).toBe('run-1');
    expect(run.status).toBe('in_progress');
    expect(run.items).toHaveLength(16);
  });

  it('passes createdBy to the query', async () => {
    const storage = new AutonomyAuditStorage();
    const spy = vi
      .spyOn(storage as any, 'queryOne')
      .mockResolvedValueOnce(makeAuditRunRow({ created_by: 'alice' }));

    await storage.createAuditRun('Test', ITEMS, 'alice');
    const params = spy.mock.calls[0][1];
    expect(params).toContain('alice');
  });
});

describe('AutonomyAuditStorage.updateAuditItem()', () => {
  it('returns null when run not found', async () => {
    const storage = new AutonomyAuditStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(null);
    expect(await storage.updateAuditItem('run-1', 'A1', { status: 'pass', note: '' })).toBeNull();
  });

  it('returns null when item not in run', async () => {
    const storage = new AutonomyAuditStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(makeAuditRunRow({ items: [] }));
    expect(await storage.updateAuditItem('run-1', 'Z9', { status: 'pass', note: '' })).toBeNull();
  });

  it('updates the item and returns updated run', async () => {
    const storage = new AutonomyAuditStorage();
    const updatedRow = makeAuditRunRow({
      items: ITEMS.map((i) => (i.id === 'A1' ? { ...i, status: 'pass' } : i)),
    });
    vi.spyOn(storage as any, 'queryOne')
      .mockResolvedValueOnce(makeAuditRunRow()) // getAuditRun
      .mockResolvedValueOnce(updatedRow); // UPDATE ... RETURNING *

    const result = await storage.updateAuditItem('run-1', 'A1', { status: 'pass', note: 'good' });
    expect(result?.items.find((i: ChecklistItem) => i.id === 'A1')?.status).toBe('pass');
  });

  it('returns null when UPDATE returns no row', async () => {
    const storage = new AutonomyAuditStorage();
    vi.spyOn(storage as any, 'queryOne')
      .mockResolvedValueOnce(makeAuditRunRow()) // getAuditRun
      .mockResolvedValueOnce(null); // UPDATE returns null

    const result = await storage.updateAuditItem('run-1', 'A1', { status: 'pass', note: '' });
    expect(result).toBeNull();
  });
});

describe('AutonomyAuditStorage.finalizeRun()', () => {
  it('updates status to completed and returns run', async () => {
    const storage = new AutonomyAuditStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(
      makeAuditRunRow({ status: 'completed', report_markdown: '# Report', completed_at: NOW })
    );

    const result = await storage.finalizeRun('run-1', '# Report', { summary: {} });
    expect(result?.status).toBe('completed');
    expect(result?.reportMarkdown).toBe('# Report');
  });

  it('returns null when run not found', async () => {
    const storage = new AutonomyAuditStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(null);
    expect(await storage.finalizeRun('nonexistent', '', {})).toBeNull();
  });
});

describe('AutonomyAuditStorage.listAuditRuns()', () => {
  it('returns list of runs', async () => {
    const storage = new AutonomyAuditStorage();
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([
      makeAuditRunRow(),
      makeAuditRunRow({ id: 'run-2', name: 'Run 2' }),
    ]);

    const runs = await storage.listAuditRuns();
    expect(runs).toHaveLength(2);
    expect(runs[0].id).toBe('run-1');
    expect(runs[1].id).toBe('run-2');
  });

  it('maps completedAt correctly', async () => {
    const storage = new AutonomyAuditStorage();
    vi.spyOn(storage as any, 'queryMany').mockResolvedValueOnce([
      makeAuditRunRow({ status: 'completed', completed_at: NOW + 1000 }),
    ]);

    const runs = await storage.listAuditRuns();
    expect(runs[0].completedAt).toBe(NOW + 1000);
  });
});

describe('AutonomyAuditStorage.getAuditRun()', () => {
  it('returns run when found', async () => {
    const storage = new AutonomyAuditStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(makeAuditRunRow());
    const run = await storage.getAuditRun('run-1');
    expect(run?.id).toBe('run-1');
  });

  it('returns null when not found', async () => {
    const storage = new AutonomyAuditStorage();
    vi.spyOn(storage as any, 'queryOne').mockResolvedValueOnce(null);
    expect(await storage.getAuditRun('missing')).toBeNull();
  });
});

describe('AutonomyAuditStorage.getOverview()', () => {
  it('groups skills and workflows by autonomy level', async () => {
    const storage = new AutonomyAuditStorage();
    vi.spyOn(storage as any, 'queryMany')
      .mockResolvedValueOnce([
        { id: 's1', name: 'Skill A', autonomy_level: 'L1', emergency_stop_procedure: null },
        { id: 's2', name: 'Skill B', autonomy_level: 'L5', emergency_stop_procedure: 'Stop B' },
      ])
      .mockResolvedValueOnce([
        { id: 'w1', name: 'Workflow A', autonomy_level: 'L2', emergency_stop_procedure: null },
      ]);

    const overview = await storage.getOverview();
    expect(overview.byLevel.L1).toHaveLength(1);
    expect(overview.byLevel.L5).toHaveLength(1);
    expect(overview.byLevel.L5[0].emergencyStopProcedure).toBe('Stop B');
    expect(overview.byLevel.L2).toHaveLength(1);
    expect(overview.byLevel.L2[0].type).toBe('workflow');
    expect(overview.totals.L1).toBe(1);
    expect(overview.totals.L2).toBe(1);
    expect(overview.totals.L5).toBe(1);
  });

  it('defaults skill level to L1 when null', async () => {
    const storage = new AutonomyAuditStorage();
    vi.spyOn(storage as any, 'queryMany')
      .mockResolvedValueOnce([
        { id: 's1', name: 'Skill', autonomy_level: null, emergency_stop_procedure: null },
      ])
      .mockResolvedValueOnce([]);

    const overview = await storage.getOverview();
    expect(overview.byLevel.L1).toHaveLength(1);
  });

  it('defaults workflow level to L2 when null', async () => {
    const storage = new AutonomyAuditStorage();
    vi.spyOn(storage as any, 'queryMany')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'w1', name: 'Workflow', autonomy_level: null, emergency_stop_procedure: null },
      ]);

    const overview = await storage.getOverview();
    expect(overview.byLevel.L2).toHaveLength(1);
  });

  it('ignores skills with unknown autonomy level', async () => {
    const storage = new AutonomyAuditStorage();
    vi.spyOn(storage as any, 'queryMany')
      .mockResolvedValueOnce([
        { id: 's1', name: 'Skill', autonomy_level: 'INVALID', emergency_stop_procedure: null },
      ])
      .mockResolvedValueOnce([]);

    const overview = await storage.getOverview();
    // INVALID level is not in byLevel, so nothing added
    const totalItems = Object.values(overview.byLevel).flat().length;
    expect(totalItems).toBe(0);
  });
});
