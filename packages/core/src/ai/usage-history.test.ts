/**
 * UsageStorage.queryHistory() — integration tests
 *
 * Requires a live PostgreSQL test database.
 * Run: npx vitest run packages/core/src/ai/usage-history.test.ts
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { UsageStorage } from './usage-storage.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fixed anchor: 2026-02-01 00:00:00 UTC */
const BASE_TS = new Date('2026-02-01T00:00:00Z').getTime();

function makeRecord(
  override: Partial<{
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    totalTokens: number;
    costUsd: number;
    timestamp: number;
    personalityId: string;
  }> = {}
) {
  return {
    provider: override.provider ?? 'anthropic',
    model: override.model ?? 'claude-sonnet-4-6',
    usage: {
      inputTokens: override.inputTokens ?? 600,
      outputTokens: override.outputTokens ?? 400,
      cachedTokens: override.cachedTokens ?? 100,
      totalTokens: override.totalTokens ?? 1000,
    },
    costUsd: override.costUsd ?? 0.003,
    timestamp: override.timestamp ?? BASE_TS,
    personalityId: override.personalityId,
  } as Parameters<UsageStorage['insert']>[0];
}

describe('UsageStorage.queryHistory()', () => {
  let storage: UsageStorage;

  beforeAll(async () => {
    await setupTestDb();
    storage = new UsageStorage();
  });

  beforeEach(async () => {
    await truncateAllTables();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // ── Basic insert + loadRecent personality_id round-trip ─────────────

  it('persists and loads personality_id via insert/loadRecent', async () => {
    await storage.insert(makeRecord({ personalityId: 'p_abc', timestamp: Date.now() }));
    const records = await storage.loadRecent();
    expect(records).toHaveLength(1);
    expect(records[0]!.personalityId).toBe('p_abc');
  });

  it('loads records with null personality_id as undefined', async () => {
    await storage.insert(makeRecord({ timestamp: Date.now() }));
    const records = await storage.loadRecent();
    expect(records[0]!.personalityId).toBeUndefined();
  });

  // ── queryHistory — no filter returns all rows ──────────────────────

  it('returns all records when no filter is provided', async () => {
    await storage.insert(makeRecord({ timestamp: BASE_TS }));
    await storage.insert(makeRecord({ timestamp: BASE_TS + DAY_MS }));
    const result = await storage.queryHistory();
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  // ── from / to date range filters ─────────────────────────────────

  it('filters by "from" timestamp', async () => {
    const day1 = BASE_TS;
    const day2 = BASE_TS + DAY_MS;
    const day3 = BASE_TS + 2 * DAY_MS;

    await storage.insert(makeRecord({ timestamp: day1 }));
    await storage.insert(makeRecord({ timestamp: day2 }));
    await storage.insert(makeRecord({ timestamp: day3 }));

    const result = await storage.queryHistory({ from: day2 });
    expect(result.every((r) => new Date(r.date).getTime() >= new Date('2026-02-02').getTime())).toBe(
      true
    );
    // Should not include day1 record
    const dates = result.map((r) => r.date);
    expect(dates).not.toContain('2026-02-01');
  });

  it('filters by "to" timestamp', async () => {
    const day1 = BASE_TS;
    const day3 = BASE_TS + 2 * DAY_MS;

    await storage.insert(makeRecord({ timestamp: day1 }));
    await storage.insert(makeRecord({ timestamp: day3 }));

    const result = await storage.queryHistory({ to: day1 + DAY_MS - 1 });
    const dates = result.map((r) => r.date);
    expect(dates).toContain('2026-02-01');
    expect(dates).not.toContain('2026-02-03');
  });

  it('filters by from+to range', async () => {
    const day1 = BASE_TS;
    const day2 = BASE_TS + DAY_MS;
    const day3 = BASE_TS + 2 * DAY_MS;

    await storage.insert(makeRecord({ timestamp: day1 }));
    await storage.insert(makeRecord({ timestamp: day2 }));
    await storage.insert(makeRecord({ timestamp: day3 }));

    const result = await storage.queryHistory({ from: day2, to: day2 + DAY_MS - 1 });
    expect(result.every((r) => r.date === '2026-02-02')).toBe(true);
  });

  // ── provider filter ──────────────────────────────────────────────

  it('filters by provider', async () => {
    await storage.insert(makeRecord({ provider: 'anthropic', timestamp: BASE_TS }));
    await storage.insert(makeRecord({ provider: 'openai', timestamp: BASE_TS }));

    const result = await storage.queryHistory({ provider: 'openai' });
    expect(result.every((r) => r.provider === 'openai')).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  // ── model filter (ILIKE) ─────────────────────────────────────────

  it('filters by model substring (ILIKE)', async () => {
    await storage.insert(makeRecord({ model: 'claude-sonnet-4-6', timestamp: BASE_TS }));
    await storage.insert(makeRecord({ model: 'gpt-4o', timestamp: BASE_TS }));

    const result = await storage.queryHistory({ model: 'sonnet' });
    expect(result.every((r) => r.model.toLowerCase().includes('sonnet'))).toBe(true);
  });

  // ── personalityId filter ─────────────────────────────────────────

  it('filters by personalityId', async () => {
    await storage.insert(makeRecord({ personalityId: 'p_alice', timestamp: BASE_TS }));
    await storage.insert(makeRecord({ personalityId: 'p_bob', timestamp: BASE_TS }));

    const result = await storage.queryHistory({ personalityId: 'p_alice' });
    expect(result.every((r) => r.personalityId === 'p_alice')).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  // ── groupBy=day aggregation ──────────────────────────────────────

  it('aggregates multiple records on the same day into one row', async () => {
    // 3 records on the same day
    await storage.insert(makeRecord({ totalTokens: 1000, costUsd: 0.001, timestamp: BASE_TS }));
    await storage.insert(
      makeRecord({ totalTokens: 2000, costUsd: 0.002, timestamp: BASE_TS + 3600_000 })
    );
    await storage.insert(
      makeRecord({ totalTokens: 500, costUsd: 0.0005, timestamp: BASE_TS + 7200_000 })
    );

    const result = await storage.queryHistory({ groupBy: 'day' });
    const row = result.find((r) => r.date === '2026-02-01');
    expect(row).toBeDefined();
    expect(row!.totalTokens).toBe(3500);
    expect(row!.costUsd).toBeCloseTo(0.0035);
    expect(row!.calls).toBe(3);
  });

  it('groups records into separate days with groupBy=day', async () => {
    await storage.insert(makeRecord({ timestamp: BASE_TS }));
    await storage.insert(makeRecord({ timestamp: BASE_TS + DAY_MS }));
    await storage.insert(makeRecord({ timestamp: BASE_TS + 2 * DAY_MS }));

    const result = await storage.queryHistory({ groupBy: 'day' });
    const dates = result.map((r) => r.date);
    expect(dates).toContain('2026-02-01');
    expect(dates).toContain('2026-02-02');
    expect(dates).toContain('2026-02-03');
  });

  // ── groupBy=hour aggregation ─────────────────────────────────────

  it('groups records by hour with groupBy=hour', async () => {
    const hour0 = BASE_TS; // 2026-02-01T00:00:00Z
    const hour1 = BASE_TS + 3600_000; // 2026-02-01T01:00:00Z

    await storage.insert(makeRecord({ totalTokens: 100, timestamp: hour0 }));
    await storage.insert(makeRecord({ totalTokens: 200, timestamp: hour0 + 1800_000 })); // same hour
    await storage.insert(makeRecord({ totalTokens: 300, timestamp: hour1 }));

    const result = await storage.queryHistory({ groupBy: 'hour' });
    const h0Row = result.find((r) => r.date === '2026-02-01T00:00:00');
    const h1Row = result.find((r) => r.date === '2026-02-01T01:00:00');

    expect(h0Row).toBeDefined();
    expect(h0Row!.totalTokens).toBe(300);
    expect(h0Row!.calls).toBe(2);

    expect(h1Row).toBeDefined();
    expect(h1Row!.totalTokens).toBe(300);
    expect(h1Row!.calls).toBe(1);
  });

  // ── totals calculation ───────────────────────────────────────────

  it('totals across all returned rows sum correctly', async () => {
    await storage.insert(makeRecord({ totalTokens: 1000, costUsd: 0.01, timestamp: BASE_TS }));
    await storage.insert(
      makeRecord({ totalTokens: 2000, costUsd: 0.02, timestamp: BASE_TS + DAY_MS })
    );
    await storage.insert(
      makeRecord({ totalTokens: 3000, costUsd: 0.03, timestamp: BASE_TS + 2 * DAY_MS })
    );

    const rows = await storage.queryHistory();
    const totalTokens = rows.reduce((s, r) => s + r.totalTokens, 0);
    const totalCost = rows.reduce((s, r) => s + r.costUsd, 0);
    const totalCalls = rows.reduce((s, r) => s + r.calls, 0);

    expect(totalTokens).toBe(6000);
    expect(totalCost).toBeCloseTo(0.06);
    expect(totalCalls).toBe(3);
  });

  // ── empty result ────────────────────────────────────────────────

  it('returns empty array when no records match filters', async () => {
    await storage.insert(makeRecord({ provider: 'anthropic', timestamp: BASE_TS }));

    const result = await storage.queryHistory({ provider: 'openai' });
    expect(result).toHaveLength(0);
  });

  // ── combined filters ─────────────────────────────────────────────

  it('combines provider + personalityId filters correctly', async () => {
    await storage.insert(
      makeRecord({ provider: 'anthropic', personalityId: 'p_alice', timestamp: BASE_TS })
    );
    await storage.insert(
      makeRecord({ provider: 'anthropic', personalityId: 'p_bob', timestamp: BASE_TS })
    );
    await storage.insert(
      makeRecord({ provider: 'openai', personalityId: 'p_alice', timestamp: BASE_TS })
    );

    const result = await storage.queryHistory({
      provider: 'anthropic',
      personalityId: 'p_alice',
    });
    expect(result.every((r) => r.provider === 'anthropic' && r.personalityId === 'p_alice')).toBe(
      true
    );
    expect(result.length).toBeGreaterThan(0);
  });
});
