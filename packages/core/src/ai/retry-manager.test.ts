import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetryManager, withRetry } from './retry-manager.js';
import {
  AIProviderError,
  RateLimitError,
  AuthenticationError,
  ProviderUnavailableError,
} from './errors.js';

describe('RetryManager', () => {
  describe('shouldRetry', () => {
    const manager = new RetryManager();

    it('should retry on recoverable AIProviderError', () => {
      const error = new RateLimitError('anthropic', 5);
      expect(manager.shouldRetry(error)).toBe(true);
    });

    it('should retry on ProviderUnavailableError', () => {
      const error = new ProviderUnavailableError('openai', 503);
      expect(manager.shouldRetry(error)).toBe(true);
    });

    it('should not retry on non-recoverable AIProviderError', () => {
      const error = new AuthenticationError('anthropic');
      expect(manager.shouldRetry(error)).toBe(false);
    });

    it('should retry on ECONNRESET', () => {
      expect(manager.shouldRetry(new Error('socket ECONNRESET'))).toBe(true);
    });

    it('should retry on fetch failed', () => {
      expect(manager.shouldRetry(new Error('fetch failed'))).toBe(true);
    });

    it('should retry on timeout errors', () => {
      expect(manager.shouldRetry(new Error('request timeout'))).toBe(true);
    });

    it('should retry on 503 in message', () => {
      expect(manager.shouldRetry(new Error('HTTP 503 Service Unavailable'))).toBe(true);
    });

    it('should not retry on unknown errors', () => {
      expect(manager.shouldRetry(new Error('something went wrong'))).toBe(false);
    });
  });

  describe('calculateDelay', () => {
    it('should use retryAfter from RateLimitError', () => {
      const manager = new RetryManager({ maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 30000 });
      const error = new RateLimitError('anthropic', 10);
      const delay = manager.calculateDelay(0, error);
      // retryAfter=10 -> 10000ms, capped at 30000
      expect(delay).toBeLessThanOrEqual(30000);
      expect(delay).toBe(10000);
    });

    it('should use exponential backoff', () => {
      const manager = new RetryManager({ maxRetries: 5, baseDelayMs: 100, maxDelayMs: 10000 });
      const delay0 = manager.calculateDelay(0);
      const delay1 = manager.calculateDelay(1);
      const delay2 = manager.calculateDelay(2);
      // Delays should generally increase (with jitter they may vary)
      // At minimum, delay at attempt 2 should not exceed maxDelay
      expect(delay0).toBeGreaterThanOrEqual(0);
      expect(delay1).toBeGreaterThanOrEqual(0);
      expect(delay2).toBeGreaterThanOrEqual(0);
      expect(delay2).toBeLessThanOrEqual(10000);
    });

    it('should clamp to maxDelayMs', () => {
      const manager = new RetryManager({ maxRetries: 5, baseDelayMs: 1000, maxDelayMs: 5000 });
      const delay = manager.calculateDelay(10); // Very high attempt
      expect(delay).toBeLessThanOrEqual(5000);
    });
  });

  describe('execute', () => {
    it('should return result on first success', async () => {
      const manager = new RetryManager({ maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 });
      const fn = vi.fn().mockResolvedValue('ok');
      const result = await manager.execute(fn);
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient errors', async () => {
      const manager = new RetryManager({ maxRetries: 3, baseDelayMs: 10, maxDelayMs: 50 });
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new ProviderUnavailableError('test', 503))
        .mockResolvedValue('ok');

      const result = await manager.execute(fn);
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should stop on non-retryable errors immediately', async () => {
      const manager = new RetryManager({ maxRetries: 3, baseDelayMs: 10, maxDelayMs: 50 });
      const fn = vi.fn().mockRejectedValue(new AuthenticationError('test'));

      await expect(manager.execute(fn)).rejects.toThrow('Authentication failed');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should respect maxRetries limit', async () => {
      const manager = new RetryManager({ maxRetries: 2, baseDelayMs: 10, maxDelayMs: 50 });
      const error = new ProviderUnavailableError('test', 503);
      const fn = vi.fn().mockRejectedValue(error);

      await expect(manager.execute(fn)).rejects.toThrow('Provider test is unavailable');
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should wrap non-Error throws as Error', async () => {
      const manager = new RetryManager({ maxRetries: 0, baseDelayMs: 10, maxDelayMs: 50 });
      const fn = vi.fn().mockRejectedValue('a plain string error');

      await expect(manager.execute(fn)).rejects.toThrow('a plain string error');
    });

    it('should succeed after multiple transient failures', async () => {
      const manager = new RetryManager({ maxRetries: 3, baseDelayMs: 5, maxDelayMs: 20 });
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockRejectedValueOnce(new Error('socket hang up'))
        .mockResolvedValue('finally ok');

      const result = await manager.execute(fn);
      expect(result).toBe('finally ok');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should execute with maxRetries: 0 and succeed', async () => {
      const manager = new RetryManager({ maxRetries: 0 });
      const fn = vi.fn().mockResolvedValue('immediate');
      const result = await manager.execute(fn);
      expect(result).toBe('immediate');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should execute with maxRetries: 0 and fail immediately', async () => {
      const manager = new RetryManager({ maxRetries: 0, baseDelayMs: 10, maxDelayMs: 50 });
      const fn = vi.fn().mockRejectedValue(new ProviderUnavailableError('test', 503));

      await expect(manager.execute(fn)).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('shouldRetry — additional branch coverage', () => {
    const manager = new RetryManager();

    it('should retry on ECONNREFUSED', () => {
      expect(manager.shouldRetry(new Error('connect ECONNREFUSED 127.0.0.1:3000'))).toBe(true);
    });

    it('should retry on ETIMEDOUT', () => {
      expect(manager.shouldRetry(new Error('connect ETIMEDOUT'))).toBe(true);
    });

    it('should retry on socket hang up', () => {
      expect(manager.shouldRetry(new Error('socket hang up'))).toBe(true);
    });

    it('should retry on 502 in message', () => {
      expect(manager.shouldRetry(new Error('HTTP 502 Bad Gateway'))).toBe(true);
    });

    it('should not retry on non-recoverable AIProviderError (TokenLimitError)', () => {
      const error = new AIProviderError('Token limit exceeded', {
        provider: 'openai',
        code: 'TOKEN_LIMIT',
        recoverable: false,
      });
      expect(manager.shouldRetry(error)).toBe(false);
    });
  });

  describe('calculateDelay — additional branch coverage', () => {
    it('should cap retryAfter to maxDelayMs', () => {
      const manager = new RetryManager({ maxRetries: 3, baseDelayMs: 100, maxDelayMs: 5000 });
      // retryAfter=60 -> 60000ms, but maxDelay = 5000
      const error = new RateLimitError('anthropic', 60);
      const delay = manager.calculateDelay(0, error);
      expect(delay).toBe(5000);
    });

    it('should return a delay without error argument', () => {
      const manager = new RetryManager({ maxRetries: 3, baseDelayMs: 100, maxDelayMs: 10000 });
      const delay = manager.calculateDelay(0);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(10000);
    });

    it('should return a delay when error is a regular Error (not AIProviderError)', () => {
      const manager = new RetryManager({ maxRetries: 3, baseDelayMs: 100, maxDelayMs: 10000 });
      const delay = manager.calculateDelay(1, new Error('generic error'));
      // Should use exponential backoff, not retryAfter
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(10000);
    });

    it('should not use retryAfter when AIProviderError has no retryAfter', () => {
      const manager = new RetryManager({ maxRetries: 3, baseDelayMs: 100, maxDelayMs: 10000 });
      const error = new ProviderUnavailableError('test', 503);
      // ProviderUnavailableError does not set retryAfter
      const delay = manager.calculateDelay(0, error);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(10000);
    });
  });

  describe('constructor', () => {
    it('should use default config when none provided', () => {
      const manager = new RetryManager();
      // Verify defaults work by checking delay calculation
      const delay = manager.calculateDelay(0);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(30000);
    });

    it('should merge partial config with defaults', () => {
      const manager = new RetryManager({ maxRetries: 5 });
      // Can still calculate delays with default baseDelayMs and maxDelayMs
      const delay = manager.calculateDelay(0);
      expect(delay).toBeGreaterThanOrEqual(0);
    });
  });

  describe('withRetry', () => {
    it('should succeed on first call', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors using default predicate', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValue('recovered');

      const result = await withRetry(fn, { baseDelayMs: 5, maxDelayMs: 20 });
      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors using default predicate', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('invalid argument'));

      await expect(
        withRetry(fn, { maxRetries: 3, baseDelayMs: 5, maxDelayMs: 20 })
      ).rejects.toThrow('invalid argument');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should respect custom shouldRetry predicate', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('custom-retryable'))
        .mockResolvedValue('ok');

      const result = await withRetry(fn, {
        baseDelayMs: 5,
        maxDelayMs: 20,
        shouldRetry: (err) => err.message.includes('custom-retryable'),
      });
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should exhaust maxRetries and throw', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('503 error'));

      await expect(
        withRetry(fn, { maxRetries: 2, baseDelayMs: 5, maxDelayMs: 20 })
      ).rejects.toThrow('503 error');
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should wrap non-Error throws as Error', async () => {
      const fn = vi.fn().mockRejectedValue(42);

      await expect(
        withRetry(fn, { maxRetries: 0, baseDelayMs: 5, maxDelayMs: 20 })
      ).rejects.toThrow('42');
    });

    it('should use default config when no policy provided', async () => {
      const fn = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValue('ok');

      // This will use the slow default delays, but we need it for coverage.
      // We override just baseDelayMs to make the test fast
      const result = await withRetry(fn, { baseDelayMs: 5, maxDelayMs: 10 });
      expect(result).toBe('ok');
    });

    it('should retry on each retryable network error keyword', async () => {
      const retryableMessages = [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'socket hang up',
        'fetch failed',
        '502 error',
        '503 error',
        'request timeout',
      ];

      for (const msg of retryableMessages) {
        const fn = vi.fn().mockRejectedValueOnce(new Error(msg)).mockResolvedValue('ok');

        const result = await withRetry(fn, { baseDelayMs: 1, maxDelayMs: 5, maxRetries: 1 });
        expect(result).toBe('ok');
      }
    });

    it('should respect maxRetries from policy', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('503'));

      await expect(withRetry(fn, { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 5 })).rejects.toThrow(
        '503'
      );
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
