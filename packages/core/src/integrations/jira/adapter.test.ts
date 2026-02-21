import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JiraIntegration } from './adapter.js';
import type { IntegrationConfig } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────

const mockLogger = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

function makeConfig(overrides: Record<string, unknown> = {}): IntegrationConfig {
  return {
    id: 'jira-test-1', platform: 'jira', displayName: 'Jira Test',
    enabled: true, status: 'disconnected', messageCount: 0,
    createdAt: Date.now(), updatedAt: Date.now(),
    config: {
      instanceUrl: 'https://myorg.atlassian.net',
      email: 'user@example.com',
      apiToken: 'tok_abc123',
      projectKey: 'PROJ',
      ...overrides,
    },
  } as IntegrationConfig;
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: mockLogger as any, onMessage };
}

function makeIssuePayload(event: 'jira:issue_created' | 'jira:issue_updated' = 'jira:issue_created') {
  return JSON.stringify({
    webhookEvent: event,
    user: { displayName: 'Alice', accountId: 'acc-1' },
    issue: {
      key: 'PROJ-42',
      fields: {
        summary: 'Fix the bug',
        status: { name: 'In Progress' },
        issuetype: { name: 'Bug' },
      },
    },
    ...(event === 'jira:issue_updated' ? {
      changelog: {
        items: [{ field: 'status', fromString: 'To Do', toString: 'In Progress' }],
      },
    } : {}),
  });
}

function makeCommentPayload(event: 'comment_created' | 'comment_updated' = 'comment_created') {
  return JSON.stringify({
    webhookEvent: event,
    comment: {
      id: 'cmt-99',
      body: 'Great work!',
      author: { displayName: 'Bob', accountId: 'acc-2' },
      created: '2024-01-01T00:00:00Z',
    },
    issue: {
      key: 'PROJ-42',
      fields: { summary: 'Fix the bug' },
    },
  });
}

// ─── Tests ────────────────────────────────────────────────────

describe('JiraIntegration', () => {
  let adapter: JiraIntegration;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new JiraIntegration();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: vi.fn().mockResolvedValue(''),
      json: vi.fn().mockResolvedValue({
        id: 'cmt-1',
        displayName: 'Alice',
        emailAddress: 'alice@example.com',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has platform "jira"', () => {
    expect(adapter.platform).toBe('jira');
  });

  it('has rate limit of 10 per second', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 10 });
  });

  it('is not healthy before start', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  describe('init()', () => {
    it('initializes successfully with all required fields', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('throws when instanceUrl is missing', async () => {
      await expect(
        adapter.init(makeConfig({ instanceUrl: '' }), makeDeps())
      ).rejects.toThrow('instanceUrl');
    });

    it('throws when email is missing', async () => {
      await expect(
        adapter.init(makeConfig({ email: '' }), makeDeps())
      ).rejects.toThrow('email and apiToken');
    });

    it('throws when apiToken is missing', async () => {
      await expect(
        adapter.init(makeConfig({ apiToken: '' }), makeDeps())
      ).rejects.toThrow('email and apiToken');
    });

    it('strips trailing slash from instanceUrl', async () => {
      await adapter.init(makeConfig({ instanceUrl: 'https://myorg.atlassian.net/' }), makeDeps());
      // Verify by making a sendMessage call and checking URL
      mockFetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ id: '1' }) });
      await adapter.sendMessage('PROJ-1', 'test');
      const [url] = mockFetch.mock.calls[0];
      expect(url).not.toContain('//rest');
    });
  });

  describe('start() / stop()', () => {
    it('becomes healthy after start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('throws when called before init', async () => {
      await expect(adapter.start()).rejects.toThrow('not initialized');
    });

    it('is idempotent — second start is no-op', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await expect(adapter.start()).resolves.not.toThrow();
    });

    it('becomes unhealthy after stop', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });
  });

  describe('sendMessage()', () => {
    it('posts a comment and returns comment id', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('PROJ-42', 'This is a comment');
      expect(id).toBe('cmt-1');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/issue/PROJ-42/comment'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('includes Basic Authorization header', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.sendMessage('PROJ-1', 'Hi');
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['Authorization']).toContain('Basic ');
    });

    it('sends ADF body format', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.sendMessage('PROJ-1', 'My comment');
      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.body.type).toBe('doc');
      expect(body.body.content[0].type).toBe('paragraph');
    });

    it('throws when API returns error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: vi.fn().mockResolvedValue('Forbidden'),
      });
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('PROJ-1', 'text')).rejects.toThrow('Failed to post Jira comment');
    });
  });

  describe('getWebhookPath()', () => {
    it('returns path with integration id', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const path = adapter.getWebhookPath();
      expect(path).toContain('jira-test-1');
    });
  });

  describe('verifyWebhook()', () => {
    it('returns true when no secret is configured', async () => {
      await adapter.init(makeConfig({ webhookSecret: undefined }), makeDeps());
      expect(adapter.verifyWebhook('payload', 'any-token')).toBe(true);
    });

    it('returns true when signature matches secret', async () => {
      await adapter.init(makeConfig({ webhookSecret: 'my-secret' }), makeDeps());
      expect(adapter.verifyWebhook('payload', 'my-secret')).toBe(true);
    });

    it('returns false when signature does not match', async () => {
      await adapter.init(makeConfig({ webhookSecret: 'my-secret' }), makeDeps());
      expect(adapter.verifyWebhook('payload', 'wrong')).toBe(false);
    });
  });

  describe('handleWebhook()', () => {
    it('throws on invalid token when secret is configured', async () => {
      await adapter.init(makeConfig({ webhookSecret: 'my-secret' }), makeDeps());
      await expect(
        adapter.handleWebhook('jira:issue_created', makeIssuePayload(), 'bad-token')
      ).rejects.toThrow('Invalid webhook token');
    });

    it('dispatches issue_created event', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));
      await adapter.handleWebhook('jira:issue_created', makeIssuePayload(), '');
      expect(onMessage).toHaveBeenCalledOnce();
      const msg = onMessage.mock.calls[0][0];
      expect(msg.platform).toBe('jira');
      expect(msg.text).toContain('PROJ-42');
      expect(msg.text).toContain('created');
      expect(msg.chatId).toBe('PROJ-42');
    });

    it('dispatches issue_updated event with changelog', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));
      await adapter.handleWebhook('jira:issue_updated', makeIssuePayload('jira:issue_updated'), '');
      const msg = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('updated');
      expect(msg.text).toContain('status');
    });

    it('dispatches comment_created event', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));
      await adapter.handleWebhook('comment_created', makeCommentPayload(), '');
      expect(onMessage).toHaveBeenCalledOnce();
      const msg = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('Great work!');
      expect(msg.senderId).toBe('acc-2');
    });

    it('dispatches comment_updated event', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));
      await adapter.handleWebhook('comment_updated', makeCommentPayload('comment_updated'), '');
      expect(onMessage).toHaveBeenCalledOnce();
    });

    it('ignores unknown events', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));
      const unknown = JSON.stringify({ webhookEvent: 'sprint:created', data: {} });
      await adapter.handleWebhook('sprint:created', unknown, '');
      expect(onMessage).not.toHaveBeenCalled();
    });

    it('accepts valid secret token', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig({ webhookSecret: 'sec' }), makeDeps(onMessage));
      await expect(
        adapter.handleWebhook('jira:issue_created', makeIssuePayload(), 'sec')
      ).resolves.not.toThrow();
    });
  });

  describe('testConnection()', () => {
    it('returns ok=true with user info', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toContain('Alice');
    });

    it('returns ok=false on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: vi.fn().mockResolvedValue('Unauthorized'),
      });
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
    });

    it('returns ok=false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toContain('ECONNREFUSED');
    });
  });
});
