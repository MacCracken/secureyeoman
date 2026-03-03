/**
 * License guard integration tests — Phase 106
 *
 * Tests that enterprise routes return 402 when enforcement is on + feature not licensed,
 * and pass through when enforcement is off or feature is licensed.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerTrainingRoutes } from '../training/training-routes.js';
import { registerSsoRoutes } from '../gateway/sso-routes.js';
import { registerTenantRoutes } from '../tenants/tenant-routes.js';
import { registerAlertRoutes } from '../telemetry/alert-routes.js';
import { registerCicdWebhookRoutes } from '../integrations/cicd/cicd-webhook-routes.js';
import { LicenseManager } from './license-manager.js';

// ── Mock SecureYeoman builder ────────────────────────────────────────────────

function buildMockSY(enforcementEnabled: boolean) {
  const origEnv = process.env.SECUREYEOMAN_LICENSE_ENFORCEMENT;
  process.env.SECUREYEOMAN_LICENSE_ENFORCEMENT = enforcementEnabled ? 'true' : 'false';
  const lm = new LicenseManager(); // no key = community tier
  if (origEnv === undefined) delete process.env.SECUREYEOMAN_LICENSE_ENFORCEMENT;
  else process.env.SECUREYEOMAN_LICENSE_ENFORCEMENT = origEnv;

  return {
    getLicenseManager: vi.fn(() => lm),
    getConversationStorage: vi.fn(() => null),
    getBrainManager: vi.fn(() => null),
    getDistillationManager: vi.fn(() => ({
      createJob: vi.fn(async () => ({ id: 'j1', status: 'pending' })),
      listJobs: vi.fn(async () => []),
      getJob: vi.fn(async () => null),
      deleteJob: vi.fn(async () => false),
      runJob: vi.fn(async () => undefined),
    })),
    getFinetuneManager: vi.fn(() => ({
      createJob: vi.fn(async () => ({ id: 'ft1', status: 'pending' })),
      listJobs: vi.fn(async () => []),
      getJob: vi.fn(async () => null),
      deleteJob: vi.fn(async () => false),
      startJob: vi.fn(async () => undefined),
      registerWithOllama: vi.fn(async () => undefined),
      streamLogs: vi.fn(async function* () {}),
    })),
    getAIClient: vi.fn(() => ({
      chat: vi.fn(async () => ({
        content: 'response',
        id: 'r1',
        usage: {},
        stopReason: 'end_turn',
        model: 'test',
        provider: 'test',
      })),
    })),
    getComputerUseManager: vi.fn(() => null),
    getConversationQualityScorer: vi.fn(() => null),
    getEvaluationManager: vi.fn(() => null),
  } as any;
}

// ── Training routes (adaptive_learning) ──────────────────────────────────────

describe('Training routes — license guard', () => {
  describe('enforcement ON (no license key)', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
      app = Fastify({ logger: false });
      const sy = buildMockSY(true);
      registerTrainingRoutes(app, { secureYeoman: sy });
      await app.ready();
    });

    afterEach(async () => {
      await app.close();
    });

    it('POST distillation/jobs returns 402', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/training/distillation/jobs',
        payload: { name: 'x', teacherProvider: 'a', teacherModel: 'b', outputPath: '/tmp/x' },
      });
      expect(res.statusCode).toBe(402);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('enterprise_license_required');
      expect(body.feature).toBe('adaptive_learning');
    });

    it('DELETE distillation/jobs/:id returns 402', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/training/distillation/jobs/j1',
      });
      expect(res.statusCode).toBe(402);
    });

    it('POST distillation/jobs/:id/run returns 402', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/training/distillation/jobs/j1/run',
      });
      expect(res.statusCode).toBe(402);
    });

    it('POST finetune/jobs returns 402', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/training/finetune/jobs',
        payload: { name: 'x', baseModel: 'b', adapterName: 'a', datasetPath: '/tmp/x' },
      });
      expect(res.statusCode).toBe(402);
    });

    it('DELETE finetune/jobs/:id returns 402', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/training/finetune/jobs/ft1',
      });
      expect(res.statusCode).toBe(402);
    });

    it('POST finetune/jobs/:id/register returns 402', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/training/finetune/jobs/ft1/register',
      });
      expect(res.statusCode).toBe(402);
    });

    it('GET distillation/jobs passes (read-only not gated)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/training/distillation/jobs',
      });
      expect(res.statusCode).not.toBe(402);
    });

    it('GET finetune/jobs passes (read-only not gated)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/training/finetune/jobs',
      });
      expect(res.statusCode).not.toBe(402);
    });
  });

  describe('enforcement OFF', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
      app = Fastify({ logger: false });
      const sy = buildMockSY(false);
      registerTrainingRoutes(app, { secureYeoman: sy });
      await app.ready();
    });

    afterEach(async () => {
      await app.close();
    });

    it('POST distillation/jobs passes through', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/training/distillation/jobs',
        payload: { name: 'x', teacherProvider: 'a', teacherModel: 'b', outputPath: '/tmp/x' },
      });
      expect(res.statusCode).not.toBe(402);
    });

    it('POST finetune/jobs passes through', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/training/finetune/jobs',
        payload: { name: 'x', baseModel: 'b', adapterName: 'a', datasetPath: '/tmp/x' },
      });
      expect(res.statusCode).not.toBe(402);
    });
  });
});

// ── Tenant routes (multi_tenancy) ────────────────────────────────────────────

describe('Tenant routes — license guard', () => {
  describe('enforcement ON', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
      app = Fastify({ logger: false });
      const sy = buildMockSY(true);
      const tenantManager = {
        list: vi.fn(async () => ({ records: [], total: 0 })),
        create: vi.fn(async () => ({ id: 't1', name: 'Test', slug: 'test' })),
        getById: vi.fn(async () => null),
        update: vi.fn(async () => null),
        delete: vi.fn(async () => undefined),
      } as any;
      registerTenantRoutes(app, { tenantManager, secureYeoman: sy });
      await app.ready();
    });

    afterEach(async () => {
      await app.close();
    });

    it('GET /admin/tenants returns 402', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/tenants' });
      expect(res.statusCode).toBe(402);
      expect(JSON.parse(res.payload).feature).toBe('multi_tenancy');
    });

    it('POST /admin/tenants returns 402', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/tenants',
        payload: { name: 'X', slug: 'x' },
      });
      expect(res.statusCode).toBe(402);
    });

    it('GET /admin/tenants/:id returns 402', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/tenants/t1' });
      expect(res.statusCode).toBe(402);
    });

    it('PUT /admin/tenants/:id returns 402', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/tenants/t1',
        payload: { name: 'Y' },
      });
      expect(res.statusCode).toBe(402);
    });

    it('DELETE /admin/tenants/:id returns 402', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/admin/tenants/t1' });
      expect(res.statusCode).toBe(402);
    });
  });

  describe('enforcement OFF', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
      app = Fastify({ logger: false });
      const sy = buildMockSY(false);
      const tenantManager = {
        list: vi.fn(async () => ({ records: [], total: 0 })),
        create: vi.fn(async () => ({ id: 't1', name: 'Test', slug: 'test' })),
        getById: vi.fn(async () => null),
        update: vi.fn(async () => null),
        delete: vi.fn(async () => undefined),
      } as any;
      registerTenantRoutes(app, { tenantManager, secureYeoman: sy });
      await app.ready();
    });

    afterEach(async () => {
      await app.close();
    });

    it('GET /admin/tenants passes through', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/tenants' });
      expect(res.statusCode).toBe(200);
    });
  });
});

// ── SSO routes (sso_saml) ────────────────────────────────────────────────────

describe('SSO routes — license guard', () => {
  describe('enforcement ON', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
      app = Fastify({ logger: false });
      const sy = buildMockSY(true);
      const ssoManager = {} as any;
      const ssoStorage = {
        listIdentityProviders: vi.fn(async () => []),
        createIdentityProvider: vi.fn(async () => ({ id: 'p1', name: 'Test' })),
        getIdentityProvider: vi.fn(async () => null),
        updateIdentityProvider: vi.fn(async () => null),
        deleteIdentityProvider: vi.fn(async () => false),
      } as any;
      registerSsoRoutes(app, {
        ssoManager,
        ssoStorage,
        dashboardUrl: 'http://localhost:3000',
        secureYeoman: sy,
      });
      await app.ready();
    });

    afterEach(async () => {
      await app.close();
    });

    it('POST /auth/sso/providers returns 402', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/sso/providers',
        payload: { name: 'Test', type: 'oidc' },
      });
      expect(res.statusCode).toBe(402);
      expect(JSON.parse(res.payload).feature).toBe('sso_saml');
    });

    it('PUT /auth/sso/providers/:id returns 402', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/auth/sso/providers/p1',
        payload: { name: 'Updated' },
      });
      expect(res.statusCode).toBe(402);
    });

    it('DELETE /auth/sso/providers/:id returns 402', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/auth/sso/providers/p1',
      });
      expect(res.statusCode).toBe(402);
    });

    it('GET /auth/sso/providers passes (public discovery)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/sso/providers',
      });
      expect(res.statusCode).not.toBe(402);
    });
  });
});

// ── Alert routes (advanced_observability) ────────────────────────────────────

describe('Alert routes — license guard', () => {
  describe('enforcement ON', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
      app = Fastify({ logger: false });
      const sy = buildMockSY(true);
      const alertManager = {
        listRules: vi.fn(async () => []),
        createRule: vi.fn(async () => ({ id: 'r1' })),
        getRule: vi.fn(async () => null),
        updateRule: vi.fn(async () => null),
        deleteRule: vi.fn(async () => false),
        testRule: vi.fn(async () => ({ fired: false, value: 0 })),
      } as any;
      registerAlertRoutes(app, { alertManager, secureYeoman: sy });
      await app.ready();
    });

    afterEach(async () => {
      await app.close();
    });

    it('POST /alerts/rules returns 402', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/alerts/rules',
        payload: {
          name: 'Test',
          metricPath: 'cpu',
          operator: 'gt',
          threshold: 90,
          cooldownSeconds: 300,
          channels: [],
        },
      });
      expect(res.statusCode).toBe(402);
      expect(JSON.parse(res.payload).feature).toBe('advanced_observability');
    });

    it('PATCH /alerts/rules/:id returns 402', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/alerts/rules/r1',
        payload: { name: 'Updated' },
      });
      expect(res.statusCode).toBe(402);
    });

    it('DELETE /alerts/rules/:id returns 402', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/alerts/rules/r1' });
      expect(res.statusCode).toBe(402);
    });

    it('POST /alerts/rules/:id/test returns 402', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/alerts/rules/r1/test',
      });
      expect(res.statusCode).toBe(402);
    });

    it('GET /alerts/rules passes (read-only)', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/rules' });
      expect(res.statusCode).toBe(200);
    });

    it('GET /alerts/rules/:id passes (read-only)', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/rules/r1' });
      expect(res.statusCode).not.toBe(402);
    });
  });
});

// ── CICD webhook routes (cicd_integration) ───────────────────────────────────

describe('CICD webhook routes — license guard', () => {
  describe('enforcement ON', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
      app = Fastify({ logger: false });
      const sy = buildMockSY(true);
      registerCicdWebhookRoutes(app, { secureYeoman: sy });
      await app.ready();
    });

    afterEach(async () => {
      await app.close();
    });

    it('POST /webhooks/ci/github returns 402', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/ci/github',
        payload: {},
        headers: { 'x-github-event': 'push' },
      });
      expect(res.statusCode).toBe(402);
      expect(JSON.parse(res.payload).feature).toBe('cicd_integration');
    });

    it('POST /webhooks/ci/jenkins returns 402', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/ci/jenkins',
        payload: {},
      });
      expect(res.statusCode).toBe(402);
    });
  });

  describe('enforcement OFF', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
      app = Fastify({ logger: false });
      const sy = buildMockSY(false);
      registerCicdWebhookRoutes(app, { secureYeoman: sy });
      await app.ready();
    });

    afterEach(async () => {
      await app.close();
    });

    it('POST /webhooks/ci/github passes through', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/ci/github',
        payload: {},
        headers: { 'x-github-event': 'push' },
      });
      expect(res.statusCode).not.toBe(402);
    });
  });
});
