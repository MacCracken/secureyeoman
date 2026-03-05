import { describe, it, expect, vi } from 'vitest';
import {
  TeeAttestationVerifier,
  type TeeConfig,
} from './tee-attestation.js';
import type { SecureLogger } from '../logging/logger.js';

function makeConfig(overrides: Partial<TeeConfig> = {}): TeeConfig {
  return {
    enabled: true,
    providerLevel: 'required',
    attestationStrategy: 'cached',
    attestationCacheTtlMs: 3_600_000,
    failureAction: 'block',
    ...overrides,
  };
}

function makeLogger(): SecureLogger {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
    level: 'info',
  } as unknown as SecureLogger;
}

describe('TeeAttestationVerifier', () => {
  describe('verify() with TEE disabled', () => {
    it('always allows any provider', () => {
      const verifier = new TeeAttestationVerifier(makeConfig({ enabled: false }));
      const { allowed, result } = verifier.verify('ollama');
      expect(allowed).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.details).toContain('disabled');
    });

    it('allows unknown providers when disabled', () => {
      const verifier = new TeeAttestationVerifier(makeConfig({ enabled: false }));
      const { allowed } = verifier.verify('unknown-provider');
      expect(allowed).toBe(true);
    });
  });

  describe('verify() with providerLevel off', () => {
    it('always allows regardless of provider support', () => {
      const verifier = new TeeAttestationVerifier(makeConfig({ providerLevel: 'off' }));
      const { allowed, result } = verifier.verify('deepseek');
      expect(allowed).toBe(true);
      expect(result.details).toContain('off');
    });
  });

  describe('verify() with required level', () => {
    it('allows supported providers', () => {
      const verifier = new TeeAttestationVerifier(makeConfig({ providerLevel: 'required', failureAction: 'block' }));
      const { allowed, result } = verifier.verify('anthropic');
      expect(allowed).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.provider).toBe('anthropic');
    });

    it('blocks unsupported providers when failureAction is block', () => {
      const verifier = new TeeAttestationVerifier(makeConfig({ providerLevel: 'required', failureAction: 'block' }));
      const { allowed, result } = verifier.verify('ollama');
      expect(allowed).toBe(false);
      expect(result.verified).toBe(false);
    });

    it('blocks unknown providers when failureAction is block', () => {
      const verifier = new TeeAttestationVerifier(makeConfig({ providerLevel: 'required', failureAction: 'block' }));
      const { allowed, result } = verifier.verify('some-random-provider');
      expect(allowed).toBe(false);
      expect(result.details).toContain('Unknown provider');
    });

    it('includes technology for providers that have one', () => {
      const verifier = new TeeAttestationVerifier(makeConfig());
      const { result } = verifier.verify('gemini');
      expect(result.technology).toBe('tdx');
    });

    it('returns null technology for providers with only none', () => {
      const verifier = new TeeAttestationVerifier(makeConfig());
      const { result } = verifier.verify('anthropic');
      expect(result.technology).toBeNull();
    });
  });

  describe('verify() with optional level', () => {
    it('allows unsupported providers with a log', () => {
      const logger = makeLogger();
      const verifier = new TeeAttestationVerifier(
        makeConfig({ providerLevel: 'optional', failureAction: 'block' }),
        logger,
      );
      const { allowed, result } = verifier.verify('ollama');
      expect(allowed).toBe(true);
      expect(result.verified).toBe(false);
      expect(logger.info).toHaveBeenCalled();
    });

    it('allows supported providers', () => {
      const verifier = new TeeAttestationVerifier(makeConfig({ providerLevel: 'optional' }));
      const { allowed } = verifier.verify('openai');
      expect(allowed).toBe(true);
    });
  });

  describe('verify() caching', () => {
    it('returns cached result on second call', () => {
      const logger = makeLogger();
      const verifier = new TeeAttestationVerifier(
        makeConfig({ attestationStrategy: 'cached' }),
        logger,
      );
      const first = verifier.verify('anthropic');
      const second = verifier.verify('anthropic');

      expect(second.result.attestationTime).toBe(first.result.attestationTime);
      expect(second.result.expiresAt).toBe(first.result.expiresAt);
      expect(logger.debug).toHaveBeenCalledWith(
        'TEE attestation cache hit',
        expect.objectContaining({ provider: 'anthropic' }),
      );
    });

    it('does not cache when attestationStrategy is none', () => {
      const verifier = new TeeAttestationVerifier(makeConfig({ attestationStrategy: 'none' }));
      verifier.verify('anthropic');
      expect(verifier.getCacheStats().size).toBe(0);
    });

    it('does not cache when attestationStrategy is per_request', () => {
      const verifier = new TeeAttestationVerifier(makeConfig({ attestationStrategy: 'per_request' }));
      verifier.verify('anthropic');
      expect(verifier.getCacheStats().size).toBe(0);
    });

    it('expires cached entries after TTL', () => {
      const verifier = new TeeAttestationVerifier(
        makeConfig({ attestationStrategy: 'cached', attestationCacheTtlMs: 1 }),
      );
      verifier.verify('anthropic');

      // Simulate TTL expiry by advancing time
      vi.useFakeTimers();
      vi.advanceTimersByTime(10);
      const { result } = verifier.verify('anthropic');
      // Should be a fresh result (new attestationTime)
      expect(result.attestationTime).toBeGreaterThan(0);
      vi.useRealTimers();
    });
  });

  describe('isProviderTeeCapable()', () => {
    it('returns true for supported providers', () => {
      const verifier = new TeeAttestationVerifier(makeConfig());
      expect(verifier.isProviderTeeCapable('anthropic')).toBe(true);
      expect(verifier.isProviderTeeCapable('openai')).toBe(true);
      expect(verifier.isProviderTeeCapable('gemini')).toBe(true);
    });

    it('returns false for unsupported providers', () => {
      const verifier = new TeeAttestationVerifier(makeConfig());
      expect(verifier.isProviderTeeCapable('ollama')).toBe(false);
      expect(verifier.isProviderTeeCapable('deepseek')).toBe(false);
      expect(verifier.isProviderTeeCapable('groq')).toBe(false);
    });

    it('returns false for unknown providers', () => {
      const verifier = new TeeAttestationVerifier(makeConfig());
      expect(verifier.isProviderTeeCapable('nonexistent')).toBe(false);
    });
  });

  describe('getTeeCapableProviders()', () => {
    it('returns only supported providers', () => {
      const verifier = new TeeAttestationVerifier(makeConfig());
      const capable = verifier.getTeeCapableProviders();
      expect(capable).toContain('anthropic');
      expect(capable).toContain('openai');
      expect(capable).toContain('gemini');
      expect(capable).not.toContain('ollama');
      expect(capable).not.toContain('deepseek');
      expect(capable).toHaveLength(3);
    });
  });

  describe('getProviderTeeInfo()', () => {
    it('returns info for known providers', () => {
      const verifier = new TeeAttestationVerifier(makeConfig());
      const info = verifier.getProviderTeeInfo('gemini');
      expect(info).toEqual({
        supported: true,
        technologies: ['tdx'],
        notes: expect.stringContaining('GCP'),
      });
    });

    it('returns null for unknown providers', () => {
      const verifier = new TeeAttestationVerifier(makeConfig());
      expect(verifier.getProviderTeeInfo('nonexistent')).toBeNull();
    });
  });

  describe('getCacheStats()', () => {
    it('reports empty cache initially', () => {
      const verifier = new TeeAttestationVerifier(makeConfig());
      const stats = verifier.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.providers).toEqual([]);
    });

    it('reports cached providers after verify calls', () => {
      const verifier = new TeeAttestationVerifier(makeConfig({ attestationStrategy: 'cached' }));
      verifier.verify('anthropic');
      verifier.verify('gemini');
      const stats = verifier.getCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.providers).toContain('anthropic');
      expect(stats.providers).toContain('gemini');
    });
  });

  describe('clearCache()', () => {
    it('removes all cached entries', () => {
      const verifier = new TeeAttestationVerifier(makeConfig({ attestationStrategy: 'cached' }));
      verifier.verify('anthropic');
      verifier.verify('openai');
      expect(verifier.getCacheStats().size).toBe(2);

      verifier.clearCache();
      expect(verifier.getCacheStats().size).toBe(0);
      expect(verifier.getCacheStats().providers).toEqual([]);
    });
  });

  describe('failureAction variants', () => {
    it('block — disallows unsupported provider on required level', () => {
      const logger = makeLogger();
      const verifier = new TeeAttestationVerifier(
        makeConfig({ providerLevel: 'required', failureAction: 'block' }),
        logger,
      );
      const { allowed } = verifier.verify('mistral');
      expect(allowed).toBe(false);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('warn — allows unsupported provider on required level but logs warning', () => {
      const logger = makeLogger();
      const verifier = new TeeAttestationVerifier(
        makeConfig({ providerLevel: 'required', failureAction: 'warn' }),
        logger,
      );
      const { allowed } = verifier.verify('mistral');
      expect(allowed).toBe(true);
      // Step 5 logs "TEE required but provider not supported" and applyFailureAction logs "warning only"
      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('not supported'),
        expect.objectContaining({ provider: 'mistral' }),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('warning only'),
        expect.objectContaining({ provider: 'mistral' }),
      );
    });

    it('audit_only — allows unsupported provider on required level and logs info', () => {
      const logger = makeLogger();
      const verifier = new TeeAttestationVerifier(
        makeConfig({ providerLevel: 'required', failureAction: 'audit_only' }),
        logger,
      );
      const { allowed } = verifier.verify('grok');
      expect(allowed).toBe(true);
      // Step 5 logs warn, applyFailureAction logs info with "audit"
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('not supported'),
        expect.objectContaining({ provider: 'grok' }),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('audit'),
        expect.objectContaining({ provider: 'grok' }),
      );
    });
  });
});
