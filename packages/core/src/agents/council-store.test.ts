import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CouncilStorage } from './council-storage.js';

// ─── Mock pool ──────────────────────────────────────────────────────
let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Row fixtures ───────────────────────────────────────────────────

const templateRow = {
  id: 'tmpl-1',
  name: 'Board of Directors',
  description: 'Strategic review',
  members: [
    {
      role: 'CFO',
      profileName: 'analyst',
      description: 'Finance',
      weight: 1,
      perspective: 'Financial',
    },
  ],
  facilitator_profile: 'summarizer',
  deliberation_strategy: 'rounds',
  max_rounds: 3,
  voting_strategy: 'facilitator_judgment',
  is_builtin: false,
  created_at: Date.now(),
};

const runRow = {
  id: 'run-1',
  template_id: 'tmpl-1',
  template_name: 'Board of Directors',
  topic: 'Should we expand?',
  context: null,
  status: 'pending',
  deliberation_strategy: 'rounds',
  max_rounds: 3,
  completed_rounds: 0,
  decision: null,
  consensus: null,
  dissents: null,
  reasoning: null,
  confidence: null,
  token_budget: 500000,
  tokens_used: 0,
  created_at: Date.now(),
  started_at: null,
  completed_at: null,
  initiated_by: null,
};

const positionRow = {
  id: 'pos-1',
  council_run_id: 'run-1',
  member_role: 'CFO',
  profile_name: 'analyst',
  round: 1,
  position: 'I support expansion',
  confidence: 0.8,
  key_points: ['Growing market', 'Low risk'],
  agreements: [],
  disagreements: [],
  created_at: Date.now(),
};

describe('CouncilStorage', () => {
  let storage: CouncilStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new CouncilStorage();
  });

  // ── Template operations ───────────────────────────────────────

  describe('getTemplate', () => {
    it('returns template when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [templateRow], rowCount: 1 });
      const result = await storage.getTemplate('tmpl-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('tmpl-1');
      expect(result!.facilitatorProfile).toBe('summarizer');
      expect(result!.deliberationStrategy).toBe('rounds');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getTemplate('no-such');
      expect(result).toBeNull();
    });
  });

  describe('getTemplateByName', () => {
    it('returns template by name', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [templateRow], rowCount: 1 });
      const result = await storage.getTemplateByName('Board of Directors');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Board of Directors');
    });
  });

  describe('listTemplates', () => {
    it('returns templates with total', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [templateRow, { ...templateRow, id: 'tmpl-2' }],
          rowCount: 2,
        });
      const result = await storage.listTemplates();
      expect(result.total).toBe(2);
      expect(result.templates).toHaveLength(2);
    });

    it('returns empty list when no templates', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.listTemplates();
      expect(result.total).toBe(0);
      expect(result.templates).toHaveLength(0);
    });
  });

  describe('createTemplate', () => {
    it('creates and returns a template', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [templateRow], rowCount: 1 });
      const result = await storage.createTemplate({
        name: 'Board of Directors',
        description: 'Strategic review',
        members: templateRow.members as any,
        facilitatorProfile: 'summarizer',
        deliberationStrategy: 'rounds',
        maxRounds: 3,
        votingStrategy: 'facilitator_judgment',
      });
      expect(result.name).toBe('Board of Directors');
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO agents.council_templates');
    });
  });

  describe('updateTemplate', () => {
    it('updates template fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...templateRow, name: 'Updated' }],
        rowCount: 1,
      });
      const result = await storage.updateTemplate('tmpl-1', { name: 'Updated' });
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Updated');
    });

    it('returns null when nothing to update', async () => {
      const result = await storage.updateTemplate('tmpl-1', {});
      expect(result).toBeNull();
    });
  });

  describe('deleteTemplate', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.deleteTemplate('tmpl-1');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.deleteTemplate('no-such');
      expect(result).toBe(false);
    });
  });

  // ── Run operations ────────────────────────────────────────────

  describe('createRun', () => {
    it('creates a run', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [runRow], rowCount: 1 });
      const template = {
        id: 'tmpl-1',
        name: 'Board of Directors',
        deliberationStrategy: 'rounds' as const,
        maxRounds: 3,
        members: [],
        facilitatorProfile: 'summarizer',
        votingStrategy: 'facilitator_judgment' as const,
        isBuiltin: false,
        createdAt: Date.now(),
        description: '',
      };
      const result = await storage.createRun(
        { templateId: 'tmpl-1', topic: 'Should we expand?' },
        template
      );
      expect(result.topic).toBe('Should we expand?');
      expect(result.status).toBe('pending');
    });
  });

  describe('updateRun', () => {
    it('updates run status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...runRow, status: 'running' }],
        rowCount: 1,
      });
      const result = await storage.updateRun('run-1', { status: 'running', startedAt: Date.now() });
      expect(result).not.toBeNull();
      expect(result!.status).toBe('running');
    });

    it('returns null when nothing to update', async () => {
      const result = await storage.updateRun('run-1', {});
      expect(result).toBeNull();
    });
  });

  describe('getRun', () => {
    it('returns run when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [runRow], rowCount: 1 });
      const result = await storage.getRun('run-1');
      expect(result).not.toBeNull();
      expect(result!.topic).toBe('Should we expand?');
    });
  });

  describe('listRuns', () => {
    it('returns runs with total', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [runRow], rowCount: 1 });
      const result = await storage.listRuns();
      expect(result.total).toBe(1);
      expect(result.runs).toHaveLength(1);
    });

    it('filters by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.listRuns({ status: 'completed' });
      expect(result.total).toBe(0);
      expect(mockQuery.mock.calls[0][0]).toContain('status = $1');
    });
  });

  // ── Position operations ───────────────────────────────────────

  describe('createPosition', () => {
    it('creates a position', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [positionRow], rowCount: 1 });
      const result = await storage.createPosition({
        councilRunId: 'run-1',
        memberRole: 'CFO',
        profileName: 'analyst',
        round: 1,
        position: 'I support expansion',
        confidence: 0.8,
        keyPoints: ['Growing market', 'Low risk'],
        agreements: [],
        disagreements: [],
      });
      expect(result.memberRole).toBe('CFO');
      expect(result.confidence).toBe(0.8);
    });
  });

  describe('getPositionsForRun', () => {
    it('returns all positions for a run', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [positionRow, { ...positionRow, id: 'pos-2', member_role: 'CTO' }],
        rowCount: 2,
      });
      const result = await storage.getPositionsForRun('run-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('getPositionsForRound', () => {
    it('returns positions for a specific round', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [positionRow], rowCount: 1 });
      const result = await storage.getPositionsForRound('run-1', 1);
      expect(result).toHaveLength(1);
      expect(result[0]!.round).toBe(1);
    });
  });
});
