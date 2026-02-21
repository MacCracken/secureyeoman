/**
 * Unit tests for SlackIntegration adapter.
 *
 * All @slack/bolt imports are fully mocked so no real network calls are made.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IntegrationConfig } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ── Stable mock references (must be declared before vi.mock factories) ────────

const mocks = vi.hoisted(() => {
  const appStart = vi.fn().mockResolvedValue(undefined);
  const appStop = vi.fn().mockResolvedValue(undefined);
  const chatPostMessage = vi.fn().mockResolvedValue({ ts: 'ts-12345' });

  // Registered handler storage (keyed by event/command/view name)
  const registeredHandlers: Record<string, (...args: any[]) => any> = {};

  const mockAppInstance = {
    start: appStart,
    stop: appStop,
    client: {
      chat: {
        postMessage: chatPostMessage,
      },
    },
    message: vi.fn().mockImplementation(function (handler: (...args: any[]) => any) {
      registeredHandlers['message'] = handler;
    }),
    event: vi.fn().mockImplementation(function (name: string, handler: (...args: any[]) => any) {
      registeredHandlers[`event:${name}`] = handler;
    }),
    action: vi.fn().mockImplementation(function (pattern: unknown, handler: (...args: any[]) => any) {
      registeredHandlers['action'] = handler;
    }),
    command: vi.fn().mockImplementation(function (name: string, handler: (...args: any[]) => any) {
      registeredHandlers[`command:${name}`] = handler;
    }),
    view: vi.fn().mockImplementation(function (name: string, handler: (...args: any[]) => any) {
      registeredHandlers[`view:${name}`] = handler;
    }),
    step: vi.fn(),
  };

  return {
    appStart,
    appStop,
    chatPostMessage,
    registeredHandlers,
    mockAppInstance,
  };
});

// ── Mock @slack/bolt ──────────────────────────────────────────────────────────

vi.mock('@slack/bolt', () => {
  const MockApp = vi.fn().mockImplementation(function () {
    return mocks.mockAppInstance;
  });

  const MockWorkflowStep = vi.fn().mockImplementation(function (name: string, handlers: unknown) {
    return { name, handlers };
  });

  return { App: MockApp, WorkflowStep: MockWorkflowStep };
});

// ── Import adapter after mocks ────────────────────────────────────────────────

import { SlackIntegration } from './adapter.js';

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

function makeConfig(overrides: Partial<IntegrationConfig> = {}): IntegrationConfig {
  return {
    id: 'sl-test-id',
    platform: 'slack',
    displayName: 'Test Slack Bot',
    enabled: true,
    status: 'disconnected',
    config: {
      botToken: 'xoxb-test-bot-token',
      appToken: 'xapp-test-app-token',
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SlackIntegration', () => {
  let integration: SlackIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear registered handlers between tests
    for (const key of Object.keys(mocks.registeredHandlers)) {
      delete mocks.registeredHandlers[key];
    }
    // Restore default mock resolved values
    mocks.appStart.mockResolvedValue(undefined);
    mocks.appStop.mockResolvedValue(undefined);
    mocks.chatPostMessage.mockResolvedValue({ ts: 'ts-12345' });
    // Re-attach handler registration logic since clearAllMocks resets mock.fn impls
    mocks.mockAppInstance.message.mockImplementation(function (handler: (...args: any[]) => any) {
      mocks.registeredHandlers['message'] = handler;
    });
    mocks.mockAppInstance.event.mockImplementation(function (name: string, handler: (...args: any[]) => any) {
      mocks.registeredHandlers[`event:${name}`] = handler;
    });
    mocks.mockAppInstance.action.mockImplementation(function (_pattern: unknown, handler: (...args: any[]) => any) {
      mocks.registeredHandlers['action'] = handler;
    });
    mocks.mockAppInstance.command.mockImplementation(function (name: string, handler: (...args: any[]) => any) {
      mocks.registeredHandlers[`command:${name}`] = handler;
    });
    mocks.mockAppInstance.view.mockImplementation(function (name: string, handler: (...args: any[]) => any) {
      mocks.registeredHandlers[`view:${name}`] = handler;
    });
    integration = new SlackIntegration();
  });

  // ── Platform metadata ──────────────────────────────────────────────────────

  it('should expose platform as "slack"', () => {
    expect(integration.platform).toBe('slack');
  });

  it('should expose platformRateLimit of 1 msg/s', () => {
    expect(integration.platformRateLimit).toEqual({ maxPerSecond: 1 });
  });

  // ── init() ─────────────────────────────────────────────────────────────────

  describe('init()', () => {
    it('should initialize successfully with valid config', async () => {
      await expect(integration.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should throw when botToken is missing', async () => {
      await expect(
        integration.init(
          makeConfig({ config: { appToken: 'xapp-token' } }),
          makeDeps()
        )
      ).rejects.toThrow('botToken');
    });

    it('should throw when appToken is missing', async () => {
      await expect(
        integration.init(
          makeConfig({ config: { botToken: 'xoxb-token' } }),
          makeDeps()
        )
      ).rejects.toThrow('appToken');
    });

    it('should register app.message handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(mocks.mockAppInstance.message).toHaveBeenCalledOnce();
    });

    it('should register app.event handler for app_mention', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(mocks.mockAppInstance.event).toHaveBeenCalledWith('app_mention', expect.any(Function));
    });

    it('should register app.action handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(mocks.mockAppInstance.action).toHaveBeenCalledOnce();
    });

    it('should register /friday command handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      const commandNames = mocks.mockAppInstance.command.mock.calls.map((c: any[]) => c[0]);
      expect(commandNames).toContain('/friday');
    });

    it('should register /friday-status command handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      const commandNames = mocks.mockAppInstance.command.mock.calls.map((c: any[]) => c[0]);
      expect(commandNames).toContain('/friday-status');
    });

    it('should register /friday-modal command handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      const commandNames = mocks.mockAppInstance.command.mock.calls.map((c: any[]) => c[0]);
      expect(commandNames).toContain('/friday-modal');
    });

    it('should register friday_modal view handler', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(mocks.mockAppInstance.view).toHaveBeenCalledWith('friday_modal', expect.any(Function));
    });

    it('should register workflow step via app.step', async () => {
      await integration.init(makeConfig(), makeDeps());
      expect(mocks.mockAppInstance.step).toHaveBeenCalledOnce();
    });
  });

  // ── start() ────────────────────────────────────────────────────────────────

  describe('start()', () => {
    it('should call app.start() and become healthy', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      expect(mocks.appStart).toHaveBeenCalledOnce();
      expect(integration.isHealthy()).toBe(true);
    });

    it('should throw when called before init', async () => {
      await expect(integration.start()).rejects.toThrow('not initialized');
    });

    it('should be idempotent — second start does not call app.start again', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.start();
      expect(mocks.appStart).toHaveBeenCalledTimes(1);
    });
  });

  // ── stop() ─────────────────────────────────────────────────────────────────

  describe('stop()', () => {
    it('should call app.stop() and become unhealthy', async () => {
      await integration.init(makeConfig(), makeDeps());
      await integration.start();
      await integration.stop();
      expect(mocks.appStop).toHaveBeenCalledOnce();
      expect(integration.isHealthy()).toBe(false);
    });

    it('should be a no-op when not running (does not call app.stop)', async () => {
      await integration.init(makeConfig(), makeDeps());
      // Not started — stop should do nothing
      await expect(integration.stop()).resolves.not.toThrow();
      expect(mocks.appStop).not.toHaveBeenCalled();
    });

    it('should be a no-op when called before init', async () => {
      await expect(integration.stop()).resolves.not.toThrow();
      expect(mocks.appStop).not.toHaveBeenCalled();
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
    beforeEach(async () => {
      await integration.init(makeConfig(), makeDeps());
    });

    it('calls app.client.chat.postMessage with channel and text', async () => {
      const ts = await integration.sendMessage('C123456', 'Hello Slack!');
      expect(mocks.chatPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C123456',
          text: 'Hello Slack!',
        })
      );
      expect(ts).toBe('ts-12345');
    });

    it('returns the ts value from the postMessage result', async () => {
      mocks.chatPostMessage.mockResolvedValueOnce({ ts: 'ts-unique-99' });
      const ts = await integration.sendMessage('C123', 'Test message');
      expect(ts).toBe('ts-unique-99');
    });

    it('includes thread_ts when metadata.threadTs is provided', async () => {
      await integration.sendMessage('C123', 'Thread reply', { threadTs: '1234567890.000200' });
      const arg = mocks.chatPostMessage.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.thread_ts).toBe('1234567890.000200');
    });

    it('includes blocks when metadata.blocks is provided', async () => {
      const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: '*Bold*' } }];
      await integration.sendMessage('C456', 'Rich message', { blocks });
      const arg = mocks.chatPostMessage.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.blocks).toEqual(blocks);
    });

    it('does not include blocks when metadata.blocks is absent', async () => {
      await integration.sendMessage('C789', 'Plain message');
      const arg = mocks.chatPostMessage.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.blocks).toBeUndefined();
    });

    it('throws when called before init', async () => {
      const uninit = new SlackIntegration();
      await expect(uninit.sendMessage('C123', 'test')).rejects.toThrow('not initialized');
    });
  });
});
