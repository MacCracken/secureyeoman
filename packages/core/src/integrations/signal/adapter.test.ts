import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignalIntegration } from './adapter.js';
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
    id: 'signal_int_1',
    platform: 'signal',
    displayName: 'Test Signal',
    enabled: true,
    status: 'disconnected',
    config: {
      webhookSecret: 'signal-secret',
      signalCliUrl: 'http://localhost:8080',
      signalCliToken: 'cli-bearer-token',
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

describe('SignalIntegration', () => {
  let adapter: SignalIntegration;

  beforeEach(() => {
    adapter = new SignalIntegration();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should have platform "signal"', () => {
    expect(adapter.platform).toBe('signal');
  });

  it('should not be healthy before init', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  describe('init()', () => {
    it('should initialize successfully with full config', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should initialize without webhookSecret (warning only)', async () => {
      const cfg = makeConfig({ config: { signalCliUrl: 'http://localhost:8080' } });
      await expect(adapter.init(cfg, makeDeps())).resolves.not.toThrow();
    });

    it('should not be healthy after init alone', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.isHealthy()).toBe(false);
    });
  });

  describe('start() / stop()', () => {
    it('should become healthy after start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should be idempotent — calling start twice is safe', async () => {
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

    it('should be safe to call stop before start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.stop()).resolves.not.toThrow();
    });
  });

  describe('sendMessage()', () => {
    it('should POST to signal-cli and return a signal_ prefixed ID', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ timestamp: 1700000000 }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('+1234567890', 'Hello Signal');

      expect(id).toBe('signal_1700000000');
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:8080/v2/send');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Authorization']).toBe('Bearer cli-bearer-token');
      const body = JSON.parse(opts.body);
      expect(body.recipient).toBe('+1234567890');
      expect(body.message).toBe('Hello Signal');
    });

    it('should omit Authorization header when no token is configured', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ timestamp: 123 }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const cfg = makeConfig({ config: { signalCliUrl: 'http://localhost:8080' } });
      await adapter.init(cfg, makeDeps());
      await adapter.sendMessage('+1234567890', 'Hello');

      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['Authorization']).toBeUndefined();
    });

    it('should throw when signalCliUrl is not configured', async () => {
      const cfg = makeConfig({ config: { webhookSecret: 'secret' } });
      await adapter.init(cfg, makeDeps());
      await expect(adapter.sendMessage('+123', 'Hello')).rejects.toThrow(
        'Signal CLI URL not configured'
      );
    });

    it('should throw when signal-cli returns a non-OK response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Internal Server Error'),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('+123', 'Hello')).rejects.toThrow(
        'Failed to send Signal message'
      );
    });

    it('should fall back to Date.now() when timestamp is absent from response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('+123', 'Hello');
      expect(id).toMatch(/^signal_\d+$/);
    });
  });

  describe('handleWebhook()', () => {
    it('should call onMessage for a valid envelope with a message body', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      adapter.handleWebhook({
        envelope: {
          sourceNumber: '+1234567890',
          message: { body: 'Hello from Signal', timestamp: 1700000000 },
        },
      });

      expect(onMessage).toHaveBeenCalledOnce();
      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.platform).toBe('signal');
      expect(msg.direction).toBe('inbound');
      expect(msg.senderId).toBe('+1234567890');
      expect(msg.chatId).toBe('+1234567890');
      expect(msg.text).toBe('Hello from Signal');
      expect(msg.timestamp).toBe(1700000000);
      expect(msg.integrationId).toBe('signal_int_1');
    });

    it('should use sourceUuid when sourceNumber is absent', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      adapter.handleWebhook({
        envelope: {
          sourceUuid: 'uuid-abc',
          message: { body: 'Hi', timestamp: 100 },
        },
      });

      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.senderId).toBe('uuid-abc');
    });

    it('should ignore payloads without a message body', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      adapter.handleWebhook({ envelope: { sourceNumber: '+123', message: {} } });

      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should ignore payloads without an envelope', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      adapter.handleWebhook({ someOtherField: 'value' });

      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should not throw when called before init', () => {
      expect(() => {
        adapter.handleWebhook({ envelope: { sourceNumber: '+123', message: { body: 'hi' } } });
      }).not.toThrow();
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

  // ── Error Path & Lifecycle Tests ──────────────────────────────────

  describe('init() — error paths', () => {
    it('should initialize with completely empty config (no required fields)', async () => {
      const cfg = makeConfig({ config: {} });
      await expect(adapter.init(cfg, makeDeps())).resolves.not.toThrow();
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
  });

  describe('sendMessage() — error paths', () => {
    it('should propagate network errors when fetch throws', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('+1234567890', 'Hello')).rejects.toThrow(
        'Connection refused'
      );
    });

    it('should include the API error text in the thrown error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Rate limit exceeded'),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('+123', 'Hi')).rejects.toThrow('Rate limit exceeded');
    });

    it('should include the signal-cli URL in the fetch call', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ timestamp: 999 }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const cfg = makeConfig({
        config: {
          webhookSecret: 's',
          signalCliUrl: 'http://custom-host:9090',
          signalCliToken: 'tok',
        },
      });
      await adapter.init(cfg, makeDeps());
      await adapter.sendMessage('+1234567890', 'Hello');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('http://custom-host:9090/v2/send');
    });
  });

  describe('handleWebhook() — edge cases', () => {
    it('should use source field when sourceNumber and sourceUuid are absent', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      adapter.handleWebhook({
        envelope: {
          source: 'legacy-source-id',
          message: { body: 'Hello', timestamp: 100 },
        },
      });

      expect(onMessage).toHaveBeenCalledOnce();
      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.senderId).toBe('legacy-source-id');
    });

    it('should use "unknown" when no source identifier is present', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      adapter.handleWebhook({
        envelope: {
          message: { body: 'Hello', timestamp: 100 },
        },
      });

      expect(onMessage).toHaveBeenCalledOnce();
      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.senderId).toBe('unknown');
    });

    it('should use Date.now() as timestamp when message timestamp is absent', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));
      const before = Date.now();

      adapter.handleWebhook({
        envelope: {
          sourceNumber: '+123',
          message: { body: 'No timestamp' },
        },
      });

      const msg: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(msg.timestamp).toBeGreaterThanOrEqual(before);
      expect(msg.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should ignore payloads where message is entirely absent', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      adapter.handleWebhook({ envelope: { sourceNumber: '+123' } });

      expect(onMessage).not.toHaveBeenCalled();
    });
  });
});
