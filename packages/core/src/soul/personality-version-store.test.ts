/**
 * PersonalityVersionStorage unit tests (Phase 114)
 *
 * Tests CRUD operations on soul.personality_versions via mocked pg pool.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../storage/pg-pool.js', () => ({ getPool: () => ({ query: mockQuery }) }));
vi.mock('../utils/id.js', () => ({ uuidv7: () => 'mock-uuid' }));

import { PersonalityVersionStorage } from './personality-version-storage.js';

const SAMPLE_ROW = {
  id: 'pv-1',
  personality_id: 'pers-1',
  version_tag: null,
  snapshot: { name: 'FRIDAY', systemPrompt: 'Hello' },
  snapshot_md: '# FRIDAY\nHello',
  diff_summary: null,
  changed_fields: [],
  author: 'system',
  created_at: '1700000000000',
};

describe('PersonalityVersionStorage', () => {
  let storage: PersonalityVersionStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new PersonalityVersionStorage();
  });

  describe('createVersion', () => {
    it('inserts a version and returns mapped result', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_ROW] });

      const result = await storage.createVersion({
        personalityId: 'pers-1',
        snapshot: { name: 'FRIDAY', systemPrompt: 'Hello' },
        snapshotMd: '# FRIDAY\nHello',
      });

      expect(result.personalityId).toBe('pers-1');
      expect(result.snapshotMd).toBe('# FRIDAY\nHello');
      expect(result.createdAt).toBe(1700000000000);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO soul.personality_versions');
    });

    it('passes author and versionTag when provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...SAMPLE_ROW, version_tag: '2026.3.3', author: 'admin' }],
      });

      const result = await storage.createVersion({
        personalityId: 'pers-1',
        versionTag: '2026.3.3',
        snapshot: { name: 'FRIDAY' },
        snapshotMd: '# FRIDAY',
        author: 'admin',
      });

      expect(result.versionTag).toBe('2026.3.3');
      expect(result.author).toBe('admin');
    });
  });

  describe('listVersions', () => {
    it('returns paginated versions with total', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [SAMPLE_ROW] });

      const { versions, total } = await storage.listVersions('pers-1', { limit: 10, offset: 0 });

      expect(total).toBe(3);
      expect(versions).toHaveLength(1);
      expect(versions[0].personalityId).toBe('pers-1');
    });

    it('uses default limit/offset when omitted', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const { versions, total } = await storage.listVersions('pers-1');

      expect(total).toBe(0);
      expect(versions).toHaveLength(0);
      // Check default limit=50, offset=0
      const selectCall = mockQuery.mock.calls[1];
      expect(selectCall[1]).toEqual(['pers-1', 50, 0]);
    });
  });

  describe('getVersion', () => {
    it('returns a version by ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_ROW] });
      const result = await storage.getVersion('pv-1');
      expect(result?.id).toBe('pv-1');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await storage.getVersion('missing');
      expect(result).toBeNull();
    });
  });

  describe('getVersionByTag', () => {
    it('returns version matching personality + tag', async () => {
      const tagged = { ...SAMPLE_ROW, version_tag: '2026.3.3' };
      mockQuery.mockResolvedValueOnce({ rows: [tagged] });
      const result = await storage.getVersionByTag('pers-1', '2026.3.3');
      expect(result?.versionTag).toBe('2026.3.3');
    });
  });

  describe('getLatestVersion', () => {
    it('returns most recent version', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_ROW] });
      const result = await storage.getLatestVersion('pers-1');
      expect(result?.id).toBe('pv-1');
    });

    it('returns null when no versions exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await storage.getLatestVersion('pers-1');
      expect(result).toBeNull();
    });
  });

  describe('getLatestTaggedVersion', () => {
    it('returns most recent tagged version', async () => {
      const tagged = { ...SAMPLE_ROW, version_tag: '2026.3.2' };
      mockQuery.mockResolvedValueOnce({ rows: [tagged] });
      const result = await storage.getLatestTaggedVersion('pers-1');
      expect(result?.versionTag).toBe('2026.3.2');
    });
  });

  describe('tagVersion', () => {
    it('updates version_tag and returns updated row', async () => {
      const updated = { ...SAMPLE_ROW, version_tag: '2026.3.3' };
      mockQuery.mockResolvedValueOnce({ rows: [updated] });
      const result = await storage.tagVersion('pv-1', '2026.3.3');
      expect(result?.versionTag).toBe('2026.3.3');
      expect(mockQuery.mock.calls[0][0]).toContain('UPDATE soul.personality_versions');
    });

    it('returns null when version not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await storage.tagVersion('missing', '2026.3.3');
      expect(result).toBeNull();
    });
  });

  describe('generateNextTag', () => {
    it('returns base date tag when no existing tags', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const tag = await storage.generateNextTag('pers-1');
      const now = new Date();
      const expected = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
      expect(tag).toBe(expected);
    });

    it('returns suffixed tag when base tag already exists', async () => {
      const now = new Date();
      const baseTag = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
      mockQuery.mockResolvedValueOnce({ rows: [{ version_tag: baseTag }] });
      const tag = await storage.generateNextTag('pers-1');
      expect(tag).toBe(`${baseTag}-1`);
    });

    it('increments suffix when multiple same-day tags exist', async () => {
      const now = new Date();
      const baseTag = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
      mockQuery.mockResolvedValueOnce({
        rows: [{ version_tag: baseTag }, { version_tag: `${baseTag}-1` }],
      });
      const tag = await storage.generateNextTag('pers-1');
      expect(tag).toBe(`${baseTag}-2`);
    });
  });

  describe('deleteVersionsForPersonality', () => {
    it('deletes all versions and returns count', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 5 });
      const count = await storage.deleteVersionsForPersonality('pers-1');
      expect(count).toBe(5);
      expect(mockQuery.mock.calls[0][0]).toContain('DELETE FROM soul.personality_versions');
    });
  });
});
