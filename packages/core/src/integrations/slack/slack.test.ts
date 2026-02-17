import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IntegrationConfig } from '@friday/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// Mock @slack/bolt
const mockPostMessage = vi.fn().mockResolvedValue({ ts: '1234567890.123' });
const mockStart = vi.fn().mockResolvedValue(undefined);
const mockStop = vi.fn().mockResolvedValue(undefined);
const eventHandlers: Record<string, Function> = {};
const commandHandlers: Record<string, Function> = {};

vi.mock('@slack/bolt', () => {
  class MockApp {
    message = vi.fn((handler: Function) => {
      eventHandlers['message'] = handler;
    });
    event = vi.fn((name: string, handler: Function) => {
      eventHandlers[name] = handler;
    });
    command = vi.fn((name: string, handler: Function) => {
      commandHandlers[name] = handler;
    });
    start = mockStart;
    stop = mockStop;
    client = {
      chat: {
        postMessage: mockPostMessage,
      },
    };
    constructor(_opts?: any) {}
  }
  return { App: MockApp };
});

import { SlackIntegration } from './adapter.js';

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
    id: 'sl_int_1',
    platform: 'slack',
    displayName: 'Test Slack Bot',
    enabled: true,
    status: 'disconnected',
    config: { botToken: 'xoxb-test', appToken: 'xapp-test' },
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: noopLogger(), onMessage };
}

describe('SlackIntegration', () => {
  let integration: SlackIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(eventHandlers).forEach((k) => delete eventHandlers[k]);
    Object.keys(commandHandlers).forEach((k) => delete commandHandlers[k]);
    integration = new SlackIntegration();
  });

  it('should have slack platform', () => {
    expect(integration.platform).toBe('slack');
  });

  it('should have rate limit config', () => {
    expect(integration.platformRateLimit).toEqual({ maxPerSecond: 1 });
  });

  it('should throw without botToken', async () => {
    await expect(
      integration.init(makeConfig({ config: { appToken: 'xapp-test' } }), makeDeps())
    ).rejects.toThrow('botToken');
  });

  it('should throw without appToken', async () => {
    await expect(
      integration.init(makeConfig({ config: { botToken: 'xoxb-test' } }), makeDeps())
    ).rejects.toThrow('appToken');
  });

  it('should initialize successfully', async () => {
    await integration.init(makeConfig(), makeDeps());
    expect(eventHandlers['message']).toBeDefined();
  });

  it('should register message handler', async () => {
    await integration.init(makeConfig(), makeDeps());
    expect(eventHandlers['message']).toBeDefined();
  });

  it('should register app_mention handler', async () => {
    await integration.init(makeConfig(), makeDeps());
    expect(eventHandlers['app_mention']).toBeDefined();
  });

  it('should register /friday command', async () => {
    await integration.init(makeConfig(), makeDeps());
    expect(commandHandlers['/friday']).toBeDefined();
  });

  it('should register /friday-status command', async () => {
    await integration.init(makeConfig(), makeDeps());
    expect(commandHandlers['/friday-status']).toBeDefined();
  });

  it('should start bolt app', async () => {
    await integration.init(makeConfig(), makeDeps());
    await integration.start();
    expect(mockStart).toHaveBeenCalled();
    expect(integration.isHealthy()).toBe(true);
  });

  it('should throw start without init', async () => {
    await expect(integration.start()).rejects.toThrow('not initialized');
  });

  it('should not start twice', async () => {
    await integration.init(makeConfig(), makeDeps());
    await integration.start();
    await integration.start();
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('should stop bolt app', async () => {
    await integration.init(makeConfig(), makeDeps());
    await integration.start();
    await integration.stop();
    expect(mockStop).toHaveBeenCalled();
    expect(integration.isHealthy()).toBe(false);
  });

  it('should stop when not running without error', async () => {
    await integration.stop(); // should not throw
  });

  it('should send message via postMessage', async () => {
    await integration.init(makeConfig(), makeDeps());
    const ts = await integration.sendMessage('C123', 'Hello Slack!');
    expect(ts).toBe('1234567890.123');
    expect(mockPostMessage).toHaveBeenCalledWith({
      channel: 'C123',
      text: 'Hello Slack!',
      thread_ts: undefined,
    });
  });

  it('should send threaded message', async () => {
    await integration.init(makeConfig(), makeDeps());
    await integration.sendMessage('C123', 'Reply', { threadTs: '1234.5678' });
    expect(mockPostMessage).toHaveBeenCalledWith({
      channel: 'C123',
      text: 'Reply',
      thread_ts: '1234.5678',
    });
  });

  it('should throw sendMessage without init', async () => {
    await expect(integration.sendMessage('C', 'hi')).rejects.toThrow('not initialized');
  });

  it('should report unhealthy when not running', () => {
    expect(integration.isHealthy()).toBe(false);
  });
});
