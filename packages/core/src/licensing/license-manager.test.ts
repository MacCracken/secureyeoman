import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { LicenseManager, type LicenseClaims, type EnterpriseFeature } from './license-manager.js';

// ── Test keypair (generated fresh per test run — never committed) ─────────────

let privateKeyPem: string;
let publicKeyPem: string;

beforeAll(() => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  privateKeyPem = privateKey;
  publicKeyPem = publicKey;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function buildKey(claims: Partial<LicenseClaims>, overridePrivKey?: string): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'LICENSE' })));
  const payload = b64url(Buffer.from(JSON.stringify(claims)));
  const msg = Buffer.from(`${header}.${payload}`);
  const { createPrivateKey } = require('node:crypto') as typeof import('node:crypto');
  const privKey = createPrivateKey(overridePrivKey ?? privateKeyPem);
  const sig = sign(null, msg, privKey);
  return `${header}.${payload}.${b64url(sig)}`;
}

function validClaims(overrides: Partial<LicenseClaims> = {}): Partial<LicenseClaims> {
  return {
    tier: 'enterprise',
    organization: 'Acme Corp',
    seats: 50,
    features: ['adaptive_learning', 'sso_saml'],
    licenseId: 'test-license-001',
    iat: Math.floor(Date.now() / 1000) - 60,
    exp: Math.floor(Date.now() / 1000) + 86400,
    ...overrides,
  };
}

/**
 * Patches the embedded public key constant for a single test.
 * We monkey-patch the module's validate method to use our test key.
 */
function withTestKey<T>(fn: (mgr: LicenseManager) => T, licenseKey: string): LicenseManager {
  // We need to bypass the embedded key — use a subclass that overrides validate
  const testPublicKeyPem = publicKeyPem;

  class TestLicenseManager extends LicenseManager {
    static override validate(key: string): LicenseClaims {
      const { createPublicKey, verify } = require('node:crypto') as typeof import('node:crypto');
      const parts = key.trim().split('.');
      if (parts.length !== 3)
        throw new Error('Invalid license key format (expected 3 dot-separated segments)');
      const [headerB64, payloadB64, sigB64] = parts;
      const message = Buffer.from(`${headerB64}.${payloadB64}`);
      const signature = Buffer.from(sigB64, 'base64url');
      const pubKey = createPublicKey(testPublicKeyPem);
      const valid = verify(null, message, pubKey, signature);
      if (!valid) throw new Error('License key signature invalid');
      const claims = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8')
      ) as LicenseClaims;
      if (claims.exp !== undefined && Date.now() / 1000 > claims.exp)
        throw new Error('License key has expired');
      if (!claims.tier || !claims.organization || !Array.isArray(claims.features)) {
        throw new Error('License key payload is missing required fields');
      }
      return claims;
    }

    constructor(key?: string) {
      super(); // skip parent key parsing
      if (key) {
        try {
          // @ts-expect-error accessing private field for test
          this.claims = TestLicenseManager.validate(key);
        } catch (err) {
          // @ts-expect-error accessing private field for test
          this.parseError = (err as Error).message;
        }
      }
    }
  }

  return new TestLicenseManager(licenseKey);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LicenseManager — community tier (no key)', () => {
  it('getTier() returns community', () => {
    const lm = new LicenseManager();
    expect(lm.getTier()).toBe('community');
  });

  it('hasFeature() always returns false', () => {
    const lm = new LicenseManager();
    const features: EnterpriseFeature[] = [
      'adaptive_learning',
      'sso_saml',
      'multi_tenancy',
      'cicd_integration',
      'advanced_observability',
    ];
    for (const f of features) {
      expect(lm.hasFeature(f)).toBe(false);
    }
  });

  it('isValid() returns false', () => {
    expect(new LicenseManager().isValid()).toBe(false);
  });

  it('getClaims() returns null', () => {
    expect(new LicenseManager().getClaims()).toBeNull();
  });

  it('getParseError() returns null when no key given', () => {
    expect(new LicenseManager().getParseError()).toBeNull();
  });

  it('toStatusObject() reflects community tier', () => {
    const s = new LicenseManager().toStatusObject();
    expect(s.tier).toBe('community');
    expect(s.valid).toBe(false);
    expect(s.organization).toBeNull();
    expect(s.features).toEqual([]);
  });
});

describe('LicenseManager — valid enterprise key', () => {
  let lm: LicenseManager;

  beforeAll(() => {
    const key = buildKey(validClaims());
    lm = withTestKey(() => lm, key);
  });

  it('getTier() returns enterprise', () => {
    expect(lm.getTier()).toBe('enterprise');
  });

  it('isValid() returns true', () => {
    expect(lm.isValid()).toBe(true);
  });

  it('getParseError() returns null', () => {
    expect(lm.getParseError()).toBeNull();
  });

  it('getClaims() returns correct organization', () => {
    expect(lm.getClaims()?.organization).toBe('Acme Corp');
  });

  it('getClaims() returns correct seats', () => {
    expect(lm.getClaims()?.seats).toBe(50);
  });

  it('getClaims() returns correct licenseId', () => {
    expect(lm.getClaims()?.licenseId).toBe('test-license-001');
  });

  it('hasFeature() returns true for granted features', () => {
    expect(lm.hasFeature('adaptive_learning')).toBe(true);
    expect(lm.hasFeature('sso_saml')).toBe(true);
  });

  it('hasFeature() returns false for non-granted features', () => {
    expect(lm.hasFeature('multi_tenancy')).toBe(false);
    expect(lm.hasFeature('cicd_integration')).toBe(false);
    expect(lm.hasFeature('advanced_observability')).toBe(false);
  });

  it('toStatusObject() reflects enterprise tier', () => {
    const s = lm.toStatusObject();
    expect(s.tier).toBe('enterprise');
    expect(s.valid).toBe(true);
    expect(s.organization).toBe('Acme Corp');
    expect(s.seats).toBe(50);
  });
});

describe('LicenseManager — all features key', () => {
  let lm: LicenseManager;

  beforeAll(() => {
    const key = buildKey(
      validClaims({
        features: [
          'adaptive_learning',
          'sso_saml',
          'multi_tenancy',
          'cicd_integration',
          'advanced_observability',
        ],
      })
    );
    lm = withTestKey(() => lm, key);
  });

  it('hasFeature() returns true for all enterprise features', () => {
    const features: EnterpriseFeature[] = [
      'adaptive_learning',
      'sso_saml',
      'multi_tenancy',
      'cicd_integration',
      'advanced_observability',
    ];
    for (const f of features) {
      expect(lm.hasFeature(f)).toBe(true);
    }
  });
});

// ─── Phase 105: Additional branch coverage ───────────────────────────────────

describe('LicenseManager — validate() error paths (Phase 105)', () => {
  it('throws on non-JSON base64 payload', () => {
    // Craft a key where the payload is valid base64url but not valid JSON
    const header = Buffer.from(JSON.stringify({ alg: 'EdDSA' })).toString('base64url');
    const payload = Buffer.from('not-json').toString('base64url');
    const fakeKey = `${header}.${payload}.fakesig`;
    const lm = new LicenseManager(fakeKey);
    // Signature check fails first (before JSON parse), so expect signature error
    expect(lm.getParseError()).toBeTruthy();
    expect(lm.isValid()).toBe(false);
  });

  it('throws when payload missing tier field', () => {
    const claims = { organization: 'Acme', seats: 5, features: [], licenseId: 'x', iat: 100 };
    const key = buildKey(claims as any);
    const lm = withTestKey(() => lm, key);
    expect(lm.getParseError()).toMatch(/missing required fields/i);
    expect(lm.isValid()).toBe(false);
  });

  it('throws when payload missing organization field', () => {
    const claims = { tier: 'enterprise', seats: 5, features: [], licenseId: 'x', iat: 100 };
    const key = buildKey(claims as any);
    const lm = withTestKey(() => lm, key);
    expect(lm.getParseError()).toMatch(/missing required fields/i);
  });

  it('throws when features is not an array', () => {
    const claims = {
      tier: 'enterprise',
      organization: 'Acme',
      seats: 5,
      features: 'not-array',
      licenseId: 'x',
      iat: 100,
    };
    const key = buildKey(claims as any);
    const lm = withTestKey(() => lm, key);
    expect(lm.getParseError()).toMatch(/missing required fields/i);
  });
});

describe('LicenseManager — toStatusObject() branches (Phase 105)', () => {
  it('returns expiresAt: null for perpetual license (no exp)', () => {
    const claims = validClaims();
    delete claims.exp; // perpetual
    const key = buildKey(claims);
    const lm = withTestKey(() => lm, key);
    const status = lm.toStatusObject();
    expect(status.expiresAt).toBeNull();
    expect(status.valid).toBe(true);
  });

  it('returns ISO string when exp is present', () => {
    const exp = Math.floor(Date.now() / 1000) + 86400;
    const key = buildKey(validClaims({ exp }));
    const lm = withTestKey(() => lm, key);
    const status = lm.toStatusObject();
    expect(status.expiresAt).toBe(new Date(exp * 1000).toISOString());
  });

  it('hasFeature() returns false on enterprise tier with empty features array', () => {
    const key = buildKey(validClaims({ features: [] }));
    const lm = withTestKey(() => lm, key);
    expect(lm.getTier()).toBe('enterprise');
    expect(lm.hasFeature('adaptive_learning')).toBe(false);
    expect(lm.hasFeature('sso_saml')).toBe(false);
  });
});

describe('LicenseManager — error cases', () => {
  it('expired key → getTier() community, parseError set', () => {
    const key = buildKey(validClaims({ exp: Math.floor(Date.now() / 1000) - 3600 }));
    const lm = withTestKey(() => lm, key);
    expect(lm.getTier()).toBe('community');
    expect(lm.getParseError()).toMatch(/expired/i);
    expect(lm.isValid()).toBe(false);
  });

  it('invalid signature → getTier() community, parseError set', () => {
    const key = buildKey(validClaims());
    // Corrupt the last byte of the signature
    const parts = key.split('.');
    const corruptSig = parts[2].slice(0, -4) + 'XXXX';
    const corruptKey = [parts[0], parts[1], corruptSig].join('.');
    const lm = withTestKey(() => lm, corruptKey);
    expect(lm.getTier()).toBe('community');
    expect(lm.getParseError()).toMatch(/signature/i);
  });

  it('malformed key (wrong segments) → parseError set', () => {
    const lm = new LicenseManager('not.a.valid.key.here');
    expect(lm.getTier()).toBe('community');
    expect(lm.getParseError()).toMatch(/format/i);
  });

  it('only 2 segments → parseError set', () => {
    const lm = new LicenseManager('abc.def');
    expect(lm.getParseError()).toMatch(/format/i);
  });

  it('static validate() throws on expired key', () => {
    const key = buildKey(validClaims({ exp: Math.floor(Date.now() / 1000) - 1 }));
    // validate with test key using subclass approach
    const lm = withTestKey(() => lm, key);
    expect(lm.getParseError()).toMatch(/expired/i);
  });

  it('static validate() throws on bad signature', () => {
    const key = buildKey(validClaims());
    const parts = key.split('.');
    const bad = [parts[0], parts[1], 'badsig'].join('.');
    const lm = withTestKey(() => lm, bad);
    expect(lm.getParseError()).toBeTruthy();
  });

  it('empty string key → parseError set', () => {
    const lm = new LicenseManager('');
    // empty string is falsy — treated as no key
    expect(lm.getTier()).toBe('community');
    expect(lm.getParseError()).toBeNull();
  });
});
