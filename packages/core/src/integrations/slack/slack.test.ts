import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IntegrationConfig } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// Mock @slack/bolt
const mockPostMessage = vi.fn().mockResolvedValue({ ts: '1234567890.123' });
const mockViewsOpen = vi.fn().mockResolvedValue(undefined);
const mockStart = vi.fn().mockResolvedValue(undefined);
const mockStop = vi.fn().mockResolvedValue(undefined);
const mockAppStep = vi.fn();
const eventHandlers: Record<string, Function> = {};
const commandHandlers: Record<string, Function> = {};
const actionHandlers: Array<{ filter: any; handler: Function }> = [];
const viewHandlers: Record<string, Function> = {};

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
    action = vi.fn((filter: any, handler: Function) => {
      actionHandlers.push({ filter, handler });
    });
    view = vi.fn((callbackId: string, handler: Function) => {
      viewHandlers[callbackId] = handler;
    });
    step = mockAppStep;
    start = mockStart;
    stop = mockStop;
    client = {
      chat: {
        postMessage: mockPostMessage,
      },
      views: {
        open: mockViewsOpen,
      },
    };
    constructor(_opts?: any) {}
  }

  class MockWorkflowStep {
    constructor(public callbackId: string, public handlers: any) {}
  }

  return { App: MockApp, WorkflowStep: MockWorkflowStep };
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
    Object.keys(viewHandlers).forEach((k) => delete viewHandlers[k]);
    actionHandlers.length = 0;
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

  it('should register /friday-modal command', async () => {
    await integration.init(makeConfig(), makeDeps());
    expect(commandHandlers['/friday-modal']).toBeDefined();
  });

  it('should register block action handler', async () => {
    await integration.init(makeConfig(), makeDeps());
    expect(actionHandlers.length).toBeGreaterThan(0);
    const buttonHandler = actionHandlers.find((h) => h.filter?.type === 'button');
    expect(buttonHandler).toBeDefined();
  });

  it('should register friday_modal view handler', async () => {
    await integration.init(makeConfig(), makeDeps());
    expect(viewHandlers['friday_modal']).toBeDefined();
  });

  it('should register workflow step via app.step', async () => {
    await integration.init(makeConfig(), makeDeps());
    expect(mockAppStep).toHaveBeenCalledOnce();
    const wsArg = mockAppStep.mock.calls[0][0];
    expect(wsArg.callbackId).toBe('friday_process');
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

  it('should send message with blocks when provided', async () => {
    await integration.init(makeConfig(), makeDeps());
    const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello' } }];
    await integration.sendMessage('C123', 'fallback', { blocks });
    expect(mockPostMessage).toHaveBeenCalledWith({
      channel: 'C123',
      text: 'fallback',
      blocks,
      thread_ts: undefined,
    });
  });

  it('should not include blocks when not in metadata', async () => {
    await integration.init(makeConfig(), makeDeps());
    await integration.sendMessage('C123', 'plain text');
    const callArg = mockPostMessage.mock.calls[0][0];
    expect(callArg.blocks).toBeUndefined();
  });

  it('should throw sendMessage without init', async () => {
    await expect(integration.sendMessage('C', 'hi')).rejects.toThrow('not initialized');
  });

  it('should report unhealthy when not running', () => {
    expect(integration.isHealthy()).toBe(false);
  });

  it('block action handler should call onMessage with isBlockAction metadata', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    await integration.init(makeConfig(), makeDeps(onMessage));

    const buttonHandler = actionHandlers.find((h) => h.filter?.type === 'button');
    expect(buttonHandler).toBeDefined();

    const ack = vi.fn().mockResolvedValue(undefined);
    const fakeAction = {
      action_id: 'approve_btn',
      block_id: 'approval_block',
      value: 'approve',
      type: 'button',
    };
    const fakeBody = {
      user: { id: 'U123', name: 'john' },
      channel: { id: 'C456' },
    };

    await buttonHandler!.handler({ action: fakeAction, ack, body: fakeBody });

    expect(ack).toHaveBeenCalledOnce();
    expect(onMessage).toHaveBeenCalledOnce();
    const msg = onMessage.mock.calls[0][0];
    expect(msg.platform).toBe('slack');
    expect(msg.metadata?.isBlockAction).toBe(true);
    expect(msg.metadata?.actionId).toBe('approve_btn');
    expect(msg.metadata?.blockId).toBe('approval_block');
    expect(msg.metadata?.value).toBe('approve');
  });

  it('/friday-modal command should call client.views.open', async () => {
    await integration.init(makeConfig(), makeDeps());

    const handler = commandHandlers['/friday-modal'] as Function;
    const ack = vi.fn().mockResolvedValue(undefined);
    const fakeCommand = {
      trigger_id: 'trig_123',
      user_id: 'U1',
      user_name: 'alice',
      channel_id: 'C1',
      text: '',
    };

    await handler({ command: fakeCommand, ack, client: { views: { open: mockViewsOpen } } });

    expect(ack).toHaveBeenCalledOnce();
    expect(mockViewsOpen).toHaveBeenCalledOnce();
    const openArg = mockViewsOpen.mock.calls[0][0];
    expect(openArg.trigger_id).toBe('trig_123');
    expect(openArg.view?.callback_id).toBe('friday_modal');
  });

  it('friday_modal view submission should call onMessage with isModalSubmit', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    await integration.init(makeConfig(), makeDeps(onMessage));

    const viewHandler = viewHandlers['friday_modal'] as Function;
    expect(viewHandler).toBeDefined();

    const ack = vi.fn().mockResolvedValue(undefined);
    const fakeView = {
      id: 'view_1',
      callback_id: 'friday_modal',
      root_view_id: 'root_1',
      state: {
        values: {
          task_block: {
            task_input: { value: 'Please process this task' },
          },
        },
      },
    };
    const fakeBody = {
      user: { id: 'U1', name: 'alice' },
      view: fakeView,
    };

    await viewHandler({ ack, view: fakeView, body: fakeBody });

    expect(ack).toHaveBeenCalledOnce();
    expect(onMessage).toHaveBeenCalledOnce();
    const msg = onMessage.mock.calls[0][0];
    expect(msg.text).toBe('Please process this task');
    expect(msg.metadata?.isModalSubmit).toBe(true);
    expect(msg.metadata?.modalCallbackId).toBe('friday_modal');
  });
});
