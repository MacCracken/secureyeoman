import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GmailIntegration } from './adapter.js';
import type { IntegrationConfig } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';

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

function makeConfig(overrides: Record<string, unknown> = {}): IntegrationConfig {
  return {
    id: 'gmail-test-1',
    platform: 'gmail',
    displayName: 'Gmail Test',
    enabled: true,
    status: 'disconnected',
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    config: {
      accessToken: 'ya29.access',
      refreshToken: 'refresh123',
      tokenExpiresAt: Date.now() + 3600_000,
      email: 'user@gmail.com',
      enableRead: true,
      enableSend: true,
      labelFilter: 'all',
      pollIntervalMs: 30000,
      ...overrides,
    },
  } as IntegrationConfig;
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: mockLogger as any, onMessage };
}

function makeProfileResponse() {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({ emailAddress: 'user@gmail.com', historyId: 'h-100' }),
    text: vi.fn().mockResolvedValue(''),
  };
}

function makeHistoryResponse(messageIds: string[] = []) {
  const history = messageIds.map((id) => ({
    id: `h-${id}`,
    messagesAdded: [{ message: { id, threadId: `t-${id}`, labelIds: ['INBOX'] } }],
  }));
  return {
    ok: true,
    json: vi
      .fn()
      .mockResolvedValue({ history: history.length ? history : undefined, historyId: 'h-200' }),
    text: vi.fn().mockResolvedValue(''),
  };
}

function makeMessageResponse(id = 'msg-1') {
  const bodyData = Buffer.from('Hello from email').toString('base64url');
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      id,
      threadId: `t-${id}`,
      labelIds: ['INBOX'],
      snippet: 'Hello',
      internalDate: '1700000000000',
      payload: {
        mimeType: 'text/plain',
        headers: [
          { name: 'From', value: 'Alice <alice@example.com>' },
          { name: 'Subject', value: 'Test Subject' },
          { name: 'Message-ID', value: '<msg-id@example.com>' },
        ],
        body: { data: bodyData, size: 16 },
        parts: undefined,
      },
    }),
    text: vi.fn().mockResolvedValue(''),
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe('GmailIntegration', () => {
  let adapter: GmailIntegration;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    adapter = new GmailIntegration();
    // Default: profile fetch succeeds
    mockFetch = vi.fn().mockResolvedValue(makeProfileResponse());
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('has platform "gmail"', () => {
    expect(adapter.platform).toBe('gmail');
  });

  it('has rate limit of 2 per second', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 2 });
  });

  it('is not healthy before start', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  describe('init()', () => {
    it('initializes successfully and fetches profile', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/profile'),
        expect.any(Object)
      );
    });

    it('throws when accessToken is missing', async () => {
      await expect(adapter.init(makeConfig({ accessToken: '' }), makeDeps())).rejects.toThrow(
        'accessToken and refreshToken'
      );
    });

    it('throws when refreshToken is missing', async () => {
      await expect(adapter.init(makeConfig({ refreshToken: '' }), makeDeps())).rejects.toThrow(
        'accessToken and refreshToken'
      );
    });

    it('throws when profile fetch fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: vi.fn().mockResolvedValue('Unauthorized'),
      });
      await expect(adapter.init(makeConfig(), makeDeps())).rejects.toThrow(
        'Failed to fetch Gmail profile'
      );
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

    it('does not start polling when enableRead is false', async () => {
      await adapter.init(makeConfig({ enableRead: false }), makeDeps());
      await adapter.start();
      mockFetch.mockClear();
      await vi.advanceTimersByTimeAsync(31000);
      // No history poll calls
      const historyCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
        url.includes('/history')
      );
      expect(historyCalls.length).toBe(0);
    });

    it('clears poll timer on stop', async () => {
      await adapter.init(makeConfig({ pollIntervalMs: 1000 }), makeDeps());
      await adapter.start();
      await adapter.stop();
      mockFetch.mockClear();
      await vi.advanceTimersByTimeAsync(5000);
      const historyCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
        url.includes('/history')
      );
      expect(historyCalls.length).toBe(0);
    });

    it('resolves label when labelFilter is "label"', async () => {
      mockFetch
        .mockResolvedValueOnce(makeProfileResponse()) // profile during init
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            labels: [{ id: 'Label_1', name: 'friday' }],
          }),
        }) // labels fetch
        .mockResolvedValueOnce(makeProfileResponse()); // profile to seed historyId

      await adapter.init(
        makeConfig({ labelFilter: 'label', labelName: 'friday', lastHistoryId: undefined }),
        makeDeps()
      );
      await adapter.start();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/labels'),
        expect.any(Object)
      );
    });
  });

  describe('sendMessage()', () => {
    it('sends an email and returns message id', async () => {
      await adapter.init(makeConfig(), makeDeps());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'sent-msg-1' }),
      });
      const id = await adapter.sendMessage('recipient@example.com', 'Hello there');
      expect(id).toBe('sent-msg-1');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/messages/send'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('includes Authorization header', async () => {
      await adapter.init(makeConfig(), makeDeps());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'm1' }),
      });
      await adapter.sendMessage('to@example.com', 'Hi');
      const calls = mockFetch.mock.calls;
      const sendCall = calls.find(([url]: [string]) => url.includes('/messages/send'));
      expect(sendCall![1].headers['Authorization']).toContain('Bearer ya29.access');
    });

    it('uses custom subject from metadata', async () => {
      await adapter.init(makeConfig(), makeDeps());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'm1' }),
      });
      await adapter.sendMessage('to@example.com', 'Hi', { subject: 'Custom Subject' });
      const sendCall = mockFetch.mock.calls.find(([url]: [string]) =>
        url.includes('/messages/send')
      );
      const body = JSON.parse(sendCall![1].body);
      // raw is base64url, decode and check Subject header
      const decoded = Buffer.from(body.raw, 'base64url').toString('utf-8');
      expect(decoded).toContain('Subject: Custom Subject');
    });

    it('throws when enableSend is false', async () => {
      await adapter.init(makeConfig({ enableSend: false }), makeDeps());
      await expect(adapter.sendMessage('to@example.com', 'Hi')).rejects.toThrow(
        'Gmail send is not enabled'
      );
    });

    it('throws when API returns error', async () => {
      await adapter.init(makeConfig(), makeDeps());
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: vi.fn().mockResolvedValue('Rate limit exceeded'),
      });
      await expect(adapter.sendMessage('to@example.com', 'Hi')).rejects.toThrow(
        'Failed to send Gmail message'
      );
    });

    it('includes threadId in request body when provided', async () => {
      await adapter.init(makeConfig(), makeDeps());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'm1' }),
      });
      await adapter.sendMessage('to@example.com', 'Reply', { threadId: 'thread-123' });
      const sendCall = mockFetch.mock.calls.find(([url]: [string]) =>
        url.includes('/messages/send')
      );
      const body = JSON.parse(sendCall![1].body);
      expect(body.threadId).toBe('thread-123');
    });
  });

  describe('polling', () => {
    it('dispatches new messages from history', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      // Init: profile fetch
      mockFetch.mockResolvedValueOnce(makeProfileResponse());
      // Start: profile fetch for historyId seed
      mockFetch.mockResolvedValueOnce(makeProfileResponse());
      await adapter.init(
        makeConfig({ pollIntervalMs: 1000, lastHistoryId: undefined }),
        makeDeps(onMessage)
      );
      await adapter.start();

      // Poll: history returns a new message
      mockFetch.mockResolvedValueOnce(makeHistoryResponse(['msg-abc']));
      // Fetch full message
      mockFetch.mockResolvedValueOnce(makeMessageResponse('msg-abc'));

      await vi.advanceTimersByTimeAsync(1001);

      expect(onMessage).toHaveBeenCalledOnce();
      const msg = onMessage.mock.calls[0][0];
      expect(msg.platform).toBe('gmail');
      expect(msg.senderId).toBe('alice@example.com');
      expect(msg.senderName).toBe('Alice');
    });

    it('skips SENT messages', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce(makeProfileResponse()); // init profile
      await adapter.init(makeConfig({ pollIntervalMs: 1000 }), makeDeps(onMessage));
      await adapter.start();

      // History with a SENT message
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          history: [
            {
              id: 'h1',
              messagesAdded: [{ message: { id: 'sent-1', threadId: 't1', labelIds: ['SENT'] } }],
            },
          ],
          historyId: 'h-201',
        }),
      });

      await vi.advanceTimersByTimeAsync(1001);
      expect(onMessage).not.toHaveBeenCalled();
    });

    it('handles 404 history by resetting historyId', async () => {
      mockFetch.mockResolvedValueOnce(makeProfileResponse()); // init profile
      await adapter.init(makeConfig({ pollIntervalMs: 1000 }), makeDeps());
      await adapter.start();

      // History returns 404
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      // Profile fetch for reset
      mockFetch.mockResolvedValueOnce(makeProfileResponse());

      await vi.advanceTimersByTimeAsync(1001);
      // No error thrown
    });

    it('warns on history fetch failure', async () => {
      mockFetch.mockResolvedValueOnce(makeProfileResponse()); // init profile
      await adapter.init(makeConfig({ pollIntervalMs: 1000 }), makeDeps());
      await adapter.start();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal error'),
      });

      await vi.advanceTimersByTimeAsync(1001);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});
