import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { registerProviderAccountRoutes } from './provider-account-routes.js';

vi.mock('../utils/errors.js', () => ({
  sendError: (reply: any, statusCode: number, message: string) =>
    reply.code(statusCode).send({ error: 'Error', message, statusCode }),
}));

const NOW = Date.now();

function sampleAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    provider: 'anthropic',
    label: 'Test Key',
    secretName: 'sec_1',
    isDefault: true,
    status: 'active',
    accountInfo: null,
    lastValidatedAt: null,
    baseUrl: null,
    tenantId: null,
    createdBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeMockManager() {
  return {
    createAccount: vi.fn(),
    getAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    listAccounts: vi.fn(),
    setDefault: vi.fn(),
    validateAccount: vi.fn(),
    rotateKey: vi.fn(),
    validateAllAccounts: vi.fn(),
    getCostSummary: vi.fn(),
    getCostTrend: vi.fn(),
    recordCost: vi.fn(),
  };
}

describe('Provider Account Routes', () => {
  let app: ReturnType<typeof Fastify>;
  let mockManager: ReturnType<typeof makeMockManager>;

  beforeEach(async () => {
    mockManager = makeMockManager();
    app = Fastify({ logger: false });
    registerProviderAccountRoutes(app, {
      providerAccountManager: mockManager as any,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // ── POST /api/v1/provider-accounts ──────────────────────────────

  describe('POST /api/v1/provider-accounts', () => {
    it('creates an account and returns 201', async () => {
      const account = sampleAccount();
      mockManager.createAccount.mockResolvedValue(account);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/provider-accounts',
        payload: { provider: 'anthropic', label: 'Test Key', apiKey: 'sk-test-123' },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.id).toBe('acc-1');
      expect(body.provider).toBe('anthropic');
      expect(mockManager.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'anthropic',
          label: 'Test Key',
          apiKey: 'sk-test-123',
        })
      );
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/provider-accounts',
        payload: { provider: 'anthropic' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/provider, label, and apiKey are required/);
      expect(mockManager.createAccount).not.toHaveBeenCalled();
    });
  });

  // ── GET /api/v1/provider-accounts ───────────────────────────────

  describe('GET /api/v1/provider-accounts', () => {
    it('returns a list of accounts', async () => {
      const accounts = [sampleAccount(), sampleAccount({ id: 'acc-2', label: 'Key 2' })];
      mockManager.listAccounts.mockResolvedValue(accounts);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/provider-accounts',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveLength(2);
      expect(mockManager.listAccounts).toHaveBeenCalledWith(undefined);
    });

    it('passes provider query param to listAccounts', async () => {
      mockManager.listAccounts.mockResolvedValue([]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/provider-accounts?provider=openai',
      });

      expect(res.statusCode).toBe(200);
      expect(mockManager.listAccounts).toHaveBeenCalledWith('openai');
    });
  });

  // ── GET /api/v1/provider-accounts/:id ───────────────────────────

  describe('GET /api/v1/provider-accounts/:id', () => {
    it('returns an account when found', async () => {
      const account = sampleAccount();
      mockManager.getAccount.mockResolvedValue(account);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/provider-accounts/acc-1',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe('acc-1');
      expect(mockManager.getAccount).toHaveBeenCalledWith('acc-1');
    });

    it('returns 404 when account is not found', async () => {
      mockManager.getAccount.mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/provider-accounts/nonexistent',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/Account not found/);
    });
  });

  // ── PUT /api/v1/provider-accounts/:id ───────────────────────────

  describe('PUT /api/v1/provider-accounts/:id', () => {
    it('updates and returns the account', async () => {
      const updated = sampleAccount({ label: 'Updated Label' });
      mockManager.updateAccount.mockResolvedValue(updated);

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/provider-accounts/acc-1',
        payload: { label: 'Updated Label' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.label).toBe('Updated Label');
      expect(mockManager.updateAccount).toHaveBeenCalledWith('acc-1', { label: 'Updated Label' });
    });

    it('returns 404 when account is not found', async () => {
      mockManager.updateAccount.mockResolvedValue(null);

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/provider-accounts/nonexistent',
        payload: { label: 'Nope' },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/Account not found/);
    });
  });

  // ── DELETE /api/v1/provider-accounts/:id ────────────────────────

  describe('DELETE /api/v1/provider-accounts/:id', () => {
    it('deletes and returns 204', async () => {
      mockManager.deleteAccount.mockResolvedValue(true);

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/provider-accounts/acc-1',
      });

      expect(res.statusCode).toBe(204);
      expect(res.body).toBe('');
      expect(mockManager.deleteAccount).toHaveBeenCalledWith('acc-1');
    });

    it('returns 404 when account is not found', async () => {
      mockManager.deleteAccount.mockResolvedValue(false);

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/provider-accounts/nonexistent',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/Account not found/);
    });
  });

  // ── POST /api/v1/provider-accounts/:id/set-default ─────────────

  describe('POST /api/v1/provider-accounts/:id/set-default', () => {
    it('sets the account as default', async () => {
      const account = sampleAccount();
      mockManager.setDefault.mockResolvedValue(account);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/provider-accounts/acc-1/set-default',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe('acc-1');
      expect(mockManager.setDefault).toHaveBeenCalledWith('acc-1');
    });

    it('returns 404 when account is not found', async () => {
      mockManager.setDefault.mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/provider-accounts/nonexistent/set-default',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/Account not found/);
    });
  });

  // ── POST /api/v1/provider-accounts/:id/validate ────────────────

  describe('POST /api/v1/provider-accounts/:id/validate', () => {
    it('validates the account and returns it', async () => {
      const account = sampleAccount({ status: 'active', lastValidatedAt: NOW });
      mockManager.validateAccount.mockResolvedValue(account);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/provider-accounts/acc-1/validate',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('active');
      expect(mockManager.validateAccount).toHaveBeenCalledWith('acc-1');
    });

    it('returns 404 when account is not found', async () => {
      mockManager.validateAccount.mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/provider-accounts/nonexistent/validate',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/Account not found/);
    });
  });

  // ── POST /api/v1/provider-accounts/:id/rotate ──────────────────

  describe('POST /api/v1/provider-accounts/:id/rotate', () => {
    it('rotates the key and returns the updated account', async () => {
      const account = sampleAccount();
      mockManager.rotateKey.mockResolvedValue(account);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/provider-accounts/acc-1/rotate',
        payload: { newKey: 'sk-new-key-456' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe('acc-1');
      expect(mockManager.rotateKey).toHaveBeenCalledWith('acc-1', 'sk-new-key-456');
    });

    it('returns 400 when newKey is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/provider-accounts/acc-1/rotate',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/newKey is required/);
      expect(mockManager.rotateKey).not.toHaveBeenCalled();
    });

    it('returns 404 when account is not found', async () => {
      mockManager.rotateKey.mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/provider-accounts/nonexistent/rotate',
        payload: { newKey: 'sk-new-key-456' },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/Account not found/);
    });
  });

  // ── POST /api/v1/provider-accounts/validate-all ─────────────────

  describe('POST /api/v1/provider-accounts/validate-all', () => {
    it('validates all accounts and returns summary', async () => {
      const result = { total: 3, valid: 2, invalid: 1 };
      mockManager.validateAllAccounts.mockResolvedValue(result);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/provider-accounts/validate-all',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.total).toBe(3);
      expect(body.valid).toBe(2);
      expect(body.invalid).toBe(1);
    });
  });

  // ── GET /api/v1/provider-accounts/costs ─────────────────────────

  describe('GET /api/v1/provider-accounts/costs', () => {
    it('returns cost summary', async () => {
      const costData = [
        {
          accountId: 'acc-1',
          provider: 'anthropic',
          label: 'Test Key',
          totalCostUsd: 12.5,
          totalInputTokens: 100000,
          totalOutputTokens: 50000,
          totalRequests: 250,
        },
      ];
      mockManager.getCostSummary.mockResolvedValue(costData);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/provider-accounts/costs',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveLength(1);
      expect(body[0].totalCostUsd).toBe(12.5);
    });

    it('passes query params to getCostSummary', async () => {
      mockManager.getCostSummary.mockResolvedValue([]);

      const from = String(Date.now() - 86400000);
      const to = String(Date.now());
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/provider-accounts/costs?from=${from}&to=${to}&accountId=acc-1`,
      });

      expect(res.statusCode).toBe(200);
      expect(mockManager.getCostSummary).toHaveBeenCalledWith({
        from: Number(from),
        to: Number(to),
        accountId: 'acc-1',
      });
    });
  });

  // ── GET /api/v1/provider-accounts/costs/trend ───────────────────

  describe('GET /api/v1/provider-accounts/costs/trend', () => {
    it('returns cost trend data', async () => {
      const trendData = [
        { date: '2026-03-01', costUsd: 5.0, requests: 100 },
        { date: '2026-03-02', costUsd: 7.5, requests: 150 },
      ];
      mockManager.getCostTrend.mockResolvedValue(trendData);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/provider-accounts/costs/trend?days=7&accountId=acc-1',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveLength(2);
      expect(body[0].date).toBe('2026-03-01');
      expect(mockManager.getCostTrend).toHaveBeenCalledWith({
        accountId: 'acc-1',
        days: 7,
      });
    });
  });

  // ── GET /api/v1/provider-accounts/costs/export ──────────────────

  describe('GET /api/v1/provider-accounts/costs/export', () => {
    it('returns CSV content with correct headers', async () => {
      const costData = [
        {
          accountId: 'acc-1',
          provider: 'anthropic',
          label: 'Test Key',
          totalCostUsd: 12.5,
          totalInputTokens: 100000,
          totalOutputTokens: 50000,
          totalRequests: 250,
        },
        {
          accountId: 'acc-2',
          provider: 'openai',
          label: 'GPT Key',
          totalCostUsd: 8.25,
          totalInputTokens: 80000,
          totalOutputTokens: 40000,
          totalRequests: 180,
        },
      ];
      mockManager.getCostSummary.mockResolvedValue(costData);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/provider-accounts/costs/export',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/csv');
      expect(res.headers['content-disposition']).toBe('attachment; filename="provider-costs.csv"');

      const lines = res.body.split('\n');
      expect(lines[0]).toBe(
        'account_id,provider,label,total_cost_usd,total_input_tokens,total_output_tokens,total_requests'
      );
      expect(lines[1]).toBe('"acc-1","anthropic","Test Key",12.5,100000,50000,250');
      expect(lines[2]).toBe('"acc-2","openai","GPT Key",8.25,80000,40000,180');
      expect(lines).toHaveLength(3);
    });
  });
});
