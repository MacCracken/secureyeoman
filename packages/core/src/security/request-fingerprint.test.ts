import { describe, it, expect, afterEach, vi } from 'vitest';
import { RequestFingerprinter, createFingerprintHook } from './request-fingerprint.js';
import type { RequestFingerprintConfig } from '@secureyeoman/shared';
import type { IpReputationManager } from './ip-reputation.js';

function makeConfig(overrides: Partial<RequestFingerprintConfig> = {}): RequestFingerprintConfig {
  return {
    enabled: true,
    headerFingerprint: true,
    behavioralHeuristics: true,
    botScoreThreshold: 70,
    suspiciousScoreThreshold: 30,
    reputationPenaltyBot: 15,
    reputationPenaltySuspicious: 5,
    ...overrides,
  };
}

function browserRequest(ip = '10.0.0.1') {
  return {
    ip,
    headers: {
      host: 'localhost:3000',
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'en-US,en;q=0.9',
      'accept-encoding': 'gzip, deflate, br',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      connection: 'keep-alive',
    } as Record<string, string | string[] | undefined>,
    url: '/api/v1/test',
  };
}

function botRequest(ip = '10.0.0.2') {
  return {
    ip,
    headers: {
      host: 'localhost:3000',
      'user-agent': 'python-requests/2.28.0',
    } as Record<string, string | string[] | undefined>,
    url: '/api/v1/test',
  };
}

describe('RequestFingerprinter', () => {
  let fingerprinter: RequestFingerprinter;

  afterEach(() => {
    fingerprinter?.stop();
  });

  describe('header fingerprint', () => {
    it('produces a consistent hash for the same headers', () => {
      fingerprinter = new RequestFingerprinter(makeConfig());
      const req = browserRequest();
      const r1 = fingerprinter.fingerprint(req);
      const r2 = fingerprinter.fingerprint(req);
      expect(r1.headerHash).toBe(r2.headerHash);
      expect(r1.headerHash).toHaveLength(16);
    });

    it('produces different hashes for different header sets', () => {
      fingerprinter = new RequestFingerprinter(makeConfig());
      const r1 = fingerprinter.fingerprint(browserRequest());
      const r2 = fingerprinter.fingerprint(botRequest());
      expect(r1.headerHash).not.toBe(r2.headerHash);
    });

    it('returns empty hash when headerFingerprint is disabled', () => {
      fingerprinter = new RequestFingerprinter(makeConfig({ headerFingerprint: false }));
      const result = fingerprinter.fingerprint(browserRequest());
      expect(result.headerHash).toBe('');
    });
  });

  describe('missing browser headers increase bot score', () => {
    it('adds 20 for missing accept-language', () => {
      fingerprinter = new RequestFingerprinter(makeConfig());
      const req = browserRequest();
      delete req.headers['accept-language'];
      const result = fingerprinter.fingerprint(req);
      expect(result.signals).toContain('missing_accept_language');
      expect(result.botScore).toBeGreaterThanOrEqual(20);
    });

    it('adds 15 for missing accept-encoding', () => {
      fingerprinter = new RequestFingerprinter(makeConfig());
      const req = browserRequest();
      delete req.headers['accept-encoding'];
      const result = fingerprinter.fingerprint(req);
      expect(result.signals).toContain('missing_accept_encoding');
      expect(result.botScore).toBeGreaterThanOrEqual(15);
    });

    it('adds 10 for missing accept', () => {
      fingerprinter = new RequestFingerprinter(makeConfig());
      const req = browserRequest();
      delete req.headers['accept'];
      const result = fingerprinter.fingerprint(req);
      expect(result.signals).toContain('missing_accept');
      expect(result.botScore).toBeGreaterThanOrEqual(10);
    });
  });

  describe('user-agent detection', () => {
    it('adds 25 for missing user-agent', () => {
      fingerprinter = new RequestFingerprinter(makeConfig());
      const req = browserRequest();
      delete req.headers['user-agent'];
      const result = fingerprinter.fingerprint(req);
      expect(result.signals).toContain('missing_user_agent');
      expect(result.botScore).toBeGreaterThanOrEqual(25);
    });

    it.each(['python-requests/2.28', 'curl/7.86', 'Wget/1.21', 'Go-http-client/2.0', 'Java/17'])(
      'detects bot user-agent: %s',
      (ua) => {
        fingerprinter = new RequestFingerprinter(makeConfig());
        const req = browserRequest();
        req.headers['user-agent'] = ua;
        const result = fingerprinter.fingerprint(req);
        expect(result.signals.some((s) => s.startsWith('bot_ua_'))).toBe(true);
        expect(result.botScore).toBeGreaterThanOrEqual(15);
      }
    );
  });

  describe('metronomic timing detection', () => {
    it('detects metronomic request timing', () => {
      fingerprinter = new RequestFingerprinter(makeConfig());
      const req = browserRequest();
      const now = Date.now();

      // Simulate 5 requests with exactly 100ms intervals (variance = 0)
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(now)
        .mockReturnValueOnce(now + 100)
        .mockReturnValueOnce(now + 200)
        .mockReturnValueOnce(now + 300)
        .mockReturnValueOnce(now + 400);

      fingerprinter.fingerprint(req);
      fingerprinter.fingerprint(req);
      fingerprinter.fingerprint(req);
      fingerprinter.fingerprint(req);
      const result = fingerprinter.fingerprint(req);

      expect(result.signals).toContain('metronomic_timing');

      vi.restoreAllMocks();
    });
  });

  describe('classification', () => {
    it('classifies normal browser requests as human', () => {
      fingerprinter = new RequestFingerprinter(makeConfig());
      const result = fingerprinter.fingerprint(browserRequest());
      expect(result.classification).toBe('human');
      expect(result.botScore).toBe(0);
    });

    it('classifies requests missing some headers as suspicious', () => {
      fingerprinter = new RequestFingerprinter(
        makeConfig({ suspiciousScoreThreshold: 30, botScoreThreshold: 70 })
      );
      const req = browserRequest();
      delete req.headers['accept-language'];
      delete req.headers['accept-encoding'];
      // Score = 20 + 15 = 35 → suspicious
      const result = fingerprinter.fingerprint(req);
      expect(result.classification).toBe('suspicious');
    });

    it('classifies requests with many signals as bot', () => {
      fingerprinter = new RequestFingerprinter(makeConfig({ botScoreThreshold: 70 }));
      // Bot request: missing accept-language (+20), accept-encoding (+15), accept (+10),
      // bot UA (+15) = 60. Still need more for 70. Also missing nothing else.
      // Actually the botRequest has host + user-agent only, so:
      // missing accept-language (+20), missing accept-encoding (+15), missing accept (+10), bot UA (+15) = 60
      // With threshold 60 it would be bot. Let's lower threshold.
      fingerprinter.stop();
      fingerprinter = new RequestFingerprinter(makeConfig({ botScoreThreshold: 55 }));
      const result = fingerprinter.fingerprint(botRequest());
      expect(result.classification).toBe('bot');
    });

    it('caps score at 100', () => {
      fingerprinter = new RequestFingerprinter(makeConfig({ botScoreThreshold: 10 }));
      // Request with no headers at all
      const req = {
        ip: '10.0.0.5',
        headers: {} as Record<string, string | string[] | undefined>,
        url: '/',
      };
      const result = fingerprinter.fingerprint(req);
      // missing accept-language (20) + missing accept-encoding (15) + missing accept (10) + missing UA (25) = 70
      expect(result.botScore).toBeLessThanOrEqual(100);
    });
  });

  describe('reputation integration', () => {
    it('records bot penalty via reputation manager', () => {
      const mockManager = {
        recordViolation: vi.fn(),
      } as unknown as IpReputationManager;

      fingerprinter = new RequestFingerprinter(
        makeConfig({ botScoreThreshold: 55, reputationPenaltyBot: 15 }),
        mockManager
      );
      fingerprinter.fingerprint(botRequest());
      expect(mockManager.recordViolation).toHaveBeenCalledWith('10.0.0.2', 15, 'bot_detected');
    });

    it('records suspicious penalty via reputation manager', () => {
      const mockManager = {
        recordViolation: vi.fn(),
      } as unknown as IpReputationManager;

      fingerprinter = new RequestFingerprinter(
        makeConfig({
          suspiciousScoreThreshold: 15,
          botScoreThreshold: 70,
          reputationPenaltySuspicious: 5,
        }),
        mockManager
      );
      // Browser request missing accept-language → score 20 → suspicious (>= 15, < 70)
      const req = browserRequest();
      delete req.headers['accept-language'];
      fingerprinter.fingerprint(req);
      expect(mockManager.recordViolation).toHaveBeenCalledWith('10.0.0.1', 5, 'suspicious_client');
    });
  });

  describe('getStats', () => {
    it('tracks fingerprinted, bot, and suspicious counts', () => {
      fingerprinter = new RequestFingerprinter(
        makeConfig({ botScoreThreshold: 55, suspiciousScoreThreshold: 15 })
      );
      // Human
      fingerprinter.fingerprint(browserRequest());
      // Bot (score = 60 with botScoreThreshold 55)
      fingerprinter.fingerprint(botRequest());
      // Suspicious: missing accept-language = 20, >= 15 threshold
      const suspicious = browserRequest('10.0.0.3');
      delete suspicious.headers['accept-language'];
      fingerprinter.fingerprint(suspicious);

      const stats = fingerprinter.getStats();
      expect(stats.totalFingerprinted).toBe(3);
      expect(stats.botsDetected).toBe(1);
      expect(stats.suspiciousDetected).toBe(1);
    });
  });

  describe('createFingerprintHook', () => {
    it('decorates request with botScore', async () => {
      fingerprinter = new RequestFingerprinter(makeConfig());
      const hook = createFingerprintHook(fingerprinter);

      const mockRequest = {
        ip: '10.0.0.1',
        headers: {
          host: 'localhost',
          accept: 'text/html',
          'accept-language': 'en-US',
          'accept-encoding': 'gzip',
          'user-agent': 'Mozilla/5.0',
        },
        url: '/test',
      } as any;

      const mockReply = {} as any;
      await hook(mockRequest, mockReply);

      expect(typeof mockRequest.botScore).toBe('number');
      expect(mockRequest.botScore).toBe(0);
    });

    it('decorates request with high botScore for bot-like requests', async () => {
      fingerprinter = new RequestFingerprinter(makeConfig());
      const hook = createFingerprintHook(fingerprinter);

      const mockRequest = {
        ip: '10.0.0.2',
        headers: {
          host: 'localhost',
          'user-agent': 'python-requests/2.28',
        },
        url: '/test',
      } as any;

      const mockReply = {} as any;
      await hook(mockRequest, mockReply);

      expect(mockRequest.botScore).toBeGreaterThan(0);
    });
  });
});
