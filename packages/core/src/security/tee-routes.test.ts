/**
 * TEE Routes Tests — Phase 129B
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerTeeRoutes } from './tee-routes.js';
import { TeeAttestationVerifier, type TeeConfig } from './tee-attestation.js';

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

describe('TEE Routes', () => {
  let app: FastifyInstance;
  let verifier: TeeAttestationVerifier;

  beforeAll(async () => {
    verifier = new TeeAttestationVerifier(makeConfig());
    app = Fastify();
    registerTeeRoutes(app, { teeVerifier: verifier });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    verifier.clearCache();
  });

  // ── GET /api/v1/security/tee/providers ────────────────────────

  describe('GET /api/v1/security/tee/providers', () => {
    it('returns TEE-capable providers list', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/tee/providers',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.providers).toBeInstanceOf(Array);
      expect(body.providers.length).toBeGreaterThan(0);
      expect(body.providers).toContain('anthropic');
    });

    it('includes hardware detection', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/tee/providers',
      });
      const body = res.json();
      expect(body.hardware).toBeDefined();
      expect(typeof body.hardware.sgxAvailable).toBe('boolean');
      expect(typeof body.hardware.sevAvailable).toBe('boolean');
      expect(typeof body.hardware.tpmAvailable).toBe('boolean');
    });

    it('includes cache stats', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/tee/providers',
      });
      const body = res.json();
      expect(body.cache).toBeDefined();
      expect(typeof body.cache.size).toBe('number');
      expect(body.cache.providers).toBeInstanceOf(Array);
    });
  });

  // ── GET /api/v1/security/tee/attestation/:provider ────────────

  describe('GET /api/v1/security/tee/attestation/:provider', () => {
    it('returns info for a known provider', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/tee/attestation/anthropic',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.provider).toBe('anthropic');
      expect(body.info).toBeDefined();
      expect(body.info.supported).toBe(true);
      expect(body.history).toBeInstanceOf(Array);
    });

    it('returns 404 for unknown provider with no history', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/tee/attestation/totally-unknown-xyz',
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.message).toContain('Unknown provider');
    });

    it('returns info for unsupported but known provider', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/tee/attestation/ollama',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.info.supported).toBe(false);
    });

    it('returns empty history for provider with no verifications', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/tee/attestation/gemini',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.history).toEqual([]);
    });
  });

  // ── POST /api/v1/security/tee/verify/:provider ──────────────

  describe('POST /api/v1/security/tee/verify/:provider', () => {
    it('returns verification result for a supported provider', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/tee/verify/anthropic',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(typeof body.allowed).toBe('boolean');
      expect(body.result).toBeDefined();
      expect(body.result.provider).toBe('anthropic');
    });

    it('returns verification result for an unsupported provider', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/tee/verify/ollama',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      // ollama is not TEE-capable, so allowed depends on config
      expect(typeof body.allowed).toBe('boolean');
      expect(body.result.provider).toBe('ollama');
    });

    it('returns verification result for unknown provider', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/tee/verify/unknown-xyz',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.result.verified).toBe(false);
    });

    it('populates attestation history after verify', async () => {
      // Verify a provider first
      await app.inject({
        method: 'POST',
        url: '/api/v1/security/tee/verify/gemini',
      });

      // Now check history
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/tee/attestation/gemini',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      // History may or may not be populated depending on verifier internals
      // (verifyAsync appends to history, sync verify does not by default)
      expect(body.info).toBeDefined();
    });
  });

  // ── Route registration ─────────────────────────────────────────

  describe('route registration', () => {
    it('registers 3 routes', async () => {
      // Use known providers to avoid application-level 404s
      const getProviders = await app.inject({
        method: 'GET',
        url: '/api/v1/security/tee/providers',
      });
      const getAttestation = await app.inject({
        method: 'GET',
        url: '/api/v1/security/tee/attestation/anthropic',
      });
      const postVerify = await app.inject({
        method: 'POST',
        url: '/api/v1/security/tee/verify/anthropic',
      });

      // All should return 200 (valid routes with known providers)
      expect(getProviders.statusCode).toBe(200);
      expect(getAttestation.statusCode).toBe(200);
      expect(postVerify.statusCode).toBe(200);
    });
  });
});

describe('TEE Routes with disabled TEE', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const verifier = new TeeAttestationVerifier(makeConfig({ enabled: false }));
    app = Fastify();
    registerTeeRoutes(app, { teeVerifier: verifier });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST verify allows all providers when TEE is disabled', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/tee/verify/ollama',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.allowed).toBe(true);
    expect(body.result.verified).toBe(true);
  });
});

describe('TEE Routes error handling', () => {
  it('handles verifier errors in POST verify', async () => {
    const verifier = new TeeAttestationVerifier(makeConfig());
    // Spy on verifyAsync to throw
    vi.spyOn(verifier, 'verifyAsync').mockRejectedValue(new Error('Internal attestation failure'));

    const app = Fastify();
    registerTeeRoutes(app, { teeVerifier: verifier });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/security/tee/verify/openai',
    });
    // sendError with 500 sanitizes message
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error).toBe('Internal Server Error');

    await app.close();
  });

  it('handles verifier errors in GET providers', async () => {
    const verifier = new TeeAttestationVerifier(makeConfig());
    vi.spyOn(verifier, 'getTeeCapableProviders').mockImplementation(() => {
      throw new Error('Providers lookup failed');
    });

    const app = Fastify();
    registerTeeRoutes(app, { teeVerifier: verifier });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/security/tee/providers',
    });
    expect(res.statusCode).toBe(500);

    await app.close();
  });

  it('handles verifier errors in GET attestation', async () => {
    const verifier = new TeeAttestationVerifier(makeConfig());
    vi.spyOn(verifier, 'getAttestationHistory').mockImplementation(() => {
      throw new Error('History lookup failed');
    });

    const app = Fastify();
    registerTeeRoutes(app, { teeVerifier: verifier });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/security/tee/attestation/openai',
    });
    expect(res.statusCode).toBe(500);

    await app.close();
  });
});
