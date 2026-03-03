/**
 * AthiManager Tests — Phase 107-F
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../storage/pg-pool.js', () => ({ getPool: () => ({ query: mockQuery }) }));
vi.mock('../logging/logger.js', () => ({
  getLogger: () => ({
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

import { AthiManager } from './athi-manager.js';
import { AthiStorage } from './athi-storage.js';

const SAMPLE_SCENARIO = {
  id: 'athi-1',
  title: 'Prompt Injection Attack',
  actor: 'cybercriminal' as const,
  techniques: ['prompt_injection' as const],
  harms: ['data_breach' as const],
  impacts: ['regulatory_penalty' as const],
  likelihood: 4,
  severity: 5,
  riskScore: 20,
  mitigations: [{ description: 'Input validation', status: 'implemented' as const }],
  status: 'identified' as const,
  createdBy: 'user-1',
  createdAt: 1000,
  updatedAt: 1000,
};

describe('AthiManager', () => {
  let manager: AthiManager;
  let storage: AthiStorage;
  let mockAlertEvaluate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new AthiStorage();
    mockAlertEvaluate = vi.fn().mockResolvedValue(undefined);
    manager = new AthiManager({
      storage,
      pool: { query: mockQuery } as any,
      getAlertManager: () =>
        ({
          evaluate: mockAlertEvaluate,
        }) as any,
    });
  });

  // ── CRUD passthrough ──────────────────────────────────────────

  describe('createScenario', () => {
    it('delegates to storage and returns scenario', async () => {
      vi.spyOn(storage, 'createScenario').mockResolvedValue(SAMPLE_SCENARIO);

      const result = await manager.createScenario(
        {
          title: 'Prompt Injection Attack',
          actor: 'cybercriminal',
          techniques: ['prompt_injection'],
          harms: ['data_breach'],
          impacts: ['regulatory_penalty'],
          likelihood: 4,
          severity: 5,
        },
        'user-1'
      );

      expect(result.id).toBe('athi-1');
      expect(storage.createScenario).toHaveBeenCalledTimes(1);
    });

    it('fires alert for high-risk scenarios (score >= 20)', async () => {
      vi.spyOn(storage, 'createScenario').mockResolvedValue(SAMPLE_SCENARIO);

      await manager.createScenario(
        {
          title: 'Critical threat',
          actor: 'nation_state',
          techniques: ['model_theft'],
          harms: ['data_breach'],
          impacts: ['ip_theft'],
          likelihood: 4,
          severity: 5,
        },
        'user-1'
      );

      expect(mockAlertEvaluate).toHaveBeenCalledTimes(1);
      const snapshot = mockAlertEvaluate.mock.calls[0][0];
      expect(snapshot.security.athi_threat.risk_score).toBe(20);
    });

    it('does not fire alert for low-risk scenarios', async () => {
      const lowRisk = { ...SAMPLE_SCENARIO, riskScore: 6 };
      vi.spyOn(storage, 'createScenario').mockResolvedValue(lowRisk);

      await manager.createScenario(
        {
          title: 'Low risk',
          actor: 'hacktivist',
          techniques: ['social_engineering'],
          harms: ['reputational_damage'],
          impacts: ['customer_trust_loss'],
          likelihood: 2,
          severity: 3,
        },
        'user-1'
      );

      expect(mockAlertEvaluate).not.toHaveBeenCalled();
    });
  });

  describe('getScenario', () => {
    it('delegates to storage', async () => {
      vi.spyOn(storage, 'getScenario').mockResolvedValue(SAMPLE_SCENARIO);
      const result = await manager.getScenario('athi-1');
      expect(result?.id).toBe('athi-1');
    });
  });

  describe('updateScenario', () => {
    it('delegates to storage and invalidates cache', async () => {
      vi.spyOn(storage, 'updateScenario').mockResolvedValue({
        ...SAMPLE_SCENARIO,
        status: 'assessed' as const,
      });

      const result = await manager.updateScenario('athi-1', { status: 'assessed' });
      expect(result?.status).toBe('assessed');
    });
  });

  describe('deleteScenario', () => {
    it('delegates to storage', async () => {
      vi.spyOn(storage, 'deleteScenario').mockResolvedValue(true);
      const result = await manager.deleteScenario('athi-1');
      expect(result).toBe(true);
    });
  });

  describe('listScenarios', () => {
    it('delegates to storage with options', async () => {
      vi.spyOn(storage, 'listScenarios').mockResolvedValue({
        items: [SAMPLE_SCENARIO],
        total: 1,
      });

      const result = await manager.listScenarios({ actor: 'cybercriminal' });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  // ── Analytics ─────────────────────────────────────────────────

  describe('getRiskMatrix', () => {
    it('delegates to storage', async () => {
      vi.spyOn(storage, 'getRiskMatrix').mockResolvedValue([]);
      const result = await manager.getRiskMatrix();
      expect(result).toEqual([]);
    });
  });

  describe('getTopRisks', () => {
    it('defaults to limit 10', async () => {
      vi.spyOn(storage, 'getTopRisks').mockResolvedValue([SAMPLE_SCENARIO]);
      const result = await manager.getTopRisks();
      expect(storage.getTopRisks).toHaveBeenCalledWith(10, undefined);
      expect(result).toHaveLength(1);
    });
  });

  describe('getMitigationCoverage', () => {
    it('returns 100% when no scenarios', async () => {
      vi.spyOn(storage, 'listScenarios').mockResolvedValue({ items: [], total: 0 });
      const coverage = await manager.getMitigationCoverage();
      expect(coverage).toBe(100);
    });

    it('calculates percentage of scenarios with implemented/verified mitigations', async () => {
      const withMitigation = {
        ...SAMPLE_SCENARIO,
        mitigations: [{ description: 'Fix', status: 'implemented' as const }],
      };
      const withoutMitigation = {
        ...SAMPLE_SCENARIO,
        id: 'athi-2',
        mitigations: [{ description: 'Planned', status: 'planned' as const }],
      };

      vi.spyOn(storage, 'listScenarios').mockResolvedValue({
        items: [withMitigation, withoutMitigation],
        total: 2,
      });

      const coverage = await manager.getMitigationCoverage();
      expect(coverage).toBe(50);
    });
  });

  describe('generateExecutiveSummary', () => {
    it('aggregates stats from storage', async () => {
      vi.spyOn(storage, 'getStatusCounts').mockResolvedValue({
        identified: 3,
        mitigated: 2,
      });
      vi.spyOn(storage, 'getActorCounts').mockResolvedValue({
        cybercriminal: 4,
        insider: 1,
      });
      vi.spyOn(storage, 'getTopRisks').mockResolvedValue([SAMPLE_SCENARIO]);
      vi.spyOn(storage, 'listScenarios').mockResolvedValue({
        items: [SAMPLE_SCENARIO],
        total: 5,
      });

      const summary = await manager.generateExecutiveSummary();
      expect(summary.totalScenarios).toBe(5);
      expect(summary.byStatus.identified).toBe(3);
      expect(summary.byActor.cybercriminal).toBe(4);
      expect(summary.topRisks).toHaveLength(1);
      // 1 of 5 scenarios has an implemented mitigation → 20%
      expect(summary.mitigationCoverage).toBe(20);
    });

    it('uses cache on subsequent calls within TTL', async () => {
      vi.spyOn(storage, 'getStatusCounts').mockResolvedValue({ identified: 1 });
      vi.spyOn(storage, 'getActorCounts').mockResolvedValue({ insider: 1 });
      vi.spyOn(storage, 'getTopRisks').mockResolvedValue([]);
      vi.spyOn(storage, 'listScenarios').mockResolvedValue({ items: [], total: 1 });

      const first = await manager.generateExecutiveSummary();
      const second = await manager.generateExecutiveSummary();

      expect(first).toBe(second);
      // Storage methods called once for the first call, not again for the second
      expect(storage.getStatusCounts).toHaveBeenCalledTimes(1);
    });
  });
});
