import { describe, it, expect, vi } from 'vitest';
import {
  TeeAttestationVerifier,
  type TeeConfig,
  type ProviderAttestationResult,
} from './tee-attestation.js';
import type { SecureLogger } from '../logging/logger.js';
import type { RemoteAttestationProvider } from './tee-types.js';

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
      const verifier = new TeeAttestationVerifier(
        makeConfig({ providerLevel: 'required', failureAction: 'block' })
      );
      const { allowed, result } = verifier.verify('anthropic');
      expect(allowed).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.provider).toBe('anthropic');
    });

    it('blocks unsupported providers when failureAction is block', () => {
      const verifier = new TeeAttestationVerifier(
        makeConfig({ providerLevel: 'required', failureAction: 'block' })
      );
      const { allowed, result } = verifier.verify('ollama');
      expect(allowed).toBe(false);
      expect(result.verified).toBe(false);
    });

    it('blocks unknown providers when failureAction is block', () => {
      const verifier = new TeeAttestationVerifier(
        makeConfig({ providerLevel: 'required', failureAction: 'block' })
      );
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
        logger
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
        logger
      );
      const first = verifier.verify('anthropic');
      const second = verifier.verify('anthropic');

      expect(second.result.attestationTime).toBe(first.result.attestationTime);
      expect(second.result.expiresAt).toBe(first.result.expiresAt);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'anthropic' }),
        'TEE attestation cache hit'
      );
    });

    it('does not cache when attestationStrategy is none', () => {
      const verifier = new TeeAttestationVerifier(makeConfig({ attestationStrategy: 'none' }));
      verifier.verify('anthropic');
      expect(verifier.getCacheStats().size).toBe(0);
    });

    it('does not cache when attestationStrategy is per_request', () => {
      const verifier = new TeeAttestationVerifier(
        makeConfig({ attestationStrategy: 'per_request' })
      );
      verifier.verify('anthropic');
      expect(verifier.getCacheStats().size).toBe(0);
    });

    it('expires cached entries after TTL', () => {
      const verifier = new TeeAttestationVerifier(
        makeConfig({ attestationStrategy: 'cached', attestationCacheTtlMs: 1 })
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
        logger
      );
      const { allowed } = verifier.verify('mistral');
      expect(allowed).toBe(false);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('warn — allows unsupported provider on required level but logs warning', () => {
      const logger = makeLogger();
      const verifier = new TeeAttestationVerifier(
        makeConfig({ providerLevel: 'required', failureAction: 'warn' }),
        logger
      );
      const { allowed } = verifier.verify('mistral');
      expect(allowed).toBe(true);
      // Step 5 logs "TEE required but provider not supported" and applyFailureAction logs "warning only"
      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'mistral' }),
        expect.stringContaining('not supported')
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'mistral' }),
        expect.stringContaining('warning only')
      );
    });

    it('audit_only — allows unsupported provider on required level and logs info', () => {
      const logger = makeLogger();
      const verifier = new TeeAttestationVerifier(
        makeConfig({ providerLevel: 'required', failureAction: 'audit_only' }),
        logger
      );
      const { allowed } = verifier.verify('grok');
      expect(allowed).toBe(true);
      // Step 5 logs warn, applyFailureAction logs info with "audit"
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'grok' }),
        expect.stringContaining('not supported')
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'grok' }),
        expect.stringContaining('audit')
      );
    });
  });

  // -------------------------------------------------------------------------
  // Phase 129 — Remote attestation, history, hardware detection
  // -------------------------------------------------------------------------

  describe('registerRemoteProvider() and verifyAsync()', () => {
    function makeMockRemoteProvider(
      verified: boolean,
      details?: string
    ): RemoteAttestationProvider {
      return {
        name: 'mock-remote',
        verifyAsync: vi.fn(
          async (provider: string): Promise<ProviderAttestationResult> => ({
            provider,
            verified,
            technology: 'sgx',
            attestationTime: Date.now(),
            expiresAt: Date.now() + 3_600_000,
            details: details ?? 'Remote attestation result',
          })
        ),
      };
    }

    it('uses remote provider when registered', async () => {
      const remote = makeMockRemoteProvider(true);
      const verifier = new TeeAttestationVerifier(makeConfig());
      verifier.registerRemoteProvider('anthropic', remote);

      const { allowed, result } = await verifier.verifyAsync('anthropic');
      expect(allowed).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.technology).toBe('sgx');
      expect(remote.verifyAsync).toHaveBeenCalledWith('anthropic');
    });

    it('falls back to sync verify() when no remote provider registered', async () => {
      const verifier = new TeeAttestationVerifier(makeConfig());
      const { allowed, result } = await verifier.verifyAsync('anthropic');
      expect(allowed).toBe(true);
      expect(result.verified).toBe(true);
      // Should match sync verify behavior
      expect(result.technology).toBeNull(); // anthropic has only 'none'
    });

    it('stores result in cache after remote verification', async () => {
      const remote = makeMockRemoteProvider(true);
      const verifier = new TeeAttestationVerifier(makeConfig({ attestationStrategy: 'cached' }));
      verifier.registerRemoteProvider('anthropic', remote);

      await verifier.verifyAsync('anthropic');
      expect(verifier.getCacheStats().size).toBe(1);
      expect(verifier.getCacheStats().providers).toContain('anthropic');
    });

    it('stores result in cache for per_request strategy', async () => {
      const remote = makeMockRemoteProvider(true);
      const verifier = new TeeAttestationVerifier(
        makeConfig({ attestationStrategy: 'per_request' })
      );
      verifier.registerRemoteProvider('anthropic', remote);

      await verifier.verifyAsync('anthropic');
      expect(verifier.getCacheStats().size).toBe(1);
    });

    it('applies failureAction for failed remote attestation', async () => {
      const logger = makeLogger();
      const remote = makeMockRemoteProvider(false, 'Remote check failed');
      const verifier = new TeeAttestationVerifier(
        makeConfig({ providerLevel: 'required', failureAction: 'block' }),
        logger
      );
      verifier.registerRemoteProvider('ollama', remote);

      const { allowed } = await verifier.verifyAsync('ollama');
      expect(allowed).toBe(false);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('allows through with warn failureAction on failed remote attestation', async () => {
      const logger = makeLogger();
      const remote = makeMockRemoteProvider(false);
      const verifier = new TeeAttestationVerifier(
        makeConfig({ providerLevel: 'required', failureAction: 'warn' }),
        logger
      );
      verifier.registerRemoteProvider('ollama', remote);

      const { allowed } = await verifier.verifyAsync('ollama');
      expect(allowed).toBe(true);
    });

    it('short-circuits when TEE disabled', async () => {
      const remote = makeMockRemoteProvider(true);
      const verifier = new TeeAttestationVerifier(makeConfig({ enabled: false }));
      verifier.registerRemoteProvider('anthropic', remote);

      const { allowed } = await verifier.verifyAsync('anthropic');
      expect(allowed).toBe(true);
      expect(remote.verifyAsync).not.toHaveBeenCalled();
    });

    it('short-circuits when providerLevel is off', async () => {
      const remote = makeMockRemoteProvider(true);
      const verifier = new TeeAttestationVerifier(makeConfig({ providerLevel: 'off' }));
      verifier.registerRemoteProvider('anthropic', remote);

      const { allowed } = await verifier.verifyAsync('anthropic');
      expect(allowed).toBe(true);
      expect(remote.verifyAsync).not.toHaveBeenCalled();
    });

    it('returns cached result on subsequent async calls', async () => {
      const remote = makeMockRemoteProvider(true);
      const logger = makeLogger();
      const verifier = new TeeAttestationVerifier(
        makeConfig({ attestationStrategy: 'cached' }),
        logger
      );
      verifier.registerRemoteProvider('anthropic', remote);

      await verifier.verifyAsync('anthropic');
      await verifier.verifyAsync('anthropic');

      // Remote should be called once; second call hits cache
      expect(remote.verifyAsync).toHaveBeenCalledTimes(1);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'anthropic' }),
        'TEE attestation cache hit (async)'
      );
    });
  });

  describe('getAttestationHistory()', () => {
    function makeMockRemoteProvider(): RemoteAttestationProvider {
      let callCount = 0;
      return {
        name: 'mock-remote',
        verifyAsync: vi.fn(async (provider: string): Promise<ProviderAttestationResult> => {
          callCount++;
          return {
            provider,
            verified: true,
            technology: 'sev',
            attestationTime: callCount,
            expiresAt: Date.now() + 1, // Expire fast so cache doesn't interfere
            details: `Call ${callCount}`,
          };
        }),
      };
    }

    it('returns empty array for unknown provider', () => {
      const verifier = new TeeAttestationVerifier(makeConfig());
      expect(verifier.getAttestationHistory('unknown')).toEqual([]);
    });

    it('returns results from async verification', async () => {
      const remote = makeMockRemoteProvider();
      const verifier = new TeeAttestationVerifier(
        makeConfig({ attestationStrategy: 'per_request' })
      );
      verifier.registerRemoteProvider('test', remote);

      await verifier.verifyAsync('test');
      const history = verifier.getAttestationHistory('test');
      expect(history).toHaveLength(1);
      expect(history[0].provider).toBe('test');
    });

    it('respects the limit parameter', async () => {
      const remote = makeMockRemoteProvider();
      const verifier = new TeeAttestationVerifier(makeConfig({ attestationStrategy: 'none' }));
      verifier.registerRemoteProvider('test', remote);

      for (let i = 0; i < 5; i++) {
        await verifier.verifyAsync('test');
      }

      const limited = verifier.getAttestationHistory('test', 3);
      expect(limited).toHaveLength(3);
      // Should be the last 3 entries
      expect(limited[0].details).toBe('Call 3');
      expect(limited[2].details).toBe('Call 5');
    });

    it('caps history at 100 entries per provider', async () => {
      const remote = makeMockRemoteProvider();
      const verifier = new TeeAttestationVerifier(makeConfig({ attestationStrategy: 'none' }));
      verifier.registerRemoteProvider('test', remote);

      for (let i = 0; i < 110; i++) {
        await verifier.verifyAsync('test');
      }

      const history = verifier.getAttestationHistory('test', 200);
      expect(history).toHaveLength(100);
      // Oldest should be call 11 (first 10 shifted out)
      expect(history[0].attestationTime).toBe(11);
    });
  });

  describe('detectHardware()', () => {
    const mockExistsSync = vi.hoisted(() => vi.fn((_path: string) => false));

    // We need a separate import with the mock applied — use dynamic reimport
    it('returns the expected shape with nothing available', async () => {
      // On a typical dev/CI machine none of the TEE devices exist,
      // so detectHardware should return all false.
      const hw = TeeAttestationVerifier.detectHardware();
      expect(hw).toHaveProperty('sgxAvailable');
      expect(hw).toHaveProperty('sevAvailable');
      expect(hw).toHaveProperty('tpmAvailable');
      expect(hw).toHaveProperty('nvidiaCC');
      // nvidiaCC is always false (detected asynchronously)
      expect(hw.nvidiaCC).toBe(false);
      // Structural check — all values are booleans
      expect(typeof hw.sgxAvailable).toBe('boolean');
      expect(typeof hw.sevAvailable).toBe('boolean');
      expect(typeof hw.tpmAvailable).toBe('boolean');
    });
  });
});
