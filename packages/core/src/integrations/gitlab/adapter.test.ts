import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitLabIntegration } from './adapter.js';
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
    id: 'gitlab-test-1', platform: 'gitlab', displayName: 'GitLab Test',
    enabled: true, status: 'disconnected', messageCount: 0,
    createdAt: Date.now(), updatedAt: Date.now(),
    config: {
      personalAccessToken: 'glpat-abc123',
      webhookSecret: 'whsec_xyz',
      ...overrides,
    },
  } as IntegrationConfig;
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: mockLogger as any, onMessage };
}

function makePushPayload() {
  return JSON.stringify({
    object_kind: 'push',
    ref: 'refs/heads/main',
    user_name: 'Alice',
    user_username: 'alice',
    project: { path_with_namespace: 'org/repo', web_url: 'https://gitlab.com/org/repo' },
    commits: [{ id: 'abc', message: 'Fix bug', author: { name: 'Alice' } }],
    total_commits_count: 1,
  });
}

function makeMRPayload(action = 'open') {
  return JSON.stringify({
    object_kind: 'merge_request',
    user: { username: 'bob', name: 'Bob' },
    project: { path_with_namespace: 'org/repo', web_url: 'https://gitlab.com/org/repo' },
    object_attributes: {
      iid: 42, title: 'Add feature', state: 'opened', action,
      url: 'https://gitlab.com/org/repo/-/merge_requests/42',
      target_branch: 'main', source_branch: 'feat/x',
    },
  });
}

function makeNotePayload(extras: Record<string, unknown> = {}) {
  return JSON.stringify({
    object_kind: 'note',
    user: { username: 'carol', name: 'Carol' },
    project: { path_with_namespace: 'org/repo' },
    object_attributes: {
      id: 99, note: 'Looks good!', noteable_type: 'MergeRequest',
      url: 'https://gitlab.com/org/repo/-/merge_requests/42#note_99',
      created_at: '2024-01-01T00:00:00Z',
    },
    ...extras,
  });
}

function makeIssuePayload(action = 'open') {
  return JSON.stringify({
    object_kind: 'issue',
    user: { username: 'dave', name: 'Dave' },
    project: { path_with_namespace: 'org/repo' },
    object_attributes: {
      iid: 7, title: 'Bug report', state: 'opened', action,
      url: 'https://gitlab.com/org/repo/-/issues/7',
      created_at: '2024-01-01T00:00:00Z',
    },
  });
}

// ─── Tests ────────────────────────────────────────────────────

describe('GitLabIntegration', () => {
  let adapter: GitLabIntegration;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GitLabIntegration();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: vi.fn().mockResolvedValue(''),
      json: vi.fn().mockResolvedValue({ id: 1001, username: 'alice', name: 'Alice' }),
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has platform "gitlab"', () => {
    expect(adapter.platform).toBe('gitlab');
  });

  it('has rate limit of 10 per second', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 10 });
  });

  it('is not healthy before start', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  describe('init()', () => {
    it('initializes successfully with required fields', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('throws when personalAccessToken is missing', async () => {
      await expect(
        adapter.init(makeConfig({ personalAccessToken: '' }), makeDeps())
      ).rejects.toThrow('personalAccessToken');
    });

    it('throws when webhookSecret is missing', async () => {
      await expect(
        adapter.init(makeConfig({ webhookSecret: '' }), makeDeps())
      ).rejects.toThrow('webhookSecret');
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
    it('posts a note on an issue', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 555 }),
      });
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('org/repo/issues/7', 'Test comment');
      expect(id).toBe('555');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/issues/7/notes'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('posts a note on a merge request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 777 }),
      });
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('org/repo/merge_requests/42', 'Nice work');
      expect(id).toBe('777');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/merge_requests/42/notes'),
        expect.any(Object)
      );
    });

    it('includes PRIVATE-TOKEN header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 1 }),
      });
      await adapter.init(makeConfig(), makeDeps());
      await adapter.sendMessage('org/repo/issues/1', 'Hi');
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['PRIVATE-TOKEN']).toBe('glpat-abc123');
    });

    it('throws when chatId format is invalid', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('bad-format', 'text')).rejects.toThrow('Invalid chatId format');
    });

    it('throws when IID is not a number', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('org/repo/issues/abc', 'text')).rejects.toThrow('Invalid issue/MR IID');
    });

    it('throws when API returns error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: vi.fn().mockResolvedValue('Forbidden'),
      });
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('org/repo/issues/1', 'text')).rejects.toThrow('Failed to post GitLab note');
    });

    it('uses custom gitlabUrl', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 1 }),
      });
      await adapter.init(makeConfig({ gitlabUrl: 'https://gitlab.example.com' }), makeDeps());
      await adapter.sendMessage('org/repo/issues/1', 'text');
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('https://gitlab.example.com');
    });
  });

  describe('getWebhookPath()', () => {
    it('returns path with integration id', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.getWebhookPath()).toContain('gitlab-test-1');
    });
  });

  describe('verifyWebhook()', () => {
    it('returns true when signature matches secret', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.verifyWebhook('payload', 'whsec_xyz')).toBe(true);
    });

    it('returns false when signature does not match', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.verifyWebhook('payload', 'wrong')).toBe(false);
    });
  });

  describe('handleWebhook()', () => {
    it('throws on invalid token', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(
        adapter.handleWebhook('push', makePushPayload(), 'bad-token')
      ).rejects.toThrow('Invalid webhook token');
    });

    it('dispatches push event', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));
      await adapter.handleWebhook('Push Hook', makePushPayload(), 'whsec_xyz');
      expect(onMessage).toHaveBeenCalledOnce();
      const msg = onMessage.mock.calls[0][0];
      expect(msg.platform).toBe('gitlab');
      expect(msg.text).toContain('Fix bug');
    });

    it('dispatches merge_request event', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));
      await adapter.handleWebhook('Merge Request Hook', makeMRPayload(), 'whsec_xyz');
      expect(onMessage).toHaveBeenCalledOnce();
      const msg = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('MR !42');
    });

    it('dispatches note on MR', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));
      const payload = makeNotePayload({
        merge_request: { iid: 42, title: 'Add feature' },
      });
      await adapter.handleWebhook('Note Hook', payload, 'whsec_xyz');
      expect(onMessage).toHaveBeenCalledOnce();
      const msg = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('Looks good!');
      expect(msg.chatId).toContain('merge_requests/42');
    });

    it('dispatches note on issue', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));
      const payload = makeNotePayload({
        issue: { iid: 7, title: 'Bug report' },
      });
      await adapter.handleWebhook('Note Hook', payload, 'whsec_xyz');
      const msg = onMessage.mock.calls[0][0];
      expect(msg.chatId).toContain('issues/7');
    });

    it('dispatches issue event', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));
      await adapter.handleWebhook('Issue Hook', makeIssuePayload(), 'whsec_xyz');
      expect(onMessage).toHaveBeenCalledOnce();
      const msg = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('Issue #7');
    });

    it('ignores unknown event kinds', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));
      const unknown = JSON.stringify({ object_kind: 'pipeline' });
      await adapter.handleWebhook('Pipeline Hook', unknown, 'whsec_xyz');
      expect(onMessage).not.toHaveBeenCalled();
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
