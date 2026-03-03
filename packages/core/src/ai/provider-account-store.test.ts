/**
 * ProviderAccountStorage Tests (Phase 112)
 *
 * Note: named -store.test.ts (not -storage.test.ts) to avoid vitest unit config exclusion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderAccountStorage } from './provider-account-storage.js';

// ── Mock pg pool ─────────────────────────────────────────────────────
const mockQuery = vi.fn();
vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({
    query: mockQuery,
    connect: vi.fn().mockResolvedValue({
      query: mockQuery,
      release: vi.fn(),
    }),
  }),
}));

vi.mock('node:crypto', () => {
  const mod = { randomUUID: () => 'test-uuid-1234' };
  return { ...mod, default: mod };
});

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    provider: 'anthropic',
    label: 'My Anthropic Key',
    secret_name: 'provider_account_anthropic_123',
    is_default: true,
    account_info: null,
    status: 'active',
    last_validated_at: null,
    base_url: null,
    tenant_id: null,
    created_by: null,
    created_at: '2026-03-03T00:00:00Z',
    updated_at: '2026-03-03T00:00:00Z',
    ...overrides,
  };
}

describe('ProviderAccountStorage', () => {
  let storage: ProviderAccountStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new ProviderAccountStorage();
  });

  describe('createAccount', () => {
    it('inserts a row and returns the account', async () => {
      const row = makeRow({ id: 'test-uuid-1234' });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const result = await storage.createAccount({
        provider: 'anthropic',
        label: 'My Key',
        secretName: 'sec_123',
      });

      expect(result.id).toBe('test-uuid-1234');
      expect(result.provider).toBe('anthropic');
      expect(result.label).toBe('My Anthropic Key');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAccount', () => {
    it('returns account when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow()], rowCount: 1 });
      const result = await storage.getAccount('acc-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('acc-1');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getAccount('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('updateAccount', () => {
    it('updates label and returns updated account', async () => {
      const row = makeRow({ label: 'Updated Label' });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const result = await storage.updateAccount('acc-1', { label: 'Updated Label' });
      expect(result).not.toBeNull();
      expect(result!.label).toBe('Updated Label');
    });

    it('returns null when id not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.updateAccount('nonexistent', { label: 'x' });
      expect(result).toBeNull();
    });
  });

  describe('deleteAccount', () => {
    it('returns true on successful delete', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.deleteAccount('acc-1');
      expect(result).toBe(true);
    });

    it('returns false when nothing deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.deleteAccount('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('listAccounts', () => {
    it('returns all accounts', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow(), makeRow({ id: 'acc-2' })], rowCount: 2 });
      const results = await storage.listAccounts();
      expect(results).toHaveLength(2);
    });

    it('filters by provider', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow()], rowCount: 1 });
      const results = await storage.listAccounts('anthropic');
      expect(results).toHaveLength(1);
      expect(mockQuery.mock.calls[0]![1]).toContain('anthropic');
    });
  });

  describe('getDefaultAccount', () => {
    it('returns default account for provider', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow()], rowCount: 1 });
      const result = await storage.getDefaultAccount('anthropic');
      expect(result).not.toBeNull();
      expect(result!.isDefault).toBe(true);
    });
  });

  describe('setDefault', () => {
    it('uses a transaction to swap default', async () => {
      // connect → BEGIN
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // BEGIN
      mockQuery.mockResolvedValueOnce({ rows: [makeRow()], rowCount: 1 }); // SELECT
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UNSET old
      const updatedRow = makeRow({ is_default: true });
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 }); // SET new
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      const result = await storage.setDefault('acc-1');
      expect(result).not.toBeNull();
    });
  });

  describe('recordCost', () => {
    it('inserts a cost record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.recordCost({
        accountId: 'acc-1',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        costUsd: 0.001,
      });
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCostSummary', () => {
    it('returns aggregated summaries', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            account_id: 'acc-1',
            provider: 'anthropic',
            label: 'My Key',
            total_cost_usd: '1.5',
            total_input_tokens: '1000',
            total_output_tokens: '500',
            total_requests: '10',
          },
        ],
        rowCount: 1,
      });

      const results = await storage.getCostSummary({});
      expect(results).toHaveLength(1);
      expect(results[0]!.totalCostUsd).toBe(1.5);
      expect(results[0]!.totalRequests).toBe(10);
    });
  });

  describe('getCostTrend', () => {
    it('returns daily trend points', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { date: '2026-03-01', cost_usd: '0.5', requests: '5' },
          { date: '2026-03-02', cost_usd: '0.8', requests: '8' },
        ],
        rowCount: 2,
      });

      const results = await storage.getCostTrend({ days: 7 });
      expect(results).toHaveLength(2);
      expect(results[0]!.date).toBe('2026-03-01');
      expect(results[0]!.costUsd).toBe(0.5);
    });
  });

  describe('getTopAccounts', () => {
    it('returns top accounts by cost', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            account_id: 'acc-1',
            provider: 'anthropic',
            label: 'Key 1',
            total_cost_usd: '10.0',
            total_input_tokens: '5000',
            total_output_tokens: '2000',
            total_requests: '50',
          },
        ],
        rowCount: 1,
      });

      const results = await storage.getTopAccounts(5);
      expect(results).toHaveLength(1);
      expect(results[0]!.totalCostUsd).toBe(10);
    });
  });
});
