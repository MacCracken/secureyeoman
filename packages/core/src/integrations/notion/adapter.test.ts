import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotionIntegration } from './adapter.js';
import type { IntegrationConfig } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

function makeConfig(overrides: Record<string, unknown> = {}): IntegrationConfig {
  return {
    id: 'notion-test-1',
    platform: 'notion',
    displayName: 'Notion Test',
    enabled: true,
    status: 'disconnected',
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    config: { apiKey: 'secret_abc123', databaseId: 'db-xyz', ...overrides },
  } as IntegrationConfig;
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: mockLogger as any, onMessage };
}

function makePageResponse(id = 'page-1') {
  return {
    ok: true,
    status: 200,
    text: vi.fn().mockResolvedValue(''),
    json: vi.fn().mockResolvedValue({
      id,
      object: 'page',
      created_time: '2024-01-01T00:00:00Z',
      last_edited_time: '2024-01-01T00:00:00Z',
    }),
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe('NotionIntegration', () => {
  let adapter: NotionIntegration;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    adapter = new NotionIntegration();
    mockFetch = vi.fn().mockResolvedValue(makePageResponse());
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('has platform "notion"', () => {
    expect(adapter.platform).toBe('notion');
  });

  it('has rate limit of 3 per second', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 3 });
  });

  it('is not healthy before start', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  describe('init()', () => {
    it('initializes successfully with apiKey', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('throws when apiKey is missing', async () => {
      await expect(adapter.init(makeConfig({ apiKey: '' }), makeDeps())).rejects.toThrow(
        'Notion integration requires an apiKey'
      );
    });

    it('throws when apiKey is undefined', async () => {
      await expect(
        adapter.init({ ...makeConfig(), config: {} } as any, makeDeps())
      ).rejects.toThrow('apiKey');
    });
  });

  describe('start()', () => {
    it('becomes healthy after start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('throws when called before init', async () => {
      await expect(adapter.start()).rejects.toThrow('not initialized');
    });

    it('is idempotent — second start is no-op', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await expect(adapter.start()).resolves.not.toThrow();
    });

    it('starts polling at the configured interval', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: [], has_more: false }),
      });
      await adapter.init(makeConfig({ pollIntervalMs: 1000 }), makeDeps());
      await adapter.start();
      vi.advanceTimersByTime(1001);
      await Promise.resolve();
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('stop()', () => {
    it('becomes unhealthy after stop', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });

    it('clears the poll timer', async () => {
      await adapter.init(makeConfig({ pollIntervalMs: 1000 }), makeDeps());
      await adapter.start();
      await adapter.stop();
      mockFetch.mockClear();
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage()', () => {
    it('creates a page in the configured database', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('', 'My note');
      expect(id).toBe('page-1');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/pages'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('uses chatId as the database when provided', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('custom-db-id', 'Content');
      expect(id).toBe('page-1');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.parent.database_id).toBe('custom-db-id');
    });

    it('throws when no database is configured and chatId is empty', async () => {
      await adapter.init(makeConfig({ databaseId: undefined }), makeDeps());
      await expect(adapter.sendMessage('', 'Content')).rejects.toThrow('No database ID configured');
    });

    it('throws when Notion API returns error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: vi.fn().mockResolvedValue('Unauthorized'),
      });
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('', 'Content')).rejects.toThrow(
        'Failed to create Notion page'
      );
    });

    it('includes Notion-Version header', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.sendMessage('', 'Hi');
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['Notion-Version']).toBeDefined();
    });

    it('includes Authorization header with apiKey', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.sendMessage('', 'Hi');
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['Authorization']).toContain('secret_abc123');
    });
  });
});
