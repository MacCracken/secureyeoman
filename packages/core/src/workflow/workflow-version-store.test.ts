/**
 * WorkflowVersionStorage unit tests (Phase 114)
 *
 * Tests CRUD operations on workflow.versions via mocked pg pool.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../storage/pg-pool.js', () => ({ getPool: () => ({ query: mockQuery }) }));
vi.mock('../utils/id.js', () => ({ uuidv7: () => 'mock-uuid' }));

import { WorkflowVersionStorage } from './workflow-version-storage.js';

const SAMPLE_ROW = {
  id: 'wv-1',
  workflow_id: 'wf-1',
  version_tag: null,
  snapshot: { name: 'Test Workflow', steps: [] },
  diff_summary: null,
  changed_fields: [],
  author: 'system',
  created_at: '1700000000000',
};

describe('WorkflowVersionStorage', () => {
  let storage: WorkflowVersionStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new WorkflowVersionStorage();
  });

  describe('createVersion', () => {
    it('inserts a version and returns mapped result', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_ROW] });

      const result = await storage.createVersion({
        workflowId: 'wf-1',
        snapshot: { name: 'Test Workflow', steps: [] },
      });

      expect(result.workflowId).toBe('wf-1');
      expect(result.createdAt).toBe(1700000000000);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO workflow.versions');
    });

    it('passes author and versionTag when provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...SAMPLE_ROW, version_tag: '2026.3.3', author: 'admin' }],
      });

      const result = await storage.createVersion({
        workflowId: 'wf-1',
        versionTag: '2026.3.3',
        snapshot: { name: 'Test' },
        author: 'admin',
      });

      expect(result.versionTag).toBe('2026.3.3');
      expect(result.author).toBe('admin');
    });
  });

  describe('listVersions', () => {
    it('returns paginated versions with total', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [SAMPLE_ROW] });

      const { versions, total } = await storage.listVersions('wf-1', { limit: 10, offset: 0 });

      expect(total).toBe(5);
      expect(versions).toHaveLength(1);
      expect(versions[0].workflowId).toBe('wf-1');
    });

    it('uses default limit/offset when omitted', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const { versions, total } = await storage.listVersions('wf-1');

      expect(total).toBe(0);
      expect(versions).toHaveLength(0);
      expect(mockQuery.mock.calls[1][1]).toEqual(['wf-1', 50, 0]);
    });
  });

  describe('getVersion', () => {
    it('returns version by ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_ROW] });
      const result = await storage.getVersion('wv-1');
      expect(result?.id).toBe('wv-1');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      expect(await storage.getVersion('missing')).toBeNull();
    });
  });

  describe('getVersionByTag', () => {
    it('returns version matching workflow + tag', async () => {
      const tagged = { ...SAMPLE_ROW, version_tag: '2026.3.3' };
      mockQuery.mockResolvedValueOnce({ rows: [tagged] });
      const result = await storage.getVersionByTag('wf-1', '2026.3.3');
      expect(result?.versionTag).toBe('2026.3.3');
    });
  });

  describe('getLatestVersion', () => {
    it('returns most recent version', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_ROW] });
      expect((await storage.getLatestVersion('wf-1'))?.id).toBe('wv-1');
    });

    it('returns null when no versions exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      expect(await storage.getLatestVersion('wf-1')).toBeNull();
    });
  });

  describe('tagVersion', () => {
    it('updates and returns tagged version', async () => {
      const updated = { ...SAMPLE_ROW, version_tag: '2026.3.3' };
      mockQuery.mockResolvedValueOnce({ rows: [updated] });
      const result = await storage.tagVersion('wv-1', '2026.3.3');
      expect(result?.versionTag).toBe('2026.3.3');
    });
  });

  describe('generateNextTag', () => {
    it('returns base date tag when none exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const tag = await storage.generateNextTag('wf-1');
      const now = new Date();
      expect(tag).toBe(`${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`);
    });

    it('increments suffix for same-day tags', async () => {
      const now = new Date();
      const baseTag = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
      mockQuery.mockResolvedValueOnce({
        rows: [{ version_tag: baseTag }, { version_tag: `${baseTag}-1` }],
      });
      expect(await storage.generateNextTag('wf-1')).toBe(`${baseTag}-2`);
    });
  });

  describe('deleteVersionsForWorkflow', () => {
    it('deletes all versions and returns count', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 3 });
      const count = await storage.deleteVersionsForWorkflow('wf-1');
      expect(count).toBe(3);
      expect(mockQuery.mock.calls[0][0]).toContain('DELETE FROM workflow.versions');
    });
  });
});
