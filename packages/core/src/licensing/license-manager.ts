/**
 * LicenseManager — offline Ed25519 license key validation.
 *
 * Keys are structured as three base64url segments joined by dots:
 *   <header>.<payload>.<signature>
 *
 * The header and payload are base64url-encoded JSON. The signature is an
 * Ed25519 signature over the bytes of "<header>.<payload>" using the
 * maintainer's private key. The corresponding public key is embedded below.
 *
 * No network call is made during validation. License checks are pure CPU.
 */

import { createPublicKey, verify } from 'node:crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export type LicenseTier = 'community' | 'enterprise';

export type EnterpriseFeature =
  | 'adaptive_learning'
  | 'sso_saml'
  | 'multi_tenancy'
  | 'cicd_integration'
  | 'advanced_observability';

export const ALL_ENTERPRISE_FEATURES: EnterpriseFeature[] = [
  'adaptive_learning',
  'sso_saml',
  'multi_tenancy',
  'cicd_integration',
  'advanced_observability',
];

export interface LicenseClaims {
  tier: LicenseTier;
  organization: string;
  seats: number;
  features: EnterpriseFeature[];
  licenseId: string;
  /** Issued-at: Unix seconds */
  iat: number;
  /** Expiry: Unix seconds. Omit for perpetual. */
  exp?: number;
}

// ── Embedded public key ───────────────────────────────────────────────────────
// Generated with: npx tsx scripts/generate-license-key.ts --init
// Replace this value after running the init command.

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAwlM7v9KTffJ5T67OtcZLenLdq4HfxL3gosI1q8T8syc=
-----END PUBLIC KEY-----`;

// ── LicenseManager ───────────────────────────────────────────────────────────

export class LicenseManager {
  private claims: LicenseClaims | null = null;
  private parseError: string | null = null;

  constructor(licenseKey?: string) {
    if (licenseKey) {
      try {
        this.claims = LicenseManager.validate(licenseKey);
      } catch (err) {
        this.parseError = (err as Error).message;
      }
    }
  }

  /**
   * Parse and verify a license key string.
   * Throws a descriptive error on any validation failure.
   */
  static validate(licenseKey: string): LicenseClaims {
    const parts = licenseKey.trim().split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid license key format (expected 3 dot-separated segments)');
    }

    const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
    const message = Buffer.from(`${headerB64}.${payloadB64}`);
    const signature = Buffer.from(sigB64, 'base64url');

    let pubKey: ReturnType<typeof createPublicKey>;
    try {
      pubKey = createPublicKey(PUBLIC_KEY_PEM);
    } catch {
      throw new Error('Embedded public key is malformed — contact support');
    }

    const valid = verify(null, message, pubKey, signature);
    if (!valid) {
      throw new Error('License key signature invalid');
    }

    let claims: LicenseClaims;
    try {
      claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as LicenseClaims;
    } catch {
      throw new Error('License key payload is not valid JSON');
    }

    if (claims.exp !== undefined && Date.now() / 1000 > claims.exp) {
      throw new Error('License key has expired');
    }

    if (!claims.tier || !claims.organization || !Array.isArray(claims.features)) {
      throw new Error('License key payload is missing required fields');
    }

    return claims;
  }

  /** Returns 'enterprise' when a valid enterprise key is loaded, otherwise 'community'. */
  getTier(): LicenseTier {
    return this.claims?.tier ?? 'community';
  }

  /** Returns true only when a valid enterprise key grants the requested feature. */
  hasFeature(feature: EnterpriseFeature): boolean {
    if (this.claims?.tier !== 'enterprise') return false;
    return this.claims.features.includes(feature);
  }

  /** Returns all claims from a valid key, or null for community tier. */
  getClaims(): LicenseClaims | null {
    return this.claims;
  }

  /** True when a key was supplied and passed validation. */
  isValid(): boolean {
    return this.claims !== null;
  }

  /** The error message from the last failed validation attempt, if any. */
  getParseError(): string | null {
    return this.parseError;
  }

  /** Serialisable summary for the /api/v1/license/status endpoint. */
  toStatusObject() {
    const claims = this.claims;
    return {
      tier: this.getTier(),
      valid: this.isValid(),
      organization: claims?.organization ?? null,
      seats: claims?.seats ?? null,
      features: claims?.features ?? [],
      licenseId: claims?.licenseId ?? null,
      expiresAt: claims?.exp ? new Date(claims.exp * 1000).toISOString() : null,
      error: this.parseError,
    };
  }
}
