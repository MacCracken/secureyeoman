/**
 * DepartmentRiskManager — Phase 111: Departmental Risk Register
 *
 * Business logic layer over DepartmentRiskStorage. Handles composite operations
 * like scorecard generation, heatmap computation, and appetite breach alerting.
 */

import pg from 'pg';
import { DepartmentRiskStorage } from './department-risk-storage.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { AlertManager } from '../telemetry/alert-manager.js';
import { getLogger } from '../logging/logger.js';
import type {
  Department,
  DepartmentCreate,
  DepartmentUpdate,
  RegisterEntry,
  RegisterEntryCreate,
  RegisterEntryUpdate,
  DepartmentScore,
  DepartmentScorecard,
  RiskHeatmapCell,
  RiskTrendPoint,
} from '@secureyeoman/shared';
import { errorToString } from '../utils/errors.js';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface DepartmentRiskManagerDeps {
  storage: DepartmentRiskStorage;
  pool: pg.Pool;
  auditChain?: AuditChain | null;
  getAlertManager?: () => AlertManager | null;
}

// ─── Manager ────────────────────────────────────────────────────────────────────

export class DepartmentRiskManager {
  private readonly storage: DepartmentRiskStorage;
  private readonly pool: pg.Pool;
  private readonly auditChain: AuditChain | null;
  private readonly getAlertManager: () => AlertManager | null;
  private readonly logger = getLogger().child({ component: 'DepartmentRiskManager' });

  // 30s cache for getExecutiveSummary() to avoid per-5s DB queries from metrics pipeline
  private _summaryCache: Awaited<ReturnType<DepartmentRiskManager['getExecutiveSummary']>> | null =
    null;
  private _summaryCacheAt = 0;
  private static readonly SUMMARY_CACHE_TTL_MS = 30_000;

  constructor(deps: DepartmentRiskManagerDeps) {
    this.storage = deps.storage;
    this.pool = deps.pool;
    this.auditChain = deps.auditChain ?? null;
    this.getAlertManager = deps.getAlertManager ?? (() => null);
  }

  // ── Department CRUD ──────────────────────────────────────────

  async createDepartment(data: DepartmentCreate, tenantId?: string): Promise<Department> {
    return this.storage.createDepartment(data, tenantId);
  }

  async getDepartment(id: string): Promise<Department | null> {
    return this.storage.getDepartment(id);
  }

  async updateDepartment(id: string, data: DepartmentUpdate): Promise<Department | null> {
    return this.storage.updateDepartment(id, data);
  }

  async deleteDepartment(id: string, force = false): Promise<boolean> {
    if (!force) {
      const stats = await this.storage.getRegisterStats(id);
      if (stats.open > 0) {
        throw new Error(
          `Cannot delete department with ${stats.open} open risk entries. Use force=true to override.`
        );
      }
    }
    return this.storage.deleteDepartment(id);
  }

  async listDepartments(opts?: {
    parentId?: string | null;
    tenantId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: Department[]; total: number }> {
    return this.storage.listDepartments(opts);
  }

  async getDepartmentTree(rootId?: string): Promise<Department[]> {
    return this.storage.getDepartmentTree(rootId);
  }

  // ── Register Entry CRUD ──────────────────────────────────────

  async createRegisterEntry(
    data: RegisterEntryCreate,
    createdBy?: string,
    tenantId?: string
  ): Promise<RegisterEntry> {
    return this.storage.createRegisterEntry(data, createdBy, tenantId);
  }

  async getRegisterEntry(id: string): Promise<RegisterEntry | null> {
    return this.storage.getRegisterEntry(id);
  }

  async updateRegisterEntry(id: string, data: RegisterEntryUpdate): Promise<RegisterEntry | null> {
    return this.storage.updateRegisterEntry(id, data);
  }

  async deleteRegisterEntry(id: string): Promise<boolean> {
    return this.storage.deleteRegisterEntry(id);
  }

  async listRegisterEntries(opts?: {
    departmentId?: string;
    status?: string;
    category?: string;
    severity?: string;
    overdue?: boolean;
    owner?: string;
    tenantId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: RegisterEntry[]; total: number }> {
    return this.storage.listRegisterEntries(opts);
  }

  async closeRegisterEntry(entryId: string): Promise<RegisterEntry | null> {
    return this.storage.updateRegisterEntry(entryId, {
      status: 'closed',
    });
  }

  // ── Scoring ──────────────────────────────────────────────────

  async snapshotDepartmentScore(
    departmentId: string,
    assessmentId?: string
  ): Promise<DepartmentScore> {
    const dept = await this.storage.getDepartment(departmentId);
    if (!dept) throw new Error(`Department ${departmentId} not found`);

    const stats = await this.storage.getRegisterStats(departmentId);
    const entries = await this.storage.listRegisterEntries({
      departmentId,
      limit: 1000,
    });

    // Compute domain scores from register entries
    const domainScores: Record<string, number> = {};
    const domainCounts: Record<string, number> = {};

    for (const entry of entries.items) {
      if (['closed', 'mitigated', 'accepted', 'transferred'].includes(entry.status)) continue;
      const domain = entry.category;
      domainScores[domain] =
        (domainScores[domain] ?? 0) + (entry.riskScore ?? entry.likelihood * entry.impact);
      domainCounts[domain] = (domainCounts[domain] ?? 0) + 1;
    }

    // Normalize domain scores to 0-100 scale (max single risk = 25)
    for (const domain of Object.keys(domainScores)) {
      domainScores[domain] = Math.min(
        100,
        ((domainScores[domain] ?? 0) / Math.max(domainCounts[domain] ?? 1, 1)) * 4
      );
    }

    // Overall score is average of domain scores
    const domainValues = Object.values(domainScores);
    const overallScore =
      domainValues.length > 0 ? domainValues.reduce((a, b) => a + b, 0) / domainValues.length : 0;

    // Check appetite breaches
    const appetite = dept.riskAppetite;
    const appetiteBreaches: { domain: string; score: number; threshold: number }[] = [];

    for (const [domain, score] of Object.entries(domainScores)) {
      const threshold = (appetite as Record<string, number>)[domain];
      if (threshold !== undefined && score > threshold) {
        appetiteBreaches.push({ domain, score, threshold });
      }
    }

    const snapshot = await this.storage.recordDepartmentScore({
      departmentId,
      overallScore,
      domainScores,
      openRisks: stats.open,
      overdueRisks: stats.overdue,
      appetiteBreaches,
      assessmentId,
      tenantId: dept.tenantId ?? undefined,
    });

    // Fire alert if appetite breaches exist
    if (appetiteBreaches.length > 0) {
      const alertManager = this.getAlertManager();
      if (alertManager) {
        const syntheticSnapshot = {
          risk: {
            appetite_breach: {
              department: dept.name,
              departmentId: dept.id,
              breachCount: appetiteBreaches.length,
              overallScore,
              openRisks: stats.open,
              overdueRisks: stats.overdue,
            },
          },
        };
        alertManager.evaluate(syntheticSnapshot).catch((err: unknown) => {
          this.logger.error(
            {
              departmentId,
              error: errorToString(err),
            },
            'Appetite breach alert evaluation failed'
          );
        });
      }
    }

    return snapshot;
  }

  async snapshotAllDepartments(assessmentId?: string): Promise<DepartmentScore[]> {
    const { items: departments } = await this.storage.listDepartments({ limit: 1000 });
    const scores: DepartmentScore[] = [];
    for (const dept of departments) {
      try {
        const score = await this.snapshotDepartmentScore(dept.id, assessmentId);
        scores.push(score);
      } catch (err) {
        this.logger.warn(
          {
            departmentId: dept.id,
            error: errorToString(err),
          },
          'Failed to snapshot department score'
        );
      }
    }
    return scores;
  }

  // ── Composite views ──────────────────────────────────────────

  async getDepartmentScorecard(departmentId: string): Promise<DepartmentScorecard> {
    const dept = await this.storage.getDepartment(departmentId);
    if (!dept) throw new Error(`Department ${departmentId} not found`);

    const stats = await this.storage.getRegisterStats(departmentId);
    const latestScores = await this.storage.listDepartmentScores({
      departmentId,
      limit: 1,
    });
    const latestScore = latestScores.length > 0 ? (latestScores[0] ?? null) : null;

    const topRisks = await this.storage.listRegisterEntries({
      departmentId,
      limit: 5,
    });

    return {
      department: dept,
      latestScore,
      openRisks: stats.open,
      overdueRisks: stats.overdue,
      criticalRisks: stats.critical,
      appetiteBreaches: latestScore?.appetiteBreaches ?? [],
      topRisks: topRisks.items,
    };
  }

  async getHeatmap(tenantId?: string): Promise<RiskHeatmapCell[]> {
    const latestScores = await this.storage.getLatestScores(tenantId);
    const { items: departments } = await this.storage.listDepartments({ tenantId, limit: 1000 });
    const deptMap = new Map(departments.map((d) => [d.id, d]));

    const cells: RiskHeatmapCell[] = [];
    for (const score of latestScores) {
      const dept = deptMap.get(score.departmentId);
      if (!dept) continue;

      const appetite = dept.riskAppetite as Record<string, number>;
      for (const [domain, domainScore] of Object.entries(score.domainScores)) {
        const threshold = appetite[domain] ?? 50;
        cells.push({
          departmentId: dept.id,
          departmentName: dept.name,
          domain,
          score: domainScore,
          threshold,
          breached: domainScore > threshold,
        });
      }
    }
    return cells;
  }

  async getTrend(departmentId: string, days = 30): Promise<RiskTrendPoint[]> {
    const from = new Date(Date.now() - days * 86_400_000).toISOString();
    const scores = await this.storage.listDepartmentScores({
      departmentId,
      from,
      limit: 365,
    });

    return scores.map((s) => ({
      date: s.scoredAt,
      overallScore: s.overallScore,
      openRisks: s.openRisks,
      overdueRisks: s.overdueRisks,
    }));
  }

  async getExecutiveSummary(tenantId?: string): Promise<{
    totalDepartments: number;
    totalOpenRisks: number;
    totalOverdueRisks: number;
    totalCriticalRisks: number;
    appetiteBreaches: number;
    averageScore: number;
    departments: {
      id: string;
      name: string;
      overallScore: number;
      openRisks: number;
      breached: boolean;
    }[];
  }> {
    // Return cached result if within TTL (avoids per-5s DB queries from metrics pipeline)
    const now = Date.now();
    if (
      this._summaryCache &&
      now - this._summaryCacheAt < DepartmentRiskManager.SUMMARY_CACHE_TTL_MS
    ) {
      return this._summaryCache;
    }

    const { items: departments } = await this.storage.listDepartments({ tenantId, limit: 1000 });
    const latestScores = await this.storage.getLatestScores(tenantId);
    const scoreMap = new Map(latestScores.map((s) => [s.departmentId, s]));

    let totalOpenRisks = 0;
    let totalOverdueRisks = 0;
    let totalCriticalRisks = 0;
    let totalBreaches = 0;
    let totalScore = 0;
    let scoredCount = 0;

    const deptSummaries: {
      id: string;
      name: string;
      overallScore: number;
      openRisks: number;
      breached: boolean;
    }[] = [];

    for (const dept of departments) {
      const score = scoreMap.get(dept.id);
      const stats = await this.storage.getRegisterStats(dept.id);

      totalOpenRisks += stats.open;
      totalOverdueRisks += stats.overdue;
      totalCriticalRisks += stats.critical;

      const breached = (score?.appetiteBreaches?.length ?? 0) > 0;
      if (breached) totalBreaches++;
      if (score) {
        totalScore += score.overallScore;
        scoredCount++;
      }

      deptSummaries.push({
        id: dept.id,
        name: dept.name,
        overallScore: score?.overallScore ?? 0,
        openRisks: stats.open,
        breached,
      });
    }

    const result = {
      totalDepartments: departments.length,
      totalOpenRisks,
      totalOverdueRisks,
      totalCriticalRisks,
      appetiteBreaches: totalBreaches,
      averageScore: scoredCount > 0 ? totalScore / scoredCount : 0,
      departments: deptSummaries,
    };

    this._summaryCache = result;
    this._summaryCacheAt = Date.now();
    return result;
  }
}
