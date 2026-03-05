import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  CircuitBreakerRegistry,
} from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 100, name: 'test' });
  });

  it('starts in closed state', () => {
    expect(breaker.getState()).toBe('closed');
  });

  it('stays closed on success', async () => {
    await breaker.execute(() => Promise.resolve('ok'));
    expect(breaker.getState()).toBe('closed');
  });

  it('stays closed below failure threshold', async () => {
    for (let i = 0; i < 2; i++) {
      await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    }
    expect(breaker.getState()).toBe('closed');
  });

  it('opens after reaching failure threshold', async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    }
    expect(breaker.getState()).toBe('open');
  });

  it('rejects immediately when open', async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    }
    await expect(breaker.execute(() => Promise.resolve('ok'))).rejects.toThrow(
      CircuitBreakerOpenError
    );
  });

  it('CircuitBreakerOpenError has correct name and circuitName', async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    }
    try {
      await breaker.execute(() => Promise.resolve('ok'));
    } catch (err) {
      expect(err).toBeInstanceOf(CircuitBreakerOpenError);
      expect((err as CircuitBreakerOpenError).circuitName).toBe('test');
      expect((err as CircuitBreakerOpenError).name).toBe('CircuitBreakerOpenError');
    }
  });

  it('transitions to half-open after reset timeout', async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    }
    expect(breaker.getState()).toBe('open');

    // Wait for reset timeout
    await new Promise((r) => setTimeout(r, 120));
    expect(breaker.getState()).toBe('half-open');
  });

  it('closes on successful probe in half-open', async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 120));
    expect(breaker.getState()).toBe('half-open');

    await breaker.execute(() => Promise.resolve('ok'));
    expect(breaker.getState()).toBe('closed');
  });

  it('re-opens on failed probe in half-open', async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 120));
    expect(breaker.getState()).toBe('half-open');

    await breaker.execute(() => Promise.reject(new Error('still bad'))).catch(() => {});
    expect(breaker.getState()).toBe('open');
  });

  it('resets consecutive failures on success', async () => {
    await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    await breaker.execute(() => Promise.resolve('ok'));
    // 2 failures then success resets count — 1 more failure shouldn't open
    await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    expect(breaker.getState()).toBe('closed');
  });

  it('reset() returns to closed state', async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    }
    expect(breaker.getState()).toBe('open');
    breaker.reset();
    expect(breaker.getState()).toBe('closed');
  });

  it('recordSuccess() closes half-open breaker', async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 120));
    breaker.recordSuccess();
    expect(breaker.getState()).toBe('closed');
  });

  it('recordFailure() increments failure count', () => {
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('closed');
    breaker.recordFailure();
    expect(breaker.getState()).toBe('open');
  });

  it('uses default options when none provided', () => {
    const defaultBreaker = new CircuitBreaker();
    expect(defaultBreaker.name).toBe('default');
    expect(defaultBreaker.getState()).toBe('closed');
  });

  it('passes through return value on success', async () => {
    const result = await breaker.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('passes through original error on failure (not yet open)', async () => {
    const err = new Error('specific error');
    await expect(breaker.execute(() => Promise.reject(err))).rejects.toBe(err);
  });
});

describe('CircuitBreakerRegistry', () => {
  it('creates breaker on first get', () => {
    const registry = new CircuitBreakerRegistry();
    const breaker = registry.get('test');
    expect(breaker).toBeInstanceOf(CircuitBreaker);
    expect(breaker.name).toBe('test');
  });

  it('returns same breaker for same key', () => {
    const registry = new CircuitBreakerRegistry();
    const a = registry.get('test');
    const b = registry.get('test');
    expect(a).toBe(b);
  });

  it('returns different breakers for different keys', () => {
    const registry = new CircuitBreakerRegistry();
    const a = registry.get('a');
    const b = registry.get('b');
    expect(a).not.toBe(b);
  });

  it('applies default options', () => {
    const registry = new CircuitBreakerRegistry({ failureThreshold: 2 });
    const breaker = registry.get('test');
    // 2 failures should open (not 5 default)
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('open');
  });

  it('per-key options override defaults', () => {
    const registry = new CircuitBreakerRegistry({ failureThreshold: 2 });
    const breaker = registry.get('test', { failureThreshold: 10 });
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('closed');
  });

  it('getAll returns all breaker states', () => {
    const registry = new CircuitBreakerRegistry();
    registry.get('a');
    registry.get('b');
    const all = registry.getAll();
    expect(Object.keys(all)).toEqual(['a', 'b']);
    expect(all['a']!.state).toBe('closed');
  });

  it('resetAll resets all breakers', () => {
    const registry = new CircuitBreakerRegistry({ failureThreshold: 1 });
    const a = registry.get('a');
    a.recordFailure();
    expect(a.getState()).toBe('open');
    registry.resetAll();
    expect(a.getState()).toBe('closed');
  });

  it('size tracks number of breakers', () => {
    const registry = new CircuitBreakerRegistry();
    expect(registry.size).toBe(0);
    registry.get('a');
    registry.get('b');
    expect(registry.size).toBe(2);
  });
});
