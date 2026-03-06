import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CostAttributionTracker, type CostEntry, type CostBudget } from './cost-attribution.js';

const mockLogger = {
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: 'info' as const,
};

function makeEntry(overrides: Partial<CostEntry> = {}): CostEntry {
  return {
    timestamp: Date.now(),
    tenantId: 'tenant-1',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    inputTokens: 1000,
    outputTokens: 500,
    costUsd: 0.015,
    ...overrides,
  };
}

describe('CostAttributionTracker', () => {
  let tracker: CostAttributionTracker;

  beforeEach(() => {
    tracker = new CostAttributionTracker(mockLogger);
  });

  it('should record and count entries', () => {
    tracker.record(makeEntry());
    tracker.record(makeEntry());
    expect(tracker.entryCount).toBe(2);
  });

  it('should compute summary by tenant', () => {
    const now = Date.now();
    tracker.record(makeEntry({ timestamp: now, personalityId: 'p1', costUsd: 0.01 }));
    tracker.record(makeEntry({ timestamp: now, personalityId: 'p2', costUsd: 0.02 }));
    tracker.record(makeEntry({ timestamp: now, tenantId: 'other', costUsd: 0.05 }));

    const summary = tracker.getSummary('tenant-1', now - 1000, now + 1000);
    expect(summary.totalCostUsd).toBeCloseTo(0.03);
    expect(summary.byPersonality['p1'].costUsd).toBeCloseTo(0.01);
    expect(summary.byPersonality['p2'].costUsd).toBeCloseTo(0.02);
  });

  it('should compute summary by provider and model', () => {
    const now = Date.now();
    tracker.record(
      makeEntry({ timestamp: now, provider: 'openai', model: 'gpt-4o', costUsd: 0.05 })
    );
    tracker.record(
      makeEntry({
        timestamp: now,
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        costUsd: 0.01,
      })
    );

    const summary = tracker.getSummary('tenant-1', now - 1000, now + 1000);
    expect(summary.byProvider['openai'].costUsd).toBeCloseTo(0.05);
    expect(summary.byProvider['anthropic'].costUsd).toBeCloseTo(0.01);
    expect(summary.byModel['gpt-4o'].costUsd).toBeCloseTo(0.05);
  });

  it('should compute summary by workflow', () => {
    const now = Date.now();
    tracker.record(makeEntry({ timestamp: now, workflowId: 'wf-1', costUsd: 0.03 }));
    tracker.record(makeEntry({ timestamp: now, workflowId: 'wf-1', costUsd: 0.02 }));
    tracker.record(makeEntry({ timestamp: now, costUsd: 0.01 })); // no workflow

    const summary = tracker.getSummary('tenant-1', now - 1000, now + 1000);
    expect(summary.byWorkflow['wf-1'].costUsd).toBeCloseTo(0.05);
    expect(Object.keys(summary.byWorkflow)).toHaveLength(1);
  });

  it('should filter by time range', () => {
    const now = Date.now();
    tracker.record(makeEntry({ timestamp: now - 5000, costUsd: 0.01 }));
    tracker.record(makeEntry({ timestamp: now, costUsd: 0.02 }));

    const summary = tracker.getSummary('tenant-1', now - 1000, now + 1000);
    expect(summary.totalCostUsd).toBeCloseTo(0.02);
  });

  describe('budgets', () => {
    it('should check budget status', () => {
      const now = Date.now();
      tracker.record(makeEntry({ timestamp: now, costUsd: 5.0 }));

      tracker.setBudget({
        id: 'budget-1',
        tenantId: 'tenant-1',
        period: 'daily',
        limitUsd: 10.0,
        enabled: true,
      });

      const [status] = tracker.checkBudgets();
      expect(status.currentSpend).toBeCloseTo(5.0);
      expect(status.percentUsed).toBeCloseTo(50);
      expect(status.exceeded).toBe(false);
    });

    it('should detect exceeded budget', () => {
      const now = Date.now();
      tracker.record(makeEntry({ timestamp: now, costUsd: 15.0 }));

      tracker.setBudget({
        id: 'budget-1',
        tenantId: 'tenant-1',
        period: 'daily',
        limitUsd: 10.0,
        enabled: true,
      });

      const [status] = tracker.checkBudgets();
      expect(status.exceeded).toBe(true);
      expect(status.percentUsed).toBe(150);
    });

    it('should skip disabled budgets', () => {
      tracker.setBudget({
        id: 'budget-1',
        tenantId: 'tenant-1',
        period: 'daily',
        limitUsd: 10.0,
        enabled: false,
      });

      expect(tracker.checkBudgets()).toHaveLength(0);
    });

    it('should remove budgets', () => {
      tracker.setBudget({
        id: 'budget-1',
        tenantId: 'tenant-1',
        period: 'daily',
        limitUsd: 10.0,
        enabled: true,
      });
      expect(tracker.removeBudget('budget-1')).toBe(true);
      expect(tracker.checkBudgets()).toHaveLength(0);
    });
  });

  describe('CSV export', () => {
    it('should export all entries as CSV', () => {
      const now = Date.now();
      tracker.record(makeEntry({ timestamp: now, personalityId: 'p1' }));
      tracker.record(makeEntry({ timestamp: now, workflowId: 'wf-1' }));

      const csv = tracker.exportCsv();
      const lines = csv.split('\n');
      expect(lines[0]).toBe(
        'timestamp,tenant_id,personality_id,workflow_id,provider,model,input_tokens,output_tokens,cost_usd'
      );
      expect(lines).toHaveLength(3); // header + 2 rows
    });

    it('should filter by tenant', () => {
      tracker.record(makeEntry({ tenantId: 'a' }));
      tracker.record(makeEntry({ tenantId: 'b' }));

      const csv = tracker.exportCsv('a');
      const lines = csv.split('\n');
      expect(lines).toHaveLength(2); // header + 1 row
    });

    it('should filter by time range', () => {
      const now = Date.now();
      tracker.record(makeEntry({ timestamp: now - 5000 }));
      tracker.record(makeEntry({ timestamp: now }));

      const csv = tracker.exportCsv(undefined, now - 1000);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(2);
    });
  });
});
