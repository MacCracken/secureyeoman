import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LineIntegration } from './adapter.js';
import type { IntegrationConfig } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import { createHmac } from 'crypto';

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
    id: 'line-test-1',
    platform: 'line',
    displayName: 'Line Test',
    enabled: true,
    status: 'disconnected',
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    config: { channelSecret: 'secret123', channelAccessToken: 'token456', ...overrides },
  } as IntegrationConfig;
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: mockLogger as any, onMessage };
}

function makeWebhookEvent(type = 'message', extras: Record<string, unknown> = {}) {
  return {
    type,
    replyToken: 'reply-token-abc',
    source: { type: 'user', userId: 'U123' },
    timestamp: 1700000000000,
    message: { id: 'msg-1', type: 'text', text: 'Hello Line' },
    ...extras,
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe('LineIntegration', () => {
  let adapter: LineIntegration;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new LineIntegration();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(''),
      json: vi.fn().mockResolvedValue({ userId: 'bot-123', displayName: 'MyBot' }),
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has platform "line"', () => {
    expect(adapter.platform).toBe('line');
  });

  it('has rate limit of 30 per second', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 30 });
  });

  it('is not healthy before start', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  describe('init()', () => {
    it('initializes successfully with required fields', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('throws when channelSecret is missing', async () => {
      await expect(adapter.init(makeConfig({ channelSecret: '' }), makeDeps())).rejects.toThrow(
        'Line integration requires channelSecret'
      );
    });

    it('throws when channelAccessToken is missing', async () => {
      await expect(
        adapter.init(makeConfig({ channelAccessToken: '' }), makeDeps())
      ).rejects.toThrow('Line integration requires channelAccessToken');
    });
  });

  describe('start() / stop()', () => {
    it('becomes healthy after start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('is idempotent on double start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await expect(adapter.start()).resolves.not.toThrow();
    });

    it('becomes unhealthy after stop', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });
  });

  describe('sendMessage()', () => {
    it('sends a reply when replyToken is in metadata', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('U123', 'Hello', { replyToken: 'rt-abc' });
      expect(id).toMatch(/^line_reply_/);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/message/reply'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('sends a push message when no replyToken', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('U123', 'Hello');
      expect(id).toMatch(/^line_push_/);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/message/push'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('includes Authorization header', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.sendMessage('U123', 'Hi');
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['Authorization']).toBe('Bearer token456');
    });

    it('throws when reply request fails', async () => {
      mockFetch.mockResolvedValue({ ok: false, text: vi.fn().mockResolvedValue('Bad request') });
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('U123', 'Hi', { replyToken: 'rt' })).rejects.toThrow(
        'Line reply failed'
      );
    });

    it('throws when push request fails', async () => {
      mockFetch.mockResolvedValue({ ok: false, text: vi.fn().mockResolvedValue('Rate limit') });
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('U123', 'Hi')).rejects.toThrow('Line push failed');
    });
  });

  describe('getWebhookPath()', () => {
    it('returns /webhooks/line', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.getWebhookPath()).toBe('/webhooks/line');
    });
  });

  describe('verifyWebhook()', () => {
    it('returns true for valid base64 HMAC-SHA256 signature', async () => {
      const payload = JSON.stringify({ destination: 'bot', events: [] });
      const sig = createHmac('sha256', 'secret123').update(payload).digest('base64');
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.verifyWebhook(payload, sig)).toBe(true);
    });

    it('returns false for invalid signature', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.verifyWebhook('payload', 'bad-sig')).toBe(false);
    });
  });

  describe('handleWebhook()', () => {
    it('calls onMessage for a text message event', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      const payload = JSON.stringify({
        destination: 'bot-1',
        events: [makeWebhookEvent('message')],
      });
      await adapter.handleWebhook(payload, '');

      expect(onMessage).toHaveBeenCalledOnce();
      const msg = onMessage.mock.calls[0][0];
      expect(msg.platform).toBe('line');
      expect(msg.text).toBe('Hello Line');
      expect(msg.senderId).toBe('U123');
    });

    it('handles sticker message', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      const payload = JSON.stringify({
        destination: 'bot-1',
        events: [
          makeWebhookEvent('message', {
            message: { id: 'm1', type: 'sticker', packageId: 'p1', stickerId: 's1' },
          }),
        ],
      });
      await adapter.handleWebhook(payload, '');

      const msg = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('Sticker');
    });

    it('handles image message', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      const payload = JSON.stringify({
        destination: 'bot-1',
        events: [makeWebhookEvent('message', { message: { id: 'm1', type: 'image' } })],
      });
      await adapter.handleWebhook(payload, '');

      const msg = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('Image');
    });

    it('handles follow event', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      const payload = JSON.stringify({
        destination: 'bot-1',
        events: [makeWebhookEvent('follow', { message: undefined })],
      });
      await adapter.handleWebhook(payload, '');

      const msg = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('followed');
    });

    it('handles unfollow event', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      const payload = JSON.stringify({
        destination: 'bot-1',
        events: [makeWebhookEvent('unfollow', { message: undefined })],
      });
      await adapter.handleWebhook(payload, '');

      expect(onMessage).toHaveBeenCalled();
    });

    it('handles group chatId from groupId', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      const payload = JSON.stringify({
        destination: 'bot-1',
        events: [
          makeWebhookEvent('message', {
            source: { type: 'group', userId: 'U123', groupId: 'G456' },
          }),
        ],
      });
      await adapter.handleWebhook(payload, '');

      const msg = onMessage.mock.calls[0][0];
      expect(msg.chatId).toBe('G456');
    });

    it('does not throw on invalid JSON', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.handleWebhook('not-json', '')).resolves.not.toThrow();
    });

    it('does nothing when deps not set', async () => {
      await expect(adapter.handleWebhook('{}', '')).resolves.not.toThrow();
    });
  });

  describe('testConnection()', () => {
    it('returns ok=true with bot display name', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toContain('MyBot');
    });

    it('returns ok=false on API error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401 });
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
    });

    it('returns ok=false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
    });
  });
});
