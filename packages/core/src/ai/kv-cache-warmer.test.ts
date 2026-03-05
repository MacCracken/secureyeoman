import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KvCacheWarmer } from './kv-cache-warmer.js';

// ── Logger mock ──────────────────────────────────────────────────────────────

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(function () {
      return this;
    }),
  } as any;
}

// ── Config ───────────────────────────────────────────────────────────────────

const OLLAMA_BASE_URL = 'http://localhost:11434';
const TEST_MODEL = 'llama3:8b';
const TEST_SYSTEM_PROMPT = 'You are a helpful assistant.';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('KvCacheWarmer', () => {
  let logger: ReturnType<typeof makeLogger>;
  let warmer: KvCacheWarmer;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = makeLogger();
    warmer = new KvCacheWarmer({
      logger,
      ollamaBaseUrl: OLLAMA_BASE_URL,
      config: { enabled: true, keepAlive: '30m' },
    });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ── enabled ──────────────────────────────────────────────────────────────

  describe('enabled', () => {
    it('reflects config', () => {
      expect(warmer.enabled).toBe(true);

      const disabledWarmer = new KvCacheWarmer({
        logger,
        ollamaBaseUrl: OLLAMA_BASE_URL,
        config: { enabled: false, keepAlive: '30m' },
      });
      expect(disabledWarmer.enabled).toBe(false);
    });
  });

  // ── warmup ───────────────────────────────────────────────────────────────

  describe('warmup()', () => {
    it('returns false when disabled', async () => {
      const disabledWarmer = new KvCacheWarmer({
        logger,
        ollamaBaseUrl: OLLAMA_BASE_URL,
        config: { enabled: false, keepAlive: '30m' },
      });
      const result = await disabledWarmer.warmup(TEST_MODEL, TEST_SYSTEM_PROMPT);
      expect(result).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('sends POST to Ollama /api/chat', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await warmer.warmup(TEST_MODEL, TEST_SYSTEM_PROMPT);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('passes model and system prompt', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await warmer.warmup(TEST_MODEL, TEST_SYSTEM_PROMPT);

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.model).toBe('llama3:8b');
      expect(body.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'system', content: 'You are a helpful assistant.' }),
        ])
      );
    });

    it('sets keep_alive and num_predict=1', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await warmer.warmup(TEST_MODEL, TEST_SYSTEM_PROMPT);

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.options?.num_predict).toBe(1);
      expect(body.keep_alive).toBeDefined();
    });

    it('returns true on success', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await warmer.warmup(TEST_MODEL, TEST_SYSTEM_PROMPT);
      expect(result).toBe(true);
    });

    it('returns false on fetch error', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Connection refused'));

      const result = await warmer.warmup(TEST_MODEL, TEST_SYSTEM_PROMPT);
      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('returns false on non-OK response', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await warmer.warmup(TEST_MODEL, TEST_SYSTEM_PROMPT);
      expect(result).toBe(false);
    });
  });
});
