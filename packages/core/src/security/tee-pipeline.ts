/**
 * Confidential Pipeline Manager — End-to-end chain-of-custody for TEE operations.
 * Provides cryptographic proof of attestation chain for compliance.
 *
 * Phase 129-D — Confidential Computing TEE Full Stack
 */

import { randomBytes, createHash } from 'node:crypto';
import type { SecureLogger } from '../logging/logger.js';
import type { TeeAttestationVerifier, ProviderAttestationResult } from './tee-attestation.js';

export interface ConfidentialRequest {
  requestId: string;
  nonce: string;
  provider: string;
  startedAt: number;
  attestationChain: AttestationChainLink[];
}

export interface AttestationChainLink {
  step: string;
  timestamp: number;
  hash: string;
  result?: ProviderAttestationResult;
}

export interface ConfidentialResponse {
  requestId: string;
  provider: string;
  completedAt: number;
  chainValid: boolean;
  chainHash: string;
  attestationChain: AttestationChainLink[];
}

export interface ChainOfCustody {
  requestId: string;
  provider: string;
  startedAt: number;
  completedAt: number | null;
  chainValid: boolean;
  chainHash: string;
  links: AttestationChainLink[];
}

export interface ConfidentialPipelineDeps {
  teeVerifier: TeeAttestationVerifier;
  logger?: SecureLogger;
  auditFn?: (event: string, data: Record<string, unknown>) => Promise<void>;
}

export class ConfidentialPipelineManager {
  private readonly deps: ConfidentialPipelineDeps;
  private readonly requests = new Map<string, ConfidentialRequest>();
  private readonly completedChains = new Map<string, ChainOfCustody>();
  private readonly MAX_REQUESTS = 1000;

  constructor(deps: ConfidentialPipelineDeps) {
    this.deps = deps;
  }

  /**
   * Create a new confidential request with nonce and attestation chain start.
   */
  async createConfidentialRequest(provider: string): Promise<ConfidentialRequest> {
    const requestId = randomBytes(16).toString('hex');
    const nonce = randomBytes(32).toString('hex');
    const now = Date.now();

    // Evict oldest if at capacity
    if (this.requests.size >= this.MAX_REQUESTS) {
      const oldest = this.requests.keys().next().value;
      if (oldest) this.requests.delete(oldest);
    }

    const startLink: AttestationChainLink = {
      step: 'pipeline_start',
      timestamp: now,
      hash: this.computeHash(`${requestId}:${nonce}:${now}`),
    };

    // Verify provider attestation
    const { result } = await this.deps.teeVerifier.verifyAsync(provider);
    const attestationLink: AttestationChainLink = {
      step: 'provider_attestation',
      timestamp: Date.now(),
      hash: this.computeHash(`${startLink.hash}:${result.verified}:${result.provider}`),
      result,
    };

    const request: ConfidentialRequest = {
      requestId,
      nonce,
      provider,
      startedAt: now,
      attestationChain: [startLink, attestationLink],
    };

    this.requests.set(requestId, request);

    await this.audit('tee_pipeline_start', { requestId, provider, nonce: nonce.slice(0, 8) });
    await this.audit('tee_pipeline_attestation', {
      requestId,
      provider,
      verified: result.verified,
      technology: result.technology,
    });

    return request;
  }

  /**
   * Verify and complete a confidential response with chain-of-custody proof.
   */
  async verifyConfidentialResponse(requestId: string): Promise<ConfidentialResponse> {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Unknown request: ${requestId}`);
    }

    const now = Date.now();
    const lastHash = request.attestationChain[request.attestationChain.length - 1].hash;

    const completionLink: AttestationChainLink = {
      step: 'pipeline_complete',
      timestamp: now,
      hash: this.computeHash(`${lastHash}:complete:${now}`),
    };

    const fullChain = [...request.attestationChain, completionLink];
    const chainHash = this.computeChainHash(fullChain);
    const chainValid = this.validateChain(fullChain);

    const response: ConfidentialResponse = {
      requestId,
      provider: request.provider,
      completedAt: now,
      chainValid,
      chainHash,
      attestationChain: fullChain,
    };

    // Store completed chain
    if (this.completedChains.size >= this.MAX_REQUESTS) {
      const oldest = this.completedChains.keys().next().value;
      if (oldest) this.completedChains.delete(oldest);
    }

    this.completedChains.set(requestId, {
      requestId,
      provider: request.provider,
      startedAt: request.startedAt,
      completedAt: now,
      chainValid,
      chainHash,
      links: fullChain,
    });

    // Cleanup active request
    this.requests.delete(requestId);

    await this.audit('tee_pipeline_complete', {
      requestId,
      provider: request.provider,
      chainValid,
      chainHash: chainHash.slice(0, 16),
      durationMs: now - request.startedAt,
    });

    return response;
  }

  /**
   * Query the chain of custody for a completed request.
   */
  getChainOfCustody(requestId: string): ChainOfCustody | null {
    return this.completedChains.get(requestId) ?? null;
  }

  /**
   * Get all completed chain IDs (for listing).
   */
  listCompletedChains(limit = 50): ChainOfCustody[] {
    const all = [...this.completedChains.values()];
    return all.slice(-limit);
  }

  /**
   * Get active request count.
   */
  getActiveRequestCount(): number {
    return this.requests.size;
  }

  private computeHash(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  private computeChainHash(chain: AttestationChainLink[]): string {
    const combined = chain.map((l) => l.hash).join(':');
    return this.computeHash(combined);
  }

  private validateChain(chain: AttestationChainLink[]): boolean {
    if (chain.length < 2) return false;
    // Verify timestamps are monotonically increasing
    for (let i = 1; i < chain.length; i++) {
      if (chain[i].timestamp < chain[i - 1].timestamp) return false;
    }
    // Verify attestation link has a result
    const attestationLink = chain.find((l) => l.step === 'provider_attestation');
    if (!attestationLink?.result) return false;
    return true;
  }

  private async audit(event: string, data: Record<string, unknown>): Promise<void> {
    try {
      await this.deps.auditFn?.(event, data);
    } catch {
      this.deps.logger?.warn('Failed to audit TEE pipeline event', { event });
    }
  }
}
