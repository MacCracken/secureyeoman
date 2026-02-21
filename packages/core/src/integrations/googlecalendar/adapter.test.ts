import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleCalendarIntegration } from './adapter.js';
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
    id: 'gcal-test-1',
    platform: 'googlecalendar',
    displayName: 'Google Calendar Test',
    enabled: true,
    status: 'disconnected',
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    config: {
      accessToken: 'ya29.access_token',
      refreshToken: 'refresh_token_abc',
      tokenExpiresAt: Date.now() + 3600_000, // 1hr from now
      calendarId: 'primary',
      pollIntervalMs: 60000,
      ...overrides,
    },
  } as IntegrationConfig;
}

function makeDeps(
  onMessage = vi.fn().mockResolvedValue(undefined),
  oauthTokenService?: any
): IntegrationDeps {
  return { logger: mockLogger as any, onMessage, oauthTokenService } as any;
}

function makeCalendarEvent(id = 'evt-1', summary = 'Team Meeting') {
  return {
    id,
    summary,
    description: 'Discuss roadmap',
    start: { dateTime: '2024-06-01T10:00:00Z' },
    end: { dateTime: '2024-06-01T11:00:00Z' },
    creator: { email: 'organizer@example.com', displayName: 'Organizer' },
    updated: '2024-06-01T09:00:00Z',
    htmlLink: 'https://calendar.google.com/evt-1',
    status: 'confirmed',
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe('GoogleCalendarIntegration', () => {
  let adapter: GoogleCalendarIntegration;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    adapter = new GoogleCalendarIntegration();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(''),
      json: vi.fn().mockResolvedValue({ items: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('has platform "googlecalendar"', () => {
    expect(adapter.platform).toBe('googlecalendar');
  });

  it('has rate limit of 10 per second', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 10 });
  });

  it('is not healthy before start', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  describe('init()', () => {
    it('initializes successfully with accessToken and refreshToken', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('throws when accessToken is missing', async () => {
      await expect(
        adapter.init(makeConfig({ accessToken: '', refreshToken: 'r' }), makeDeps())
      ).rejects.toThrow('accessToken and refreshToken');
    });

    it('throws when refreshToken is missing', async () => {
      await expect(
        adapter.init(makeConfig({ accessToken: 'a', refreshToken: '' }), makeDeps())
      ).rejects.toThrow('accessToken and refreshToken');
    });

    it('uses oauthTokenService when provided', async () => {
      const oauthTokenService = {
        getValidToken: vi.fn().mockResolvedValue('oauth_access_token'),
      };
      await expect(
        adapter.init(
          makeConfig({ email: 'user@example.com' }),
          makeDeps(vi.fn(), oauthTokenService)
        )
      ).resolves.not.toThrow();
      expect(oauthTokenService.getValidToken).toHaveBeenCalledWith(
        'googlecalendar',
        'user@example.com'
      );
    });

    it('throws when oauthTokenService returns null token', async () => {
      const oauthTokenService = {
        getValidToken: vi.fn().mockResolvedValue(null),
      };
      await expect(
        adapter.init(
          makeConfig({ email: 'user@example.com' }),
          makeDeps(vi.fn(), oauthTokenService)
        )
      ).rejects.toThrow('No OAuth token found');
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

    it('clears the poll timer on stop', async () => {
      await adapter.init(makeConfig({ pollIntervalMs: 1000 }), makeDeps());
      await adapter.start();
      await adapter.stop();
      mockFetch.mockClear();
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage()', () => {
    it('creates a calendar event via quickAdd', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'new-event-id' }),
      });
      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('primary', 'Meeting tomorrow at 3pm');
      expect(id).toBe('new-event-id');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/events/quickAdd'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('uses configured calendarId when chatId is empty', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'evt-x' }),
      });
      await adapter.init(makeConfig({ calendarId: 'work@group.calendar.google.com' }), makeDeps());
      await adapter.sendMessage('', 'Team standup');
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('work%40group.calendar.google.com');
    });

    it('includes Authorization header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'e1' }),
      });
      await adapter.init(makeConfig(), makeDeps());
      await adapter.sendMessage('primary', 'Event');
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['Authorization']).toContain('Bearer ya29.access_token');
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: vi.fn().mockResolvedValue('Quota exceeded'),
      });
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('primary', 'Event')).rejects.toThrow(
        'Failed to create calendar event'
      );
    });
  });

  describe('polling', () => {
    it('dispatches new calendar events as UnifiedMessages', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig({ pollIntervalMs: 1000 }), makeDeps(onMessage));
      await adapter.start();

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ items: [makeCalendarEvent()] }),
      });

      await vi.advanceTimersByTimeAsync(1001);

      expect(onMessage).toHaveBeenCalledOnce();
      const msg = onMessage.mock.calls[0][0];
      expect(msg.platform).toBe('googlecalendar');
      expect(msg.text).toContain('Team Meeting');
    });

    it('formats event text with summary and start time', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig({ pollIntervalMs: 1000 }), makeDeps(onMessage));
      await adapter.start();

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ items: [makeCalendarEvent()] }),
      });

      await vi.advanceTimersByTimeAsync(1001);

      const msg = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('Calendar event:');
      expect(msg.text).toContain('Team Meeting');
      expect(msg.text).toContain('2024-06-01T10:00:00Z');
    });

    it('handles all-day events (date only)', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      await adapter.init(makeConfig({ pollIntervalMs: 1000 }), makeDeps(onMessage));
      await adapter.start();

      const allDayEvent = {
        ...makeCalendarEvent(),
        start: { date: '2024-06-01' },
        end: { date: '2024-06-02' },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ items: [allDayEvent] }),
      });

      await vi.advanceTimersByTimeAsync(1001);

      const msg = onMessage.mock.calls[0][0];
      expect(msg.text).toContain('2024-06-01');
    });

    it('warns on poll failure without throwing', async () => {
      await adapter.init(makeConfig({ pollIntervalMs: 1000 }), makeDeps());
      await adapter.start();

      mockFetch.mockResolvedValue({ ok: false, status: 401 });
      await vi.advanceTimersByTimeAsync(1001);

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('testConnection()', () => {
    it('returns ok=true on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ items: [{ id: 'primary', summary: 'My Calendar' }] }),
      });
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(true);
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
    });
  });
});
