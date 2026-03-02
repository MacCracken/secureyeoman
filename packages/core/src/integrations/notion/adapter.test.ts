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

  // ── Error Path & Lifecycle Tests ──────────────────────────────────

  describe('init() — error paths', () => {
    it('throws when apiKey is null', async () => {
      await expect(
        adapter.init(makeConfig({ apiKey: null as unknown as string }), makeDeps())
      ).rejects.toThrow('apiKey');
    });
  });

  describe('start() / stop() — lifecycle edge cases', () => {
    it('should be idempotent — calling stop twice does not throw', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      await expect(adapter.stop()).resolves.not.toThrow();
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should support restart cycle (start → stop → start)', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('stop clears poll timer so no further polls occur', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: [], has_more: false }),
      });
      await adapter.init(makeConfig({ pollIntervalMs: 500 }), makeDeps());
      await adapter.start();
      await adapter.stop();
      mockFetch.mockClear();

      // Advance well past poll interval
      vi.advanceTimersByTime(5000);
      await Promise.resolve();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage() — error paths', () => {
    it('propagates network errors when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('DNS resolution failed'));
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('', 'Hello')).rejects.toThrow('DNS resolution failed');
    });

    it('includes the Notion API error text in the thrown error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: vi.fn().mockResolvedValue('Rate limited: too many requests'),
      });
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('', 'Hello')).rejects.toThrow(
        'Rate limited: too many requests'
      );
    });

    it('truncates title to 100 chars when text is very long', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const longText = 'A'.repeat(200);
      await adapter.sendMessage('', longText);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const titleContent = body.properties.title.title[0].text.content;
      expect(titleContent).toHaveLength(100);
      // Full text goes into paragraph block
      const paragraphContent = body.children[0].paragraph.rich_text[0].text.content;
      expect(paragraphContent).toBe(longText);
    });
  });

  describe('testConnection()', () => {
    it('returns ok=true with user name on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'user-1', name: 'Test Bot', type: 'bot' }),
      });
      await adapter.init(makeConfig(), makeDeps());

      const result = await adapter.testConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toContain('Test Bot');
    });

    it('returns ok=true with user id when name is absent', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'user-42', type: 'bot' }),
      });
      await adapter.init(makeConfig(), makeDeps());

      const result = await adapter.testConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toContain('user-42');
    });

    it('returns ok=false when API returns non-OK response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: vi.fn().mockResolvedValue('Invalid token'),
      });
      await adapter.init(makeConfig(), makeDeps());

      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Notion API error');
    });

    it('returns ok=false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));
      await adapter.init(makeConfig(), makeDeps());

      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Connection refused');
    });

    it('calls the /users/me endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'u1', name: 'Me', type: 'bot' }),
      });
      await adapter.init(makeConfig(), makeDeps());

      await adapter.testConnection();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/me'),
        expect.any(Object)
      );
    });
  });

  describe('polling — error handling', () => {
    it('should not call onMessage when poll returns non-OK response', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      await adapter.init(makeConfig({ pollIntervalMs: 1000 }), makeDeps(onMessage));
      await adapter.start();

      vi.advanceTimersByTime(1001);
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());

      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should not crash when poll fetch throws a network error', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      const warnLogger = {
        ...mockLogger,
        warn: vi.fn(),
      };
      mockFetch.mockRejectedValue(new Error('Network timeout'));
      await adapter.init(makeConfig({ pollIntervalMs: 1000 }), {
        logger: warnLogger as any,
        onMessage,
      });
      await adapter.start();

      vi.advanceTimersByTime(1001);
      await vi.waitFor(() => expect(warnLogger.warn).toHaveBeenCalled());

      expect(onMessage).not.toHaveBeenCalled();
      expect(warnLogger.warn).toHaveBeenCalledWith(
        'Notion poll error',
        expect.objectContaining({ error: 'Network timeout' })
      );
    });

    it('should use workspace as chatId when no databaseId is configured', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [
            {
              id: 'page-1',
              created_time: '2024-01-01T00:00:00Z',
              last_edited_time: '2024-01-02T00:00:00Z',
              properties: {
                Title: { type: 'title', title: [{ plain_text: 'Test Page' }] },
              },
            },
          ],
          has_more: false,
        }),
      });

      await adapter.init(makeConfig({ databaseId: undefined }), makeDeps(onMessage));
      await adapter.start();

      vi.advanceTimersByTime(60_001); // default interval
      await vi.waitFor(() => expect(onMessage).toHaveBeenCalled());

      const msg = onMessage.mock.calls[0][0];
      expect(msg.chatId).toBe('workspace');
    });
  });
});
