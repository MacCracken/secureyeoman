/**
 * AthiManager — Phase 107-F: ATHI Threat Governance Framework
 *
 * Business logic for ATHI threat scenario management. Handles CRUD passthrough,
 * risk matrix computation, executive summary generation with caching,
 * and fire-and-forget alert on high-risk scenario creation.
 */

import pg from 'pg';
import { AthiStorage } from './athi-storage.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { AlertManager } from '../telemetry/alert-manager.js';
import { getLogger } from '../logging/logger.js';
import type {
  AthiScenario,
  AthiScenarioCreate,
  AthiScenarioUpdate,
  AthiRiskMatrixCell,
  AthiExecutiveSummary,
} from '@secureyeoman/shared';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AthiManagerDeps {
  storage: AthiStorage;
  pool: pg.Pool;
  auditChain?: AuditChain | null;
  getAlertManager?: () => AlertManager | null;
}

// ─── Manager ────────────────────────────────────────────────────────────────

export class AthiManager {
  private readonly storage: AthiStorage;
  private readonly pool: pg.Pool;
  private readonly auditChain: AuditChain | null;
  private readonly getAlertManager: () => AlertManager | null;
  private readonly logger = getLogger().child({ component: 'AthiManager' });

  // 30s cache for executive summary
  private _summaryCache: AthiExecutiveSummary | null = null;
  private _summaryCacheAt = 0;
  private static readonly SUMMARY_CACHE_TTL_MS = 30_000;

  constructor(deps: AthiManagerDeps) {
    this.storage = deps.storage;
    this.pool = deps.pool;
    this.auditChain = deps.auditChain ?? null;
    this.getAlertManager = deps.getAlertManager ?? (() => null);
  }

  // ── CRUD ──────────────────────────────────────────────────────

  async createScenario(
    data: AthiScenarioCreate,
    createdBy?: string,
    orgId?: string
  ): Promise<AthiScenario> {
    const scenario = await this.storage.createScenario(data, createdBy, orgId);
    this._summaryCache = null;

    // Fire-and-forget alert for high-risk scenarios (score >= 20)
    if (scenario.riskScore >= 20) {
      try {
        const alertMgr = this.getAlertManager();
        if (alertMgr) {
          const snapshot = {
            security: {
              athi_threat: {
                id: scenario.id,
                title: scenario.title,
                actor: scenario.actor,
                risk_score: scenario.riskScore,
                status: scenario.status,
              },
            },
          };
          alertMgr.evaluate(snapshot as any).catch((e: unknown) => {
            this.logger.debug({ error: String(e) }, 'ATHI alert evaluation failed');
          });
        }
      } catch {
        // non-fatal
      }
    }

    return scenario;
  }

  async getScenario(id: string): Promise<AthiScenario | null> {
    return this.storage.getScenario(id);
  }

  async updateScenario(id: string, data: AthiScenarioUpdate): Promise<AthiScenario | null> {
    const result = await this.storage.updateScenario(id, data);
    if (result) this._summaryCache = null;
    return result;
  }

  async deleteScenario(id: string): Promise<boolean> {
    const result = await this.storage.deleteScenario(id);
    if (result) this._summaryCache = null;
    return result;
  }

  async listScenarios(opts?: {
    actor?: string;
    status?: string;
    orgId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: AthiScenario[]; total: number }> {
    return this.storage.listScenarios(opts);
  }

  // ── Analytics ─────────────────────────────────────────────────

  async findScenariosForTechnique(technique: string): Promise<AthiScenario[]> {
    return this.storage.findByTechnique(technique);
  }

  async getScenariosWithLinkedEvents(): Promise<AthiScenario[]> {
    return this.storage.getScenariosWithLinkedEvents();
  }

  async linkEvents(id: string, eventIds: string[]): Promise<AthiScenario | null> {
    const result = await this.storage.linkEvents(id, eventIds);
    if (result) this._summaryCache = null;
    return result;
  }

  async getRiskMatrix(orgId?: string): Promise<AthiRiskMatrixCell[]> {
    return this.storage.getRiskMatrix(orgId);
  }

  async getTopRisks(limit = 10, orgId?: string): Promise<AthiScenario[]> {
    return this.storage.getTopRisks(limit, orgId);
  }

  async getMitigationCoverage(orgId?: string): Promise<number> {
    const { items, total } = await this.storage.listScenarios({
      orgId,
      limit: 10000,
      offset: 0,
    });
    if (total === 0) return 100;

    const mitigated = items.filter((s) =>
      s.mitigations.some((m) => m.status === 'implemented' || m.status === 'verified')
    ).length;
    return Math.round((mitigated / total) * 100);
  }

  async generateExecutiveSummary(orgId?: string): Promise<AthiExecutiveSummary> {
    const now = Date.now();
    if (this._summaryCache && now - this._summaryCacheAt < AthiManager.SUMMARY_CACHE_TTL_MS) {
      return this._summaryCache;
    }

    const [byStatus, byActor, topRisks, coverage, { total: _total }] = await Promise.all([
      this.storage.getStatusCounts(orgId),
      this.storage.getActorCounts(orgId),
      this.storage.getTopRisks(5, orgId),
      this.getMitigationCoverage(orgId),
      this.storage.listScenarios({ orgId, limit: 1 }),
    ]);

    const totalScenarios = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const avgScore =
      topRisks.length > 0
        ? Number((topRisks.reduce((sum, s) => sum + s.riskScore, 0) / topRisks.length).toFixed(1))
        : 0;

    const summary: AthiExecutiveSummary = {
      totalScenarios,
      byStatus,
      byActor,
      topRisks,
      averageRiskScore: avgScore,
      mitigationCoverage: coverage,
    };

    this._summaryCache = summary;
    this._summaryCacheAt = now;
    return summary;
  }
}
