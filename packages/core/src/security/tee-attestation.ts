/**
 * TEE Attestation Verifier for Confidential Computing
 *
 * Config-driven module that validates provider attestation claims
 * and caches results. Currently uses a static support table; remote
 * attestation (calling provider APIs) is a future phase item.
 */

import type { SecureLogger } from '../logging/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TeeLevel = 'off' | 'optional' | 'required';
export type TeeTechnology = 'sgx' | 'sev' | 'tdx' | 'nitro' | 'cca' | 'auto' | 'none';
export type AttestationStrategy = 'none' | 'cached' | 'per_request';
export type AttestationFailureAction = 'block' | 'warn' | 'audit_only';

export interface TeeConfig {
  enabled: boolean;
  /** Default level for all providers */
  providerLevel: TeeLevel;
  attestationStrategy: AttestationStrategy;
  /** Default 3_600_000 (1 hour) */
  attestationCacheTtlMs: number;
  failureAction: AttestationFailureAction;
}

export interface ProviderAttestationResult {
  provider: string;
  verified: boolean;
  technology: TeeTechnology | null;
  attestationTime: number;
  expiresAt: number;
  details?: string;
}

// ---------------------------------------------------------------------------
// Static provider TEE support table
// ---------------------------------------------------------------------------

interface ProviderTeeInfo {
  supported: boolean;
  technologies: TeeTechnology[];
  notes: string;
}

const PROVIDER_TEE_SUPPORT: Record<string, ProviderTeeInfo> = {
  anthropic: { supported: true, technologies: ['none'], notes: 'Claims secure infrastructure; no remote attestation API' },
  openai: { supported: true, technologies: ['none'], notes: 'Azure OpenAI supports SGX/SEV-SNP via Azure CC' },
  gemini: { supported: true, technologies: ['tdx'], notes: 'GCP Confidential VMs (TDX/SEV-SNP) available' },
  ollama: { supported: false, technologies: ['none'], notes: 'Local provider — TEE depends on host hardware' },
  lmstudio: { supported: false, technologies: ['none'], notes: 'Local provider' },
  localai: { supported: false, technologies: ['none'], notes: 'Local provider' },
  deepseek: { supported: false, technologies: ['none'], notes: 'No public TEE attestation' },
  mistral: { supported: false, technologies: ['none'], notes: 'No public TEE attestation' },
  grok: { supported: false, technologies: ['none'], notes: 'No public TEE attestation' },
  groq: { supported: false, technologies: ['none'], notes: 'No public TEE attestation' },
  openrouter: { supported: false, technologies: ['none'], notes: 'Proxy — TEE depends on upstream provider' },
  opencode: { supported: false, technologies: ['none'], notes: 'Local provider' },
  letta: { supported: false, technologies: ['none'], notes: 'Stateful agent platform' },
};

// ---------------------------------------------------------------------------
// TeeAttestationVerifier
// ---------------------------------------------------------------------------

export class TeeAttestationVerifier {
  private readonly config: TeeConfig;
  private readonly cache = new Map<string, ProviderAttestationResult>();
  private readonly logger: SecureLogger | null;

  constructor(config: TeeConfig, logger?: SecureLogger) {
    this.config = config;
    this.logger = logger ?? null;
  }

  /**
   * Check if a provider meets TEE requirements.
   * Returns `{ allowed, result }`.
   */
  verify(provider: string): { allowed: boolean; result: ProviderAttestationResult } {
    const now = Date.now();

    // 1. If TEE not enabled, always allow
    if (!this.config.enabled) {
      const result = this.buildResult(provider, true, null, now, 'TEE verification disabled');
      return { allowed: true, result };
    }

    // 2. If providerLevel is 'off', always allow
    if (this.config.providerLevel === 'off') {
      const result = this.buildResult(provider, true, null, now, 'Provider TEE level is off');
      return { allowed: true, result };
    }

    // 3. Check cache (if attestationStrategy is 'cached')
    if (this.config.attestationStrategy === 'cached') {
      const cached = this.cache.get(provider);
      if (cached && cached.expiresAt > now) {
        this.logger?.debug('TEE attestation cache hit', { component: 'tee', provider });
        return { allowed: this.resolveAllowed(cached.verified), result: cached };
      }
    }

    // 4. Look up static support table
    const info = PROVIDER_TEE_SUPPORT[provider];
    const supported = info?.supported ?? false;
    const technology: TeeTechnology | null = supported
      ? (info!.technologies.find((t) => t !== 'none') ?? null)
      : null;
    const details = info
      ? info.notes
      : `Unknown provider '${provider}' — no TEE information available`;

    const result = this.buildResult(provider, supported, technology, now, details);

    // 5/6. Evaluate against providerLevel
    if (!supported) {
      if (this.config.providerLevel === 'required') {
        this.logger?.warn('TEE required but provider not supported', { component: 'tee', provider });
      } else if (this.config.providerLevel === 'optional') {
        this.logger?.info('TEE optional — provider not supported, allowing', { component: 'tee', provider });
      }
    }

    // 7. Cache the result
    if (this.config.attestationStrategy === 'cached') {
      this.cache.set(provider, result);
    }

    // 8. Apply failureAction when provider is not supported
    const allowed = this.resolveAllowed(supported);
    if (!supported && this.config.providerLevel === 'required') {
      this.applyFailureAction(provider, result);
    }

    return { allowed, result };
  }

  /** Check if a provider is TEE-capable (without enforcing). */
  isProviderTeeCapable(provider: string): boolean {
    return PROVIDER_TEE_SUPPORT[provider]?.supported ?? false;
  }

  /** Get all providers that support TEE. */
  getTeeCapableProviders(): string[] {
    return Object.entries(PROVIDER_TEE_SUPPORT)
      .filter(([, info]) => info.supported)
      .map(([name]) => name);
  }

  /** Get the provider support info. */
  getProviderTeeInfo(provider: string): ProviderTeeInfo | null {
    return PROVIDER_TEE_SUPPORT[provider] ?? null;
  }

  /** Clear the attestation cache. */
  clearCache(): void {
    this.cache.clear();
  }

  /** Get cache stats. */
  getCacheStats(): { size: number; providers: string[] } {
    return {
      size: this.cache.size,
      providers: [...this.cache.keys()],
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private buildResult(
    provider: string,
    verified: boolean,
    technology: TeeTechnology | null,
    now: number,
    details?: string,
  ): ProviderAttestationResult {
    return {
      provider,
      verified,
      technology,
      attestationTime: now,
      expiresAt: now + this.config.attestationCacheTtlMs,
      details,
    };
  }

  /**
   * Map `verified` to `allowed` based on providerLevel and failureAction.
   */
  private resolveAllowed(verified: boolean): boolean {
    if (verified) return true;
    if (this.config.providerLevel === 'optional') return true;
    // providerLevel === 'required'
    if (this.config.failureAction === 'block') return false;
    // warn / audit_only still allow through
    return true;
  }

  private applyFailureAction(provider: string, result: ProviderAttestationResult): void {
    switch (this.config.failureAction) {
      case 'block':
        this.logger?.warn('TEE attestation failed — blocking provider', {
          component: 'tee',
          provider,
          details: result.details,
        });
        break;
      case 'warn':
        this.logger?.warn('TEE attestation failed — warning only', {
          component: 'tee',
          provider,
          details: result.details,
        });
        break;
      case 'audit_only':
        this.logger?.info('TEE attestation failed — audit record', {
          component: 'tee',
          provider,
          details: result.details,
        });
        break;
    }
  }
}
