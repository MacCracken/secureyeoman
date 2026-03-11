/**
 * Route handler tests for WebAuthn/FIDO2 endpoints.
 * Uses Fastify inject() — no real DB, manager is mocked.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerWebAuthnRoutes } from './webauthn-routes.js';
import type { WebAuthnManager } from './webauthn.js';

// ── Mock manager factory ─────────────────────────────────────────────

function makeMockManager(): WebAuthnManager {
  return {
    generateRegistrationOptions: vi.fn(),
    verifyRegistration: vi.fn(),
    generateAuthenticationOptions: vi.fn(),
    verifyAuthentication: vi.fn(),
    listCredentials: vi.fn(),
    removeCredential: vi.fn(),
  } as unknown as WebAuthnManager;
}

// ── Sample data ──────────────────────────────────────────────────────

const SAMPLE_REG_OPTIONS = {
  rp: { name: 'SecureYeoman', id: 'localhost' },
  user: { id: 'user-1', name: 'alice', displayName: 'alice' },
  challenge: 'dGVzdC1jaGFsbGVuZ2U',
  pubKeyCredParams: [
    { type: 'public-key', alg: -7 },
    { type: 'public-key', alg: -257 },
  ],
  timeout: 60000,
  excludeCredentials: [],
  authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  attestation: 'none',
};

const SAMPLE_AUTH_OPTIONS = {
  challenge: 'YXV0aC1jaGFsbGVuZ2U',
  timeout: 60000,
  rpId: 'localhost',
  allowCredentials: [],
  userVerification: 'preferred',
};

const SAMPLE_CREDENTIAL_ITEM = {
  id: 'row-1',
  credential_id: 'cred-abc',
  device_type: 'platform',
  backed_up: false,
  transports: ['internal'],
  display_name: 'My Key',
  created_at: 1000,
  last_used_at: 2000,
  public_key: 'pem-data',
  user_id: 'user-1',
  counter: 5,
};

// ── Tests ────────────────────────────────────────────────────────────

describe('WebAuthn Routes', () => {
  let app: FastifyInstance;
  let mgr: ReturnType<typeof makeMockManager>;

  beforeAll(async () => {
    app = Fastify();

    // Decorate request with authUser for authenticated routes
    app.decorateRequest('authUser', null);
    app.addHook('onRequest', async (request) => {
      const authHeader = request.headers['x-test-auth-user'];
      if (authHeader) {
        (request as any).authUser = { userId: String(authHeader), userName: 'testuser' };
      }
    });

    mgr = makeMockManager();
    registerWebAuthnRoutes(app, { webAuthnManager: mgr });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── POST /api/v1/auth/webauthn/register/options ────────────────

  describe('POST /api/v1/auth/webauthn/register/options', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/webauthn/register/options',
        payload: {},
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().message).toBe('Authentication required');
    });

    it('returns registration options for authenticated user', async () => {
      (mgr.generateRegistrationOptions as ReturnType<typeof vi.fn>).mockResolvedValue(
        SAMPLE_REG_OPTIONS
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/webauthn/register/options',
        headers: { 'x-test-auth-user': 'user-1', 'content-type': 'application/json' },
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.challenge).toBe(SAMPLE_REG_OPTIONS.challenge);
      expect(body.rp.name).toBe('SecureYeoman');
    });
  });

  // ── POST /api/v1/auth/webauthn/register/verify ────────────────

  describe('POST /api/v1/auth/webauthn/register/verify', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/webauthn/register/verify',
        payload: { challenge: 'abc', response: {} },
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 400 when challenge/response missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/webauthn/register/verify',
        headers: { 'x-test-auth-user': 'user-1', 'content-type': 'application/json' },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('challenge and response are required');
    });

    it('returns 201 on successful verification', async () => {
      (mgr.verifyRegistration as ReturnType<typeof vi.fn>).mockResolvedValue({
        verified: true,
        credential: { credentialId: 'cred-abc', publicKey: 'pem', counter: 0 },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/webauthn/register/verify',
        headers: { 'x-test-auth-user': 'user-1', 'content-type': 'application/json' },
        payload: {
          challenge: 'test-challenge',
          response: {
            id: 'cred-1',
            rawId: 'cred-1',
            type: 'public-key',
            response: { clientDataJSON: 'abc', attestationObject: 'def' },
          },
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().verified).toBe(true);
    });

    it('returns 400 when verification fails', async () => {
      (mgr.verifyRegistration as ReturnType<typeof vi.fn>).mockResolvedValue({
        verified: false,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/webauthn/register/verify',
        headers: { 'x-test-auth-user': 'user-1', 'content-type': 'application/json' },
        payload: {
          challenge: 'test-challenge',
          response: {
            id: 'cred-1',
            rawId: 'cred-1',
            type: 'public-key',
            response: { clientDataJSON: 'abc', attestationObject: 'def' },
          },
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Registration verification failed');
    });
  });

  // ── POST /api/v1/auth/webauthn/authenticate/options ────────────

  describe('POST /api/v1/auth/webauthn/authenticate/options', () => {
    it('returns authentication options without auth', async () => {
      (mgr.generateAuthenticationOptions as ReturnType<typeof vi.fn>).mockResolvedValue(
        SAMPLE_AUTH_OPTIONS
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/webauthn/authenticate/options',
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().challenge).toBe(SAMPLE_AUTH_OPTIONS.challenge);
      expect(res.json().rpId).toBe('localhost');
    });
  });

  // ── POST /api/v1/auth/webauthn/authenticate/verify ─────────────

  describe('POST /api/v1/auth/webauthn/authenticate/verify', () => {
    it('returns 400 when challenge/response missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/webauthn/authenticate/verify',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('challenge and response are required');
    });

    it('returns 200 on successful authentication', async () => {
      (mgr.verifyAuthentication as ReturnType<typeof vi.fn>).mockResolvedValue({
        verified: true,
        credentialId: 'cred-abc',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/webauthn/authenticate/verify',
        payload: {
          challenge: 'auth-challenge',
          response: {
            id: 'cred-abc',
            rawId: 'cred-abc',
            type: 'public-key',
            response: { clientDataJSON: 'a', authenticatorData: 'b', signature: 'c' },
          },
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().verified).toBe(true);
      expect(res.json().credentialId).toBe('cred-abc');
    });

    it('returns 401 on failed authentication', async () => {
      (mgr.verifyAuthentication as ReturnType<typeof vi.fn>).mockResolvedValue({
        verified: false,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/webauthn/authenticate/verify',
        payload: {
          challenge: 'auth-challenge',
          response: {
            id: 'bad',
            rawId: 'bad',
            type: 'public-key',
            response: { clientDataJSON: 'a', authenticatorData: 'b', signature: 'c' },
          },
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().message).toBe('Authentication failed');
    });
  });

  // ── GET /api/v1/auth/webauthn/credentials ──────────────────────

  describe('GET /api/v1/auth/webauthn/credentials', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/webauthn/credentials',
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns credentials list without public keys', async () => {
      (mgr.listCredentials as ReturnType<typeof vi.fn>).mockResolvedValue([SAMPLE_CREDENTIAL_ITEM]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/webauthn/credentials',
        headers: { 'x-test-auth-user': 'user-1' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.credentials).toHaveLength(1);
      expect(body.credentials[0].credentialId).toBe('cred-abc');
      expect(body.credentials[0].displayName).toBe('My Key');
      // Ensure public_key is NOT in the response
      expect(body.credentials[0].public_key).toBeUndefined();
      expect(body.credentials[0].publicKey).toBeUndefined();
    });
  });

  // ── DELETE /api/v1/auth/webauthn/credentials/:id ───────────────

  describe('DELETE /api/v1/auth/webauthn/credentials/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/auth/webauthn/credentials/cred-abc',
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 204 on successful deletion', async () => {
      (mgr.removeCredential as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/auth/webauthn/credentials/cred-abc',
        headers: { 'x-test-auth-user': 'user-1' },
      });

      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when credential not found', async () => {
      (mgr.removeCredential as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/auth/webauthn/credentials/nonexistent',
        headers: { 'x-test-auth-user': 'user-1' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().message).toBe('Credential not found');
    });
  });
});
