import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarketplaceStorage } from './storage.js';

// ─── Mock pg-pool ─────────────────────────────────────────────

let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Mock built-in skills import ─────────────────────────────

vi.mock('./skills/index.js', () => ({
  summarizeTextSkill: { name: 'Summarize Text', author: 'system', version: '1.0.0' },
  veteranFinancialManagerSkill: { name: 'Veteran FM', author: 'system', version: '1.0.0' },
  seniorWebDesignerSkill: { name: 'Web Designer', author: 'system', version: '1.0.0' },
  seniorSoftwareEngineerSkill: { name: 'SW Engineer', author: 'system', version: '1.0.0' },
  seniorSoftwareEngineerAuditSkill: {
    name: 'SW Engineer Audit',
    author: 'system',
    version: '1.0.0',
  },
  devopsSreSkill: { name: 'DevOps SRE', author: 'system', version: '1.0.0' },
}));

// ─── Test Data ────────────────────────────────────────────────

const skillRow = {
  id: 'skill-1',
  name: 'My Skill',
  description: 'Does things',
  version: '1.2.0',
  author: 'alice',
  author_info: null,
  category: 'productivity',
  tags: ['useful', 'fast'],
  download_count: 42,
  rating: 4.5,
  instructions: 'Use me wisely',
  tools: ['search'],
  installed: false,
  source: 'published',
  published_at: 1000,
  updated_at: 2000,
};

// ─── Tests ────────────────────────────────────────────────────

describe('MarketplaceStorage', () => {
  let storage: MarketplaceStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new MarketplaceStorage();
  });

  describe('addSkill', () => {
    it('inserts and returns skill object with defaults', async () => {
      const result = await storage.addSkill({ name: 'My Skill' });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('My Skill');
      expect(result.description).toBe('');
      expect(result.version).toBe('1.0.0');
      expect(result.author).toBe('');
      expect(result.category).toBe('general');
      expect(result.tags).toEqual([]);
      expect(result.downloadCount).toBe(0);
      expect(result.rating).toBe(0);
      expect(result.installed).toBe(false);
      expect(result.source).toBe('published');
    });

    it('uses provided id if given', async () => {
      const result = await storage.addSkill({ id: 'custom-id', name: 'Named' });
      expect(result.id).toBe('custom-id');
    });

    it('passes correct params including serialized arrays', async () => {
      await storage.addSkill({ name: 'Test', tags: ['a', 'b'], tools: ['x'] as any });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('Test');
      expect(params[7]).toBe(JSON.stringify(['a', 'b'])); // tags
      expect(params[11]).toBe(JSON.stringify(['x'])); // tools
    });

    it('serializes authorInfo as JSON when provided', async () => {
      await storage.addSkill({
        name: 'Test',
        authorInfo: { name: 'Alice', email: 'alice@example.com' } as any,
      });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(typeof params[5]).toBe('string'); // author_info serialized
      const parsed = JSON.parse(params[5] as string);
      expect(parsed.name).toBe('Alice');
    });

    it('passes null for authorInfo when not provided', async () => {
      await storage.addSkill({ name: 'No Author Info' });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[5]).toBeNull(); // author_info
    });
  });

  describe('getSkill', () => {
    it('returns skill when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [skillRow], rowCount: 1 });
      const result = await storage.getSkill('skill-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('skill-1');
      expect(result!.name).toBe('My Skill');
      expect(result!.downloadCount).toBe(42);
      expect(result!.rating).toBe(4.5);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getSkill('nonexistent');
      expect(result).toBeNull();
    });

    it('parses authorInfo when it is a string', async () => {
      const rowWithAuthorInfo = {
        ...skillRow,
        author_info: '{"name":"Alice","email":"alice@example.com"}',
      };
      mockQuery.mockResolvedValueOnce({ rows: [rowWithAuthorInfo], rowCount: 1 });
      const result = await storage.getSkill('skill-1');
      expect(result!.authorInfo).toEqual({ name: 'Alice', email: 'alice@example.com' });
    });

    it('uses authorInfo as-is when it is an object', async () => {
      const rowWithAuthorInfo = {
        ...skillRow,
        author_info: { name: 'Bob', email: 'bob@example.com' },
      };
      mockQuery.mockResolvedValueOnce({ rows: [rowWithAuthorInfo], rowCount: 1 });
      const result = await storage.getSkill('skill-1');
      expect(result!.authorInfo).toEqual({ name: 'Bob', email: 'bob@example.com' });
    });
  });

  describe('findByNameAndSource', () => {
    it('returns skill when found by name and source', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [skillRow], rowCount: 1 });
      const result = await storage.findByNameAndSource('My Skill', 'published');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('My Skill');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.findByNameAndSource('Unknown', 'published');
      expect(result).toBeNull();
    });

    it('passes name and source as params', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.findByNameAndSource('My Skill', 'builtin');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('My Skill');
      expect(params[1]).toBe('builtin');
    });
  });

  describe('updateSkill', () => {
    it('returns true when updated', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.updateSkill('skill-1', { name: 'Updated' });
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.updateSkill('nonexistent', { name: 'New' });
      expect(result).toBe(false);
    });

    it('passes COALESCE-able null for unset fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await storage.updateSkill('skill-1', { name: 'New Name' });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('New Name');
      expect(params[1]).toBeNull(); // description not set
    });
  });

  describe('search', () => {
    it('returns skills and total without filters', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [skillRow], rowCount: 1 });

      const result = await storage.search();
      expect(result.total).toBe(3);
      expect(result.skills).toHaveLength(1);
    });

    it('filters by query string', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.search('my skill');
      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('name LIKE');
      expect(countSql).toContain('description LIKE');
    });

    it('filters by category', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.search(undefined, 'productivity');
      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('category =');
    });

    it('filters by source', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.search(undefined, undefined, 20, 0, 'builtin');
      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('source =');
    });

    it('uses custom limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.search(undefined, undefined, 5, 10);
      const selectParams = mockQuery.mock.calls[1][1] as unknown[];
      expect(selectParams).toContain(5);
      expect(selectParams).toContain(10);
    });
  });

  describe('setInstalled', () => {
    it('returns true when updated', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.setInstalled('skill-1', true);
      expect(result).toBe(true);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('installed = $1');
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.setInstalled('nonexistent', false);
      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.delete('skill-1');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.delete('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('seedBuiltinSkills', () => {
    it('inserts skills that do not already exist', async () => {
      // 6 skills total; alternate: odd ones exist, even ones don't
      // All return null (no existing) → all 6 get inserted
      // Each addSkill: one execute INSERT
      // Each check: one queryOne
      // That's 12 queries total
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 }); // all checks return null, all inserts succeed

      await storage.seedBuiltinSkills();

      // Should have called queryOne (SELECT 1) for each skill
      const selectCalls = mockQuery.mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('SELECT 1')
      );
      expect(selectCalls).toHaveLength(6);
    });

    it('skips skills that already exist', async () => {
      // All skills already exist
      mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 });

      await storage.seedBuiltinSkills();

      // No INSERT calls
      const insertCalls = mockQuery.mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO marketplace.skills')
      );
      expect(insertCalls).toHaveLength(0);
    });
  });
});
