import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerRoutingRulesRoutes } from './routing-rules-routes.js';
import type { RoutingRule } from '@secureyeoman/shared';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRule(overrides: Partial<RoutingRule> = {}): RoutingRule {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    enabled: true,
    priority: 100,
    triggerDirection: 'inbound',
    triggerPlatforms: [],
    triggerIntegrationIds: [],
    triggerChatIdPattern: null,
    triggerSenderIdPattern: null,
    triggerKeywordPattern: null,
    actionType: 'forward',
    actionTargetIntegrationId: 'int-2',
    actionTargetChatId: 'chat-2',
    actionMessageTemplate: null,
    actionPersonalityId: null,
    actionWebhookUrl: null,
    matchCount: 0,
    lastMatchedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ── Mock Storage & Manager ────────────────────────────────────────────────────

function buildApp(
  storageOverrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {},
  managerOverrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}
) {
  const storage = {
    list: vi.fn().mockResolvedValue([makeRule()]),
    get: vi.fn().mockResolvedValue(makeRule()),
    create: vi.fn().mockResolvedValue(makeRule()),
    update: vi.fn().mockResolvedValue(makeRule()),
    delete: vi.fn().mockResolvedValue(true),
    ...storageOverrides,
  } as any;

  const manager = {
    testRule: vi.fn().mockReturnValue({ matched: true, rule: makeRule() }),
    ...managerOverrides,
  } as any;

  const app = Fastify({ logger: false });
  registerRoutingRulesRoutes(app, { storage, manager });
  return { app, storage, manager };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('routing-rules-routes', () => {
  describe('GET /api/v1/routing-rules', () => {
    it('returns list of rules', async () => {
      const { app } = buildApp();
      await app.ready();
      const res = await app.inject({ method: 'GET', url: '/api/v1/routing-rules' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it('passes enabled=true filter', async () => {
      const { app, storage } = buildApp();
      await app.ready();
      await app.inject({ method: 'GET', url: '/api/v1/routing-rules?enabled=true' });
      expect(storage.list).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });

    it('passes enabled=false filter', async () => {
      const { app, storage } = buildApp();
      await app.ready();
      await app.inject({ method: 'GET', url: '/api/v1/routing-rules?enabled=false' });
      expect(storage.list).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    });

    it('passes limit and offset filters', async () => {
      const { app, storage } = buildApp();
      await app.ready();
      await app.inject({ method: 'GET', url: '/api/v1/routing-rules?limit=10&offset=5' });
      expect(storage.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, offset: 5 }));
    });

    it('passes undefined for missing filters', async () => {
      const { app, storage } = buildApp();
      await app.ready();
      await app.inject({ method: 'GET', url: '/api/v1/routing-rules' });
      expect(storage.list).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: undefined, limit: undefined, offset: undefined })
      );
    });
  });

  describe('GET /api/v1/routing-rules/:id', () => {
    it('returns rule by id', async () => {
      const { app } = buildApp();
      await app.ready();
      const res = await app.inject({ method: 'GET', url: '/api/v1/routing-rules/rule-1' });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe('rule-1');
    });

    it('returns 404 when rule not found', async () => {
      const { app } = buildApp({ get: vi.fn().mockResolvedValue(null) });
      await app.ready();
      const res = await app.inject({ method: 'GET', url: '/api/v1/routing-rules/nonexistent' });
      expect(res.statusCode).toBe(404);
      expect(res.json().message).toContain('nonexistent');
    });
  });

  describe('POST /api/v1/routing-rules', () => {
    it('creates a rule and returns 201', async () => {
      const { app } = buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/routing-rules',
        payload: { name: 'New Rule', actionType: 'forward' },
      });
      expect(res.statusCode).toBe(201);
    });

    it('returns 400 when actionType is missing', async () => {
      const { app } = buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/routing-rules',
        payload: { name: 'New Rule' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain('actionType');
    });

    it('returns 400 when name is missing', async () => {
      const { app } = buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/routing-rules',
        payload: { actionType: 'forward' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain('name');
    });

    it('returns 400 when name is blank whitespace', async () => {
      const { app } = buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/routing-rules',
        payload: { name: '   ', actionType: 'forward' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when body is empty', async () => {
      const { app } = buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/routing-rules',
        payload: null,
        headers: { 'content-type': 'application/json' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('PUT /api/v1/routing-rules/:id', () => {
    it('updates a rule and returns it', async () => {
      const { app } = buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/routing-rules/rule-1',
        payload: { name: 'Updated Rule' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 when rule not found', async () => {
      const { app } = buildApp({ update: vi.fn().mockResolvedValue(null) });
      await app.ready();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/routing-rules/nonexistent',
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/routing-rules/:id', () => {
    it('deletes a rule and returns 204', async () => {
      const { app } = buildApp();
      await app.ready();
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/routing-rules/rule-1' });
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when rule not found', async () => {
      const { app } = buildApp({ delete: vi.fn().mockResolvedValue(false) });
      await app.ready();
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/routing-rules/nonexistent' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/routing-rules/:id/test', () => {
    it('returns test result for valid rule and platform', async () => {
      const { app } = buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/routing-rules/rule-1/test',
        payload: { platform: 'slack', direction: 'inbound', text: 'hello' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().matched).toBe(true);
    });

    it('returns 404 when rule not found', async () => {
      const { app } = buildApp({ get: vi.fn().mockResolvedValue(null) });
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/routing-rules/nonexistent/test',
        payload: { platform: 'slack' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when platform is missing', async () => {
      const { app } = buildApp();
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/routing-rules/rule-1/test',
        payload: { text: 'hello' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain('platform');
    });

    it('passes all dry-run params to testRule', async () => {
      const { app, manager } = buildApp();
      await app.ready();
      await app.inject({
        method: 'POST',
        url: '/api/v1/routing-rules/rule-1/test',
        payload: {
          platform: 'slack',
          direction: 'outbound',
          integrationId: 'int-1',
          chatId: 'chat-1',
          senderId: 'user-1',
          text: 'urgent help',
        },
      });
      expect(manager.testRule).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'rule-1' }),
        expect.objectContaining({
          platform: 'slack',
          direction: 'outbound',
          integrationId: 'int-1',
          chatId: 'chat-1',
          senderId: 'user-1',
          text: 'urgent help',
        })
      );
    });

    it('uses default direction=inbound when not provided', async () => {
      const { app, manager } = buildApp();
      await app.ready();
      await app.inject({
        method: 'POST',
        url: '/api/v1/routing-rules/rule-1/test',
        payload: { platform: 'slack' },
      });
      expect(manager.testRule).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ direction: 'inbound' })
      );
    });
  });
});
