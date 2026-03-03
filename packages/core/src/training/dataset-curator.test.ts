import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import { DatasetCuratorManager } from './dataset-curator.js';

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockPool = { query: mockQuery } as unknown as Pool;
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
} as unknown as SecureLogger;

describe('DatasetCuratorManager', () => {
  let manager: DatasetCuratorManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new DatasetCuratorManager({ pool: mockPool, logger: mockLogger });
  });

  describe('previewDataset', () => {
    it('returns sample count and token estimate', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { conversation_id: 'c1', quality_score: 0.8, token_estimate: 500, messages: '[]' },
          { conversation_id: 'c2', quality_score: 0.7, token_estimate: 300, messages: '[]' },
        ],
      });

      const result = await manager.previewDataset({ minTokens: 100, maxTokens: 1000 });
      expect(result.sampleCount).toBe(2);
      expect(result.totalTokens).toBe(800);
    });

    it('applies quality threshold filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await manager.previewDataset({ qualityThreshold: 0.7 });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('quality_score');
    });

    it('applies personality filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await manager.previewDataset({ personalityIds: ['p1', 'p2'] });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toEqual(['p1', 'p2']);
    });

    it('applies date range filters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await manager.previewDataset({ fromTs: '2026-01-01', toTs: '2026-03-01' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('created_at >=');
      expect(sql).toContain('created_at <=');
    });

    it('excludes tool error conversations when requested', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await manager.previewDataset({ excludeToolErrors: true });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('NOT IN');
      expect(sql).toContain("LIKE '%error%'");
    });
  });

  describe('commitDataset', () => {
    it('writes JSONL and inserts DB row', async () => {
      const { writeFileSync } = await import('node:fs');

      mockQuery
        // buildFilteredQuery
        .mockResolvedValueOnce({
          rows: [
            {
              conversation_id: 'c1',
              messages: [{ role: 'user', content: 'hi' }],
              quality_score: 0.9,
              token_estimate: 200,
            },
          ],
        })
        // INSERT
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'ds-1',
              name: 'test-ds',
              personality_id: null,
              rules: {},
              dataset_hash: 'abc123',
              sample_count: 1,
              total_tokens: 200,
              status: 'committed',
              path: '/tmp/out/test-ds_123.jsonl',
              created_at: new Date('2026-03-01'),
            },
          ],
        });

      const result = await manager.commitDataset(
        'test-ds',
        undefined,
        { minTokens: 0 },
        '/tmp/out'
      );
      expect(result.status).toBe('committed');
      expect(result.sampleCount).toBe(1);
      expect(writeFileSync).toHaveBeenCalled();
    });
  });

  describe('listDatasets', () => {
    it('returns all datasets by default', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'ds-1',
            name: 'ds1',
            personality_id: null,
            rules: {},
            dataset_hash: 'h1',
            sample_count: 10,
            total_tokens: 5000,
            status: 'committed',
            path: '/tmp/ds1.jsonl',
            created_at: new Date('2026-03-01'),
          },
        ],
      });

      const datasets = await manager.listDatasets();
      expect(datasets).toHaveLength(1);
      expect(datasets[0].name).toBe('ds1');
    });

    it('filters by status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await manager.listDatasets({ status: 'committed' });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('committed');
    });
  });

  describe('getDataset', () => {
    it('returns dataset when found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'ds-1',
            name: 'found',
            personality_id: null,
            rules: {},
            dataset_hash: '',
            sample_count: 0,
            total_tokens: 0,
            status: 'preview',
            path: null,
            created_at: new Date(),
          },
        ],
      });

      const ds = await manager.getDataset('ds-1');
      expect(ds?.name).toBe('found');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const ds = await manager.getDataset('nope');
      expect(ds).toBeNull();
    });
  });

  describe('deleteDataset', () => {
    it('returns true on success', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      expect(await manager.deleteDataset('ds-1')).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      expect(await manager.deleteDataset('nope')).toBe(false);
    });
  });
});
