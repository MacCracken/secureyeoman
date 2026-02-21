import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AirtableIntegration } from './adapter.js';
import type { IntegrationConfig, UnifiedMessage } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ── Helpers ────────────────────────────────────────────────────────

function noopLogger(): SecureLogger {
  const noop = () => {};
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => noopLogger(),
    level: 'silent',
  } as SecureLogger;
}

function makeConfig(overrides: Partial<IntegrationConfig> = {}): IntegrationConfig {
  return {
    id: 'airtable_int_1',
    platform: 'airtable',
    displayName: 'Test Airtable',
    enabled: true,
    status: 'disconnected',
    config: {
      apiKey: 'pat_test_apikey',
      baseId: 'appTestBase123',
      pollIntervalMs: 999999, // effectively never fires during tests
    },
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: noopLogger(), onMessage };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('AirtableIntegration', () => {
  let adapter: AirtableIntegration;

  beforeEach(() => {
    adapter = new AirtableIntegration();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should have platform "airtable"', () => {
    expect(adapter.platform).toBe('airtable');
  });

  it('should have rate limit of 5 per second', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 5 });
  });

  it('should not be healthy before init', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  // ── init() ────────────────────────────────────────────────────────

  describe('init()', () => {
    it('should initialize successfully with valid config', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should throw when apiKey is missing', async () => {
      const cfg = makeConfig({ config: { baseId: 'appTestBase123' } });
      await expect(adapter.init(cfg, makeDeps())).rejects.toThrow(
        'Airtable integration requires an apiKey'
      );
    });

    it('should initialize without baseId (polling will be skipped)', async () => {
      const cfg = makeConfig({ config: { apiKey: 'pat_test' } });
      await expect(adapter.init(cfg, makeDeps())).resolves.not.toThrow();
    });
  });

  // ── start() / stop() ──────────────────────────────────────────────

  describe('start() / stop()', () => {
    it('should become healthy after start', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ records: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should be idempotent — calling start twice is safe', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ records: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await expect(adapter.start()).resolves.not.toThrow();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should throw if start is called before init', async () => {
      await expect(adapter.start()).rejects.toThrow('not initialized');
    });

    it('should become unhealthy after stop', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ records: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should be safe to call stop without start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.stop()).resolves.not.toThrow();
    });

    it('should not poll when no baseId is configured', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const cfg = makeConfig({ config: { apiKey: 'pat_test' } });
      await adapter.init(cfg, makeDeps());
      await adapter.start();

      expect(adapter.isHealthy()).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should seed seen record IDs on start to avoid re-dispatching existing records', async () => {
      const existingRecord = {
        id: 'recExisting1',
        fields: { Name: 'Old task' },
        createdTime: '2024-01-01T00:00:00.000Z',
      };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ records: [existingRecord] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));
      await adapter.start();

      expect(onMessage).not.toHaveBeenCalled();
    });
  });

  // ── sendMessage() ─────────────────────────────────────────────────

  describe('sendMessage()', () => {
    it('should POST a new record and return its ID', async () => {
      const createdRecord = { id: 'recNewRecord1', fields: { Name: 'Buy milk' } };

      const mockFetch = vi.fn()
        // First call: seedSeenRecords during start()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ records: [] }) })
        // Second call: create record
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createdRecord),
        });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      const id = await adapter.sendMessage('appTestBase123/Tasks', 'Buy milk');

      expect(id).toBe('recNewRecord1');
      const [url, opts] = mockFetch.mock.calls[1];
      expect(url).toContain('https://api.airtable.com/v0/appTestBase123/Tasks');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Authorization']).toBe('Bearer pat_test_apikey');
      const body = JSON.parse(opts.body);
      expect(body.fields.Name).toBe('Buy milk');
    });

    it('should fall back to configured baseId + "Tasks" when chatId is empty', async () => {
      const createdRecord = { id: 'recFallback1', fields: { Name: 'Fallback' } };

      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ records: [] }) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createdRecord),
        });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      const id = await adapter.sendMessage('', 'Fallback');

      expect(id).toBe('recFallback1');
      const [url] = mockFetch.mock.calls[1];
      expect(url).toContain('appTestBase123/Tasks');
    });

    it('should throw when no base is configured and chatId is empty', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ records: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const cfg = makeConfig({ config: { apiKey: 'pat_test' } }); // no baseId
      await adapter.init(cfg, makeDeps());
      await adapter.start();

      await expect(adapter.sendMessage('', 'No base')).rejects.toThrow(
        'No base/table configured for Airtable sendMessage'
      );
    });

    it('should throw when record creation fails', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ records: [] }) })
        .mockResolvedValueOnce({
          ok: false,
          text: () => Promise.resolve('Unprocessable Entity'),
        });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();

      await expect(adapter.sendMessage('appTestBase123/Tasks', 'Fail')).rejects.toThrow(
        'Airtable create record failed'
      );
    });
  });

  // ── poll() via timer ──────────────────────────────────────────────

  describe('poll() (internal, triggered via setInterval)', () => {
    it('should dispatch new records as UnifiedMessages and not re-dispatch seen ones', async () => {
      const newRecord = {
        id: 'recNew1',
        fields: { Name: 'New task' },
        createdTime: '2024-06-01T00:00:00.000Z',
      };

      const mockFetch = vi.fn()
        // seedSeenRecords: returns empty
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ records: [] }) })
        // poll: returns one new record
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ records: [newRecord] }),
        })
        // second poll: same record (should not re-dispatch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ records: [newRecord] }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const onMessage = vi.fn().mockResolvedValue(undefined);
      const cfg = makeConfig({ config: { apiKey: 'pat_test_apikey', baseId: 'appTestBase123', pollIntervalMs: 1000 } });
      await adapter.init(cfg, makeDeps(onMessage));
      await adapter.start();

      // Trigger first poll
      await vi.advanceTimersByTimeAsync(1000);
      expect(onMessage).toHaveBeenCalledTimes(1);

      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.platform).toBe('airtable');
      expect(msg.direction).toBe('inbound');
      expect(msg.platformMessageId).toBe('recNew1');
      expect(msg.text).toBe('New record: New task');
      expect(msg.integrationId).toBe('airtable_int_1');
      expect(msg.chatId).toBe('appTestBase123');

      // Trigger second poll — same record should not re-dispatch
      await vi.advanceTimersByTimeAsync(1000);
      expect(onMessage).toHaveBeenCalledTimes(1);

      await adapter.stop();
    });

    it('should warn on failed poll and not throw', async () => {
      const warnFn = vi.fn();
      const logger = { ...noopLogger(), warn: warnFn };

      const mockFetch = vi.fn()
        // seedSeenRecords
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ records: [] }) })
        // poll failure
        .mockResolvedValueOnce({ ok: false, status: 429 });
      vi.stubGlobal('fetch', mockFetch);

      const cfg = makeConfig({ config: { apiKey: 'pat_test_apikey', baseId: 'appTestBase123', pollIntervalMs: 1000 } });
      await adapter.init(cfg, { logger, onMessage: vi.fn().mockResolvedValue(undefined) });
      await adapter.start();

      await vi.advanceTimersByTimeAsync(1000);
      expect(warnFn).toHaveBeenCalledWith('Airtable poll failed', expect.objectContaining({ status: 429 }));

      await adapter.stop();
    });

    it('should use record.id as the Name text fallback when Name field is absent', async () => {
      const newRecord = {
        id: 'recNoName1',
        fields: {},
        createdTime: '2024-06-01T00:00:00.000Z',
      };

      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ records: [] }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ records: [newRecord] }) });
      vi.stubGlobal('fetch', mockFetch);

      const onMessage = vi.fn().mockResolvedValue(undefined);
      const cfg = makeConfig({ config: { apiKey: 'pat_test_apikey', baseId: 'appTestBase123', pollIntervalMs: 1000 } });
      await adapter.init(cfg, makeDeps(onMessage));
      await adapter.start();

      await vi.advanceTimersByTimeAsync(1000);
      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.text).toBe('New record: recNoName1');

      await adapter.stop();
    });
  });

  // ── isHealthy() ───────────────────────────────────────────────────

  describe('isHealthy()', () => {
    it('should return false before start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should return true after start', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ records: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should return false after stop', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ records: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });
  });

  // ── testConnection() ─────────────────────────────────────────────

  describe('testConnection()', () => {
    it('should return ok=true with the user email', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'usr_1', email: 'alice@example.com' }),
        statusText: 'OK',
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(true);
      expect(result.message).toContain('alice@example.com');
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.airtable.com/v0/meta/whoami');
      expect(opts.headers['Authorization']).toBe('Bearer pat_test_apikey');
    });

    it('should fall back to user id when email is absent', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'usr_42' }),
        statusText: 'OK',
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(true);
      expect(result.message).toContain('usr_42');
    });

    it('should return ok=false when the API returns a non-OK response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('Unauthorized');
    });

    it('should return ok=false when fetch throws a network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('Network error');
    });
  });
});
