/**
 * Cost Attribution (Phase 139)
 *
 * Tracks AI provider costs per tenant, personality, and workflow.
 * Provides aggregation, budget alerting, and CSV export.
 */

import type { SecureLogger } from '../logging/logger.js';

export interface CostEntry {
  timestamp: number;
  tenantId: string;
  personalityId?: string;
  workflowId?: string;
  workflowRunId?: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface CostBudget {
  id: string;
  tenantId: string;
  /** 'daily' | 'monthly' */
  period: 'daily' | 'monthly';
  limitUsd: number;
  enabled: boolean;
}

export interface CostSummary {
  tenantId: string;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byPersonality: Record<string, { costUsd: number; tokens: number }>;
  byWorkflow: Record<string, { costUsd: number; tokens: number }>;
  byProvider: Record<string, { costUsd: number; tokens: number }>;
  byModel: Record<string, { costUsd: number; tokens: number }>;
  period: { start: number; end: number };
}

export interface BudgetStatus {
  budget: CostBudget;
  currentSpend: number;
  percentUsed: number;
  exceeded: boolean;
}

const MAX_ENTRIES = 100_000;
const DAY_MS = 86_400_000;
const MONTH_DAYS = 30;

export class CostAttributionTracker {
  private entries: CostEntry[] = [];
  private budgets = new Map<string, CostBudget>();
  private readonly logger: SecureLogger;

  constructor(logger: SecureLogger) {
    this.logger = logger;
  }

  record(entry: CostEntry): void {
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
  }

  setBudget(budget: CostBudget): void {
    this.budgets.set(budget.id, budget);
  }

  removeBudget(id: string): boolean {
    return this.budgets.delete(id);
  }

  /**
   * Get cost summary for a tenant within a time range.
   */
  getSummary(tenantId: string, startMs: number, endMs: number): CostSummary {
    const filtered = this.entries.filter(
      (e) => e.tenantId === tenantId && e.timestamp >= startMs && e.timestamp <= endMs
    );

    const byPersonality: Record<string, { costUsd: number; tokens: number }> = {};
    const byWorkflow: Record<string, { costUsd: number; tokens: number }> = {};
    const byProvider: Record<string, { costUsd: number; tokens: number }> = {};
    const byModel: Record<string, { costUsd: number; tokens: number }> = {};

    let totalCostUsd = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const e of filtered) {
      totalCostUsd += e.costUsd;
      totalInputTokens += e.inputTokens;
      totalOutputTokens += e.outputTokens;
      const totalTokens = e.inputTokens + e.outputTokens;

      if (e.personalityId) {
        const p = (byPersonality[e.personalityId] ??= { costUsd: 0, tokens: 0 });
        p.costUsd += e.costUsd;
        p.tokens += totalTokens;
      }
      if (e.workflowId) {
        const w = (byWorkflow[e.workflowId] ??= { costUsd: 0, tokens: 0 });
        w.costUsd += e.costUsd;
        w.tokens += totalTokens;
      }
      const prov = (byProvider[e.provider] ??= { costUsd: 0, tokens: 0 });
      prov.costUsd += e.costUsd;
      prov.tokens += totalTokens;

      const m = (byModel[e.model] ??= { costUsd: 0, tokens: 0 });
      m.costUsd += e.costUsd;
      m.tokens += totalTokens;
    }

    return {
      tenantId,
      totalCostUsd,
      totalInputTokens,
      totalOutputTokens,
      byPersonality,
      byWorkflow,
      byProvider,
      byModel,
      period: { start: startMs, end: endMs },
    };
  }

  /**
   * Check all budgets and return their status.
   */
  checkBudgets(): BudgetStatus[] {
    const now = Date.now();
    const statuses: BudgetStatus[] = [];

    for (const budget of this.budgets.values()) {
      if (!budget.enabled) continue;

      const periodStart = budget.period === 'daily' ? now - DAY_MS : now - DAY_MS * MONTH_DAYS;

      const spend = this.entries
        .filter((e) => e.tenantId === budget.tenantId && e.timestamp >= periodStart)
        .reduce((sum, e) => sum + e.costUsd, 0);

      statuses.push({
        budget,
        currentSpend: spend,
        percentUsed: budget.limitUsd > 0 ? (spend / budget.limitUsd) * 100 : 0,
        exceeded: spend >= budget.limitUsd,
      });
    }

    return statuses;
  }

  /**
   * Export cost data as CSV.
   */
  exportCsv(tenantId?: string, startMs?: number, endMs?: number): string {
    let filtered = this.entries;
    if (tenantId) {
      filtered = filtered.filter((e) => e.tenantId === tenantId);
    }
    if (startMs) {
      filtered = filtered.filter((e) => e.timestamp >= startMs);
    }
    if (endMs) {
      filtered = filtered.filter((e) => e.timestamp <= endMs);
    }

    const header =
      'timestamp,tenant_id,personality_id,workflow_id,provider,model,input_tokens,output_tokens,cost_usd';
    const rows = filtered.map((e) =>
      [
        new Date(e.timestamp).toISOString(),
        e.tenantId,
        e.personalityId ?? '',
        e.workflowId ?? '',
        e.provider,
        e.model,
        e.inputTokens,
        e.outputTokens,
        e.costUsd.toFixed(6),
      ].join(',')
    );

    return [header, ...rows].join('\n');
  }

  get entryCount(): number {
    return this.entries.length;
  }
}
