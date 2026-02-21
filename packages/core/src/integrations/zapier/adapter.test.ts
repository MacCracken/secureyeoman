import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ZapierIntegration } from './adapter.js';
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
    id: 'zapier_int_1',
    platform: 'zapier',
    displayName: 'Test Zapier',
    enabled: true,
    status: 'disconnected',
    config: {
      webhookSecret: 'my-zap-secret',
      outboundUrl: 'https://hooks.zapier.com/hooks/catch/abc/xyz/',
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

describe('ZapierIntegration', () => {
  let adapter: ZapierIntegration;

  beforeEach(() => {
    adapter = new ZapierIntegration();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should have platform "zapier"', () => {
    expect(adapter.platform).toBe('zapier');
  });

  it('should have rate limit of 10 per second', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 10 });
  });

  it('should not be healthy before init', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  describe('init()', () => {
    it('should initialize successfully', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should initialize without a webhookSecret or outboundUrl', async () => {
      await expect(adapter.init(makeConfig({ config: {} }), makeDeps())).resolves.not.toThrow();
    });
  });

  describe('start() / stop()', () => {
    it('should become healthy after start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should be idempotent — calling start twice does not throw', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await expect(adapter.start()).resolves.not.toThrow();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should become unhealthy after stop', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });
  });

  describe('sendMessage()', () => {
    it('should POST to the configured outbound URL and return an ID', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('_', 'Hello Zapier');

      expect(id).toMatch(/^zapier_out_\d+$/);
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://hooks.zapier.com/hooks/catch/abc/xyz/');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body.message).toBe('Hello Zapier');
    });

    it('should use outboundUrl from metadata when provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig({ config: {} }), makeDeps());
      const id = await adapter.sendMessage('_', 'Hi', {
        outboundUrl: 'https://hooks.zapier.com/hooks/catch/override/',
      });

      expect(id).toMatch(/^zapier_out_/);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://hooks.zapier.com/hooks/catch/override/');
    });

    it('should throw when no outbound URL is configured', async () => {
      await adapter.init(makeConfig({ config: {} }), makeDeps());
      await expect(adapter.sendMessage('_', 'Hello')).rejects.toThrow(
        'No Zapier outbound webhook URL configured'
      );
    });

    it('should throw when the fetch response is not ok', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 400 });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('_', 'Hello')).rejects.toThrow(
        'Zapier webhook dispatch failed: 400'
      );
    });
  });

  describe('getWebhookPath()', () => {
    it('should return the expected webhook path', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.getWebhookPath()).toBe('/webhooks/zapier');
    });
  });

  describe('verifyWebhook()', () => {
    it('should return true when no secret is configured', async () => {
      await adapter.init(makeConfig({ config: {} }), makeDeps());
      expect(adapter.verifyWebhook('any-payload', 'any-sig')).toBe(true);
    });

    it('should return true for a valid HMAC-SHA256 signature', async () => {
      const { createHmac } = await import('crypto');
      const secret = 'my-zap-secret';
      const payload = '{"message":"hello"}';
      const sig = createHmac('sha256', secret).update(payload).digest('hex');

      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.verifyWebhook(payload, sig)).toBe(true);
    });

    it('should return false for an invalid signature', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.verifyWebhook('{"message":"hello"}', 'bad-signature')).toBe(false);
    });

    it('should strip sha256= prefix before comparing', async () => {
      const { createHmac } = await import('crypto');
      const secret = 'my-zap-secret';
      const payload = '{"message":"hi"}';
      const rawHex = createHmac('sha256', secret).update(payload).digest('hex');
      const withPrefix = `sha256=${rawHex}`;

      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.verifyWebhook(payload, withPrefix)).toBe(true);
    });
  });

  describe('handleWebhook()', () => {
    it('should parse a JSON payload and call onMessage', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));
      await adapter.start();

      const payload = JSON.stringify({ message: 'Hello from Zap', sender: 'zapier_user', chatId: 'chan_1' });
      await adapter.handleWebhook(payload, '');

      expect(onMessage).toHaveBeenCalledOnce();
      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.platform).toBe('zapier');
      expect(msg.direction).toBe('inbound');
      expect(msg.text).toBe('Hello from Zap');
      expect(msg.senderId).toBe('zapier_user');
      expect(msg.chatId).toBe('chan_1');
      expect(msg.integrationId).toBe('zapier_int_1');
    });

    it('should fall back to text/content fields when message is absent', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      await adapter.handleWebhook(JSON.stringify({ text: 'Fallback text' }), '');

      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.text).toBe('Fallback text');
    });

    it('should use a generic fallback text when no message field is found', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      await adapter.handleWebhook(JSON.stringify({ someOtherKey: 'value' }), '');

      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.text).toMatch(/^Zap triggered/);
    });

    it('should not throw on invalid JSON — warns instead', async () => {
      const warnLogger = { ...noopLogger(), warn: vi.fn() };
      await adapter.init(makeConfig(), { logger: warnLogger, onMessage: vi.fn() });

      await expect(adapter.handleWebhook('not-json', '')).resolves.not.toThrow();
    });

    it('should do nothing when deps are not set', async () => {
      await expect(adapter.handleWebhook('{"message":"hi"}', '')).resolves.not.toThrow();
    });
  });

  describe('testConnection()', () => {
    it('should return ok=true with no outbound URL', async () => {
      await adapter.init(makeConfig({ config: {} }), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toContain('inbound only');
    });

    it('should return ok=true with outbound URL configured', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toContain('hooks.zapier.com');
    });
  });
});
