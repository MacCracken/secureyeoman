import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResponsibleAiStorage } from './responsible-ai-store.js';
import type {
  CohortAnalysis,
  FairnessReport,
  ShapExplanation,
  ProvenanceEntry,
  ModelCard,
} from '@secureyeoman/shared';

// ── Mock pg pool ─────────────────────────────────────────────────

const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

const mockPool = { query: mockQuery } as any;
const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => mockLogger,
} as any;

describe('ResponsibleAiStorage', () => {
  let storage: ResponsibleAiStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new ResponsibleAiStorage();
  });

  // ── Cohort Analyses ─────────────────────────────────────────

  describe('cohort analyses', () => {
    const sample: CohortAnalysis = {
      id: 'ca-1',
      evalRunId: 'run-1',
      datasetId: 'ds-1',
      dimension: 'model_name',
      slices: [
        {
          dimension: 'model_name',
          value: 'model-a',
          sampleCount: 10,
          errorCount: 2,
          errorRate: 0.2,
          avgScore: 3.5,
          avgGroundedness: 3.5,
          avgCoherence: 3.5,
          avgRelevance: 3.5,
          avgFluency: 3.5,
          avgHarmlessness: 3.5,
        },
      ],
      totalSamples: 10,
      overallErrorRate: 0.2,
      createdAt: 1700000000000,
    };

    it('inserts cohort analysis', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.insertCohortAnalysis(sample);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO responsible_ai.cohort_analyses'),
        expect.arrayContaining(['ca-1', 'run-1', 'ds-1', 'model_name'])
      );
    });

    it('returns null for missing cohort analysis', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getCohortAnalysis('missing');
      expect(result).toBeNull();
    });

    it('maps row to CohortAnalysis', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'ca-1',
            eval_run_id: 'run-1',
            dataset_id: 'ds-1',
            dimension: 'model_name',
            slices: JSON.stringify(sample.slices),
            total_samples: 10,
            overall_error_rate: 0.2,
            created_at: '1700000000000',
          },
        ],
        rowCount: 1,
      });
      const result = await storage.getCohortAnalysis('ca-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('ca-1');
      expect(result!.slices).toHaveLength(1);
      expect(result!.totalSamples).toBe(10);
    });
  });

  // ── Fairness Reports ────────────────────────────────────────

  describe('fairness reports', () => {
    it('inserts fairness report', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const report: FairnessReport = {
        id: 'fr-1',
        evalRunId: 'run-1',
        datasetId: 'ds-1',
        protectedAttribute: 'gender',
        groups: [],
        demographicParity: 0.1,
        equalizedOdds: 0.05,
        disparateImpactRatio: 0.9,
        passesThreshold: true,
        threshold: 0.8,
        createdAt: Date.now(),
      };
      await storage.insertFairnessReport(report);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO responsible_ai.fairness_reports'),
        expect.arrayContaining(['fr-1', 'run-1', 'gender'])
      );
    });

    it('lists fairness reports by eval run', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'fr-1',
            eval_run_id: 'run-1',
            dataset_id: 'ds-1',
            protected_attribute: 'gender',
            groups: '[]',
            demographic_parity: 0.1,
            equalized_odds: 0.05,
            disparate_impact_ratio: 0.9,
            passes_threshold: true,
            threshold: 0.8,
            created_at: '1700000000000',
          },
        ],
        rowCount: 1,
      });
      const results = await storage.listFairnessReports('run-1');
      expect(results).toHaveLength(1);
      expect(results[0]!.protectedAttribute).toBe('gender');
    });
  });

  // ── SHAP Explanations ──────────────────────────────────────

  describe('SHAP explanations', () => {
    it('inserts SHAP explanation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const shap: ShapExplanation = {
        id: 'shap-1',
        modelName: 'test-model',
        prompt: 'hello world',
        response: 'response',
        inputTokens: [
          { token: 'hello', attribution: 0.6 },
          { token: 'world', attribution: 0.4 },
        ],
        createdAt: Date.now(),
      };
      await storage.insertShapExplanation(shap);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO responsible_ai.shap_explanations'),
        expect.arrayContaining(['shap-1', 'test-model'])
      );
    });

    it('lists SHAP explanations with filters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const results = await storage.listShapExplanations({ modelName: 'test', limit: 10 });
      expect(results).toEqual([]);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('model_name'),
        expect.arrayContaining(['test', 10])
      );
    });
  });

  // ── Provenance ─────────────────────────────────────────────

  describe('provenance', () => {
    it('inserts provenance batch', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 2 });
      const entries: ProvenanceEntry[] = [
        {
          id: 'p-1',
          datasetId: 'ds-1',
          status: 'included',
          sourceType: 'conversation',
          recordedAt: Date.now(),
        },
        {
          id: 'p-2',
          datasetId: 'ds-1',
          status: 'filtered',
          filterReason: 'quality',
          sourceType: 'conversation',
          recordedAt: Date.now(),
        },
      ];
      await storage.insertProvenanceBatch(entries);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO responsible_ai.provenance_entries'),
        expect.any(Array)
      );
    });

    it('handles empty batch', async () => {
      await storage.insertProvenanceBatch([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('queries provenance with filters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.queryProvenance({ datasetId: 'ds-1', status: 'filtered', limit: 50 });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('dataset_id'),
        expect.arrayContaining(['ds-1', 'filtered', 50, 0])
      );
    });

    it('computes provenance summary', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { status: 'included', cnt: '10' },
            { status: 'filtered', cnt: '5' },
          ],
          rowCount: 2,
        })
        .mockResolvedValueOnce({
          rows: [{ users: '3', convs: '7' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ filter_reason: 'quality', cnt: '5' }],
          rowCount: 1,
        });

      const summary = await storage.getProvenanceSummary('ds-1');
      expect(summary.totalEntries).toBe(15);
      expect(summary.included).toBe(10);
      expect(summary.filtered).toBe(5);
      expect(summary.uniqueUsers).toBe(3);
      expect(summary.filterReasons['quality']).toBe(5);
    });

    it('redacts user data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 3 });
      const count = await storage.redactUserData('user-1');
      expect(count).toBe(3);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("status = 'redacted'"), [
        'user-1',
      ]);
    });
  });

  // ── Model Cards ────────────────────────────────────────────

  describe('model cards', () => {
    const card: ModelCard = {
      id: 'mc-1',
      personalityId: 'p-1',
      modelName: 'test-model',
      intendedUse: 'Testing',
      limitations: 'None',
      trainingDataSummary: { sampleCount: 100 },
      generatedBy: 'auto',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    it('inserts model card', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.insertModelCard(card);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO responsible_ai.model_cards'),
        expect.arrayContaining(['mc-1', 'p-1', 'test-model'])
      );
    });

    it('returns null for missing model card', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getModelCard('missing');
      expect(result).toBeNull();
    });

    it('maps row to ModelCard', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'mc-1',
            personality_id: 'p-1',
            model_name: 'test-model',
            version: null,
            intended_use: 'Testing',
            limitations: 'None',
            ethical_considerations: null,
            training_data_summary: JSON.stringify({ sampleCount: 100 }),
            evaluation_results: null,
            fairness_assessment: null,
            deployed_at: null,
            risk_classification: 'limited',
            generated_by: 'auto',
            created_at: '1700000000000',
            updated_at: '1700000000000',
          },
        ],
        rowCount: 1,
      });
      const result = await storage.getModelCard('mc-1');
      expect(result).not.toBeNull();
      expect(result!.personalityId).toBe('p-1');
      expect(result!.trainingDataSummary.sampleCount).toBe(100);
      expect(result!.riskClassification).toBe('limited');
    });

    it('lists model cards with personality filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listModelCards({ personalityId: 'p-1', limit: 10 });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('personality_id'),
        expect.arrayContaining(['p-1', 10])
      );
    });
  });
});
