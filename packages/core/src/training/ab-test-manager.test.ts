import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import { AbTestManager } from './ab-test-manager.js';

const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockPool = { query: mockQuery } as unknown as Pool;
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
} as unknown as SecureLogger;

function makeTestRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ab-1',
    personality_id: 'p-1',
    name: 'Test A/B',
    model_a: 'llama3:8b',
    model_b: 'llama3:8b-finetuned',
    traffic_pct_b: 50,
    status: 'running',
    auto_promote: false,
    min_conversations: 100,
    winner: null,
    conversations_a: 0,
    conversations_b: 0,
    avg_quality_a: null,
    avg_quality_b: null,
    created_at: new Date('2026-03-01'),
    completed_at: null,
    ...overrides,
  };
}

describe('AbTestManager', () => {
  let manager: AbTestManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new AbTestManager({ pool: mockPool, logger: mockLogger });
  });

  describe('createTest', () => {
    it('creates a new A/B test', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // no existing running test
        .mockResolvedValueOnce({ rows: [makeTestRow()] }); // INSERT

      const test = await manager.createTest({
        personalityId: 'p-1',
        name: 'Test A/B',
        modelA: 'llama3:8b',
        modelB: 'llama3:8b-finetuned',
        trafficPctB: 50,
      });

      expect(test.name).toBe('Test A/B');
      expect(test.status).toBe('running');
    });

    it('rejects when a running test already exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });

      await expect(
        manager.createTest({
          personalityId: 'p-1',
          name: 'Second Test',
          modelA: 'a',
          modelB: 'b',
          trafficPctB: 30,
        })
      ).rejects.toThrow('already exists');
    });
  });

  describe('getTest', () => {
    it('returns test when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeTestRow()] });
      const test = await manager.getTest('ab-1');
      expect(test?.name).toBe('Test A/B');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      expect(await manager.getTest('nope')).toBeNull();
    });
  });

  describe('getActiveTest', () => {
    it('returns running test for personality', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeTestRow()] });
      const test = await manager.getActiveTest('p-1');
      expect(test?.status).toBe('running');
    });

    it('returns null when no running test', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      expect(await manager.getActiveTest('p-1')).toBeNull();
    });
  });

  describe('listTests', () => {
    it('lists all tests', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeTestRow(), makeTestRow({ id: 'ab-2' })] });
      const tests = await manager.listTests();
      expect(tests).toHaveLength(2);
    });

    it('filters by personality and status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await manager.listTests({ personalityId: 'p-1', status: 'running' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('personality_id =');
      expect(sql).toContain('status =');
    });
  });

  describe('resolveModel', () => {
    it('returns null when no active test', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // getActiveTest
      const result = await manager.resolveModel('p-1', 'conv-1');
      expect(result).toBeNull();
    });

    it('returns existing assignment for conversation', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeTestRow()] }) // getActiveTest
        .mockResolvedValueOnce({ rows: [{ assigned_model: 'b' }] }); // existing assignment

      const result = await manager.resolveModel('p-1', 'conv-1');
      expect(result).not.toBeNull();
      expect(result!.variant).toBe('b');
      expect(result!.model).toBe('llama3:8b-finetuned');
      expect(result!.testId).toBe('ab-1');
    });

    it('creates new assignment when none exists', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeTestRow({ traffic_pct_b: 100 })] }) // getActiveTest — 100% to B
        .mockResolvedValueOnce({ rows: [] }) // no existing assignment
        .mockResolvedValueOnce({}) // INSERT assignment
        .mockResolvedValueOnce({}); // UPDATE count

      const result = await manager.resolveModel('p-1', 'conv-new');
      expect(result).not.toBeNull();
      expect(result!.variant).toBe('b');
      expect(result!.model).toBe('llama3:8b-finetuned');
    });

    it('assigns model A when traffic_pct_b is 0-ish', async () => {
      // traffic_pct_b=1 means ~1% to B — use deterministic test by mocking Math.random
      const origRandom = Math.random;
      Math.random = () => 0.99; // 99 > 1, so assignment is 'a'

      mockQuery
        .mockResolvedValueOnce({ rows: [makeTestRow({ traffic_pct_b: 1 })] })
        .mockResolvedValueOnce({ rows: [] }) // no existing
        .mockResolvedValueOnce({}) // INSERT
        .mockResolvedValueOnce({}); // UPDATE count

      const result = await manager.resolveModel('p-1', 'conv-2');
      expect(result!.variant).toBe('a');
      expect(result!.model).toBe('llama3:8b');

      Math.random = origRandom;
    });
  });

  describe('recordQualityScore', () => {
    it('updates assignment and recomputes aggregates', async () => {
      mockQuery
        .mockResolvedValueOnce({}) // UPDATE assignment
        .mockResolvedValueOnce({}); // recompute aggregates

      await manager.recordQualityScore('ab-1', 'conv-1', 0.85);
      expect(mockQuery).toHaveBeenCalledTimes(2);
      const sql1 = mockQuery.mock.calls[0][0] as string;
      expect(sql1).toContain('UPDATE training.ab_test_assignments');
    });
  });

  describe('evaluateTest', () => {
    it('determines winner when min conversations met', async () => {
      // getTest
      mockQuery.mockResolvedValueOnce({
        rows: [makeTestRow({ conversations_a: 60, conversations_b: 60, min_conversations: 100 })],
      });
      // recompute aggregates
      mockQuery.mockResolvedValueOnce({});
      // getTest after recompute
      mockQuery.mockResolvedValueOnce({
        rows: [
          makeTestRow({
            conversations_a: 60,
            conversations_b: 60,
            avg_quality_a: 0.8,
            avg_quality_b: 0.85,
            min_conversations: 100,
          }),
        ],
      });

      const result = await manager.evaluateTest('ab-1');
      expect(result.winner).toBe('b');
      expect(result.avgQualityB).toBe(0.85);
    });

    it('returns null winner when not enough conversations', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [makeTestRow({ conversations_a: 10, conversations_b: 10 })],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [
            makeTestRow({
              conversations_a: 10,
              conversations_b: 10,
              avg_quality_a: 0.8,
              avg_quality_b: 0.9,
            }),
          ],
        });

      const result = await manager.evaluateTest('ab-1');
      expect(result.winner).toBeNull();
    });

    it('throws when test not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(manager.evaluateTest('nope')).rejects.toThrow('Test not found');
    });
  });

  describe('completeTest', () => {
    it('marks test as completed with winner', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeTestRow({ status: 'completed', winner: 'b' })],
      });

      const test = await manager.completeTest('ab-1', 'b');
      expect(test?.status).toBe('completed');
      expect(test?.winner).toBe('b');
    });

    it('returns null if test is not running', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      expect(await manager.completeTest('ab-1', 'a')).toBeNull();
    });
  });

  describe('cancelTest', () => {
    it('marks test as cancelled', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeTestRow({ status: 'cancelled' })],
      });

      const test = await manager.cancelTest('ab-1');
      expect(test?.status).toBe('cancelled');
    });

    it('returns null if already completed', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      expect(await manager.cancelTest('ab-1')).toBeNull();
    });
  });
});
