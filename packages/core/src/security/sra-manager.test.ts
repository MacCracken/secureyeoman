/**
 * SraManager Tests — Phase 123
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

import { SraManager, type SraManagerDeps } from './sra-manager.js';
import { SraStorage } from './sra-storage.js';
import type { SraBlueprint, SraAssessment } from '@secureyeoman/shared';

const SAMPLE_BLUEPRINT: SraBlueprint = {
  id: 'bp-1',
  name: 'AWS SRA Foundation',
  provider: 'aws',
  framework: 'aws_sra',
  controls: [
    {
      id: 'c1',
      domain: 'identity_access',
      title: 'MFA',
      description: 'Enable MFA',
      priority: 'critical',
      complianceMappings: [],
      iacSnippets: [],
      dependencies: [],
      tags: [],
    },
    {
      id: 'c2',
      domain: 'network_security',
      title: 'VPC Logs',
      description: 'Enable VPC flow logs',
      priority: 'high',
      complianceMappings: [],
      iacSnippets: [],
      dependencies: [],
      tags: [],
    },
    {
      id: 'c3',
      domain: 'data_protection',
      title: 'KMS',
      description: 'KMS key management',
      priority: 'medium',
      complianceMappings: [],
      iacSnippets: [],
      dependencies: [],
      tags: [],
    },
  ],
  status: 'active',
  isBuiltin: true,
  metadata: {},
  createdAt: 1000,
  updatedAt: 1000,
};

const SAMPLE_ASSESSMENT: SraAssessment = {
  id: 'assess-1',
  blueprintId: 'bp-1',
  name: 'Q1 Assessment',
  controlResults: [
    { controlId: 'c1', status: 'fully_implemented' },
    { controlId: 'c2', status: 'not_implemented' },
    { controlId: 'c3', status: 'partially_implemented' },
  ],
  status: 'in_progress',
  createdAt: 2000,
  updatedAt: 2000,
};

function makeManager(): {
  manager: SraManager;
  storage: SraStorage;
  alertEval: ReturnType<typeof vi.fn>;
} {
  const storage = new SraStorage();
  const alertEval = vi.fn().mockResolvedValue(undefined);
  const deps: SraManagerDeps = {
    storage,
    pool: { query: mockQuery } as any,
    getAlertManager: () => ({ evaluate: alertEval }) as any,
  };
  return { manager: new SraManager(deps), storage, alertEval };
}

describe('SraManager', () => {
  let manager: SraManager;
  let storage: SraStorage;
  let alertEval: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    ({ manager, storage, alertEval } = makeManager());
  });

  // ── Blueprint CRUD ─────────────────────────────────────────────

  describe('createBlueprint', () => {
    it('delegates to storage and invalidates cache', async () => {
      vi.spyOn(storage, 'createBlueprint').mockResolvedValue(SAMPLE_BLUEPRINT);

      const result = await manager.createBlueprint({
        name: 'AWS SRA Foundation',
        provider: 'aws',
        framework: 'aws_sra',
      });

      expect(result.id).toBe('bp-1');
      expect(storage.createBlueprint).toHaveBeenCalledTimes(1);
    });
  });

  describe('getBlueprint', () => {
    it('delegates to storage', async () => {
      vi.spyOn(storage, 'getBlueprint').mockResolvedValue(SAMPLE_BLUEPRINT);
      const result = await manager.getBlueprint('bp-1');
      expect(result?.id).toBe('bp-1');
    });
  });

  describe('updateBlueprint', () => {
    it('delegates to storage and invalidates cache', async () => {
      vi.spyOn(storage, 'updateBlueprint').mockResolvedValue({
        ...SAMPLE_BLUEPRINT,
        status: 'archived',
      });
      const result = await manager.updateBlueprint('bp-1', { status: 'archived' });
      expect(result?.status).toBe('archived');
    });
  });

  describe('deleteBlueprint', () => {
    it('delegates to storage', async () => {
      vi.spyOn(storage, 'deleteBlueprint').mockResolvedValue(true);
      const result = await manager.deleteBlueprint('bp-1');
      expect(result).toBe(true);
    });
  });

  describe('listBlueprints', () => {
    it('delegates to storage', async () => {
      vi.spyOn(storage, 'listBlueprints').mockResolvedValue({
        items: [SAMPLE_BLUEPRINT],
        total: 1,
      });
      const result = await manager.listBlueprints({ provider: 'aws' });
      expect(result.items).toHaveLength(1);
    });
  });

  // ── Assessment CRUD ────────────────────────────────────────────

  describe('createAssessment', () => {
    it('delegates to storage', async () => {
      vi.spyOn(storage, 'createAssessment').mockResolvedValue(SAMPLE_ASSESSMENT);
      const result = await manager.createAssessment({
        blueprintId: 'bp-1',
        name: 'Q1 Assessment',
      });
      expect(result.id).toBe('assess-1');
    });
  });

  describe('getAssessment', () => {
    it('delegates to storage', async () => {
      vi.spyOn(storage, 'getAssessment').mockResolvedValue(SAMPLE_ASSESSMENT);
      const result = await manager.getAssessment('assess-1');
      expect(result?.id).toBe('assess-1');
    });
  });

  // ── Assessment generation ──────────────────────────────────────

  describe('generateAssessmentSummary', () => {
    it('computes summary from control results and blueprint', async () => {
      vi.spyOn(storage, 'getAssessment').mockResolvedValue(SAMPLE_ASSESSMENT);
      vi.spyOn(storage, 'getBlueprint').mockResolvedValue(SAMPLE_BLUEPRINT);
      vi.spyOn(storage, 'updateAssessment').mockImplementation(
        async (_id, data) =>
          ({
            ...SAMPLE_ASSESSMENT,
            summary: data.summary,
            status: data.status ?? SAMPLE_ASSESSMENT.status,
          }) as SraAssessment
      );

      const result = await manager.generateAssessmentSummary('assess-1');
      expect(result).not.toBeNull();
      expect(result!.summary).toBeDefined();
      expect(result!.summary!.totalControls).toBe(3);
      expect(result!.summary!.implemented).toBe(1);
      expect(result!.summary!.partial).toBe(1);
      expect(result!.summary!.notImplemented).toBe(1);
      // Score: (1 + 0.5) / 3 = 50%
      expect(result!.summary!.complianceScore).toBe(50);
    });

    it('returns null when assessment not found', async () => {
      vi.spyOn(storage, 'getAssessment').mockResolvedValue(null);
      const result = await manager.generateAssessmentSummary('missing');
      expect(result).toBeNull();
    });

    it('returns null when blueprint not found', async () => {
      vi.spyOn(storage, 'getAssessment').mockResolvedValue(SAMPLE_ASSESSMENT);
      vi.spyOn(storage, 'getBlueprint').mockResolvedValue(null);
      const result = await manager.generateAssessmentSummary('assess-1');
      expect(result).toBeNull();
    });

    it('fires alert when compliance score is below 50', async () => {
      const lowScoreAssessment: SraAssessment = {
        ...SAMPLE_ASSESSMENT,
        controlResults: [
          { controlId: 'c1', status: 'not_implemented' },
          { controlId: 'c2', status: 'not_implemented' },
          { controlId: 'c3', status: 'not_implemented' },
        ],
      };

      vi.spyOn(storage, 'getAssessment').mockResolvedValue(lowScoreAssessment);
      vi.spyOn(storage, 'getBlueprint').mockResolvedValue(SAMPLE_BLUEPRINT);
      vi.spyOn(storage, 'updateAssessment').mockImplementation(
        async (_id, data) =>
          ({
            ...lowScoreAssessment,
            summary: data.summary,
            status: data.status ?? lowScoreAssessment.status,
          }) as SraAssessment
      );

      await manager.generateAssessmentSummary('assess-1');
      expect(alertEval).toHaveBeenCalledTimes(1);
    });

    it('does not fire alert when compliance score is >= 50', async () => {
      vi.spyOn(storage, 'getAssessment').mockResolvedValue(SAMPLE_ASSESSMENT);
      vi.spyOn(storage, 'getBlueprint').mockResolvedValue(SAMPLE_BLUEPRINT);
      vi.spyOn(storage, 'updateAssessment').mockImplementation(
        async (_id, data) =>
          ({
            ...SAMPLE_ASSESSMENT,
            summary: data.summary,
            status: data.status ?? SAMPLE_ASSESSMENT.status,
          }) as SraAssessment
      );

      await manager.generateAssessmentSummary('assess-1');
      expect(alertEval).not.toHaveBeenCalled();
    });

    it('handles not_applicable controls correctly', async () => {
      const naAssessment: SraAssessment = {
        ...SAMPLE_ASSESSMENT,
        controlResults: [
          { controlId: 'c1', status: 'fully_implemented' },
          { controlId: 'c2', status: 'fully_implemented' },
          { controlId: 'c3', status: 'not_applicable' },
        ],
      };

      vi.spyOn(storage, 'getAssessment').mockResolvedValue(naAssessment);
      vi.spyOn(storage, 'getBlueprint').mockResolvedValue(SAMPLE_BLUEPRINT);
      vi.spyOn(storage, 'updateAssessment').mockImplementation(
        async (_id, data) =>
          ({
            ...naAssessment,
            summary: data.summary,
            status: data.status ?? naAssessment.status,
          }) as SraAssessment
      );

      const result = await manager.generateAssessmentSummary('assess-1');
      expect(result!.summary!.complianceScore).toBe(100);
      expect(result!.summary!.notApplicable).toBe(1);
    });
  });

  // ── Executive summary with caching ─────────────────────────────

  describe('getSummary', () => {
    it('fetches and caches summary', async () => {
      vi.spyOn(storage, 'getBlueprintCounts').mockResolvedValue({
        total: 3,
        byProvider: { aws: 1, azure: 1, generic: 1 },
        byFramework: { aws_sra: 1, mcra: 1, cisa_tra: 1 },
      });
      vi.spyOn(storage, 'getAssessmentStats').mockResolvedValue({
        total: 5,
        avgComplianceScore: 72.5,
        topGaps: ['MFA not enabled'],
        recent: [SAMPLE_ASSESSMENT],
      });

      const result = await manager.getSummary();
      expect(result.totalBlueprints).toBe(3);
      expect(result.totalAssessments).toBe(5);
      expect(result.avgComplianceScore).toBe(72.5);

      // Second call should use cache
      const result2 = await manager.getSummary();
      expect(result2).toEqual(result);
      expect(storage.getBlueprintCounts).toHaveBeenCalledTimes(1);
    });

    it('invalidates cache after blueprint create', async () => {
      vi.spyOn(storage, 'getBlueprintCounts').mockResolvedValue({
        total: 1,
        byProvider: { aws: 1 },
        byFramework: { aws_sra: 1 },
      });
      vi.spyOn(storage, 'getAssessmentStats').mockResolvedValue({
        total: 0,
        avgComplianceScore: 0,
        topGaps: [],
        recent: [],
      });

      await manager.getSummary();
      expect(storage.getBlueprintCounts).toHaveBeenCalledTimes(1);

      // Create a blueprint to invalidate cache
      vi.spyOn(storage, 'createBlueprint').mockResolvedValue(SAMPLE_BLUEPRINT);
      await manager.createBlueprint({ name: 'Test', provider: 'aws', framework: 'aws_sra' });

      // Next summary call should re-fetch
      await manager.getSummary();
      expect(storage.getBlueprintCounts).toHaveBeenCalledTimes(2);
    });
  });

  // ── Seeding ────────────────────────────────────────────────────

  describe('seedBuiltinBlueprints', () => {
    it('seeds 3 builtin blueprints', async () => {
      vi.spyOn(storage, 'createBuiltinBlueprint').mockResolvedValue(SAMPLE_BLUEPRINT);

      await manager.seedBuiltinBlueprints();

      expect(storage.createBuiltinBlueprint).toHaveBeenCalledTimes(3);
      const calls = (storage.createBuiltinBlueprint as any).mock.calls;
      expect(calls[0][0].id).toBe('sra-builtin-aws-sra');
      expect(calls[1][0].id).toBe('sra-builtin-cisa-tra');
      expect(calls[2][0].id).toBe('sra-builtin-mcra');
    });

    it('continues seeding even when one fails', async () => {
      vi.spyOn(storage, 'createBuiltinBlueprint')
        .mockRejectedValueOnce(new Error('db error'))
        .mockResolvedValueOnce(SAMPLE_BLUEPRINT)
        .mockResolvedValueOnce(SAMPLE_BLUEPRINT);

      await manager.seedBuiltinBlueprints();
      expect(storage.createBuiltinBlueprint).toHaveBeenCalledTimes(3);
    });
  });

  describe('seedComplianceMappings', () => {
    it('seeds compliance mappings', async () => {
      vi.spyOn(storage, 'seedComplianceMappings').mockResolvedValue(undefined);

      await manager.seedComplianceMappings();

      expect(storage.seedComplianceMappings).toHaveBeenCalledTimes(1);
      const mappings = (storage.seedComplianceMappings as any).mock.calls[0][0];
      // 10 domains x 4 frameworks = 40 mappings
      expect(mappings.length).toBe(40);
    });
  });
});
