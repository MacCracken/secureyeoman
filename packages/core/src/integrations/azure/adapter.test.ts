import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AzureDevOpsIntegration } from './adapter.js';
import type { IntegrationConfig } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';

// ── Fetch mock ────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeConfig(overrides: Record<string, unknown> = {}): IntegrationConfig {
  return {
    id: 'azure-1',
    platform: 'azure',
    displayName: 'Test Azure DevOps',
    enabled: true,
    status: 'disconnected',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      organizationUrl: 'https://dev.azure.com/myorg',
      personalAccessToken: 'my-pat-token',
      project: 'MyProject',
      webhookSecret: 'webhook-secret',
      ...overrides,
    },
  };
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as any,
    onMessage,
  };
}

function makeWorkItemPayload(
  eventType: 'workitem.created' | 'workitem.updated' = 'workitem.created'
): string {
  return JSON.stringify({
    eventType,
    resource: {
      id: 42,
      fields: {
        'System.Title': 'Fix the bug',
        'System.State': 'Active',
        'System.WorkItemType': 'Bug',
        'System.ChangedBy': 'John Doe',
      },
      url: 'https://dev.azure.com/myorg/MyProject/_workitems/42',
    },
    resourceContainers: {
      project: { id: 'proj-123', baseUrl: 'https://dev.azure.com/myorg' },
    },
  });
}

function makeBuildPayload(): string {
  return JSON.stringify({
    eventType: 'build.complete',
    resource: {
      id: 1001,
      buildNumber: '20240101.1',
      status: 'completed',
      result: 'succeeded',
      definition: { name: 'CI Pipeline' },
      requestedFor: { displayName: 'Jane Smith', uniqueName: 'jane@example.com' },
      url: 'https://dev.azure.com/myorg/MyProject/_build/1001',
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AzureDevOpsIntegration – adapter.ts', () => {
  let adapter: AzureDevOpsIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    adapter = new AzureDevOpsIntegration();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    try { await adapter.stop(); } catch { /* ignore */ }
  });

  // ── Platform metadata ─────────────────────────────────────────────────────

  it('has platform = "azure"', () => {
    expect(adapter.platform).toBe('azure');
  });

  it('has platformRateLimit = { maxPerSecond: 10 }', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 10 });
  });

  it('isHealthy() returns false before init', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  // ── init() ────────────────────────────────────────────────────────────────

  describe('init()', () => {
    it('succeeds with valid config', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.toBeUndefined();
    });

    it('throws when organizationUrl is missing', async () => {
      await expect(
        adapter.init(makeConfig({ organizationUrl: '' }), makeDeps())
      ).rejects.toThrow('requires an organizationUrl');
    });

    it('throws when personalAccessToken is missing', async () => {
      await expect(
        adapter.init(makeConfig({ personalAccessToken: '' }), makeDeps())
      ).rejects.toThrow('requires a personalAccessToken');
    });

    it('throws when project is missing', async () => {
      await expect(
        adapter.init(makeConfig({ project: '' }), makeDeps())
      ).rejects.toThrow('requires a project name');
    });

    it('strips trailing slash from organizationUrl', async () => {
      await adapter.init(makeConfig({ organizationUrl: 'https://dev.azure.com/myorg/' }), makeDeps());
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 42 }) });
      await adapter.sendMessage('5', 'test');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://dev.azure.com/myorg/'),
        expect.any(Object)
      );
    });
  });

  // ── start() / stop() ──────────────────────────────────────────────────────

  describe('start() / stop()', () => {
    it('becomes healthy after start()', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('start() is idempotent', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('throws when start() called before init()', async () => {
      await expect(adapter.start()).rejects.toThrow('Integration not initialized');
    });

    it('stop() sets isHealthy() to false', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });

    it('stop() before start() is a no-op', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.stop()).resolves.toBeUndefined();
    });
  });

  // ── sendMessage() ─────────────────────────────────────────────────────────

  describe('sendMessage()', () => {
    it('posts a comment on a work item and returns the comment ID', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 99 }) });
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('42', 'Test comment');
      expect(id).toBe('99');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('workitems/42/comments'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('uses Basic auth with PAT', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 1 }) });
      await adapter.init(makeConfig(), makeDeps());
      await adapter.sendMessage('1', 'comment');
      const [, init] = mockFetch.mock.calls[0];
      expect((init as RequestInit).headers).toMatchObject({
        Authorization: expect.stringContaining('Basic '),
      });
    });

    it('sends the text in the JSON body', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 7 }) });
      await adapter.init(makeConfig(), makeDeps());
      await adapter.sendMessage('7', 'My comment text');
      const [, init] = mockFetch.mock.calls[0];
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({ text: 'My comment text' });
    });

    it('throws when chatId is not a valid number', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('not-a-number', 'text')).rejects.toThrow(
        'Invalid work item ID'
      );
    });

    it('throws when the API returns a non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, text: async () => 'Forbidden' });
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('1', 'text')).rejects.toThrow(
        'Failed to post Azure DevOps comment'
      );
    });
  });

  // ── testConnection() ──────────────────────────────────────────────────────

  describe('testConnection()', () => {
    it('returns ok=true when project API responds successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ name: 'MyProject', state: 'wellFormed' }),
      });
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toContain('MyProject');
      expect(result.message).toContain('wellFormed');
    });

    it('returns ok=false when project API returns an error', async () => {
      mockFetch.mockResolvedValue({ ok: false, text: async () => 'Unauthorized' });
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Azure DevOps API error');
    });

    it('returns ok=false when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toBe('Network error');
    });
  });

  // ── Webhook methods ───────────────────────────────────────────────────────

  describe('getWebhookPath()', () => {
    it('returns path with integration id', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.getWebhookPath()).toBe('/api/v1/webhooks/azure/azure-1');
    });
  });

  describe('verifyWebhook()', () => {
    it('returns true when signature matches webhookSecret', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.verifyWebhook('payload', 'webhook-secret')).toBe(true);
    });

    it('returns false when signature does not match', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.verifyWebhook('payload', 'wrong-secret')).toBe(false);
    });

    it('returns true when no webhookSecret is configured', async () => {
      await adapter.init(makeConfig({ webhookSecret: '' }), makeDeps());
      expect(adapter.verifyWebhook('payload', 'anything')).toBe(true);
    });
  });

  describe('handleWebhook()', () => {
    it('handles workitem.created event', async () => {
      const deps = makeDeps();
      await adapter.init(makeConfig(), deps);
      await adapter.start();
      await adapter.handleWebhook('workitem.created', makeWorkItemPayload('workitem.created'), 'webhook-secret');
      expect(deps.onMessage).toHaveBeenCalledTimes(1);
      const msg = deps.onMessage.mock.calls[0][0];
      expect(msg.platform).toBe('azure');
      expect(msg.text).toContain('created');
      expect(msg.text).toContain('Fix the bug');
      expect(msg.chatId).toBe('42');
    });

    it('handles workitem.updated event', async () => {
      const deps = makeDeps();
      await adapter.init(makeConfig(), deps);
      await adapter.start();
      await adapter.handleWebhook('workitem.updated', makeWorkItemPayload('workitem.updated'), 'webhook-secret');
      expect(deps.onMessage).toHaveBeenCalledTimes(1);
      const msg = deps.onMessage.mock.calls[0][0];
      expect(msg.text).toContain('updated');
    });

    it('handles build.complete event', async () => {
      const deps = makeDeps();
      await adapter.init(makeConfig(), deps);
      await adapter.start();
      await adapter.handleWebhook('build.complete', makeBuildPayload(), 'webhook-secret');
      expect(deps.onMessage).toHaveBeenCalledTimes(1);
      const msg = deps.onMessage.mock.calls[0][0];
      expect(msg.platform).toBe('azure');
      expect(msg.text).toContain('20240101.1');
      expect(msg.senderName).toBe('Jane Smith');
    });

    it('throws when token does not match webhookSecret', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(
        adapter.handleWebhook('event', makeWorkItemPayload(), 'wrong-token')
      ).rejects.toThrow('Invalid webhook token');
    });

    it('does nothing for unknown eventType', async () => {
      const deps = makeDeps();
      await adapter.init(makeConfig(), deps);
      await adapter.start();
      const payload = JSON.stringify({ eventType: 'unknown.event', resource: {} });
      await adapter.handleWebhook('unknown', payload, 'webhook-secret');
      expect(deps.onMessage).not.toHaveBeenCalled();
    });

    it('work item message includes metadata fields', async () => {
      const deps = makeDeps();
      await adapter.init(makeConfig(), deps);
      await adapter.start();
      await adapter.handleWebhook('workitem.created', makeWorkItemPayload(), 'webhook-secret');
      const msg = deps.onMessage.mock.calls[0][0];
      expect(msg.metadata).toMatchObject({
        event: 'workitem.created',
        workItemId: 42,
        workItemType: 'Bug',
        state: 'Active',
      });
    });

    it('build message includes build metadata', async () => {
      const deps = makeDeps();
      await adapter.init(makeConfig(), deps);
      await adapter.start();
      await adapter.handleWebhook('build.complete', makeBuildPayload(), 'webhook-secret');
      const msg = deps.onMessage.mock.calls[0][0];
      expect(msg.metadata).toMatchObject({
        event: 'build.complete',
        buildId: 1001,
        result: 'succeeded',
      });
    });
  });
});
