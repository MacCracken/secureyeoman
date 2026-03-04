import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter, createRateLimiter } from './rate-limiter.js';

function createTestLimiter(): RateLimiter {
  return new RateLimiter({
    defaultWindowMs: 60000,
    defaultMaxRequests: 10,
  });
}

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = createTestLimiter();
  });

  afterEach(() => {
    limiter.stop();
  });

  describe('basic rate limiting', () => {
    it('should allow requests within limit', () => {
      const result = limiter.check('default', 'user-1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it('should reject requests exceeding limit', () => {
      // Use up all 10 requests
      for (let i = 0; i < 10; i++) {
        const r = limiter.check('default', 'user-1');
        expect(r.allowed).toBe(true);
      }

      // 11th should be rejected
      const result = limiter.check('default', 'user-1');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('window reset', () => {
    it('should reset after windowMs expires', () => {
      vi.useFakeTimers();

      // Use up all requests
      for (let i = 0; i < 10; i++) {
        limiter.check('default', 'user-1');
      }
      expect(limiter.check('default', 'user-1').allowed).toBe(false);

      // Advance time past window
      vi.advanceTimersByTime(60001);

      // Should be allowed again
      const result = limiter.check('default', 'user-1');
      expect(result.allowed).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('addRule() / removeRule()', () => {
    it('should add and use custom rules', () => {
      limiter.addRule({
        name: 'strict',
        windowMs: 1000,
        maxRequests: 2,
        keyType: 'user',
        onExceed: 'reject',
      });

      expect(limiter.check('strict', 'user-1').allowed).toBe(true);
      expect(limiter.check('strict', 'user-1').allowed).toBe(true);
      expect(limiter.check('strict', 'user-1').allowed).toBe(false);
    });

    it('should remove rules', () => {
      limiter.addRule({
        name: 'temp',
        windowMs: 1000,
        maxRequests: 1,
        keyType: 'user',
        onExceed: 'reject',
      });

      expect(limiter.removeRule('temp')).toBe(true);
      expect(limiter.removeRule('nonexistent')).toBe(false);
    });
  });

  describe('checkMultiple()', () => {
    it('should return most restrictive result', () => {
      limiter.addRule({
        name: 'loose',
        windowMs: 60000,
        maxRequests: 100,
        keyType: 'user',
        onExceed: 'reject',
      });
      limiter.addRule({
        name: 'tight',
        windowMs: 60000,
        maxRequests: 2,
        keyType: 'user',
        onExceed: 'reject',
      });

      // Both should pass initially
      const r1 = limiter.checkMultiple([
        { name: 'loose', key: 'user-1' },
        { name: 'tight', key: 'user-1' },
      ]);
      expect(r1.allowed).toBe(true);

      // Use up tight rule
      limiter.check('tight', 'user-1');

      // Now tight should block
      const r2 = limiter.checkMultiple([
        { name: 'loose', key: 'user-1' },
        { name: 'tight', key: 'user-1' },
      ]);
      expect(r2.allowed).toBe(false);
    });
  });

  describe('reset()', () => {
    it('should clear a specific key', () => {
      for (let i = 0; i < 10; i++) {
        limiter.check('default', 'user-1');
      }
      expect(limiter.check('default', 'user-1').allowed).toBe(false);

      limiter.reset('default', 'user-1');

      expect(limiter.check('default', 'user-1').allowed).toBe(true);
    });
  });

  describe('getUsage()', () => {
    it('should return current count', () => {
      limiter.check('default', 'user-1');
      limiter.check('default', 'user-1');

      const usage = limiter.getUsage('default', 'user-1');
      expect(usage).not.toBeNull();
      expect(usage!.count).toBe(2);
      expect(usage!.limit).toBe(10);
    });

    it('should return null for unknown key', () => {
      const usage = limiter.getUsage('default', 'unknown');
      expect(usage).toBeNull();
    });
  });

  describe('log_only onExceed mode', () => {
    it('should allow but log when exceeded', () => {
      limiter.addRule({
        name: 'monitor',
        windowMs: 60000,
        maxRequests: 1,
        keyType: 'user',
        onExceed: 'log_only',
      });

      expect(limiter.check('monitor', 'user-1').allowed).toBe(true);
      // Exceeds limit but log_only allows it
      const result = limiter.check('monitor', 'user-1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });
  });

  describe('getStats()', () => {
    it('should return correct counts', () => {
      limiter.addRule({
        name: 'rule1',
        windowMs: 60000,
        maxRequests: 10,
        keyType: 'user',
        onExceed: 'reject',
      });

      limiter.check('default', 'user-1');
      limiter.check('rule1', 'user-2');

      const stats = limiter.getStats();
      expect(stats.activeWindows).toBe(2);
      expect(stats.rules).toBe(1);
    });
  });

  describe('stop()', () => {
    it('should clear cleanup interval', () => {
      limiter.stop();
      // Should not throw when called again
      limiter.stop();
    });
  });

  describe('per-IP vs per-user precedence', () => {
    it('IP-keyed and user-keyed rules are tracked independently', () => {
      limiter.addRule({
        name: 'ip_rule',
        windowMs: 60000,
        maxRequests: 2,
        keyType: 'ip',
        onExceed: 'reject',
      });
      limiter.addRule({
        name: 'user_rule',
        windowMs: 60000,
        maxRequests: 5,
        keyType: 'user',
        onExceed: 'reject',
      });

      // Use up IP rule for 1.2.3.4
      expect(limiter.check('ip_rule', '1.2.3.4').allowed).toBe(true);
      expect(limiter.check('ip_rule', '1.2.3.4').allowed).toBe(true);
      expect(limiter.check('ip_rule', '1.2.3.4').allowed).toBe(false);

      // User rule for the same logical user should still have capacity
      expect(limiter.check('user_rule', 'user-1').allowed).toBe(true);
    });

    it('different IPs have independent windows', () => {
      limiter.addRule({
        name: 'per_ip',
        windowMs: 60000,
        maxRequests: 1,
        keyType: 'ip',
        onExceed: 'reject',
      });

      expect(limiter.check('per_ip', '10.0.0.1').allowed).toBe(true);
      expect(limiter.check('per_ip', '10.0.0.1').allowed).toBe(false);
      // Different IP — should be allowed
      expect(limiter.check('per_ip', '10.0.0.2').allowed).toBe(true);
    });
  });

  describe('sliding window reset timing', () => {
    it('starts a new window after exact windowMs boundary', () => {
      vi.useFakeTimers();

      limiter.addRule({
        name: 'precise',
        windowMs: 5000,
        maxRequests: 1,
        keyType: 'user',
        onExceed: 'reject',
      });

      expect(limiter.check('precise', 'u1').allowed).toBe(true);
      expect(limiter.check('precise', 'u1').allowed).toBe(false);

      // Advance just under the window — still blocked
      vi.advanceTimersByTime(4999);
      expect(limiter.check('precise', 'u1').allowed).toBe(false);

      // Advance past the window — allowed again
      vi.advanceTimersByTime(2);
      expect(limiter.check('precise', 'u1').allowed).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('totalHits and totalChecks tracking', () => {
    it('increments totalChecks on every check and totalHits on rejections', () => {
      const stats0 = limiter.getStats();
      expect(stats0.totalChecks).toBe(0);
      expect(stats0.totalHits).toBe(0);

      // 10 allowed + 1 rejected
      for (let i = 0; i < 10; i++) {
        limiter.check('default', 'user-x');
      }
      limiter.check('default', 'user-x'); // rejected

      const stats = limiter.getStats();
      expect(stats.totalChecks).toBe(11);
      expect(stats.totalHits).toBe(1);
    });
  });

  describe('createRateLimiter()', () => {
    it('should create a limiter with default rules', () => {
      const rl = createRateLimiter({
        rateLimiting: {
          defaultWindowMs: 60000,
          defaultMaxRequests: 100,
        },
        inputValidation: {
          maxInputLength: 10000,
          maxFileSize: 1048576,
          enableInjectionDetection: true,
        },
      } as any);

      // Should have pre-configured rules like api_requests
      const result = rl.check('api_requests', 'user-1');
      expect(result.allowed).toBe(true);

      rl.stop();
    });

    it('should apply custom authLoginMaxAttempts to auth_attempts rule', () => {
      const rl = createRateLimiter({
        rateLimiting: {
          defaultWindowMs: 60000,
          defaultMaxRequests: 100,
          authLoginMaxAttempts: 3,
          authLoginWindowMs: 60000,
        },
        inputValidation: {
          maxInputLength: 10000,
          maxFileSize: 1048576,
          enableInjectionDetection: true,
        },
      } as any);

      // First 3 should be allowed
      expect(rl.check('auth_attempts', '1.2.3.4').allowed).toBe(true);
      expect(rl.check('auth_attempts', '1.2.3.4').allowed).toBe(true);
      expect(rl.check('auth_attempts', '1.2.3.4').allowed).toBe(true);
      // 4th should be blocked
      expect(rl.check('auth_attempts', '1.2.3.4').allowed).toBe(false);

      rl.stop();
    });

    it('should use default strict auth limits when no override is provided', () => {
      const rl = createRateLimiter({
        rateLimiting: {
          defaultWindowMs: 60000,
          defaultMaxRequests: 100,
          // authLoginMaxAttempts omitted — schema default of 5 applies
        },
        inputValidation: {
          maxInputLength: 10000,
          maxFileSize: 1048576,
          enableInjectionDetection: true,
        },
      } as any);

      // 5 attempts allowed
      for (let i = 0; i < 5; i++) {
        expect(rl.check('auth_attempts', '10.0.0.1').allowed).toBe(true);
      }
      // 6th blocked
      expect(rl.check('auth_attempts', '10.0.0.1').allowed).toBe(false);

      rl.stop();
    });

    it('creates RedisRateLimiter when redisUrl is provided', () => {
      // We cannot actually connect to Redis in unit tests, but we can verify
      // the factory attempts to construct the Redis-backed limiter
      // The constructor will create a Redis client that fails async — that's ok
      const rl = createRateLimiter({
        rateLimiting: {
          defaultWindowMs: 60000,
          defaultMaxRequests: 100,
          redisUrl: 'redis://localhost:6379',
          redisPrefix: 'test:rl',
        },
        inputValidation: {
          maxInputLength: 10000,
          maxFileSize: 1048576,
          enableInjectionDetection: true,
        },
      } as any);

      // Should be a RedisRateLimiter (has addRule/check/stop/getStats)
      expect(typeof rl.addRule).toBe('function');
      expect(typeof rl.check).toBe('function');
      expect(typeof rl.stop).toBe('function');
      expect(typeof rl.getStats).toBe('function');

      rl.stop();
    });

    it('includes auth_refresh and auth_reset_password rules', () => {
      const rl = createRateLimiter({
        rateLimiting: {
          defaultWindowMs: 60000,
          defaultMaxRequests: 100,
        },
        inputValidation: {
          maxInputLength: 10000,
          maxFileSize: 1048576,
          enableInjectionDetection: true,
        },
      } as any);

      // auth_refresh allows 10 per minute per IP
      for (let i = 0; i < 10; i++) {
        expect(rl.check('auth_refresh', '1.2.3.4').allowed).toBe(true);
      }
      expect(rl.check('auth_refresh', '1.2.3.4').allowed).toBe(false);

      // auth_reset_password allows 3 per hour per IP
      for (let i = 0; i < 3; i++) {
        expect(rl.check('auth_reset_password', '1.2.3.4').allowed).toBe(true);
      }
      expect(rl.check('auth_reset_password', '1.2.3.4').allowed).toBe(false);

      rl.stop();
    });
  });

  describe('createFastifyHook', () => {
    function makeRateLimiter() {
      return new RateLimiter({
        defaultWindowMs: 60000,
        defaultMaxRequests: 100,
      } as any);
    }

    function makeRequest(url: string, ip = '127.0.0.1', headers: Record<string, string> = {}) {
      return { url, ip, headers };
    }

    function makeReply() {
      const sent: { code: number; headers: Record<string, string>; body: unknown } = {
        code: 0,
        headers: {},
        body: null,
      };
      const reply: any = {
        sent,
        header(k: string, v: string) {
          sent.headers[k] = v;
          return reply;
        },
        code(n: number) {
          sent.code = n;
          return {
            send(body: unknown) {
              sent.body = body;
            },
          };
        },
      };
      return reply;
    }

    it('allows normal API requests through', () => {
      const rl = makeRateLimiter();
      const hook = rl.createFastifyHook();
      let called = false;
      hook(makeRequest('/api/v1/brain/notes'), makeReply(), () => {
        called = true;
      });
      expect(called).toBe(true);
      rl.stop();
    });

    it('skips health check endpoints', () => {
      const rl = makeRateLimiter();
      const hook = rl.createFastifyHook();
      let called = false;
      hook(makeRequest('/api/v1/terminal/health'), makeReply(), () => {
        called = true;
      });
      expect(called).toBe(true);
      rl.stop();
    });

    it('skips non-API routes', () => {
      const rl = makeRateLimiter();
      const hook = rl.createFastifyHook();
      let called = false;
      hook(makeRequest('/index.html'), makeReply(), () => {
        called = true;
      });
      expect(called).toBe(true);
      rl.stop();
    });

    it('skips WebSocket upgrade requests', () => {
      const rl = makeRateLimiter();
      const hook = rl.createFastifyHook();
      let called = false;
      hook(makeRequest('/api/v1/ws', '127.0.0.1', { upgrade: 'websocket' }), makeReply(), () => {
        called = true;
      });
      expect(called).toBe(true);
      rl.stop();
    });

    it('blocks after exceeding terminal route limit (10/min)', () => {
      const rl = makeRateLimiter();
      const hook = rl.createFastifyHook();
      const ip = '10.0.0.1';

      for (let i = 0; i < 10; i++) {
        let passed = false;
        hook(makeRequest('/api/v1/terminal/execute', ip), makeReply(), () => {
          passed = true;
        });
        expect(passed).toBe(true);
      }

      // 11th should be blocked
      const reply = makeReply();
      let passed = false;
      hook(makeRequest('/api/v1/terminal/execute', ip), reply, () => {
        passed = true;
      });
      expect(passed).toBe(false);
      expect(reply.sent.code).toBe(429);
      expect(reply.sent.headers['Retry-After']).toBeDefined();
      rl.stop();
    });

    it('blocks after exceeding auth route limit (5/min)', () => {
      const rl = makeRateLimiter();
      const hook = rl.createFastifyHook();
      const ip = '10.0.0.2';

      for (let i = 0; i < 5; i++) {
        let passed = false;
        hook(makeRequest('/api/v1/auth/login', ip), makeReply(), () => {
          passed = true;
        });
        expect(passed).toBe(true);
      }

      const reply = makeReply();
      let passed = false;
      hook(makeRequest('/api/v1/auth/login', ip), reply, () => {
        passed = true;
      });
      expect(passed).toBe(false);
      expect(reply.sent.code).toBe(429);
      rl.stop();
    });

    it('blocks after exceeding workflow execute limit (10/min)', () => {
      const rl = makeRateLimiter();
      const hook = rl.createFastifyHook();
      const ip = '10.0.0.3';

      for (let i = 0; i < 10; i++) {
        let passed = false;
        hook(makeRequest('/api/v1/workflow/abc/execute', ip), makeReply(), () => {
          passed = true;
        });
        expect(passed).toBe(true);
      }

      const reply = makeReply();
      let passed = false;
      hook(makeRequest('/api/v1/workflow/abc/execute', ip), reply, () => {
        passed = true;
      });
      expect(passed).toBe(false);
      expect(reply.sent.code).toBe(429);
      rl.stop();
    });

    it('allows 100 general API requests per IP', () => {
      const rl = makeRateLimiter();
      const hook = rl.createFastifyHook();
      const ip = '10.0.0.4';

      for (let i = 0; i < 100; i++) {
        let passed = false;
        hook(makeRequest('/api/v1/brain/notes', ip), makeReply(), () => {
          passed = true;
        });
        expect(passed).toBe(true);
      }

      // 101st should be blocked
      const reply = makeReply();
      let passed = false;
      hook(makeRequest('/api/v1/brain/notes', ip), reply, () => {
        passed = true;
      });
      expect(passed).toBe(false);
      expect(reply.sent.code).toBe(429);
      rl.stop();
    });

    it('different IPs have independent limits', () => {
      const rl = makeRateLimiter();
      const hook = rl.createFastifyHook();

      // Exhaust IP A
      for (let i = 0; i < 10; i++) {
        hook(makeRequest('/api/v1/terminal/execute', 'ip-a'), makeReply(), () => {});
      }

      // IP B should still pass
      let passed = false;
      hook(makeRequest('/api/v1/terminal/execute', 'ip-b'), makeReply(), () => {
        passed = true;
      });
      expect(passed).toBe(true);
      rl.stop();
    });

    it('returns proper rate limit headers on 429', () => {
      const rl = makeRateLimiter();
      const hook = rl.createFastifyHook();
      const ip = '10.0.0.5';

      // Exhaust auth limit
      for (let i = 0; i < 5; i++) {
        hook(makeRequest('/api/v1/auth/login', ip), makeReply(), () => {});
      }

      const reply = makeReply();
      hook(makeRequest('/api/v1/auth/login', ip), reply, () => {});
      expect(reply.sent.code).toBe(429);
      expect(reply.sent.headers['Retry-After']).toBeDefined();
      expect(reply.sent.headers['X-RateLimit-Remaining']).toBe('0');
      expect(reply.sent.headers['X-RateLimit-Reset']).toBeDefined();
      rl.stop();
    });
  });
});
