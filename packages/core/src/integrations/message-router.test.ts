/**
 * MessageRouter Tests
 *
 * Unit tests for the inbound message routing flow.
 * No real integrations, task executor, or DB required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageRouter } from './message-router.js';
import { TaskType } from '@secureyeoman/shared';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    integrationId: 'int-1',
    platform: 'slack',
    senderId: 'user-1',
    senderName: 'Alice',
    chatId: 'chat-1',
    text: 'Hello, how are you?',
    timestamp: NOW,
    attachments: [],
    ...overrides,
  } as any;
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    status: 'pending',
    result: null,
    ...overrides,
  };
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    logger: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    taskExecutor: {
      submit: vi.fn().mockResolvedValue(makeTask()),
    },
    integrationManager: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
    integrationStorage: {
      storeMessage: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MessageRouter.handleInbound()', () => {
  it('stores inbound message and submits a task', async () => {
    const deps = makeDeps();
    const router = new MessageRouter(deps as any);
    await router.handleInbound(makeMessage());

    expect(deps.integrationStorage.storeMessage).toHaveBeenCalledOnce();
    expect(deps.taskExecutor.submit).toHaveBeenCalledWith(
      expect.objectContaining({ type: TaskType.QUERY }),
      expect.objectContaining({ userId: 'slack:user-1' })
    );
  });

  it('skips task submission for empty messages', async () => {
    const deps = makeDeps();
    const router = new MessageRouter(deps as any);
    await router.handleInbound(makeMessage({ text: '   ' }));

    expect(deps.taskExecutor.submit).not.toHaveBeenCalled();
    expect(deps.logger.debug).toHaveBeenCalledWith(expect.stringContaining('empty'));
  });

  it('fires outbound webhook dispatcher when set', async () => {
    const deps = makeDeps();
    const dispatcher = { dispatch: vi.fn() };
    deps['outboundWebhookDispatcher'] = dispatcher;
    const router = new MessageRouter(deps as any);

    await router.handleInbound(makeMessage());

    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      'message.inbound',
      expect.objectContaining({
        platform: 'slack',
        chatId: 'chat-1',
      })
    );
  });

  it('blocks message when integration not in personality allowlist', async () => {
    const deps = makeDeps();
    const router = new MessageRouter({
      ...deps,
      getActivePersonality: vi.fn().mockResolvedValue({
        selectedIntegrations: ['int-2', 'int-3'], // int-1 not allowed
      }),
    } as any);

    await router.handleInbound(makeMessage({ integrationId: 'int-1' }));

    expect(deps.taskExecutor.submit).not.toHaveBeenCalled();
    expect(deps.logger.info).toHaveBeenCalledWith(expect.stringContaining('blocked'));
  });

  it('allows message when integration is in personality allowlist', async () => {
    const deps = makeDeps();
    const router = new MessageRouter({
      ...deps,
      getActivePersonality: vi.fn().mockResolvedValue({
        selectedIntegrations: ['int-1'],
      }),
    } as any);

    await router.handleInbound(makeMessage({ integrationId: 'int-1' }));

    expect(deps.taskExecutor.submit).toHaveBeenCalledOnce();
  });

  it('allows all integrations when selectedIntegrations is empty', async () => {
    const deps = makeDeps();
    const router = new MessageRouter({
      ...deps,
      getActivePersonality: vi.fn().mockResolvedValue({ selectedIntegrations: [] }),
    } as any);

    await router.handleInbound(makeMessage());

    expect(deps.taskExecutor.submit).toHaveBeenCalledOnce();
  });

  it('sends response when task completes synchronously', async () => {
    const deps = makeDeps({
      taskExecutor: {
        submit: vi.fn().mockResolvedValue(
          makeTask({
            status: 'completed',
            result: { success: true },
          })
        ),
      },
    });
    const router = new MessageRouter(deps as any);

    await router.handleInbound(makeMessage());

    expect(deps.integrationManager.sendMessage).toHaveBeenCalledWith(
      'int-1',
      'chat-1',
      expect.stringContaining('Task'),
      expect.any(Object)
    );
  });

  it('sends TTS audio when multimodal manager is available and task completes', async () => {
    const deps = makeDeps({
      taskExecutor: {
        submit: vi
          .fn()
          .mockResolvedValue(makeTask({ status: 'completed', result: { success: true } })),
      },
      multimodalManager: {
        synthesizeSpeech: vi.fn().mockResolvedValue({ audioBase64: 'audio123', format: 'mp3' }),
      },
    });
    const router = new MessageRouter(deps as any);

    await router.handleInbound(makeMessage());

    const sendCall = deps.integrationManager.sendMessage.mock.calls[0];
    expect(sendCall[3]).toMatchObject({ audioBase64: 'audio123' });
  });

  it('uses personality voice for TTS when valid', async () => {
    const synthSpy = vi.fn().mockResolvedValue({ audioBase64: 'a', format: 'mp3' });
    const deps = makeDeps({
      taskExecutor: {
        submit: vi
          .fn()
          .mockResolvedValue(makeTask({ status: 'completed', result: { success: true } })),
      },
      multimodalManager: { synthesizeSpeech: synthSpy },
      getActivePersonality: vi.fn().mockResolvedValue({ voice: 'nova' }),
    });
    const router = new MessageRouter(deps as any);
    await router.handleInbound(makeMessage());

    expect(synthSpy).toHaveBeenCalledWith(expect.objectContaining({ voice: 'nova' }));
  });

  it('skips TTS voice when invalid voice name', async () => {
    const synthSpy = vi.fn().mockResolvedValue({ audioBase64: 'a', format: 'mp3' });
    const deps = makeDeps({
      taskExecutor: {
        submit: vi
          .fn()
          .mockResolvedValue(makeTask({ status: 'completed', result: { success: true } })),
      },
      multimodalManager: { synthesizeSpeech: synthSpy },
      getActivePersonality: vi.fn().mockResolvedValue({ voice: 'invalid-voice' }),
    });
    const router = new MessageRouter(deps as any);
    await router.handleInbound(makeMessage());

    expect(synthSpy).toHaveBeenCalledWith(expect.objectContaining({ voice: undefined }));
  });

  it('logs warning when TTS fails', async () => {
    const deps = makeDeps({
      taskExecutor: {
        submit: vi
          .fn()
          .mockResolvedValue(makeTask({ status: 'completed', result: { success: true } })),
      },
      multimodalManager: {
        synthesizeSpeech: vi.fn().mockRejectedValue(new Error('TTS unavailable')),
      },
    });
    const router = new MessageRouter(deps as any);
    await router.handleInbound(makeMessage());

    expect(deps.logger.warn).toHaveBeenCalledWith(expect.stringContaining('TTS synthesis failed'));
  });

  it('handles task submission errors and sends error response', async () => {
    const deps = makeDeps({
      taskExecutor: {
        submit: vi.fn().mockRejectedValue(new Error('executor unavailable')),
      },
    });
    const router = new MessageRouter(deps as any);
    await router.handleInbound(makeMessage());

    expect(deps.logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to process'));
    expect(deps.integrationManager.sendMessage).toHaveBeenCalledWith(
      'int-1',
      'chat-1',
      expect.stringContaining('error'),
      expect.any(Object)
    );
  });

  it('logs error when sending error response also fails', async () => {
    const deps = makeDeps({
      taskExecutor: {
        submit: vi.fn().mockRejectedValue(new Error('executor failed')),
      },
      integrationManager: {
        sendMessage: vi.fn().mockRejectedValue(new Error('send failed')),
      },
    });
    const router = new MessageRouter(deps as any);
    await router.handleInbound(makeMessage());

    expect(deps.logger.error).toHaveBeenCalledTimes(2);
  });

  it('routes via routingRulesManager when set', async () => {
    const deps = makeDeps();
    const routingManager = { processMessage: vi.fn().mockResolvedValue(undefined) };
    const router = new MessageRouter(deps as any);
    router.setRoutingRulesManager(routingManager as any);

    await router.handleInbound(makeMessage());

    expect(routingManager.processMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: 'chat-1' })
    );
  });
});

describe('MessageRouter.setMultimodalDeps()', () => {
  it('injects multimodal manager', () => {
    const deps = makeDeps();
    const router = new MessageRouter(deps as any);
    const mm = { synthesizeSpeech: vi.fn() };
    router.setMultimodalDeps({ multimodalManager: mm as any });
    expect((router as any).deps.multimodalManager).toBe(mm);
  });

  it('injects getActivePersonality if provided', () => {
    const deps = makeDeps();
    const router = new MessageRouter(deps as any);
    const getAP = vi.fn();
    router.setMultimodalDeps({ multimodalManager: null, getActivePersonality: getAP });
    expect((router as any).deps.getActivePersonality).toBe(getAP);
  });
});

describe('MessageRouter.setOutboundWebhookDispatcher()', () => {
  it('sets the dispatcher', () => {
    const deps = makeDeps();
    const router = new MessageRouter(deps as any);
    const dispatcher = { dispatch: vi.fn() };
    router.setOutboundWebhookDispatcher(dispatcher as any);
    expect((router as any).deps.outboundWebhookDispatcher).toBe(dispatcher);
  });

  it('accepts null', () => {
    const deps = makeDeps();
    const router = new MessageRouter(deps as any);
    router.setOutboundWebhookDispatcher(null);
    expect((router as any).deps.outboundWebhookDispatcher).toBeNull();
  });
});
