import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpotifyIntegration } from './adapter.js';
import type { IntegrationConfig } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';

// ── Fetch mock ────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

// ── Shared token response ────────────────────────────────────────────────────

function makeTokenResponse() {
  return {
    ok: true,
    text: async () => '',
    json: async () => ({ access_token: 'test-access-token', expires_in: 3600 }),
  };
}

function makeRecentResponse(items: unknown[] = []) {
  return {
    ok: true,
    json: async () => ({ items }),
  };
}

function makeTrackItem(id = 'track1', playedAt = '2024-01-01T00:00:00Z') {
  return {
    track: {
      id,
      name: 'Test Track',
      artists: [{ name: 'Artist A' }, { name: 'Artist B' }],
      uri: `spotify:track:${id}`,
      duration_ms: 200000,
    },
    played_at: playedAt,
  };
}

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeConfig(overrides: Record<string, unknown> = {}): IntegrationConfig {
  return {
    id: 'spotify-1',
    platform: 'spotify',
    displayName: 'Test Spotify',
    enabled: true,
    status: 'disconnected',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      refreshToken: 'test-refresh-token',
      pollIntervalMs: 1000,
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SpotifyIntegration – adapter.ts', () => {
  let adapter: SpotifyIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    adapter = new SpotifyIntegration();

    // Default: token exchange succeeds, recently-played returns empty
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('accounts.spotify.com')) {
        return Promise.resolve(makeTokenResponse());
      }
      if (url.includes('recently-played')) {
        return Promise.resolve(makeRecentResponse([]));
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    try {
      await adapter.stop();
    } catch {
      /* ignore */
    }
    vi.useRealTimers();
  });

  // ── Platform metadata ─────────────────────────────────────────────────────

  it('has platform = "spotify"', () => {
    expect(adapter.platform).toBe('spotify');
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

    it('throws when clientId is missing', async () => {
      await expect(adapter.init(makeConfig({ clientId: '' }), makeDeps())).rejects.toThrow(
        'Spotify integration requires clientId, clientSecret, and refreshToken'
      );
    });

    it('throws when clientSecret is missing', async () => {
      await expect(adapter.init(makeConfig({ clientSecret: '' }), makeDeps())).rejects.toThrow(
        'Spotify integration requires clientId, clientSecret, and refreshToken'
      );
    });

    it('throws when refreshToken is missing', async () => {
      await expect(adapter.init(makeConfig({ refreshToken: '' }), makeDeps())).rejects.toThrow(
        'Spotify integration requires clientId, clientSecret, and refreshToken'
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

    it('throws when start() is called before init()', async () => {
      await expect(adapter.start()).rejects.toThrow('Integration not initialized');
    });

    it('start() is idempotent', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
      // Token should only be fetched once (second start() returns early)
      const tokenCalls = mockFetch.mock.calls.filter((c) => c[0].includes('accounts.spotify.com'));
      expect(tokenCalls).toHaveLength(1);
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

    it('refreshes access token during start()', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      const tokenCalls = mockFetch.mock.calls.filter((c) => c[0].includes('accounts.spotify.com'));
      expect(tokenCalls.length).toBeGreaterThan(0);
    });

    it('sends refresh token in token request body', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      const tokenCall = mockFetch.mock.calls.find((c) => c[0].includes('accounts.spotify.com'));
      expect(tokenCall).toBeDefined();
      const body = (tokenCall![1] as RequestInit).body as string;
      expect(body).toContain('refresh_token=test-refresh-token');
      expect(body).toContain('grant_type=refresh_token');
    });
  });

  // ── sendMessage() ─────────────────────────────────────────────────────────

  describe('sendMessage()', () => {
    it('queues a track URI and returns the URI', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('accounts.spotify.com')) {
          return Promise.resolve(makeTokenResponse());
        }
        if (url.includes('/me/player/queue')) {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve(makeRecentResponse([]));
      });

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      const result = await adapter.sendMessage('ignored', 'spotify:track:abc123');
      expect(result).toBe('spotify:track:abc123');
      const queueCall = mockFetch.mock.calls.find((c) => c[0].includes('/me/player/queue'));
      expect(queueCall).toBeDefined();
      expect(queueCall![0]).toContain(encodeURIComponent('spotify:track:abc123'));
    });

    it('uses POST method for queue endpoint', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('accounts.spotify.com')) {
          return Promise.resolve(makeTokenResponse());
        }
        return Promise.resolve({ ok: true });
      });

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.sendMessage('_', 'spotify:track:xyz');
      const queueCall = mockFetch.mock.calls.find((c) => c[0].includes('/me/player/queue'));
      expect((queueCall![1] as RequestInit).method).toBe('POST');
    });

    it('throws when the queue endpoint returns an error', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('accounts.spotify.com')) {
          return Promise.resolve(makeTokenResponse());
        }
        if (url.includes('/me/player/queue')) {
          return Promise.resolve({ ok: false, text: async () => 'Premium required' });
        }
        return Promise.resolve(makeRecentResponse([]));
      });

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await expect(adapter.sendMessage('_', 'spotify:track:fail')).rejects.toThrow(
        'Spotify queue track failed'
      );
    });

    it('trims whitespace from the track URI', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('accounts.spotify.com')) {
          return Promise.resolve(makeTokenResponse());
        }
        return Promise.resolve({ ok: true });
      });

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      const result = await adapter.sendMessage('_', '  spotify:track:abc  ');
      expect(result).toBe('  spotify:track:abc  '); // returns original text arg
      const queueCall = mockFetch.mock.calls.find((c) => c[0].includes('/me/player/queue'));
      expect(queueCall![0]).toContain(encodeURIComponent('spotify:track:abc'));
    });
  });

  // ── isHealthy() ───────────────────────────────────────────────────────────

  describe('isHealthy()', () => {
    it('returns false before start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.isHealthy()).toBe(false);
    });

    it('returns true after start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('returns false after stop', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });
  });

  // ── testConnection() ──────────────────────────────────────────────────────

  describe('testConnection()', () => {
    it('returns ok=true with display_name when profile API succeeds', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('accounts.spotify.com')) {
          return Promise.resolve(makeTokenResponse());
        }
        if (url.includes('/me') && !url.includes('player')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ id: 'user123', display_name: 'Test User' }),
          });
        }
        return Promise.resolve(makeRecentResponse([]));
      });

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toContain('Test User');
    });

    it('uses id when display_name is absent', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('accounts.spotify.com')) {
          return Promise.resolve(makeTokenResponse());
        }
        if (url.includes('/me') && !url.includes('player')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ id: 'user123' }),
          });
        }
        return Promise.resolve(makeRecentResponse([]));
      });

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toContain('user123');
    });

    it('returns ok=false when profile API returns an error', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('accounts.spotify.com')) {
          return Promise.resolve(makeTokenResponse());
        }
        return Promise.resolve({ ok: false, statusText: 'Unauthorized' });
      });

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Spotify API error');
    });

    it('returns ok=false when token refresh fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => 'invalid_grant',
      });

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
    });

    it('returns ok=false when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('Network unreachable'));
      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toBe('Network unreachable');
    });
  });

  // ── Polling and seenTrack deduplication ───────────────────────────────────

  describe('polling deduplication', () => {
    it('does not emit onMessage for tracks already seeded during start()', async () => {
      const item = makeTrackItem('track1', '2024-01-01T00:00:00Z');
      const onMessage = vi.fn().mockResolvedValue(undefined);

      // seed: return track1 during start()'s seedSeenTracks
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('accounts.spotify.com')) {
          return Promise.resolve(makeTokenResponse());
        }
        return Promise.resolve(makeRecentResponse([item]));
      });

      await adapter.init(makeConfig(), makeDeps(onMessage));
      await adapter.start();

      // poll: same track1 returned again — should be skipped
      vi.useFakeTimers();
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('accounts.spotify.com')) {
          return Promise.resolve(makeTokenResponse());
        }
        return Promise.resolve(makeRecentResponse([item]));
      });
      await vi.advanceTimersByTimeAsync(1100);

      expect(onMessage).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('emits onMessage for genuinely new tracks', async () => {
      const onMessage = vi.fn().mockResolvedValue(undefined);

      // During start() → seedSeenTracks + refreshAccessToken: return empty list
      // We switch to fake timers BEFORE start so that the poll interval fires under our control
      vi.useFakeTimers();

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('accounts.spotify.com')) {
          return Promise.resolve(makeTokenResponse());
        }
        // Seed call during start(): empty
        return Promise.resolve(makeRecentResponse([]));
      });

      await adapter.init(makeConfig({ pollIntervalMs: 1000 }), makeDeps(onMessage));
      await adapter.start();

      // Now reconfigure fetch so the next poll returns a new track
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('accounts.spotify.com')) {
          return Promise.resolve(makeTokenResponse());
        }
        return Promise.resolve(
          makeRecentResponse([makeTrackItem('new-track', '2024-06-01T12:00:00Z')])
        );
      });

      await vi.advanceTimersByTimeAsync(1100);

      expect(onMessage).toHaveBeenCalledTimes(1);
      const msg = onMessage.mock.calls[0][0];
      expect(msg.platform).toBe('spotify');
      expect(msg.text).toContain('Test Track');
      expect(msg.metadata).toMatchObject({ trackId: 'new-track' });
      vi.useRealTimers();
    });
  });
});
