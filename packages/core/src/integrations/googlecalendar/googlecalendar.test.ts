import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleCalendarIntegration } from './adapter.js';
import type { IntegrationConfig, UnifiedMessage } from '@friday/shared';

const mockFetch = vi.fn();

function makeConfig(): IntegrationConfig {
  return {
    id: 'gcal-1',
    platform: 'googlecalendar',
    displayName: 'Test Calendar',
    enabled: true,
    config: {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      tokenExpiresAt: Date.now() + 3600_000,
      calendarId: 'primary',
    },
    status: 'disconnected',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeDeps() {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as any,
    onMessage: vi.fn(),
  };
}

describe('GoogleCalendarIntegration', () => {
  let adapter: GoogleCalendarIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    adapter = new GoogleCalendarIntegration();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('init', () => {
    it('should initialize successfully with valid config', async () => {
      // ensureValidToken will be a no-op since tokenExpiresAt is in the future
      await adapter.init(makeConfig(), makeDeps());
    });

    it('should throw when tokens are missing', async () => {
      const config = makeConfig();
      (config.config as any).accessToken = '';
      (config.config as any).refreshToken = '';
      await expect(adapter.init(config, makeDeps())).rejects.toThrow(
        'requires accessToken and refreshToken'
      );
    });
  });

  describe('testConnection', () => {
    it('should return ok when API responds successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      });

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(true);
    });

    it('should return error when API fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => 'Unauthorized',
      });

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Unauthorized');
    });
  });

  describe('sendMessage', () => {
    it('should create event via quick-add', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'event-123' }),
      });

      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('primary', 'Meeting tomorrow at 3pm');
      expect(id).toBe('event-123');
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => 'Bad request',
      });

      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('primary', 'bad')).rejects.toThrow(
        'Failed to create calendar event'
      );
    });
  });

  describe('lifecycle', () => {
    it('should start and stop cleanly', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });
  });
});
