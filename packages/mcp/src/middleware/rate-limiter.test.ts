import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRateLimiter, RateLimitError } from './rate-limiter.js';

describe('rate-limiter', () => {
  it('should allow requests within limit', () => {
    const limiter = createRateLimiter(10);
    const result = limiter.check('test_tool');
    expect(result.allowed).toBe(true);
  });

  it('should deny requests exceeding limit', () => {
    const limiter = createRateLimiter(2);
    limiter.check('test_tool');
    limiter.check('test_tool');
    const result = limiter.check('test_tool');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeDefined();
  });

  it('should track different tools independently', () => {
    const limiter = createRateLimiter(1);
    limiter.check('tool_a');
    const resultA = limiter.check('tool_a');
    const resultB = limiter.check('tool_b');

    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
  });

  it('should refill tokens over time', async () => {
    const limiter = createRateLimiter(10);
    // Drain all tokens
    for (let i = 0; i < 10; i++) {
      limiter.check('test_tool');
    }
    const drained = limiter.check('test_tool');
    expect(drained.allowed).toBe(false);

    // Wait for refill
    await new Promise((r) => setTimeout(r, 200));
    const refilled = limiter.check('test_tool');
    expect(refilled.allowed).toBe(true);
  });

  it('should reset a tool bucket', () => {
    const limiter = createRateLimiter(1);
    limiter.check('test_tool');
    const before = limiter.check('test_tool');
    expect(before.allowed).toBe(false);

    limiter.reset('test_tool');
    const after = limiter.check('test_tool');
    expect(after.allowed).toBe(true);
  });

  it('wrap should execute function within limit', async () => {
    const limiter = createRateLimiter(10);
    const result = await limiter.wrap('test_tool', async () => 42);
    expect(result).toBe(42);
  });

  it('wrap should throw RateLimitError when exceeded', async () => {
    const limiter = createRateLimiter(1);
    limiter.check('test_tool');
    await expect(limiter.wrap('test_tool', async () => 42)).rejects.toThrow(RateLimitError);
  });

  it('RateLimitError should have correct properties', () => {
    const err = new RateLimitError('my_tool', 500);
    expect(err.toolName).toBe('my_tool');
    expect(err.retryAfterMs).toBe(500);
    expect(err.name).toBe('RateLimitError');
    expect(err.message).toContain('my_tool');
  });
});
