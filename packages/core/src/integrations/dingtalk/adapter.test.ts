/**
 * Unit tests for DingTalkIntegration adapter.
 *
 * DingTalk uses webhook-based communication with no external SDK,
 * so only `fetch` (global) and `crypto` (built-in) need handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IntegrationConfig, UnifiedMessage } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ── Hoisted mock references ────────────────────────────────────────────────────

const { mockFetch } = vi.hoisted(() => {
  const mockFetch = vi.fn();
  return { mockFetch };
});

vi.stubGlobal('fetch', mockFetch);

// ── Import adapter after global stub ─────────────────────────────────────────

import { DingTalkIntegration } from './adapter.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLogger(): SecureLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as SecureLogger;
}

const WEBHOOK_URL = 'https://oapi.dingtalk.com/robot/send?access_token=abc123';

function makeConfig(overrides: Partial<IntegrationConfig> = {}): IntegrationConfig {
  return {
    id: 'dt-test-id',
    platform: 'dingtalk',
    displayName: 'Test DingTalk',
    enabled: true,
    status: 'disconnected',
    config: {
      outboundWebhookUrl: WEBHOOK_URL,
    },
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: makeLogger(), onMessage };
}

function makeWebhookPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    msgtype: 'text',
    text: { content: 'Hello DingTalk' },
    senderStaffId: 'staff-001',
    senderNick: 'Alice',
    conversationId: 'conv-001',
    msgId: 'msg-001',
    createAt: 1700000000,
    sessionWebhook: 'https://oapi.dingtalk.com/robot/session/reply',
    ...overrides,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DingTalkIntegration', () => {
  let integration: DingTalkIntegration;

  beforeEach(() => {
    // Reset the mockFetch implementation queue (clears once-mocks from prior tests)
    // then restore the default OK response.
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    integration = new DingTalkIntegration();
  });

  // ── Platform metadata ──────────────────────────────────────────────────────

  it('should expose platform as "dingtalk"', () => {
    expect(integration.platform).toBe('dingtalk');
  });

  it('should expose platformRateLimit of 20 msg/s', () => {
    expect(integration.platformRateLimit).toEqual({ maxPerSecond: 20 });
  });

  it('should expose webhook path as "/webhooks/dingtalk"', () => {
    expect(integration.getWebhookPath()).toBe('/webhooks/dingtalk');
  });

  it('should not be healthy before init', () => {
    expect(integration.isHealthy()).toBe(false);
  });

  // ── init() ─────────────────────────────────────────────────────────────────

  describe('init()', () => {
    it('should initialize successfully with webhook URL config', async () => {
      await expect(integration.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should initialize with empty config (no required fields)', async () => {
      await expect(integration.init(makeConfig({ config: {} }), makeDeps())).resolves.not.toThrow();
    });

    it('should log initialization message', async () => {
      const deps = makeDeps();
      await integration.init(makeConfig(), deps);
      expect(deps.logger.info as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        expect.stringContaining('DingTalk')
      );
    });
  });

  // ── start() ────────────────────────────────────────────────────────────────

  describe('start()', () => {
    it('should set running and be healthy', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      expect(integration.isHealthy()).toBe(true);
    });

    it('should log start message', async () => {
      const deps = makeDeps();
      await integration.init(makeConfig(), deps);
      await integration.start();
      const infoCalls = (deps.logger.info as ReturnType<typeof vi.fn>).mock.calls;
      expect(infoCalls.some((c: any[]) => String(c[0]).toLowerCase().includes('start'))).toBe(true);
    });

    it('should be idempotent — second start does not call start logic again', async () => {
      const deps = makeDeps();
      await integration.init(makeConfig(), deps);
      await integration.start();
      const callsAfterFirst = (deps.logger.info as ReturnType<typeof vi.fn>).mock.calls.length;
      await integration.start();
      // No additional log on the second call (already running guard)
      expect((deps.logger.info as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
        callsAfterFirst
      );
    });
  });

  // ── stop() ─────────────────────────────────────────────────────────────────

  describe('stop()', () => {
    it('should set not running after stop', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.stop();
      expect(integration.isHealthy()).toBe(false);
    });

    it('should be safe to call without start', async () => {
      await integration.init(makeConfig(), makeDeps());
      await expect(integration.stop()).resolves.not.toThrow();
    });

    it('should be safe to call without init', async () => {
      await expect(integration.stop()).resolves.not.toThrow();
    });
  });

  // ── isHealthy() ────────────────────────────────────────────────────────────

  describe('isHealthy()', () => {
    it('returns false before init', () => {
      expect(integration.isHealthy()).toBe(false);
    });

    it('returns false after init but before start', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(integration.isHealthy()).toBe(false);
    });

    it('returns true after start', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      expect(integration.isHealthy()).toBe(true);
    });

    it('returns false after stop', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.stop();
      expect(integration.isHealthy()).toBe(false);
    });
  });

  // ── sendMessage() ──────────────────────────────────────────────────────────

  describe('sendMessage()', () => {
    it('should POST a text message using outbound webhook URL from config', async () => {
      // chatId is used as the URL when no sessionWebhook metadata is given;
      // pass the actual webhook URL so the adapter accepts it.
      await integration.init(makeConfig(), makeDeps());

      await integration.sendMessage(WEBHOOK_URL, 'Hello DingTalk!');

      expect(mockFetch).toHaveBeenCalledWith(
        WEBHOOK_URL,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ msgtype: 'text', text: { content: 'Hello DingTalk!' } }),
        })
      );
    });

    it('should use sessionWebhook from metadata — takes priority over chatId', async () => {
      await integration.init(makeConfig(), makeDeps());
      const sessionWebhook = 'https://oapi.dingtalk.com/robot/session/reply?token=xyz';

      await integration.sendMessage(WEBHOOK_URL, 'Reply!', { sessionWebhook });

      expect(mockFetch).toHaveBeenCalledWith(sessionWebhook, expect.anything());
    });

    it('should send markdown payload when metadata.markdown is true', async () => {
      await integration.init(makeConfig(), makeDeps());

      // Use a text longer than 20 chars so slice(0,20) truncates the title
      const longText = '## A very long headline that exceeds twenty chars';
      await integration.sendMessage(WEBHOOK_URL, longText, { markdown: true });

      const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(callBody.msgtype).toBe('markdown');
      expect(callBody.markdown.text).toBe(longText);
      // title = text.slice(0, 20)
      expect(callBody.markdown.title).toBe(longText.slice(0, 20));
    });

    it('should send text payload when metadata.markdown is false', async () => {
      await integration.init(makeConfig(), makeDeps());

      await integration.sendMessage(WEBHOOK_URL, 'Plain text', { markdown: false });

      const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(callBody.msgtype).toBe('text');
    });

    it('should return a dingtalk_ prefixed message id', async () => {
      await integration.init(makeConfig(), makeDeps());
      const id = await integration.sendMessage(WEBHOOK_URL, 'Hi');
      expect(id).toMatch(/^dingtalk_\d+$/);
    });

    it('should throw when no webhook URL is configured and chatId is not an HTTP URL', async () => {
      await integration.init(makeConfig({ config: {} }), makeDeps());

      await expect(integration.sendMessage('not-a-url', 'Hello')).rejects.toThrow(
        'No DingTalk outbound webhook URL configured'
      );
    });

    it('should use chatId directly when it is a valid HTTP URL', async () => {
      await integration.init(makeConfig({ config: {} }), makeDeps());
      const chatIdUrl = 'https://oapi.dingtalk.com/robot/send?access_token=direct';

      await integration.sendMessage(chatIdUrl, 'Direct');
      expect(mockFetch).toHaveBeenCalledWith(chatIdUrl, expect.anything());
    });

    it('should throw when fetch returns non-ok status', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
      await integration.init(makeConfig(), makeDeps());

      await expect(integration.sendMessage(WEBHOOK_URL, 'Hello')).rejects.toThrow(
        'DingTalk send failed: 429'
      );
    });
  });

  // ── verifyWebhook() ────────────────────────────────────────────────────────

  describe('verifyWebhook()', () => {
    it('should return true when no webhookToken is configured', async () => {
      await integration.init(makeConfig({ config: {} }), makeDeps());
      expect(integration.verifyWebhook('payload', 'any-sig')).toBe(true);
    });

    it('should return true for a valid HMAC-SHA256 signature', async () => {
      const { createHmac } = await import('crypto');
      const webhookToken = 'my-secret-token';
      const payload = 'test-payload';
      const computed = createHmac('sha256', webhookToken).update(payload).digest('hex');

      await integration.init(makeConfig({ config: { webhookToken } }), makeDeps());

      expect(integration.verifyWebhook(payload, computed)).toBe(true);
    });

    it('should return true for signature with "sha256=" prefix', async () => {
      const { createHmac } = await import('crypto');
      const webhookToken = 'my-secret-token';
      const payload = 'test-payload';
      const computed = createHmac('sha256', webhookToken).update(payload).digest('hex');

      await integration.init(makeConfig({ config: { webhookToken } }), makeDeps());

      expect(integration.verifyWebhook(payload, `sha256=${computed}`)).toBe(true);
    });

    it('should return false for an invalid signature', async () => {
      await integration.init(makeConfig({ config: { webhookToken: 'secret' } }), makeDeps());

      // Length matches SHA-256 hex but value is wrong
      expect(integration.verifyWebhook('payload', 'a'.repeat(64))).toBe(false);
    });

    it('should return false when signature has mismatched length (timingSafeEqual throws)', async () => {
      await integration.init(makeConfig({ config: { webhookToken: 'secret' } }), makeDeps());

      // timingSafeEqual will throw if buffer lengths differ, caught and returns false
      expect(integration.verifyWebhook('payload', 'short')).toBe(false);
    });
  });

  // ── handleWebhook() ────────────────────────────────────────────────────────

  describe('handleWebhook()', () => {
    it('should parse a text event and call onMessage', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const payload = makeWebhookPayload();
      await integration.handleWebhook(payload, '');

      expect(onMessage).toHaveBeenCalledOnce();
      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.id).toBe('dingtalk_msg-001');
      expect(unified.platform).toBe('dingtalk');
      expect(unified.direction).toBe('inbound');
      expect(unified.senderId).toBe('staff-001');
      expect(unified.senderName).toBe('Alice');
      expect(unified.chatId).toBe('conv-001');
      expect(unified.text).toBe('Hello DingTalk');
      expect(unified.metadata?.msgtype).toBe('text');
      expect(unified.metadata?.sessionWebhook).toBe(
        'https://oapi.dingtalk.com/robot/session/reply'
      );
    });

    it('should extract text from markdown events', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const payload = makeWebhookPayload({
        msgtype: 'markdown',
        text: undefined,
        markdown: { title: 'Title', text: '## Markdown content' },
        msgId: 'md-msg-001',
      });
      await integration.handleWebhook(payload, '');

      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.text).toBe('## Markdown content');
    });

    it('should fallback to "DingTalk event: <msgtype>" for unknown message types', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const payload = makeWebhookPayload({
        msgtype: 'file',
        text: undefined,
        markdown: undefined,
        msgId: 'file-msg-001',
      });
      await integration.handleWebhook(payload, '');

      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.text).toBe('DingTalk event: file');
    });

    it('should use "unknown" for missing senderStaffId and "DingTalk" for missing senderNick', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const payload = makeWebhookPayload({
        senderStaffId: undefined,
        senderNick: undefined,
        msgId: 'anon-msg',
      });
      await integration.handleWebhook(payload, '');

      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.senderId).toBe('unknown');
      expect(unified.senderName).toBe('DingTalk');
    });

    it('should handle invalid JSON payload gracefully without throwing', async () => {
      const deps = makeDeps();
      await integration.init(makeConfig(), deps);

      await expect(integration.handleWebhook('not-valid-json', '')).resolves.not.toThrow();
      expect(deps.logger.warn as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    });

    it('should not call onMessage when deps is null (before init)', async () => {
      // Do not call init — deps remains null internally
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await expect(integration.handleWebhook(makeWebhookPayload(), '')).resolves.not.toThrow();
      expect(onMessage).not.toHaveBeenCalled();
    });

    it('should set timestamp from createAt field', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const payload = makeWebhookPayload({ createAt: 1700000000 });
      await integration.handleWebhook(payload, '');

      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.timestamp).toBe(1700000000);
    });

    it('should use "dingtalk" as chatId when conversationId is missing', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await integration.init(makeConfig(), makeDeps(onMessage));

      const payload = makeWebhookPayload({ conversationId: undefined });
      await integration.handleWebhook(payload, '');

      const unified: UnifiedMessage = onMessage.mock.calls[0][0];
      expect(unified.chatId).toBe('dingtalk');
    });
  });

  // ── testConnection() ───────────────────────────────────────────────────────

  describe('testConnection()', () => {
    it('should return ok=true with outboundWebhookUrl configured', async () => {
      await integration.init(makeConfig(), makeDeps());
      const result = await integration.testConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toContain('oapi.dingtalk.com');
    });

    it('should return ok=true and "ready" message when no config is set', async () => {
      await integration.init(makeConfig({ config: {} }), makeDeps());
      const result = await integration.testConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toContain('ready');
    });

    it('should check appKey via fetch when configured', async () => {
      mockFetch.mockResolvedValueOnce({ status: 200 });
      await integration.init(makeConfig({ config: { appKey: 'my-app-key' } }), makeDeps());

      const result = await integration.testConnection();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('dingtalk'),
        expect.anything()
      );
      expect(result.ok).toBe(true);
    });

    it('should return ok=false and "Invalid app credentials" for 401 response', async () => {
      mockFetch.mockResolvedValueOnce({ status: 401 });
      await integration.init(makeConfig({ config: { appKey: 'bad-key' } }), makeDeps());

      const result = await integration.testConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Invalid app credentials');
    });

    it('should return ok=false when fetch throws an error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));
      await integration.init(makeConfig({ config: { appKey: 'key' } }), makeDeps());

      const result = await integration.testConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Network failure');
    });
  });
});
