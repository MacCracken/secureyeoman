import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LinearIntegration } from './adapter.js';
import type { IntegrationConfig } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import { createHmac } from 'crypto';

// ─── Helpers ──────────────────────────────────────────────────

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

function makeConfig(configOverrides: Record<string, unknown> = {}): IntegrationConfig {
  return {
    id: 'linear-test-1',
    platform: 'linear',
    displayName: 'Linear Test',
    enabled: true,
    status: 'disconnected',
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    config: { apiKey: 'lin_api_key_abc', teamId: 'team-123', ...configOverrides },
  } as IntegrationConfig;
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: mockLogger as any, onMessage };
}

function makeWebhookPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    action: 'create',
    type: 'Issue',
    data: {
      id: 'issue-abc',
      title: 'Test Issue',
      identifier: 'ENG-42',
      state: { name: 'In Progress' },
      assignee: { name: 'Alice' },
    },
    createdAt: '2024-01-01T12:00:00Z',
    organizationId: 'org-1',
    ...overrides,
  });
}

// ─── Tests ────────────────────────────────────────────────────

describe('LinearIntegration', () => {
  let adapter: LinearIntegration;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new LinearIntegration();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: { issueCreate: { issue: { identifier: 'ENG-99', id: 'abc' } } },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has platform "linear"', () => {
    expect(adapter.platform).toBe('linear');
  });

  it('has rate limit of 10 per second', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 10 });
  });

  it('is not healthy before start', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  describe('init()', () => {
    it('initializes successfully with apiKey', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('throws when apiKey is missing', async () => {
      await expect(adapter.init(makeConfig({ apiKey: '' }), makeDeps())).rejects.toThrow(
        'Linear integration requires an apiKey'
      );
    });

    it('throws when apiKey is undefined', async () => {
      const cfg = { ...makeConfig(), config: {} };
      await expect(adapter.init(cfg, makeDeps())).rejects.toThrow('apiKey');
    });
  });

  describe('start() / stop()', () => {
    it('becomes healthy after start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
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
    it('creates a Linear issue and returns identifier', async () => {
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('_', 'Fix the bug');
      expect(id).toBe('ENG-99');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.linear.app/graphql',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('returns noop when no teamId is configured', async () => {
      await adapter.init(makeConfig({ teamId: undefined }), makeDeps());
      const id = await adapter.sendMessage('_', 'hi');
      expect(id).toBe('linear_noop_no_team');
    });

    it('uses teamId from metadata when provided', async () => {
      await adapter.init(makeConfig({ teamId: '' }), makeDeps());
      await adapter.sendMessage('_', 'hi', { teamId: 'meta-team' });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.variables.teamId).toBe('meta-team');
    });

    it('returns linear_error when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('_', 'hi');
      expect(id).toBe('linear_error');
    });

    it('includes Authorization header with apiKey', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.sendMessage('_', 'hi');
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['Authorization']).toBe('lin_api_key_abc');
    });
  });

  describe('getWebhookPath()', () => {
    it('returns /webhooks/linear', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.getWebhookPath()).toBe('/webhooks/linear');
    });
  });

  describe('verifyWebhook()', () => {
    it('returns true when no secret configured', async () => {
      await adapter.init(makeConfig({ webhookSecret: undefined }), makeDeps());
      expect(adapter.verifyWebhook('payload', 'any-sig')).toBe(true);
    });

    it('returns true for valid HMAC-SHA256 signature', async () => {
      const secret = 'my-linear-secret';
      const payload = '{"action":"create"}';
      const sig = createHmac('sha256', secret).update(payload).digest('hex');
      await adapter.init(makeConfig({ webhookSecret: secret }), makeDeps());
      expect(adapter.verifyWebhook(payload, sig)).toBe(true);
    });

    it('returns false for invalid signature', async () => {
      await adapter.init(makeConfig({ webhookSecret: 'secret' }), makeDeps());
      expect(adapter.verifyWebhook('payload', 'bad-sig')).toBe(false);
    });
  });

  describe('handleWebhook()', () => {
    it('parses Issue create event and calls onMessage', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      await adapter.handleWebhook(makeWebhookPayload(), '');

      expect(onMessage).toHaveBeenCalledOnce();
      const msg = onMessage.mock.calls[0][0];
      expect(msg.platform).toBe('linear');
      expect(msg.text).toContain('ENG-42');
      expect(msg.text).toContain('Test Issue');
    });

    it('parses Issue update event', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      await adapter.handleWebhook(makeWebhookPayload({ action: 'update' }), '');

      const msg = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('updated');
    });

    it('parses Issue remove event', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      await adapter.handleWebhook(makeWebhookPayload({ action: 'remove' }), '');

      const msg = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('removed');
    });

    it('parses Comment event', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      const payload = makeWebhookPayload({
        type: 'Comment',
        data: { id: 'c1', body: 'Great work!', userId: 'user-1' },
      });
      await adapter.handleWebhook(payload, '');

      const msg = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('Great work!');
    });

    it('handles unknown type gracefully', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig(), makeDeps(onMessage));

      await adapter.handleWebhook(
        makeWebhookPayload({ type: 'Project', action: 'create', data: { id: 'p1' } }),
        ''
      );

      const msg = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('Linear event');
    });

    it('does not throw on invalid JSON', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.handleWebhook('not-json', '')).resolves.not.toThrow();
    });

    it('does nothing when deps are not set', async () => {
      await expect(adapter.handleWebhook('{}', '')).resolves.not.toThrow();
    });
  });

  describe('testConnection()', () => {
    it('returns ok=true with viewer info', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: { viewer: { name: 'Alice', organization: { name: 'Acme' } } },
        }),
      });
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toContain('Alice');
    });

    it('returns ok=false when API errors', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ errors: [{ message: 'Unauthorized' }] }),
      });
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
    });

    it('returns ok=false on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401 });
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
    });

    it('returns ok=false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
    });
  });
});
