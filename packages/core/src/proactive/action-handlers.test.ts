import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeMessageAction,
  executeWebhookAction,
  executeRemindAction,
  executeExecuteAction,
  executeLearnAction,
} from './action-handlers.js';
import type { ProactiveManagerDeps } from './types.js';
import type {
  MessageAction,
  WebhookAction,
  RemindAction,
  ExecuteAction,
  LearnAction,
} from '@friday/shared';

// ── Mock Logger ──────────────────────────────────────────────────

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

// ── Mock BrainManager ────────────────────────────────────────────

const mockBrainManager = {
  remember: vi.fn().mockResolvedValue({ id: 'mem-1' }),
  recall: vi.fn().mockResolvedValue([]),
};

// ── Mock IntegrationManager ──────────────────────────────────────

const mockSendMessage = vi.fn().mockResolvedValue(undefined);

const mockIntegrationManager = {
  listIntegrations: vi.fn().mockResolvedValue([]),
  getAdapter: vi.fn().mockReturnValue(null),
  getRunningCount: vi.fn().mockReturnValue(0),
};

// ── Deps builder ─────────────────────────────────────────────────

function makeDeps(overrides?: Partial<ProactiveManagerDeps>): ProactiveManagerDeps {
  return {
    logger: mockLogger as any,
    brainManager: mockBrainManager as any,
    integrationManager: mockIntegrationManager as any,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('executeMessageAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMessage.mockResolvedValue(undefined);
    mockIntegrationManager.listIntegrations.mockResolvedValue([]);
    mockIntegrationManager.getAdapter.mockReturnValue(null);
  });

  it('returns failure when integrationManager is not available', async () => {
    const action: MessageAction = { type: 'message', content: 'Hello!' };
    const deps = makeDeps({ integrationManager: undefined });

    const result = await executeMessageAction(action, deps);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Integration manager not available');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Integration manager not available for message action',
    );
  });

  it('sends message to all running integrations when no channel filter', async () => {
    const adapter1 = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    const adapter2 = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    mockIntegrationManager.listIntegrations.mockResolvedValue([
      { id: 'i1', platform: 'telegram', enabled: true },
      { id: 'i2', platform: 'discord', enabled: true },
    ]);
    mockIntegrationManager.getAdapter.mockImplementation((id: string) => {
      if (id === 'i1') return adapter1;
      if (id === 'i2') return adapter2;
      return null;
    });

    const action: MessageAction = { type: 'message', content: 'Broadcast!' };
    const result = await executeMessageAction(action, makeDeps());

    expect(result.success).toBe(true);
    expect(result.data?.sentCount).toBe(2);
    expect(adapter1.sendMessage).toHaveBeenCalledWith('proactive', 'Broadcast!');
    expect(adapter2.sendMessage).toHaveBeenCalledWith('proactive', 'Broadcast!');
  });

  it('sends message only to matching channel when channel filter is set', async () => {
    const telegramAdapter = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    const discordAdapter = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    mockIntegrationManager.listIntegrations.mockResolvedValue([
      { id: 'i1', platform: 'telegram', enabled: true },
      { id: 'i2', platform: 'discord', enabled: true },
    ]);
    mockIntegrationManager.getAdapter.mockImplementation((id: string) => {
      if (id === 'i1') return telegramAdapter;
      if (id === 'i2') return discordAdapter;
      return null;
    });

    const action: MessageAction = { type: 'message', content: 'Telegram only!', channel: 'telegram' };
    const result = await executeMessageAction(action, makeDeps());

    expect(result.success).toBe(true);
    expect(result.data?.sentCount).toBe(1);
    expect(telegramAdapter.sendMessage).toHaveBeenCalledWith('proactive', 'Telegram only!');
    expect(discordAdapter.sendMessage).not.toHaveBeenCalled();
  });

  it('returns success with sentCount 0 when no integrations running', async () => {
    mockIntegrationManager.listIntegrations.mockResolvedValue([]);
    const action: MessageAction = { type: 'message', content: 'No one listening' };
    const result = await executeMessageAction(action, makeDeps());

    expect(result.success).toBe(true);
    expect(result.data?.sentCount).toBe(0);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'No integrations available for proactive message, logging to memory',
    );
  });

  it('continues sending to other integrations when one fails', async () => {
    const failAdapter = { sendMessage: vi.fn().mockRejectedValue(new Error('Connection failed')) };
    const okAdapter = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    mockIntegrationManager.listIntegrations.mockResolvedValue([
      { id: 'i1', platform: 'telegram', enabled: true },
      { id: 'i2', platform: 'discord', enabled: true },
    ]);
    mockIntegrationManager.getAdapter.mockImplementation((id: string) => {
      if (id === 'i1') return failAdapter;
      if (id === 'i2') return okAdapter;
      return null;
    });

    const action: MessageAction = { type: 'message', content: 'Hello!' };
    const result = await executeMessageAction(action, makeDeps());

    expect(result.success).toBe(true);
    expect(result.data?.sentCount).toBe(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Failed to send proactive message via integration',
      expect.objectContaining({ platform: 'telegram' }),
    );
  });

  it('returns success message with correct channel count', async () => {
    const adapter = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    mockIntegrationManager.listIntegrations.mockResolvedValue([
      { id: 'i1', platform: 'slack', enabled: true },
    ]);
    mockIntegrationManager.getAdapter.mockReturnValue(adapter);

    const action: MessageAction = { type: 'message', content: 'Test' };
    const result = await executeMessageAction(action, makeDeps());

    expect(result.message).toBe('Message sent to 1 channel(s)');
  });

  it('handles unexpected error during listIntegrations', async () => {
    mockIntegrationManager.listIntegrations.mockRejectedValue(new Error('Unexpected error'));

    const action: MessageAction = { type: 'message', content: 'Test' };
    const result = await executeMessageAction(action, makeDeps());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unexpected error');
  });
});

// ── executeWebhookAction ──────────────────────────────────────────

describe('executeWebhookAction', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('makes a POST request and returns success on 200', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    });

    const action: WebhookAction = {
      type: 'webhook',
      url: 'https://example.com/hook',
      method: 'POST',
      timeoutMs: 5000,
    };
    const result = await executeWebhookAction(action, makeDeps());

    expect(result.success).toBe(true);
    expect(result.message).toBe('Webhook OK (200)');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('defaults to POST method when not specified', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });

    const action: WebhookAction = {
      type: 'webhook',
      url: 'https://example.com/hook',
      method: 'POST',
      timeoutMs: 5000,
    };
    await executeWebhookAction(action, makeDeps());

    const fetchOptions = mockFetch.mock.calls[0][1];
    expect(fetchOptions.method).toBe('POST');
  });

  it('sends custom headers when provided', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });

    const action: WebhookAction = {
      type: 'webhook',
      url: 'https://example.com/hook',
      method: 'POST',
      headers: { 'X-Secret': 'my-token' },
      timeoutMs: 5000,
    };
    await executeWebhookAction(action, makeDeps());

    const fetchOptions = mockFetch.mock.calls[0][1];
    expect(fetchOptions.headers['X-Secret']).toBe('my-token');
  });

  it('sends custom body when provided', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });

    const action: WebhookAction = {
      type: 'webhook',
      url: 'https://example.com/hook',
      method: 'POST',
      body: JSON.stringify({ event: 'trigger_fired' }),
      timeoutMs: 5000,
    };
    await executeWebhookAction(action, makeDeps());

    const fetchOptions = mockFetch.mock.calls[0][1];
    expect(fetchOptions.body).toBe(JSON.stringify({ event: 'trigger_fired' }));
  });

  it('sends default body with source and timestamp when no body provided', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });

    const action: WebhookAction = {
      type: 'webhook',
      url: 'https://example.com/hook',
      method: 'POST',
      timeoutMs: 5000,
    };
    await executeWebhookAction(action, makeDeps());

    const fetchOptions = mockFetch.mock.calls[0][1];
    const body = JSON.parse(fetchOptions.body);
    expect(body.source).toBe('friday-proactive');
    expect(body.timestamp).toBeTypeOf('number');
  });

  it('retries on failure and returns failure after max retries', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const action: WebhookAction = {
      type: 'webhook',
      url: 'https://example.com/hook',
      method: 'POST',
      timeoutMs: 5000,
    };
    const result = await executeWebhookAction(action, makeDeps());

    expect(result.success).toBe(false);
    expect(result.message).toBe('Webhook failed after retries');
    expect(result.error).toBe('Network error');
    // 3 attempts: initial + 2 retries
    expect(mockFetch).toHaveBeenCalledTimes(3);
  }, 15000);

  it('returns failure on non-ok HTTP response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });

    const action: WebhookAction = {
      type: 'webhook',
      url: 'https://example.com/hook',
      method: 'POST',
      timeoutMs: 5000,
    };
    const result = await executeWebhookAction(action, makeDeps());

    expect(result.success).toBe(false);
    expect(result.error).toContain('503');
  }, 15000);

  it('succeeds on first retry after initial failure', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });

    const action: WebhookAction = {
      type: 'webhook',
      url: 'https://example.com/hook',
      method: 'POST',
      timeoutMs: 5000,
    };
    const result = await executeWebhookAction(action, makeDeps());

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  }, 10000);

  it('logs success with attempt number', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201, statusText: 'Created' });

    const action: WebhookAction = {
      type: 'webhook',
      url: 'https://example.com/hook',
      method: 'POST',
      timeoutMs: 5000,
    };
    await executeWebhookAction(action, makeDeps());

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Proactive webhook executed',
      expect.objectContaining({ url: 'https://example.com/hook', attempt: 1 }),
    );
  });
});

// ── executeRemindAction ───────────────────────────────────────────

describe('executeRemindAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBrainManager.remember.mockResolvedValue({ id: 'mem-1' });
  });

  it('stores reminder in brain memory', async () => {
    const action: RemindAction = {
      type: 'remind',
      content: 'Check on the deployment',
      category: 'deployment',
    };
    const result = await executeRemindAction(action, makeDeps());

    expect(result.success).toBe(true);
    expect(result.message).toBe('Reminder stored in memory');
    expect(mockBrainManager.remember).toHaveBeenCalledWith(
      'procedural',
      'Check on the deployment',
      'deployment',
      { source: 'proactive_remind' },
      0.7,
    );
  });

  it('uses default category when not specified', async () => {
    const action: RemindAction = {
      type: 'remind',
      content: 'Do something',
      category: 'proactive_reminder',
    };
    await executeRemindAction(action, makeDeps());

    expect(mockBrainManager.remember).toHaveBeenCalledWith(
      'procedural',
      'Do something',
      'proactive_reminder',
      { source: 'proactive_remind' },
      0.7,
    );
  });

  it('logs the stored reminder with category', async () => {
    const action: RemindAction = {
      type: 'remind',
      content: 'Morning standup',
      category: 'standup',
    };
    await executeRemindAction(action, makeDeps());

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Proactive reminder stored',
      expect.objectContaining({ category: 'standup' }),
    );
  });

  it('returns failure when brainManager.remember throws', async () => {
    mockBrainManager.remember.mockRejectedValue(new Error('Brain unavailable'));

    const action: RemindAction = {
      type: 'remind',
      content: 'Reminder',
      category: 'test',
    };
    const result = await executeRemindAction(action, makeDeps());

    expect(result.success).toBe(false);
    expect(result.message).toBe('Failed to store reminder');
    expect(result.error).toBe('Brain unavailable');
  });

  it('handles non-Error throw gracefully', async () => {
    mockBrainManager.remember.mockRejectedValue('string error');

    const action: RemindAction = { type: 'remind', content: 'Test', category: 'test' };
    const result = await executeRemindAction(action, makeDeps());

    expect(result.success).toBe(false);
    expect(result.error).toBe('string error');
  });
});

// ── executeExecuteAction ──────────────────────────────────────────

describe('executeExecuteAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queues task and returns success', async () => {
    const action: ExecuteAction = {
      type: 'execute',
      taskName: 'run-weekly-report',
      agentProfile: 'analyst',
    };
    const result = await executeExecuteAction(action, makeDeps());

    expect(result.success).toBe(true);
    expect(result.message).toBe('Task "run-weekly-report" queued for execution');
    expect(result.data?.taskName).toBe('run-weekly-report');
    expect(result.data?.agentProfile).toBe('analyst');
  });

  it('logs the execute request with taskName and agentProfile', async () => {
    const action: ExecuteAction = {
      type: 'execute',
      taskName: 'analyze-logs',
      agentProfile: 'ops',
    };
    await executeExecuteAction(action, makeDeps());

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Proactive execute action requested',
      { taskName: 'analyze-logs', agentProfile: 'ops' },
    );
  });

  it('works without agentProfile', async () => {
    const action: ExecuteAction = {
      type: 'execute',
      taskName: 'sync-data',
    };
    const result = await executeExecuteAction(action, makeDeps());

    expect(result.success).toBe(true);
    expect(result.data?.taskName).toBe('sync-data');
    expect(result.data?.agentProfile).toBeUndefined();
  });

  it('works without taskInput', async () => {
    const action: ExecuteAction = {
      type: 'execute',
      taskName: 'cleanup',
    };
    const result = await executeExecuteAction(action, makeDeps());

    expect(result.success).toBe(true);
  });
});

// ── executeLearnAction ────────────────────────────────────────────

describe('executeLearnAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBrainManager.remember.mockResolvedValue({ id: 'mem-2' });
  });

  it('stores knowledge in brain memory', async () => {
    const action: LearnAction = {
      type: 'learn',
      content: 'The deployment pipeline runs every Friday at 5pm',
      category: 'deployment',
      memoryType: 'procedural',
      importance: 0.8,
    };
    const result = await executeLearnAction(action, makeDeps());

    expect(result.success).toBe(true);
    expect(result.message).toBe('Knowledge stored in memory');
    expect(mockBrainManager.remember).toHaveBeenCalledWith(
      'procedural',
      'The deployment pipeline runs every Friday at 5pm',
      'deployment',
      { source: 'proactive_learn' },
      0.8,
    );
  });

  it('uses default memoryType of procedural when not specified', async () => {
    const action: LearnAction = {
      type: 'learn',
      content: 'Fact to learn',
      category: 'general',
      memoryType: 'procedural',
      importance: 0.6,
    };
    await executeLearnAction(action, makeDeps());

    expect(mockBrainManager.remember).toHaveBeenCalledWith(
      'procedural',
      expect.any(String),
      expect.any(String),
      expect.any(Object),
      expect.any(Number),
    );
  });

  it('uses default importance of 0.6 when not specified', async () => {
    const action: LearnAction = {
      type: 'learn',
      content: 'Something to know',
      category: 'proactive_learning',
      memoryType: 'procedural',
      importance: 0.6,
    };
    await executeLearnAction(action, makeDeps());

    expect(mockBrainManager.remember).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(Object),
      0.6,
    );
  });

  it('uses semantic memoryType when specified', async () => {
    const action: LearnAction = {
      type: 'learn',
      content: 'Semantic fact',
      category: 'facts',
      memoryType: 'semantic',
      importance: 0.7,
    };
    await executeLearnAction(action, makeDeps());

    expect(mockBrainManager.remember).toHaveBeenCalledWith(
      'semantic',
      'Semantic fact',
      'facts',
      { source: 'proactive_learn' },
      0.7,
    );
  });

  it('logs the stored knowledge with category and memoryType', async () => {
    const action: LearnAction = {
      type: 'learn',
      content: 'Test knowledge',
      category: 'test-cat',
      memoryType: 'episodic',
      importance: 0.5,
    };
    await executeLearnAction(action, makeDeps());

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Proactive learn action stored',
      expect.objectContaining({ category: 'test-cat', memoryType: 'episodic' }),
    );
  });

  it('returns failure when brainManager.remember throws', async () => {
    mockBrainManager.remember.mockRejectedValue(new Error('Storage error'));

    const action: LearnAction = {
      type: 'learn',
      content: 'Will fail',
      category: 'test',
      memoryType: 'procedural',
      importance: 0.6,
    };
    const result = await executeLearnAction(action, makeDeps());

    expect(result.success).toBe(false);
    expect(result.message).toBe('Failed to store knowledge');
    expect(result.error).toBe('Storage error');
  });

  it('handles non-Error throw gracefully', async () => {
    mockBrainManager.remember.mockRejectedValue(42);

    const action: LearnAction = {
      type: 'learn',
      content: 'Test',
      category: 'test',
      memoryType: 'procedural',
      importance: 0.6,
    };
    const result = await executeLearnAction(action, makeDeps());

    expect(result.success).toBe(false);
    expect(result.error).toBe('42');
  });
});
