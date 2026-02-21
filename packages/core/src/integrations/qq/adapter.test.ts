import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QQIntegration } from './adapter.js';
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

function makeConfig(overrides: Partial<Record<string, unknown>> = {}): IntegrationConfig {
  return {
    id: 'qq-test-1',
    platform: 'qq',
    displayName: 'QQ Test',
    enabled: true,
    status: 'disconnected',
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    config: { httpUrl: 'http://localhost:5700', ...overrides },
  } as IntegrationConfig;
}

function makeDeps(): IntegrationDeps {
  return { logger: mockLogger as any, onMessage: vi.fn().mockResolvedValue(undefined) };
}

function makeOkResponse(data: unknown = {}, status: 'ok' | 'failed' = 'ok') {
  return { ok: true, status: 200, json: vi.fn().mockResolvedValue({ status, retcode: 0, data }) };
}

// ─── Tests ────────────────────────────────────────────────────

describe('QQIntegration', () => {
  let adapter: QQIntegration;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    adapter = new QQIntegration();
    mockFetch = vi.fn().mockResolvedValue(makeOkResponse());
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('has platform "qq"', () => {
    expect(adapter.platform).toBe('qq');
  });

  it('has rate limit of 30 per second', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 30 });
  });

  it('is not healthy before start', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  describe('init()', () => {
    it('initializes successfully with httpUrl', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('throws when httpUrl is missing', async () => {
      await expect(adapter.init(makeConfig({ httpUrl: '' }), makeDeps())).rejects.toThrow(
        'QQ integration requires httpUrl'
      );
    });

    it('throws when httpUrl is undefined', async () => {
      const cfg = { ...makeConfig(), config: {} };
      await expect(adapter.init(cfg, makeDeps())).rejects.toThrow(
        'QQ integration requires httpUrl'
      );
    });
  });

  describe('start()', () => {
    it('sets running to true', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('throws when called before init', async () => {
      await expect(adapter.start()).rejects.toThrow('not initialized');
    });

    it('is idempotent — second start is a no-op', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await expect(adapter.start()).resolves.not.toThrow();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('starts a poll interval', async () => {
      await adapter.init(makeConfig({ pollIntervalMs: 1000 }), makeDeps());
      await adapter.start();
      vi.advanceTimersByTime(1001);
      await Promise.resolve();
      // poll calls /get_friend_list
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/get_friend_list'),
        expect.any(Object)
      );
    });
  });

  describe('stop()', () => {
    it('sets running to false', async () => {
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
      // No more polls after stop
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage()', () => {
    it('sends a private message and returns message_id', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ status: 'ok', retcode: 0, data: { message_id: 99 } }),
      });
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('123456', 'Hello');
      expect(id).toBe('99');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/send_private_msg'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('sends a group message when chatId starts with group_', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ status: 'ok', retcode: 0, data: { message_id: 88 } }),
      });
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('group_777', 'Hi group');
      expect(id).toBe('88');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/send_group_msg'),
        expect.any(Object)
      );
    });

    it('sends a group message when metadata.group is true', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ status: 'ok', retcode: 0, data: { message_id: 77 } }),
      });
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('999', 'Hi group', { group: true });
      expect(id).toBe('77');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/send_group_msg'),
        expect.any(Object)
      );
    });

    it('throws when fetch response is not ok', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503 });
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('123', 'Hi')).rejects.toThrow('QQ send failed: 503');
    });

    it('includes Authorization header when accessToken is set', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ status: 'ok', retcode: 0, data: { message_id: 1 } }),
      });
      await adapter.init(makeConfig({ accessToken: 'mytoken' }), makeDeps());
      await adapter.sendMessage('123', 'Hi');
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['Authorization']).toBe('Bearer mytoken');
    });
  });

  describe('handleInboundEvent()', () => {
    it('calls onMessage with a normalized UnifiedMessage for private message', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), { logger: mockLogger as any, onMessage });

      adapter.handleInboundEvent({
        message_id: 42,
        user_id: 111,
        message: 'hello',
        raw_message: 'hello',
        sender: { user_id: 111, nickname: 'Alice', card: 'Al' },
        time: 1700000000,
        message_type: 'private',
      });

      expect(onMessage).toHaveBeenCalledOnce();
      const msg = onMessage.mock.calls[0][0];
      expect(msg.platform).toBe('qq');
      expect(msg.senderId).toBe('111');
      expect(msg.senderName).toBe('Al');
      expect(msg.text).toBe('hello');
      expect(msg.chatId).toBe('111');
    });

    it('uses group_ prefix for group messages', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), { logger: mockLogger as any, onMessage });

      adapter.handleInboundEvent({
        message_id: 5,
        user_id: 222,
        group_id: 333,
        message: 'hi',
        raw_message: 'hi',
        sender: { user_id: 222, nickname: 'Bob' },
        time: 1700000001,
        message_type: 'group',
      });

      const msg = onMessage.mock.calls[0][0];
      expect(msg.chatId).toBe('group_333');
    });

    it('does nothing when deps are not set (before init)', () => {
      expect(() =>
        adapter.handleInboundEvent({
          message_id: 1,
          user_id: 1,
          message: 'hi',
          raw_message: 'hi',
          sender: { user_id: 1, nickname: 'X' },
          time: 0,
          message_type: 'private',
        })
      ).not.toThrow();
    });
  });

  describe('testConnection()', () => {
    it('returns ok=true when CQ-HTTP responds successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          status: 'ok',
          retcode: 0,
          data: { user_id: 123456, nickname: 'TestBot' },
        }),
      });
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toContain('TestBot');
    });

    it('returns ok=false when response is not ok', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
    });

    it('returns ok=false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toContain('ECONNREFUSED');
    });
  });
});
