/**
 * Access Review Routes Tests
 *
 * Route tests for the access review REST API.
 * No DB required — AccessReviewManager is fully mocked.
 */

import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerAccessReviewRoutes } from './access-review-routes.js';
import type { CampaignRecord, EntitlementRecord, DecisionRecord } from './access-review-storage.js';
import type { EntitlementEntry } from './access-review-manager.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;

const SAMPLE_ENTITLEMENT_ENTRY: EntitlementEntry = {
  userId: 'user-1',
  userName: 'Alice',
  entitlementType: 'role',
  entitlementValue: 'role_operator',
  details: { roleName: 'Operator' },
};

const SAMPLE_CAMPAIGN: CampaignRecord = {
  id: 'camp-1',
  name: 'Q1 Review',
  status: 'in_review',
  reviewerIds: ['reviewer-1'],
  scope: null,
  createdBy: 'admin',
  createdAt: NOW,
  closedAt: null,
  expiresAt: NOW + 30 * 86_400_000,
};

const SAMPLE_ENTITLEMENT: EntitlementRecord = {
  id: 'ent-1',
  campaignId: 'camp-1',
  userId: 'user-1',
  userName: 'Alice',
  entitlementType: 'role',
  entitlementValue: 'role_operator',
  details: null,
  createdAt: NOW,
};

const SAMPLE_DECISION: DecisionRecord = {
  id: 'dec-1',
  campaignId: 'camp-1',
  entitlementId: 'ent-1',
  reviewerId: 'reviewer-1',
  decision: 'approve',
  justification: null,
  createdAt: NOW,
};

function makeManager(overrides: Record<string, unknown> = {}) {
  return {
    getEntitlementReport: vi.fn().mockResolvedValue([SAMPLE_ENTITLEMENT_ENTRY]),
    createCampaign: vi.fn().mockResolvedValue(SAMPLE_CAMPAIGN),
    listCampaigns: vi.fn().mockResolvedValue([SAMPLE_CAMPAIGN]),
    getCampaign: vi.fn().mockResolvedValue({
      ...SAMPLE_CAMPAIGN,
      entitlements: [SAMPLE_ENTITLEMENT],
      decisions: [SAMPLE_DECISION],
    }),
    submitDecision: vi.fn().mockResolvedValue(SAMPLE_DECISION),
    closeCampaign: vi.fn().mockResolvedValue({ ...SAMPLE_CAMPAIGN, status: 'closed' }),
    ...overrides,
  };
}

function buildApp(
  manager: ReturnType<typeof makeManager> | null = makeManager(),
  authUserId = 'test-user'
) {
  const app = Fastify({ logger: false });
  // Simulate auth middleware — inject authUser on every request
  app.addHook('onRequest', async (request) => {
    (request as any).authUser = { userId: authUserId };
  });
  registerAccessReviewRoutes(app, { manager: manager as any });
  return { app, manager };
}

// ── GET /api/v1/security/access-review/entitlements ──────────────────────────

describe('GET /api/v1/security/access-review/entitlements', () => {
  it('returns entitlement list', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/security/access-review/entitlements',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.entitlements).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.entitlements[0].userId).toBe('user-1');
  });

  it('returns 500 on manager error', async () => {
    const mgr = makeManager({
      getEntitlementReport: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    const { app } = buildApp(mgr);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/security/access-review/entitlements',
    });
    expect(res.statusCode).toBe(500);
  });
});

// ── POST /api/v1/security/access-review/campaigns ────────────────────────────

describe('POST /api/v1/security/access-review/campaigns', () => {
  it('creates a campaign and returns 201', async () => {
    const { app, manager } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns',
      payload: { name: 'Q1 Review', reviewerIds: ['reviewer-1'] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().campaign.id).toBe('camp-1');
    expect(manager!.createCampaign).toHaveBeenCalledWith('Q1 Review', ['reviewer-1'], {
      scope: undefined,
      createdBy: 'test-user',
      expiryMs: undefined,
    });
  });

  it('passes optional fields to manager', async () => {
    const { app, manager } = buildApp();
    await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns',
      payload: {
        name: 'Scoped',
        reviewerIds: ['rev-1'],
        scope: 'engineering',
        expiryDays: 14,
      },
    });
    expect(manager!.createCampaign).toHaveBeenCalledWith('Scoped', ['rev-1'], {
      scope: 'engineering',
      createdBy: 'test-user',
      expiryMs: 14 * 24 * 60 * 60 * 1000,
    });
  });

  it('returns 400 when name is missing', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns',
      payload: { reviewerIds: ['rev-1'] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/name/i);
  });

  it('returns 400 when reviewerIds is missing', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns',
      payload: { name: 'Test' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/reviewerIds/i);
  });

  it('returns 400 when reviewerIds is empty array', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns',
      payload: { name: 'Test', reviewerIds: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 on manager error', async () => {
    const mgr = makeManager({
      createCampaign: vi.fn().mockRejectedValue(new Error('name is required')),
    });
    const { app } = buildApp(mgr);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns',
      payload: { name: '  ', reviewerIds: ['rev-1'] },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── GET /api/v1/security/access-review/campaigns ─────────────────────────────

describe('GET /api/v1/security/access-review/campaigns', () => {
  it('returns all campaigns', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/security/access-review/campaigns',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.campaigns).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('passes status filter to manager', async () => {
    const { app, manager } = buildApp();
    await app.inject({
      method: 'GET',
      url: '/api/v1/security/access-review/campaigns?status=closed',
    });
    expect(manager!.listCampaigns).toHaveBeenCalledWith({ status: 'closed' });
  });

  it('returns 400 for invalid status', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/security/access-review/campaigns?status=invalid',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/invalid status/i);
  });

  it('returns 500 on manager error', async () => {
    const mgr = makeManager({
      listCampaigns: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    const { app } = buildApp(mgr);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/security/access-review/campaigns',
    });
    expect(res.statusCode).toBe(500);
  });
});

// ── GET /api/v1/security/access-review/campaigns/:id ─────────────────────────

describe('GET /api/v1/security/access-review/campaigns/:id', () => {
  it('returns campaign with entitlements and decisions', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/security/access-review/campaigns/camp-1',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.campaign.id).toBe('camp-1');
    expect(body.campaign.entitlements).toHaveLength(1);
    expect(body.campaign.decisions).toHaveLength(1);
  });

  it('returns 404 when campaign not found', async () => {
    const mgr = makeManager({ getCampaign: vi.fn().mockResolvedValue(null) });
    const { app } = buildApp(mgr);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/security/access-review/campaigns/nonexistent',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toMatch(/not found/i);
  });

  it('returns 500 on manager error', async () => {
    const mgr = makeManager({
      getCampaign: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    const { app } = buildApp(mgr);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/security/access-review/campaigns/camp-1',
    });
    expect(res.statusCode).toBe(500);
  });
});

// ── POST /api/v1/security/access-review/campaigns/:id/decisions ──────────────

describe('POST /api/v1/security/access-review/campaigns/:id/decisions', () => {
  it('records a decision and returns 201', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns/camp-1/decisions',
      payload: {
        entitlementId: 'ent-1',
        decision: 'approve',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().decision.id).toBe('dec-1');
  });

  it('passes justification to manager', async () => {
    const { app, manager } = buildApp();
    await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns/camp-1/decisions',
      payload: {
        entitlementId: 'ent-1',
        decision: 'revoke',
        justification: 'Offboarded',
      },
    });
    expect(manager!.submitDecision).toHaveBeenCalledWith(
      'camp-1',
      'ent-1',
      'revoke',
      'test-user',
      'Offboarded'
    );
  });

  it('returns 400 when entitlementId is missing', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns/camp-1/decisions',
      payload: { decision: 'approve' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/entitlementId/i);
  });

  it('returns 400 when decision is missing', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns/camp-1/decisions',
      payload: { entitlementId: 'ent-1' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 when no auth user', async () => {
    const app = Fastify({ logger: false });
    registerAccessReviewRoutes(app, { manager: makeManager() as any });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns/camp-1/decisions',
      payload: { entitlementId: 'ent-1', decision: 'approve' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid decision value', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns/camp-1/decisions',
      payload: { entitlementId: 'ent-1', decision: 'skip' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/invalid decision/i);
  });

  it('returns 404 when campaign not found', async () => {
    const mgr = makeManager({
      submitDecision: vi.fn().mockRejectedValue(new Error('Campaign not found: bad')),
    });
    const { app } = buildApp(mgr);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns/bad/decisions',
      payload: { entitlementId: 'ent-1', decision: 'approve' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when campaign is closed', async () => {
    const mgr = makeManager({
      submitDecision: vi
        .fn()
        .mockRejectedValue(new Error('Campaign camp-1 is closed and cannot accept decisions')),
    });
    const { app } = buildApp(mgr);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns/camp-1/decisions',
      payload: { entitlementId: 'ent-1', decision: 'approve' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 409 when reviewer is not assigned', async () => {
    const mgr = makeManager({
      submitDecision: vi
        .fn()
        .mockRejectedValue(
          new Error('User test-user is not an assigned reviewer for campaign camp-1')
        ),
    });
    const { app } = buildApp(mgr);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns/camp-1/decisions',
      payload: { entitlementId: 'ent-1', decision: 'approve' },
    });
    expect(res.statusCode).toBe(409);
  });
});

// ── POST /api/v1/security/access-review/campaigns/:id/close ──────────────────

describe('POST /api/v1/security/access-review/campaigns/:id/close', () => {
  it('closes campaign and returns updated record', async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns/camp-1/close',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().campaign.status).toBe('closed');
  });

  it('uses auth user as closedBy', async () => {
    const { app, manager } = buildApp(undefined, 'admin-user');
    await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns/camp-1/close',
    });
    expect(manager!.closeCampaign).toHaveBeenCalledWith('camp-1', 'admin-user');
  });

  it('handles missing auth gracefully', async () => {
    const app = Fastify({ logger: false });
    registerAccessReviewRoutes(app, { manager: makeManager() as any });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns/camp-1/close',
    });
    // closedBy will be undefined when no auth
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when campaign not found', async () => {
    const mgr = makeManager({
      closeCampaign: vi.fn().mockRejectedValue(new Error('Campaign not found: bad')),
    });
    const { app } = buildApp(mgr);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns/bad/close',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when campaign is already closed', async () => {
    const mgr = makeManager({
      closeCampaign: vi.fn().mockRejectedValue(new Error('Campaign camp-1 is already closed')),
    });
    const { app } = buildApp(mgr);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns/camp-1/close',
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 409 when campaign is expired', async () => {
    const mgr = makeManager({
      closeCampaign: vi.fn().mockRejectedValue(new Error('Campaign camp-1 is expired')),
    });
    const { app } = buildApp(mgr);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns/camp-1/close',
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 500 on unexpected error', async () => {
    const mgr = makeManager({
      closeCampaign: vi.fn().mockRejectedValue(new Error('Database connection lost')),
    });
    const { app } = buildApp(mgr);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/access-review/campaigns/camp-1/close',
    });
    expect(res.statusCode).toBe(500);
  });
});
