import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GenericWebhookIntegration } from './adapter.js';
import type { IntegrationConfig, UnifiedMessage } from '@friday/shared';
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
    id: 'wh_int_1',
    platform: 'webhook',
    displayName: 'Test Webhook',
    enabled: true,
    status: 'disconnected',
    config: { webhookUrl: 'https://example.com/hook', secret: 'test-secret-123' },
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

describe('GenericWebhookIntegration', () => {
  let adapter: GenericWebhookIntegration;

  beforeEach(() => {
    adapter = new GenericWebhookIntegration();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should have webhook platform', () => {
    expect(adapter.platform).toBe('webhook');
  });

  it('should have rate limit config', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 30 });
  });

  it('should not be healthy before init', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  describe('init()', () => {
    it('should initialize successfully with full config', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should initialize with empty config (no URL, no secret)', async () => {
      await expect(adapter.init(makeConfig({ config: {} }), makeDeps())).resolves.not.toThrow();
    });
  });

  describe('start() / stop()', () => {
    it('should start and become healthy', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should not start twice', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should stop and become unhealthy', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should be safe to call stop without start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.stop()).resolves.not.toThrow();
    });
  });

  describe('sendMessage()', () => {
    it('should POST to webhook URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('chat1', 'Hello world');

      expect(id).toMatch(/^wh_/);
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.com/hook');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(opts.headers['X-Webhook-Signature']).toBeDefined();

      const body = JSON.parse(opts.body);
      expect(body.chatId).toBe('chat1');
      expect(body.text).toBe('Hello world');
    });

    it('should throw when no webhook URL configured', async () => {
      await adapter.init(makeConfig({ config: {} }), makeDeps());
      await expect(adapter.sendMessage('chat1', 'test')).rejects.toThrow('No webhook URL');
    });

    it('should throw on non-OK response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('chat1', 'test')).rejects.toThrow('Webhook delivery failed');
    });

    it('should skip signature header when no secret', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(
        makeConfig({ config: { webhookUrl: 'https://example.com/hook' } }),
        makeDeps()
      );
      await adapter.sendMessage('chat1', 'Hello');

      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['X-Webhook-Signature']).toBeUndefined();
    });
  });

  describe('WebhookIntegration methods', () => {
    it('should return webhook path with integration id', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.getWebhookPath()).toBe('/api/v1/webhooks/custom/wh_int_1');
    });

    it('should verify valid signature', async () => {
      await adapter.init(makeConfig(), makeDeps());

      // Generate a valid signature using the same secret
      const { createHmac } = await import('node:crypto');
      const payload = '{"test":"data"}';
      const expected = `sha256=${createHmac('sha256', 'test-secret-123').update(payload).digest('hex')}`;

      expect(adapter.verifyWebhook(payload, expected)).toBe(true);
    });

    it('should reject invalid signature', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.verifyWebhook('payload', 'sha256=invalid')).toBe(false);
    });

    it('should accept any payload when no secret configured', async () => {
      await adapter.init(
        makeConfig({ config: { webhookUrl: 'https://example.com/hook' } }),
        makeDeps()
      );
      expect(adapter.verifyWebhook('anything', '')).toBe(true);
    });
  });

  describe('handleInbound()', () => {
    it('should normalize payload and call onMessage', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      await adapter.handleInbound({
        senderId: 'ext_user',
        senderName: 'External System',
        chatId: 'channel_1',
        text: 'Incoming webhook message',
        id: 'ext_msg_42',
        timestamp: 1700000000000,
        metadata: { source: 'ci' },
      });

      expect(onMessage).toHaveBeenCalledOnce();
      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.platform).toBe('webhook');
      expect(msg.direction).toBe('inbound');
      expect(msg.senderId).toBe('ext_user');
      expect(msg.senderName).toBe('External System');
      expect(msg.chatId).toBe('channel_1');
      expect(msg.text).toBe('Incoming webhook message');
      expect(msg.platformMessageId).toBe('ext_msg_42');
      expect(msg.timestamp).toBe(1700000000000);
      expect(msg.metadata).toEqual({ source: 'ci' });
      expect(msg.integrationId).toBe('wh_int_1');
    });

    it('should use defaults for missing fields', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      await adapter.handleInbound({ text: 'minimal payload' });

      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.senderId).toBe('external');
      expect(msg.senderName).toBe('Webhook');
      expect(msg.chatId).toBe('default');
    });

    it('should throw if not initialized', async () => {
      await expect(adapter.handleInbound({ text: 'test' })).rejects.toThrow('not initialized');
    });
  });

  describe('isHealthy()', () => {
    it('should return false before start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should return true after start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should return false after stop', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });
  });
});
