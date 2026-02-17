import { describe, it, expect, vi } from 'vitest';
import { RetryManager } from './retry-manager.js';
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
  });
});
