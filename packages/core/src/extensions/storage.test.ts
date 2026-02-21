import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtensionStorage } from './storage.js';

// ─── Mock pool ──────────────────────────────────────────────────────
let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Row fixtures ───────────────────────────────────────────────────

const extRow = {
  id: 'ext-1',
  name: 'Test Extension',
  version: '1.0.0',
  hooks: JSON.stringify([{ point: 'message.received', semantics: 'observe', priority: 100 }]),
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const hookRow = {
  id: 'hook-1',
  extension_id: 'ext-1',
  hook_point: 'message.received',
  semantics: 'observe',
  priority: 100,
  created_at: '2024-01-01T00:00:00Z',
};

const webhookRow = {
  id: 'wh-1',
  url: 'https://example.com/hook',
  hook_points: JSON.stringify(['message.received']),
  secret: null,
  enabled: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('ExtensionStorage', () => {
  let storage: ExtensionStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new ExtensionStorage();
  });

  describe('listExtensions', () => {
    it('returns empty array when none registered', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.listExtensions();
      expect(result).toHaveLength(0);
    });

    it('returns extensions with parsed hooks', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [extRow], rowCount: 1 });
      const result = await storage.listExtensions();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ext-1');
      expect(result[0].hooks).toHaveLength(1);
    });

    it('handles malformed hooks JSON gracefully', async () => {
      const badRow = { ...extRow, hooks: 'not-json' };
      mockQuery.mockResolvedValueOnce({ rows: [badRow], rowCount: 1 });
      const result = await storage.listExtensions();
      expect(result[0].hooks).toEqual([]);
    });
  });

  describe('getExtension', () => {
    it('returns extension when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [extRow], rowCount: 1 });
      const result = await storage.getExtension('ext-1');
      expect(result!.id).toBe('ext-1');
      expect(result!.name).toBe('Test Extension');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getExtension('no-such');
      expect(result).toBeNull();
    });
  });

  describe('registerExtension', () => {
    it('upserts extension and returns it', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [extRow], rowCount: 1 });
      const result = await storage.registerExtension({
        id: 'ext-1',
        name: 'Test Extension',
        version: '1.0.0',
        hooks: [],
      });
      expect(result.id).toBe('ext-1');
    });

    it('generates id when not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [extRow], rowCount: 1 });
      await storage.registerExtension({
        id: '',
        name: 'New Ext',
        version: '1.0.0',
        hooks: [],
      });
      expect(mockQuery).toHaveBeenCalledOnce();
    });
  });

  describe('removeExtension', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.removeExtension('ext-1');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.removeExtension('no-such');
      expect(result).toBe(false);
    });
  });

  describe('listHooks', () => {
    it('returns all hooks without filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [hookRow], rowCount: 1 });
      const result = await storage.listHooks();
      expect(result).toHaveLength(1);
      expect(result[0].hookPoint).toBe('message.received');
    });

    it('filters by extensionId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [hookRow], rowCount: 1 });
      await storage.listHooks({ extensionId: 'ext-1' });
      expect(mockQuery).toHaveBeenCalledOnce();
    });

    it('filters by hookPoint', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listHooks({ hookPoint: 'task.created' });
      expect(mockQuery).toHaveBeenCalledOnce();
    });

    it('filters by both extensionId and hookPoint', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [hookRow], rowCount: 1 });
      await storage.listHooks({ extensionId: 'ext-1', hookPoint: 'message.received' });
      expect(mockQuery).toHaveBeenCalledOnce();
    });
  });

  describe('registerHook', () => {
    it('inserts hook and returns record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [hookRow], rowCount: 1 });
      const result = await storage.registerHook({
        extensionId: 'ext-1',
        hookPoint: 'message.received',
        semantics: 'observe',
        priority: 100,
      });
      expect(result.id).toBe('hook-1');
      expect(result.extensionId).toBe('ext-1');
    });
  });

  describe('removeHook', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.removeHook('hook-1');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.removeHook('no-such');
      expect(result).toBe(false);
    });
  });

  describe('listWebhooks', () => {
    it('returns empty array when none registered', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.listWebhooks();
      expect(result).toHaveLength(0);
    });

    it('returns webhooks with parsed hookPoints', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [webhookRow], rowCount: 1 });
      const result = await storage.listWebhooks();
      expect(result[0].id).toBe('wh-1');
      expect(result[0].hookPoints).toContain('message.received');
      expect(result[0].enabled).toBe(true);
    });

    it('handles malformed hookPoints JSON', async () => {
      const bad = { ...webhookRow, hook_points: 'bad-json' };
      mockQuery.mockResolvedValueOnce({ rows: [bad], rowCount: 1 });
      const result = await storage.listWebhooks();
      expect(result[0].hookPoints).toEqual([]);
    });
  });

  describe('registerWebhook', () => {
    it('inserts webhook and returns it', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [webhookRow], rowCount: 1 });
      const result = await storage.registerWebhook({
        url: 'https://example.com/hook',
        hookPoints: ['message.received' as any],
        enabled: true,
      });
      expect(result.id).toBe('wh-1');
      expect(result.url).toBe('https://example.com/hook');
    });

    it('stores secret when provided', async () => {
      const rowWithSecret = { ...webhookRow, secret: 'my-secret' };
      mockQuery.mockResolvedValueOnce({ rows: [rowWithSecret], rowCount: 1 });
      const result = await storage.registerWebhook({
        url: 'https://example.com/hook',
        hookPoints: [],
        enabled: true,
        secret: 'my-secret',
      });
      expect(result.secret).toBe('my-secret');
    });
  });

  describe('removeWebhook', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.removeWebhook('wh-1');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.removeWebhook('no-such');
      expect(result).toBe(false);
    });
  });

  describe('updateWebhook', () => {
    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // SELECT
      const result = await storage.updateWebhook('no-such', { enabled: false });
      expect(result).toBeNull();
    });

    it('returns existing webhook when no updates', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [webhookRow], rowCount: 1 }); // SELECT
      const result = await storage.updateWebhook('wh-1', {});
      expect(result!.id).toBe('wh-1');
      expect(mockQuery).toHaveBeenCalledOnce();
    });

    it('updates url', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [webhookRow], rowCount: 1 }) // SELECT
        .mockResolvedValueOnce({ rows: [{ ...webhookRow, url: 'https://new.com' }], rowCount: 1 }); // UPDATE
      const result = await storage.updateWebhook('wh-1', { url: 'https://new.com' });
      expect(result!.url).toBe('https://new.com');
    });

    it('updates all fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [webhookRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [webhookRow], rowCount: 1 });
      await storage.updateWebhook('wh-1', {
        url: 'https://new.com',
        hookPoints: ['task.created' as any],
        secret: 'new-secret',
        enabled: false,
      });
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });
});
