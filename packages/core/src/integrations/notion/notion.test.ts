import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotionIntegration } from './adapter.js';
import type { IntegrationConfig } from '@friday/shared';

const mockFetch = vi.fn();

function makeConfig(): IntegrationConfig {
  return {
    id: 'notion-1',
    platform: 'notion',
    displayName: 'Test Notion',
    enabled: true,
    config: {
      apiKey: 'ntn_test_token',
      databaseId: 'db-123',
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

describe('NotionIntegration', () => {
  let adapter: NotionIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    adapter = new NotionIntegration();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('init', () => {
    it('should initialize successfully with valid config', async () => {
      await adapter.init(makeConfig(), makeDeps());
    });

    it('should throw when apiKey is missing', async () => {
      const config = makeConfig();
      (config.config as any).apiKey = '';
      await expect(adapter.init(config, makeDeps())).rejects.toThrow('requires an apiKey');
    });
  });

  describe('testConnection', () => {
    it('should return ok when API responds successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'user-1', name: 'Test User', type: 'bot' }),
      });

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toContain('Test User');
    });

    it('should return error when API fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => 'Unauthorized',
      });

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('should create a page in the database', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'page-456' }),
      });

      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('db-123', 'Test page content');
      expect(id).toBe('page-456');
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => 'Validation error',
      });

      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.sendMessage('db-123', 'bad')).rejects.toThrow('Failed to create Notion page');
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
