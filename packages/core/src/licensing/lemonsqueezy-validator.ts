/**
 * LemonSqueezy License Validation — validates license keys via the LS API.
 *
 * LemonSqueezy license keys are UUID-format strings that require an API call
 * to validate. Results are cached locally to provide offline resilience.
 *
 * This module is used alongside the Ed25519 LicenseManager to support both
 * LS-issued keys (online validation, cached) and locally-minted Ed25519 keys
 * (offline validation).
 */

import type { LicenseTier, LicensedFeature, LicenseClaims } from './license-manager.js';
import { PRO_FEATURES, ALL_LICENSED_FEATURES } from './license-manager.js';

// ── Types ────────────────────────────────────────────────────────────

export interface LSValidationResult {
  valid: boolean;
  tier: LicenseTier;
  claims: LicenseClaims | null;
  error: string | null;
  cachedAt: number;
}

interface LSValidateResponse {
  valid: boolean;
  error: string | null;
  license_key: {
    id: number;
    status: string;
    key: string;
    activation_limit: number;
    activation_usage: number;
    disabled: boolean;
    expires_at: string | null;
  };
  instance: {
    id: string;
    name: string;
    created_at: string;
  } | null;
  meta: {
    store_id: number;
    order_id: number;
    order_item_id: number;
    product_id: number;
    product_name: string;
    variant_id: number;
    variant_name: string;
    customer_id: number;
    customer_name: string;
    customer_email: string;
  };
}

// ── Configuration ────────────────────────────────────────────────────

export interface LSValidatorConfig {
  /** LemonSqueezy API endpoint for license validation */
  validateUrl?: string;
  /** LemonSqueezy API endpoint for license activation */
  activateUrl?: string;
  /** Variant ID → tier mapping */
  variantTierMap?: Record<string, LicenseTier>;
  /** Cache duration in ms (default: 24 hours) */
  cacheTtlMs?: number;
  /** Grace period when API is unreachable (default: 7 days) */
  offlineGracePeriodMs?: number;
  /** Instance name for activation (default: hostname) */
  instanceName?: string;
}

const LS_VALIDATE_URL = 'https://api.lemonsqueezy.com/v1/licenses/validate';
const LS_ACTIVATE_URL = 'https://api.lemonsqueezy.com/v1/licenses/activate';
const DEFAULT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_GRACE_PERIOD = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Validator ────────────────────────────────────────────────────────

export class LemonSqueezyValidator {
  private config: Required<LSValidatorConfig>;
  private cache: LSValidationResult | null = null;

  constructor(config: LSValidatorConfig = {}) {
    this.config = {
      validateUrl: config.validateUrl ?? LS_VALIDATE_URL,
      activateUrl: config.activateUrl ?? LS_ACTIVATE_URL,
      variantTierMap: config.variantTierMap ?? {},
      cacheTtlMs: config.cacheTtlMs ?? DEFAULT_CACHE_TTL,
      offlineGracePeriodMs: config.offlineGracePeriodMs ?? DEFAULT_GRACE_PERIOD,
      instanceName: config.instanceName ?? globalThis.process?.env?.HOSTNAME ?? 'secureyeoman',
    };
  }

  /**
   * Validate a LemonSqueezy license key via their API.
   * Results are cached for offline resilience.
   */
  async validate(licenseKey: string): Promise<LSValidationResult> {
    try {
      const response = await fetch(this.config.validateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: licenseKey, instance_name: this.config.instanceName }),
      });

      if (!response.ok) {
        throw new Error(`LS API returned ${response.status}`);
      }

      const data = (await response.json()) as LSValidateResponse;

      if (!data.valid) {
        const result: LSValidationResult = {
          valid: false,
          tier: 'community',
          claims: null,
          error: data.error ?? 'License key is not valid',
          cachedAt: Date.now(),
        };
        this.cache = result;
        return result;
      }

      const lk = data.license_key;
      if (lk.disabled) {
        const result: LSValidationResult = {
          valid: false,
          tier: 'community',
          claims: null,
          error: 'License key has been disabled',
          cachedAt: Date.now(),
        };
        this.cache = result;
        return result;
      }

      // Resolve tier from variant ID
      const variantId = String(data.meta.variant_id);
      const tier =
        this.config.variantTierMap[variantId] ??
        this.inferTierFromVariantName(data.meta.variant_name);

      // Build claims from LS response
      const features = this.getFeaturesForTier(tier);
      const claims: LicenseClaims = {
        tier,
        organization: data.meta.customer_name || data.meta.customer_email,
        seats: lk.activation_limit || 1,
        features,
        licenseId: String(lk.id),
        iat: Math.floor(Date.now() / 1000),
        exp: lk.expires_at ? Math.floor(new Date(lk.expires_at).getTime() / 1000) : undefined,
      };

      const result: LSValidationResult = {
        valid: true,
        tier,
        claims,
        error: null,
        cachedAt: Date.now(),
      };
      this.cache = result;
      return result;
    } catch (err) {
      // API unreachable — use cache with grace period
      if (this.cache?.valid) {
        const age = Date.now() - this.cache.cachedAt;
        if (age < this.config.offlineGracePeriodMs) {
          return this.cache; // Return stale cache within grace period
        }
      }

      return {
        valid: false,
        tier: 'community',
        claims: null,
        error: `Unable to validate license: ${(err as Error).message}`,
        cachedAt: Date.now(),
      };
    }
  }

  /**
   * Activate a LemonSqueezy license key for this instance.
   * Call once on first key entry.
   */
  async activate(licenseKey: string): Promise<LSValidationResult> {
    try {
      const response = await fetch(this.config.activateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: licenseKey, instance_name: this.config.instanceName }),
      });

      if (!response.ok) {
        // If already activated, fall through to validate
        if (response.status === 422) {
          return this.validate(licenseKey);
        }
        throw new Error(`LS activation API returned ${response.status}`);
      }

      // Activation succeeded — validate to get full details
      return this.validate(licenseKey);
    } catch (err) {
      return {
        valid: false,
        tier: 'community',
        claims: null,
        error: `Activation failed: ${(err as Error).message}`,
        cachedAt: Date.now(),
      };
    }
  }

  /** Get cached validation result (for startup without network). */
  getCachedResult(): LSValidationResult | null {
    return this.cache;
  }

  /** Restore cache from persisted data (e.g. brain.meta). */
  restoreCache(result: LSValidationResult): void {
    this.cache = result;
  }

  /** Check if a LemonSqueezy key (UUID format with dashes). */
  static isLemonSqueezyKey(key: string): boolean {
    // LS keys are typically UUID-like or alphanumeric with dashes
    // Ed25519 keys have exactly 2 dots (header.payload.signature)
    return !key.includes('.') && key.length > 10;
  }

  private inferTierFromVariantName(name: string): LicenseTier {
    const lower = name.toLowerCase();
    if (lower.includes('enterprise') || lower.includes('solopreneur')) return 'enterprise';
    if (lower.includes('pro')) return 'pro';
    return 'pro'; // Default to pro for any paid variant
  }

  private getFeaturesForTier(tier: LicenseTier): LicensedFeature[] {
    if (tier === 'enterprise') return [...ALL_LICENSED_FEATURES];
    if (tier === 'pro') return [...PRO_FEATURES];
    return [];
  }
}
