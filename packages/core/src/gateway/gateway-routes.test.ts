/**
 * Gateway Routes tests (Phase 80)
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerGatewayRoutes } from './gateway-routes.js';

// Mock auth storage
const mockAuthStorage = {
  getTokensUsedToday: vi.fn(),
  recordKeyUsage: vi.fn(),
  getKeyUsage: vi.fn(),
  getUsageSummary: vi.fn(),
};

// Counter used to generate unique apiKeyId per test to avoid RPM window interference
let testKeyCounter = 0;

function buildApp(authUserOverrides: Record<string, unknown> = {}) {
  testKeyCounter++;
  const keyId = `key-test-${testKeyCounter}`;

  const app = Fastify({ logger: false });

  app.addHook('onRequest', async (request) => {
    (request as any).authUser = {
      userId: 'user-1',
      role: 'admin',
      permissions: [],
      authMethod: 'api_key',
      apiKeyId: keyId,
      isGatewayKey: true,
      ...authUserOverrides,
    };
  });

  registerGatewayRoutes(app, {
    secureYeoman: {} as any,
    authStorage: mockAuthStorage as any,
  });

  return { app, keyId };
}

describe('Gateway Routes', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthStorage.getTokensUsedToday.mockResolvedValue(0);
    mockAuthStorage.recordKeyUsage.mockResolvedValue(undefined);
    mockAuthStorage.getKeyUsage.mockResolvedValue([]);
    mockAuthStorage.getUsageSummary.mockResolvedValue([]);
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  // ── Main gateway endpoint ──────────────────────────────────────────────

  describe('POST /api/v1/gateway', () => {
    it('should forward request to /api/v1/chat and relay the response', async () => {
      const { app: a } = buildApp({
        gatewayRateLimitRpm: undefined,
        gatewayRateLimitTpd: undefined,
      });
      app = a;

      app.post('/api/v1/chat', async (_req, reply) => {
        return reply.send({ response: 'hello from chat', tokensUsed: 42 });
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/gateway',
        payload: { message: 'hello' },
        headers: { Authorization: 'Bearer test-token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.response).toBe('hello from chat');
    });

    it('should return 429 when RPM limit is exceeded', async () => {
      const { app: a, _keyId } = buildApp({
        gatewayRateLimitRpm: 2,
        gatewayRateLimitTpd: undefined,
        apiKeyId: `rpm-key-${testKeyCounter}`,
      });
      app = a;

      app.post('/api/v1/chat', async (_req, reply) => {
        return reply.send({ response: 'ok', tokensUsed: 1 });
      });

      // Override authUser to use a specific key for this test
      const uniqueKey = `rpm-unique-${Date.now()}-${Math.random()}`;
      const appRpm = Fastify({ logger: false });
      appRpm.addHook('onRequest', async (request) => {
        (request as any).authUser = {
          userId: 'user-1',
          role: 'admin',
          permissions: [],
          apiKeyId: uniqueKey,
          isGatewayKey: true,
          gatewayRateLimitRpm: 2,
        };
      });
      registerGatewayRoutes(appRpm, {
        secureYeoman: {} as any,
        authStorage: mockAuthStorage as any,
      });
      appRpm.post('/api/v1/chat', async (_req, reply) => {
        return reply.send({ response: 'ok', tokensUsed: 1 });
      });

      const res1 = await appRpm.inject({
        method: 'POST',
        url: '/api/v1/gateway',
        payload: { message: 'a' },
      });
      const res2 = await appRpm.inject({
        method: 'POST',
        url: '/api/v1/gateway',
        payload: { message: 'b' },
      });
      const res3 = await appRpm.inject({
        method: 'POST',
        url: '/api/v1/gateway',
        payload: { message: 'c' },
      });

      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);
      expect(res3.statusCode).toBe(429);
      expect(JSON.parse(res3.body).message).toContain('Rate limit exceeded');
      expect(res3.headers['retry-after']).toBe('60');

      await appRpm.close();
    });

    it('should return 429 with "quota" message when TPD is exceeded', async () => {
      const { app: a } = buildApp({
        gatewayRateLimitRpm: undefined,
        gatewayRateLimitTpd: 100,
      });
      app = a;

      // Simulate 100 tokens already used today (at quota)
      mockAuthStorage.getTokensUsedToday.mockResolvedValue(100);

      app.post('/api/v1/chat', async (_req, reply) => {
        return reply.send({ response: 'ok', tokensUsed: 1 });
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/gateway',
        payload: { message: 'over quota' },
        headers: { Authorization: 'Bearer t' },
      });

      expect(res.statusCode).toBe(429);
      expect(JSON.parse(res.body).message).toContain('quota');
    });

    it('should allow request when TPD usage is below limit', async () => {
      const { app: a } = buildApp({
        gatewayRateLimitRpm: undefined,
        gatewayRateLimitTpd: 1000,
      });
      app = a;

      mockAuthStorage.getTokensUsedToday.mockResolvedValue(50);

      app.post('/api/v1/chat', async (_req, reply) => {
        return reply.send({ response: 'ok', tokensUsed: 10 });
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/gateway',
        payload: { message: 'hello' },
      });

      expect(res.statusCode).toBe(200);
    });

    it('should inject personalityId from key binding', async () => {
      const { app: a } = buildApp({
        gatewayPersonalityId: 'bound-personality-id',
        gatewayRateLimitRpm: undefined,
        gatewayRateLimitTpd: undefined,
      });
      app = a;

      let receivedBody: any;
      app.post('/api/v1/chat', async (req, reply) => {
        receivedBody = req.body;
        return reply.send({ response: 'ok', tokensUsed: 5 });
      });

      await app.inject({
        method: 'POST',
        url: '/api/v1/gateway',
        payload: { message: 'hi' },
        headers: { Authorization: 'Bearer t' },
      });

      expect(receivedBody?.personalityId).toBe('bound-personality-id');
    });

    it('should not override personalityId if key has no binding', async () => {
      const { app: a } = buildApp({
        gatewayPersonalityId: undefined,
        gatewayRateLimitRpm: undefined,
        gatewayRateLimitTpd: undefined,
      });
      app = a;

      let receivedBody: any;
      app.post('/api/v1/chat', async (req, reply) => {
        receivedBody = req.body;
        return reply.send({ response: 'ok', tokensUsed: 5 });
      });

      await app.inject({
        method: 'POST',
        url: '/api/v1/gateway',
        payload: { message: 'hi', personalityId: 'caller-supplied' },
        headers: { Authorization: 'Bearer t' },
      });

      expect(receivedBody?.personalityId).toBe('caller-supplied');
    });

    it('should record usage after the request completes', async () => {
      const { app: a } = buildApp({
        gatewayRateLimitRpm: undefined,
        gatewayRateLimitTpd: undefined,
      });
      app = a;

      app.post('/api/v1/chat', async (_req, reply) => {
        return reply.send({ response: 'ok', tokensUsed: 10 });
      });

      await app.inject({
        method: 'POST',
        url: '/api/v1/gateway',
        payload: { message: 'test' },
        headers: { Authorization: 'Bearer test-token' },
      });

      // recordKeyUsage is fire & forget — allow microtask to flush
      await new Promise((r) => setTimeout(r, 10));
      expect(mockAuthStorage.recordKeyUsage).toHaveBeenCalled();
    });

    it('should relay non-200 status codes from chat endpoint', async () => {
      const { app: a } = buildApp({
        gatewayRateLimitRpm: undefined,
        gatewayRateLimitTpd: undefined,
      });
      app = a;

      app.post('/api/v1/chat', async (_req, reply) => {
        return reply.code(400).send({ error: 'Bad Request', message: 'invalid input' });
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/gateway',
        payload: { message: 'bad' },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ── Analytics endpoints ─────────────────────────────────────────────────

  describe('GET /api/v1/auth/api-keys/:id/usage', () => {
    it('should return usage rows for a key', async () => {
      const { app: a } = buildApp();
      app = a;

      const usageRows = [
        {
          id: 'u1',
          key_id: 'key-1',
          timestamp: Date.now(),
          tokens_used: 42,
          latency_ms: 150,
          personality_id: null,
          status_code: 200,
          error_message: null,
        },
      ];
      mockAuthStorage.getKeyUsage.mockResolvedValueOnce(usageRows);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/api-keys/key-1/usage',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.usage).toHaveLength(1);
    });

    it('should accept from and to query params', async () => {
      const { app: a } = buildApp();
      app = a;

      mockAuthStorage.getKeyUsage.mockResolvedValueOnce([]);

      const from = Date.now() - 86_400_000;
      const to = Date.now();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/auth/api-keys/key-1/usage?from=${from}&to=${to}`,
      });

      expect(res.statusCode).toBe(200);
      expect(mockAuthStorage.getKeyUsage).toHaveBeenCalledWith('key-1', from, to);
    });

    it('should return empty array when no usage records', async () => {
      const { app: a } = buildApp();
      app = a;

      mockAuthStorage.getKeyUsage.mockResolvedValueOnce([]);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/api-keys/key-1/usage',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).usage).toHaveLength(0);
    });
  });

  describe('GET /api/v1/auth/api-keys/usage/summary', () => {
    it('should return JSON summary', async () => {
      const { app: a } = buildApp();
      app = a;

      mockAuthStorage.getUsageSummary.mockResolvedValueOnce([
        {
          keyId: 'k1',
          keyPrefix: 'sck_abc',
          personalityId: null,
          requests24h: 100,
          tokens24h: 5000,
          errors24h: 2,
          p50LatencyMs: 120,
          p95LatencyMs: 350,
        },
      ]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/api-keys/usage/summary',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.summary).toHaveLength(1);
      expect(body.summary[0].keyId).toBe('k1');
    });

    it('should return CSV when format=csv is requested', async () => {
      const { app: a } = buildApp();
      app = a;

      mockAuthStorage.getUsageSummary.mockResolvedValueOnce([
        {
          keyId: 'k1',
          keyPrefix: 'sck_abc',
          personalityId: 'p1',
          requests24h: 5,
          tokens24h: 100,
          errors24h: 0,
          p50LatencyMs: 50,
          p95LatencyMs: 100,
        },
      ]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/api-keys/usage/summary?format=csv',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.body).toContain('keyId,keyPrefix');
      expect(res.body).toContain('k1,sck_abc');
    });

    it('should include headers in CSV output', async () => {
      const { app: a } = buildApp();
      app = a;

      mockAuthStorage.getUsageSummary.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/api-keys/usage/summary?format=csv',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain(
        'keyId,keyPrefix,personalityId,requests24h,tokens24h,errors24h,p50LatencyMs,p95LatencyMs'
      );
    });

    it('should return empty summary array when no data', async () => {
      const { app: a } = buildApp();
      app = a;

      mockAuthStorage.getUsageSummary.mockResolvedValueOnce([]);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/api-keys/usage/summary',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).summary).toHaveLength(0);
    });
  });
});
