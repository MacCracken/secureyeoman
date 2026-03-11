/**
 * Unit tests for WebAuthnManager — fully mocked storage, no DB required.
 * Tests flow and validation logic; does not test actual crypto verification
 * (that requires real authenticator-generated keys).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────

const MOCK_UUID = 'test-uuid-webauthn-001';

vi.mock('../utils/crypto.js', () => ({
  uuidv7: vi.fn(() => MOCK_UUID),
}));

// ── Imports ──────────────────────────────────────────────────────────

import { WebAuthnManager } from './webauthn.js';
import type {
  WebAuthnStorage,
  WebAuthnCredentialRow,
  WebAuthnChallengeRow,
} from './webauthn-storage.js';

// ── Mock storage factory ─────────────────────────────────────────────

function makeMockStorage() {
  return {
    storeCredential: vi.fn(),
    getCredential: vi.fn(),
    getCredentialsByUser: vi.fn().mockResolvedValue([]),
    updateCounter: vi.fn(),
    updateLastUsed: vi.fn(),
    deleteCredential: vi.fn().mockResolvedValue(1),
    storeChallenge: vi.fn(),
    getChallenge: vi.fn(),
    deleteChallenge: vi.fn(),
    cleanExpiredChallenges: vi.fn().mockResolvedValue(0),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function makeManager(storage: ReturnType<typeof makeMockStorage>): WebAuthnManager {
  return new WebAuthnManager({
    storage: storage as unknown as WebAuthnStorage,
    rpName: 'SecureYeoman',
    rpId: 'localhost',
    origin: 'https://localhost',
  });
}

const SAMPLE_CREDENTIAL: WebAuthnCredentialRow = {
  id: 'cred-row-1',
  user_id: 'user-1',
  credential_id: 'cred-id-abc',
  public_key: '-----BEGIN PUBLIC KEY-----\nMFkw...\n-----END PUBLIC KEY-----',
  counter: 5,
  device_type: 'platform',
  backed_up: false,
  transports: ['internal'],
  display_name: 'My MacBook',
  created_at: 1000,
  last_used_at: 2000,
};

const SAMPLE_CHALLENGE: WebAuthnChallengeRow = {
  id: 'challenge-1',
  challenge: 'dGVzdC1jaGFsbGVuZ2U',
  user_id: 'user-1',
  type: 'registration',
  expires_at: Date.now() + 300_000,
  created_at: Date.now(),
};

// ── Tests ────────────────────────────────────────────────────────────

describe('WebAuthnManager', () => {
  let storage: ReturnType<typeof makeMockStorage>;
  let mgr: WebAuthnManager;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = makeMockStorage();
    mgr = makeManager(storage);
  });

  // ── Registration Options ──────────────────────────────────────

  describe('generateRegistrationOptions', () => {
    it('returns options with correct RP info', async () => {
      const opts = await mgr.generateRegistrationOptions('user-1', 'alice');

      expect(opts.rp).toEqual({ name: 'SecureYeoman', id: 'localhost' });
      expect(opts.user).toEqual({ id: 'user-1', name: 'alice', displayName: 'alice' });
    });

    it('generates a base64url challenge', async () => {
      const opts = await mgr.generateRegistrationOptions('user-1', 'alice');

      expect(typeof opts.challenge).toBe('string');
      expect(opts.challenge.length).toBeGreaterThan(0);
      // base64url: no +, /, or = padding by default
      expect(opts.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('stores the challenge in storage', async () => {
      await mgr.generateRegistrationOptions('user-1', 'alice');

      expect(storage.storeChallenge).toHaveBeenCalledOnce();
      const [id, challenge, userId, type, expiresAt] = storage.storeChallenge.mock.calls[0]!;
      expect(id).toBe(MOCK_UUID);
      expect(typeof challenge).toBe('string');
      expect(userId).toBe('user-1');
      expect(type).toBe('registration');
      expect(expiresAt).toBeGreaterThan(Date.now());
    });

    it('includes ES256 and RS256 algorithms', async () => {
      const opts = await mgr.generateRegistrationOptions('user-1', 'alice');

      const algs = opts.pubKeyCredParams.map((p) => p.alg);
      expect(algs).toContain(-7); // ES256
      expect(algs).toContain(-257); // RS256
    });

    it('populates excludeCredentials from existing IDs', async () => {
      const opts = await mgr.generateRegistrationOptions('user-1', 'alice', ['cred-a', 'cred-b']);

      expect(opts.excludeCredentials).toHaveLength(2);
      expect(opts.excludeCredentials[0]).toEqual({ id: 'cred-a', type: 'public-key' });
    });

    it('returns empty excludeCredentials when none provided', async () => {
      const opts = await mgr.generateRegistrationOptions('user-1', 'alice');
      expect(opts.excludeCredentials).toHaveLength(0);
    });

    it('sets attestation to none', async () => {
      const opts = await mgr.generateRegistrationOptions('user-1', 'alice');
      expect(opts.attestation).toBe('none');
    });

    it('sets timeout to 60000ms', async () => {
      const opts = await mgr.generateRegistrationOptions('user-1', 'alice');
      expect(opts.timeout).toBe(60000);
    });
  });

  // ── Verify Registration ────────────────────────────────────────

  describe('verifyRegistration', () => {
    it('returns verified: false when challenge not found', async () => {
      storage.getChallenge.mockResolvedValue(null);

      const result = await mgr.verifyRegistration('bad-challenge', {
        id: 'cred-1',
        rawId: 'cred-1',
        type: 'public-key',
        response: { clientDataJSON: '', attestationObject: '' },
      });

      expect(result.verified).toBe(false);
    });

    it('returns verified: false when challenge is expired', async () => {
      storage.getChallenge.mockResolvedValue({
        ...SAMPLE_CHALLENGE,
        expires_at: Date.now() - 1000, // expired
      });

      const result = await mgr.verifyRegistration(SAMPLE_CHALLENGE.challenge, {
        id: 'cred-1',
        rawId: 'cred-1',
        type: 'public-key',
        response: { clientDataJSON: '', attestationObject: '' },
      });

      expect(result.verified).toBe(false);
      expect(storage.deleteChallenge).toHaveBeenCalledWith(SAMPLE_CHALLENGE.id);
    });
  });

  // ── Authentication Options ─────────────────────────────────────

  describe('generateAuthenticationOptions', () => {
    it('returns options with correct RP ID', async () => {
      const opts = await mgr.generateAuthenticationOptions();

      expect(opts.rpId).toBe('localhost');
      expect(opts.timeout).toBe(60000);
      expect(opts.userVerification).toBe('preferred');
    });

    it('stores the authentication challenge', async () => {
      await mgr.generateAuthenticationOptions('user-1');

      expect(storage.storeChallenge).toHaveBeenCalledOnce();
      const [, , userId, type] = storage.storeChallenge.mock.calls[0]!;
      expect(userId).toBe('user-1');
      expect(type).toBe('authentication');
    });

    it('includes allowCredentials for known user', async () => {
      storage.getCredentialsByUser.mockResolvedValue([SAMPLE_CREDENTIAL]);

      const opts = await mgr.generateAuthenticationOptions('user-1');

      expect(opts.allowCredentials).toHaveLength(1);
      expect(opts.allowCredentials[0]!.id).toBe('cred-id-abc');
      expect(opts.allowCredentials[0]!.type).toBe('public-key');
    });

    it('returns empty allowCredentials when no userId', async () => {
      const opts = await mgr.generateAuthenticationOptions();
      expect(opts.allowCredentials).toHaveLength(0);
    });

    it('passes transports from stored credentials', async () => {
      storage.getCredentialsByUser.mockResolvedValue([SAMPLE_CREDENTIAL]);

      const opts = await mgr.generateAuthenticationOptions('user-1');
      expect(opts.allowCredentials[0]!.transports).toEqual(['internal']);
    });
  });

  // ── Verify Authentication ──────────────────────────────────────

  describe('verifyAuthentication', () => {
    const fakeResponse = {
      id: 'cred-id-abc',
      rawId: 'cred-id-abc',
      type: 'public-key',
      response: {
        clientDataJSON: '',
        authenticatorData: '',
        signature: '',
      },
    };

    it('returns verified: false when challenge not found', async () => {
      storage.getChallenge.mockResolvedValue(null);

      const result = await mgr.verifyAuthentication('bad-challenge', fakeResponse);
      expect(result.verified).toBe(false);
    });

    it('returns verified: false when challenge is expired', async () => {
      storage.getChallenge.mockResolvedValue({
        ...SAMPLE_CHALLENGE,
        type: 'authentication',
        expires_at: Date.now() - 1000,
      });

      const result = await mgr.verifyAuthentication(SAMPLE_CHALLENGE.challenge, fakeResponse);
      expect(result.verified).toBe(false);
      expect(storage.deleteChallenge).toHaveBeenCalled();
    });
  });

  // ── Credential Management ──────────────────────────────────────

  describe('listCredentials', () => {
    it('delegates to storage.getCredentialsByUser', async () => {
      storage.getCredentialsByUser.mockResolvedValue([SAMPLE_CREDENTIAL]);

      const creds = await mgr.listCredentials('user-1');

      expect(storage.getCredentialsByUser).toHaveBeenCalledWith('user-1');
      expect(creds).toHaveLength(1);
      expect(creds[0]!.credential_id).toBe('cred-id-abc');
    });

    it('returns empty array when user has no credentials', async () => {
      storage.getCredentialsByUser.mockResolvedValue([]);

      const creds = await mgr.listCredentials('user-2');
      expect(creds).toHaveLength(0);
    });
  });

  describe('removeCredential', () => {
    it('delegates to storage.deleteCredential', async () => {
      storage.deleteCredential.mockResolvedValue(1);

      const count = await mgr.removeCredential('cred-id-abc');

      expect(storage.deleteCredential).toHaveBeenCalledWith('cred-id-abc');
      expect(count).toBe(1);
    });

    it('returns 0 when credential does not exist', async () => {
      storage.deleteCredential.mockResolvedValue(0);

      const count = await mgr.removeCredential('nonexistent');
      expect(count).toBe(0);
    });
  });
});
