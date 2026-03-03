/**
 * AthiStorage Tests — Phase 107-F
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../storage/pg-pool.js', () => ({ getPool: () => ({ query: mockQuery }) }));

import { AthiStorage } from './athi-storage.js';

const SAMPLE_ROW = {
  id: 'athi-1',
  org_id: null,
  title: 'Prompt Injection via API',
  description: 'Attacker crafts malicious prompts',
  actor: 'cybercriminal',
  techniques: ['prompt_injection'],
  harms: ['data_breach'],
  impacts: ['regulatory_penalty'],
  likelihood: 4,
  severity: 5,
  risk_score: 20,
  mitigations: [{ description: 'Input validation', status: 'implemented' }],
  status: 'identified',
  created_by: 'user-1',
  created_at: 1000,
  updated_at: 1000,
};

describe('AthiStorage', () => {
  let storage: AthiStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new AthiStorage();
  });

  describe('createScenario', () => {
    it('inserts a scenario and returns it', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_ROW] });

      const scenario = await storage.createScenario(
        {
          title: 'Prompt Injection via API',
          actor: 'cybercriminal',
          techniques: ['prompt_injection'],
          harms: ['data_breach'],
          impacts: ['regulatory_penalty'],
          likelihood: 4,
          severity: 5,
        },
        'user-1'
      );

      expect(scenario.title).toBe('Prompt Injection via API');
      expect(scenario.riskScore).toBe(20);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO security.athi_scenarios');
    });

    it('passes orgId when provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...SAMPLE_ROW, org_id: 'org-1' }],
      });

      const scenario = await storage.createScenario(
        {
          title: 'Test',
          actor: 'insider',
          techniques: ['data_poisoning'],
          harms: ['misinformation'],
          impacts: ['ip_theft'],
          likelihood: 2,
          severity: 3,
        },
        'user-1',
        'org-1'
      );

      expect(scenario.orgId).toBe('org-1');
      expect(mockQuery.mock.calls[0][1]![1]).toBe('org-1');
    });
  });

  describe('getScenario', () => {
    it('returns scenario by id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_ROW] });

      const scenario = await storage.getScenario('athi-1');
      expect(scenario?.id).toBe('athi-1');
      expect(scenario?.actor).toBe('cybercriminal');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const scenario = await storage.getScenario('missing');
      expect(scenario).toBeNull();
    });
  });

  describe('updateScenario', () => {
    it('updates fields and returns updated scenario', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...SAMPLE_ROW, status: 'assessed' }],
      });

      const scenario = await storage.updateScenario('athi-1', { status: 'assessed' });
      expect(scenario?.status).toBe('assessed');
      expect(mockQuery.mock.calls[0][0]).toContain('UPDATE security.athi_scenarios');
    });

    it('returns null when scenario does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await storage.updateScenario('missing', { title: 'New' });
      expect(result).toBeNull();
    });

    it('falls back to getScenario when no fields to update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_ROW] });
      const result = await storage.updateScenario('athi-1', {});
      expect(result?.id).toBe('athi-1');
      expect(mockQuery.mock.calls[0][0]).toContain('SELECT');
    });
  });

  describe('deleteScenario', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      const deleted = await storage.deleteScenario('athi-1');
      expect(deleted).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      const deleted = await storage.deleteScenario('missing');
      expect(deleted).toBe(false);
    });
  });

  describe('listScenarios', () => {
    it('lists scenarios with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [SAMPLE_ROW] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await storage.listScenarios({ limit: 10, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('applies actor filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await storage.listScenarios({ actor: 'insider' });
      expect(mockQuery.mock.calls[0][0]).toContain('actor = $1');
    });

    it('applies status filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await storage.listScenarios({ status: 'mitigated' });
      expect(mockQuery.mock.calls[0][0]).toContain('status = $1');
    });

    it('applies orgId filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await storage.listScenarios({ orgId: 'org-1' });
      expect(mockQuery.mock.calls[0][0]).toContain('org_id = $1');
    });
  });

  describe('getRiskMatrix', () => {
    it('returns actor x technique matrix cells', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            actor: 'cybercriminal',
            technique: 'prompt_injection',
            count: '3',
            avg_risk_score: '15.5',
            max_risk_score: '20',
            scenario_ids: ['a', 'b', 'c'],
          },
        ],
      });

      const cells = await storage.getRiskMatrix();
      expect(cells).toHaveLength(1);
      expect(cells[0].actor).toBe('cybercriminal');
      expect(cells[0].technique).toBe('prompt_injection');
      expect(cells[0].count).toBe(3);
      expect(cells[0].avgRiskScore).toBe(15.5);
      expect(cells[0].maxRiskScore).toBe(20);
    });

    it('filters by orgId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await storage.getRiskMatrix('org-1');
      expect(mockQuery.mock.calls[0][0]).toContain('WHERE org_id = $1');
    });
  });

  describe('getTopRisks', () => {
    it('returns top N scenarios by risk score', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_ROW] });
      const top = await storage.getTopRisks(5);
      expect(top).toHaveLength(1);
      expect(mockQuery.mock.calls[0][0]).toContain('ORDER BY risk_score DESC');
    });
  });

  describe('getStatusCounts', () => {
    it('returns counts grouped by status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { status: 'identified', count: '5' },
          { status: 'mitigated', count: '3' },
        ],
      });

      const counts = await storage.getStatusCounts();
      expect(counts.identified).toBe(5);
      expect(counts.mitigated).toBe(3);
    });
  });

  describe('getActorCounts', () => {
    it('returns counts grouped by actor', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { actor: 'cybercriminal', count: '4' },
          { actor: 'insider', count: '2' },
        ],
      });

      const counts = await storage.getActorCounts();
      expect(counts.cybercriminal).toBe(4);
      expect(counts.insider).toBe(2);
    });
  });
});
