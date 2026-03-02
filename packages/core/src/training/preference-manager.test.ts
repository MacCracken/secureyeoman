/**
 * PreferenceManager unit tests
 *
 * Tests DPO preference pair annotation CRUD, counting, and JSONL export
 * with a mocked Pool. No database required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import { PreferenceManager } from './preference-manager.js';

const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockPool = { query: mockQuery } as unknown as Pool;

const mockLogger: SecureLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
} as unknown as SecureLogger;

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'pair-1',
    prompt: 'What is Rust?',
    chosen: 'A systems programming language.',
    rejected: 'A color of iron oxide.',
    source: 'annotation',
    conversation_id: 'conv-1',
    message_id: 'msg-1',
    personality_id: 'pers-1',
    annotator_id: 'user-1',
    metadata: { quality: 'high' },
    created_at: new Date('2026-03-01T00:00:00Z'),
    ...overrides,
  };
}

describe('PreferenceManager', () => {
  let manager: PreferenceManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new PreferenceManager({ pool: mockPool, logger: mockLogger });
  });

  // ── recordAnnotation ────────────────────────────────────────────────────

  describe('recordAnnotation', () => {
    it('inserts with all fields', async () => {
      const row = makeRow();
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const result = await manager.recordAnnotation({
        prompt: 'What is Rust?',
        chosen: 'A systems programming language.',
        rejected: 'A color of iron oxide.',
        source: 'annotation',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        personalityId: 'pers-1',
        annotatorId: 'user-1',
        metadata: { quality: 'high' },
      });

      expect(mockQuery).toHaveBeenCalledOnce();
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO training.preference_pairs');
      expect(sql).toContain('RETURNING *');
      expect(params).toEqual([
        'What is Rust?',
        'A systems programming language.',
        'A color of iron oxide.',
        'annotation',
        'conv-1',
        'msg-1',
        'pers-1',
        'user-1',
        JSON.stringify({ quality: 'high' }),
      ]);

      expect(result).toEqual({
        id: 'pair-1',
        prompt: 'What is Rust?',
        chosen: 'A systems programming language.',
        rejected: 'A color of iron oxide.',
        source: 'annotation',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        personalityId: 'pers-1',
        annotatorId: 'user-1',
        metadata: { quality: 'high' },
        createdAt: '2026-03-01T00:00:00.000Z',
      });
    });

    it('inserts with minimal fields (no optional)', async () => {
      const row = makeRow({
        conversation_id: null,
        message_id: null,
        personality_id: null,
        annotator_id: null,
        metadata: {},
      });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const result = await manager.recordAnnotation({
        prompt: 'Hello',
        chosen: 'Hi there!',
        rejected: 'Go away.',
        source: 'comparison',
      });

      const [, params] = mockQuery.mock.calls[0];
      expect(params).toEqual([
        'Hello',
        'Hi there!',
        'Go away.',
        'comparison',
        null,
        null,
        null,
        null,
        '{}',
      ]);

      expect(result.conversationId).toBeNull();
      expect(result.messageId).toBeNull();
      expect(result.personalityId).toBeNull();
      expect(result.annotatorId).toBeNull();
    });
  });

  // ── listAnnotations ─────────────────────────────────────────────────────

  describe('listAnnotations', () => {
    it('returns all with no filters', async () => {
      const rows = [makeRow(), makeRow({ id: 'pair-2' })];
      mockQuery.mockResolvedValueOnce({ rows, rowCount: 2 });

      const result = await manager.listAnnotations();

      expect(result).toHaveLength(2);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).not.toContain('WHERE');
      expect(sql).toContain('ORDER BY created_at DESC');
      expect(sql).toContain('LIMIT $1 OFFSET $2');
      expect(params).toEqual([100, 0]);
    });

    it('filters by personalityId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow()], rowCount: 1 });

      await manager.listAnnotations({ personalityId: 'pers-1' });

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('WHERE personality_id = $1');
      expect(sql).toContain('LIMIT $2 OFFSET $3');
      expect(params).toEqual(['pers-1', 100, 0]);
    });

    it('filters by source', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await manager.listAnnotations({ source: 'multi_turn' });

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('WHERE source = $1');
      expect(params).toEqual(['multi_turn', 100, 0]);
    });

    it('respects limit and offset', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await manager.listAnnotations({ limit: 25, offset: 50 });

      const [, params] = mockQuery.mock.calls[0];
      expect(params).toEqual([25, 50]);
    });
  });

  // ── getAnnotation ───────────────────────────────────────────────────────

  describe('getAnnotation', () => {
    it('returns the annotation when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeRow()], rowCount: 1 });

      const result = await manager.getAnnotation('pair-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('pair-1');
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('SELECT * FROM training.preference_pairs WHERE id = $1');
      expect(params).toEqual(['pair-1']);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await manager.getAnnotation('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ── deleteAnnotation ────────────────────────────────────────────────────

  describe('deleteAnnotation', () => {
    it('returns true on successful deletion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await manager.deleteAnnotation('pair-1');

      expect(result).toBe(true);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('DELETE FROM training.preference_pairs WHERE id = $1');
      expect(params).toEqual(['pair-1']);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await manager.deleteAnnotation('nonexistent');

      expect(result).toBe(false);
    });
  });

  // ── countByPersonality ──────────────────────────────────────────────────

  describe('countByPersonality', () => {
    it('returns the count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '42' }], rowCount: 1 });

      const result = await manager.countByPersonality('pers-1');

      expect(result).toBe(42);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('COUNT(*)');
      expect(sql).toContain('personality_id = $1');
      expect(params).toEqual(['pers-1']);
    });
  });

  // ── exportAsDpo ─────────────────────────────────────────────────────────

  describe('exportAsDpo', () => {
    it('yields JSONL lines across batches', async () => {
      const row1 = makeRow({ prompt: 'Q1', chosen: 'A1', rejected: 'R1' });
      const row2 = makeRow({ id: 'pair-2', prompt: 'Q2', chosen: 'A2', rejected: 'R2' });

      // First call returns 2 rows, second call returns 0 to stop iteration
      mockQuery
        .mockResolvedValueOnce({ rows: [row1, row2], rowCount: 2 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const lines: string[] = [];
      for await (const line of manager.exportAsDpo()) {
        lines.push(line);
      }

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toEqual({ prompt: 'Q1', chosen: 'A1', rejected: 'R1' });
      expect(JSON.parse(lines[1])).toEqual({ prompt: 'Q2', chosen: 'A2', rejected: 'R2' });

      // Each line ends with newline
      expect(lines[0].endsWith('\n')).toBe(true);
      expect(lines[1].endsWith('\n')).toBe(true);

      // Verify the query was called with correct ORDER BY and pagination
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('ORDER BY created_at ASC');
    });
  });
});
