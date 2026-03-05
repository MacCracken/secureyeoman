import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResponsibleAiManager, tokenize } from './responsible-ai-manager.js';
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

let uuidCounter = 0;
vi.mock('../utils/id.js', () => ({
  uuidv7: () => `test-uuid-${++uuidCounter}`,
}));

const mockPool = { query: mockQuery } as any;

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => mockLogger,
} as any;

// ── Tests ────────────────────────────────────────────────────────

describe('ResponsibleAiManager', () => {
  let manager: ResponsibleAiManager;

  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;
    manager = new ResponsibleAiManager({
      pool: mockPool,
      logger: mockLogger,
    });
  });

  // ── Cohort Error Analysis ───────────────────────────────────

  describe('cohort error analysis', () => {
    it('computes cohort slices from eval scores', async () => {
      // Mock eval scores query
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            sample_index: 0,
            prompt: 'p1',
            response: 'r1',
            groundedness: 4,
            coherence: 4,
            relevance: 4,
            fluency: 4,
            harmlessness: 4,
            model_name: 'model-a',
            metadata: { topic_category: 'tech' },
          },
          {
            sample_index: 1,
            prompt: 'p2',
            response: 'r2',
            groundedness: 2,
            coherence: 2,
            relevance: 2,
            fluency: 2,
            harmlessness: 2,
            model_name: 'model-a',
            metadata: { topic_category: 'tech' },
          },
          {
            sample_index: 2,
            prompt: 'p3',
            response: 'r3',
            groundedness: 5,
            coherence: 5,
            relevance: 5,
            fluency: 5,
            harmlessness: 5,
            model_name: 'model-b',
            metadata: { topic_category: 'science' },
          },
        ],
        rowCount: 3,
      });
      // Mock storage insert
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await manager.runCohortAnalysis({
        evalRunId: 'run-1',
        datasetId: 'ds-1',
        dimension: 'model_name',
      });

      expect(result.totalSamples).toBe(3);
      expect(result.slices).toHaveLength(2);
      expect(result.dimension).toBe('model_name');
      // model-a has 1 error out of 2 (50% error rate)
      const sliceA = result.slices.find((s) => s.value === 'model-a');
      expect(sliceA).toBeDefined();
      expect(sliceA!.sampleCount).toBe(2);
      expect(sliceA!.errorCount).toBe(1);
      expect(sliceA!.errorRate).toBe(0.5);
    });

    it('throws when no eval scores found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(
        manager.runCohortAnalysis({
          evalRunId: 'empty',
          datasetId: 'ds-1',
          dimension: 'model_name',
        })
      ).rejects.toThrow('No eval scores found');
    });

    it('sorts slices by error rate descending', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            sample_index: 0,
            prompt: 'p',
            response: 'r',
            groundedness: 1,
            coherence: 1,
            relevance: 1,
            fluency: 1,
            harmlessness: 1,
            model_name: 'bad-model',
          },
          {
            sample_index: 1,
            prompt: 'p',
            response: 'r',
            groundedness: 5,
            coherence: 5,
            relevance: 5,
            fluency: 5,
            harmlessness: 5,
            model_name: 'good-model',
          },
        ],
        rowCount: 2,
      });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await manager.runCohortAnalysis({
        evalRunId: 'run-2',
        datasetId: 'ds-1',
        dimension: 'model_name',
      });

      expect(result.slices[0]!.value).toBe('bad-model');
      expect(result.slices[0]!.errorRate).toBe(1);
      expect(result.slices[1]!.value).toBe('good-model');
      expect(result.slices[1]!.errorRate).toBe(0);
    });
  });

  // ── Fairness Metrics ────────────────────────────────────────

  describe('fairness metrics', () => {
    it('computes demographic parity and disparate impact', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            sample_index: 0,
            prompt: 'p',
            response: 'r',
            groundedness: 4,
            coherence: 4,
            relevance: 4,
            fluency: 4,
            harmlessness: 4,
            model_name: 'm',
            metadata: { gender: 'male' },
          },
          {
            sample_index: 1,
            prompt: 'p',
            response: 'r',
            groundedness: 4,
            coherence: 4,
            relevance: 4,
            fluency: 4,
            harmlessness: 4,
            model_name: 'm',
            metadata: { gender: 'male' },
          },
          {
            sample_index: 2,
            prompt: 'p',
            response: 'r',
            groundedness: 2,
            coherence: 2,
            relevance: 2,
            fluency: 2,
            harmlessness: 2,
            model_name: 'm',
            metadata: { gender: 'female' },
          },
          {
            sample_index: 3,
            prompt: 'p',
            response: 'r',
            groundedness: 4,
            coherence: 4,
            relevance: 4,
            fluency: 4,
            harmlessness: 4,
            model_name: 'm',
            metadata: { gender: 'female' },
          },
        ],
        rowCount: 4,
      });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await manager.computeFairnessReport({
        evalRunId: 'run-1',
        datasetId: 'ds-1',
        protectedAttribute: 'gender',
        threshold: 0.8,
      });

      expect(result.groups).toHaveLength(2);
      expect(result.protectedAttribute).toBe('gender');
      // male: 2/2 positive, female: 1/2 positive
      expect(result.demographicParity).toBe(0.5);
      expect(result.disparateImpactRatio).toBe(0.5); // 0.5/1.0
      expect(result.passesThreshold).toBe(false); // 0.5 < 0.8
    });

    it('passes threshold when groups are balanced', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            sample_index: 0,
            prompt: 'p',
            response: 'r',
            groundedness: 4,
            coherence: 4,
            relevance: 4,
            fluency: 4,
            harmlessness: 4,
            model_name: 'm',
            metadata: { group: 'a' },
          },
          {
            sample_index: 1,
            prompt: 'p',
            response: 'r',
            groundedness: 4,
            coherence: 4,
            relevance: 4,
            fluency: 4,
            harmlessness: 4,
            model_name: 'm',
            metadata: { group: 'b' },
          },
        ],
        rowCount: 2,
      });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await manager.computeFairnessReport({
        evalRunId: 'run-2',
        datasetId: 'ds-1',
        protectedAttribute: 'group',
      });

      expect(result.disparateImpactRatio).toBe(1);
      expect(result.passesThreshold).toBe(true);
    });
  });

  // ── SHAP Explainability ─────────────────────────────────────

  describe('SHAP explainability', () => {
    it('computes token attributions using leave-one-out', async () => {
      // Mock storage insert
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await manager.computeShapExplanation({
        modelName: 'test-model',
        prompt: 'hello world test',
        response: 'great response here',
      });

      expect(result.inputTokens).toHaveLength(3);
      expect(result.inputTokens[0]!.token).toBe('hello');
      expect(result.inputTokens[1]!.token).toBe('world');
      expect(result.inputTokens[2]!.token).toBe('test');
      expect(result.modelName).toBe('test-model');
      // Attributions should be normalized
      const totalAbs = result.inputTokens.reduce((s, t) => s + Math.abs(t.attribution), 0);
      expect(totalAbs).toBeCloseTo(1, 1);
    });
  });

  // ── Data Provenance ─────────────────────────────────────────

  describe('data provenance', () => {
    it('records provenance entries in batch', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 2 });

      const entries: ProvenanceEntry[] = [
        {
          id: 'prov-1',
          datasetId: 'ds-1',
          conversationId: 'conv-1',
          userId: 'user-1',
          status: 'included',
          sourceType: 'conversation',
          recordedAt: Date.now(),
        },
        {
          id: 'prov-2',
          datasetId: 'ds-1',
          conversationId: 'conv-2',
          userId: 'user-2',
          status: 'filtered',
          filterReason: 'low_quality',
          sourceType: 'conversation',
          recordedAt: Date.now(),
        },
      ];

      await manager.recordProvenance(entries);
      expect(mockQuery).toHaveBeenCalled();
    });

    it('computes provenance summary', async () => {
      // Mock status counts
      mockQuery.mockResolvedValueOnce({
        rows: [
          { status: 'included', cnt: '10' },
          { status: 'filtered', cnt: '3' },
          { status: 'synthetic', cnt: '2' },
        ],
        rowCount: 3,
      });
      // Mock unique counts
      mockQuery.mockResolvedValueOnce({
        rows: [{ users: '5', convs: '8' }],
        rowCount: 1,
      });
      // Mock filter reasons
      mockQuery.mockResolvedValueOnce({
        rows: [
          { filter_reason: 'low_quality', cnt: '2' },
          { filter_reason: 'duplicate', cnt: '1' },
        ],
        rowCount: 2,
      });

      const summary = await manager.getProvenanceSummary('ds-1');
      expect(summary.totalEntries).toBe(15);
      expect(summary.included).toBe(10);
      expect(summary.filtered).toBe(3);
      expect(summary.synthetic).toBe(2);
      expect(summary.redacted).toBe(0);
      expect(summary.uniqueUsers).toBe(5);
      expect(summary.uniqueConversations).toBe(8);
      expect(summary.filterReasons['low_quality']).toBe(2);
    });

    it('redacts user data for GDPR compliance', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 5 });

      const count = await manager.redactUserData('user-123');
      expect(count).toBe(5);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("status = 'redacted'"), [
        'user-123',
      ]);
    });
  });

  // ── Model Cards ─────────────────────────────────────────────

  describe('model cards', () => {
    it('generates a model card with defaults', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const card = await manager.generateModelCard({
        personalityId: 'p-1',
        modelName: 'claude-sonnet-4-20250514',
      });

      expect(card.personalityId).toBe('p-1');
      expect(card.modelName).toBe('claude-sonnet-4-20250514');
      expect(card.intendedUse).toContain('General-purpose');
      expect(card.limitations).toContain('inaccurate');
      expect(card.generatedBy).toBe('auto');
      expect(card.riskClassification).toBe('limited');
    });

    it('renders model card as markdown', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const card = await manager.generateModelCard({
        personalityId: 'p-1',
        modelName: 'test-model',
        version: '1.0',
        intendedUse: 'Customer support',
        limitations: 'May hallucinate',
        riskClassification: 'high',
      });

      const md = manager.renderModelCardMarkdown(card);
      expect(md).toContain('# Model Card: test-model');
      expect(md).toContain('**Version**: 1.0');
      expect(md).toContain('## Intended Use');
      expect(md).toContain('Customer support');
      expect(md).toContain('## Limitations');
      expect(md).toContain('May hallucinate');
      expect(md).toContain('EU AI Act Risk Classification');
      expect(md).toContain('high');
    });

    it('renders evaluation results in markdown when present', () => {
      const card: ModelCard = {
        id: 'mc-1',
        personalityId: 'p-1',
        modelName: 'test',
        intendedUse: 'Test',
        limitations: 'Test',
        trainingDataSummary: { sampleCount: 100 },
        evaluationResults: {
          evalRunId: 'run-1',
          avgGroundedness: 4.2,
          avgCoherence: 3.8,
          sampleCount: 50,
        },
        generatedBy: 'auto',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const md = manager.renderModelCardMarkdown(card);
      expect(md).toContain('## Evaluation Results');
      expect(md).toContain('4.20');
      expect(md).toContain('3.80');
    });

    it('renders fairness assessment in markdown when present', () => {
      const card: ModelCard = {
        id: 'mc-2',
        personalityId: 'p-1',
        modelName: 'test',
        intendedUse: 'Test',
        limitations: 'Test',
        trainingDataSummary: { sampleCount: 0 },
        fairnessAssessment: {
          protectedAttributes: ['gender', 'age'],
          passesThreshold: true,
          disparateImpactRatios: { gender: 0.95, age: 0.88 },
        },
        generatedBy: 'auto',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const md = manager.renderModelCardMarkdown(card);
      expect(md).toContain('## Fairness Assessment');
      expect(md).toContain('gender, age');
      expect(md).toContain('Yes');
      expect(md).toContain('0.950');
    });
  });

  // ── Tokenizer ───────────────────────────────────────────────

  describe('tokenize', () => {
    it('splits on whitespace', () => {
      expect(tokenize('hello world test')).toEqual(['hello', 'world', 'test']);
    });

    it('handles multiple spaces', () => {
      expect(tokenize('  hello   world  ')).toEqual(['hello', 'world']);
    });

    it('returns empty array for empty string', () => {
      expect(tokenize('')).toEqual([]);
    });
  });
});
