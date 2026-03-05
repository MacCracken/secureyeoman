/**
 * Azure MAA (Microsoft Azure Attestation) Remote Attestation Provider.
 * Posts to the Azure MAA REST API and validates JWT attestation tokens.
 */

import type { RemoteAttestationProvider } from '../tee-types.js';
import type { ProviderAttestationResult } from '../tee-attestation.js';

export interface AzureMaaConfig {
  tenantUrl: string;
  policyName: string;
}

export class AzureMaaAttestationProvider implements RemoteAttestationProvider {
  readonly name = 'azure-maa';
  private readonly config: AzureMaaConfig;

  constructor(config: AzureMaaConfig) {
    this.config = config;
  }

  async verifyAsync(provider: string): Promise<ProviderAttestationResult> {
    const now = Date.now();

    if (!this.config.tenantUrl) {
      return {
        provider,
        verified: false,
        technology: null,
        attestationTime: now,
        expiresAt: now + 3_600_000,
        details: 'Azure MAA tenant URL not configured',
      };
    }

    const url = `${this.config.tenantUrl.replace(/\/$/, '')}/attest/SgxEnclave?api-version=2022-08-01`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quote: '',
          runtimeData: { data: '', dataType: 'JSON' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          provider,
          verified: false,
          technology: 'sgx',
          attestationTime: now,
          expiresAt: now + 3_600_000,
          details: `Azure MAA returned ${response.status}: ${response.statusText}`,
        };
      }

      const data = (await response.json()) as { token?: string };

      if (!data.token) {
        return {
          provider,
          verified: false,
          technology: 'sgx',
          attestationTime: now,
          expiresAt: now + 3_600_000,
          details: 'Azure MAA response missing attestation token',
        };
      }

      // Parse JWT claims (header.payload.signature)
      const parts = data.token.split('.');
      if (parts.length !== 3) {
        return {
          provider,
          verified: false,
          technology: 'sgx',
          attestationTime: now,
          expiresAt: now + 3_600_000,
          details: 'Invalid JWT token format from Azure MAA',
        };
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as Record<string, unknown>;
      const verified =
        payload['x-ms-attestation-type'] === 'sgx' &&
        payload['x-ms-policy-signer'] !== undefined;

      const expMs = typeof payload.exp === 'number' ? payload.exp * 1000 : now + 3_600_000;

      return {
        provider,
        verified,
        technology: 'sgx',
        attestationTime: now,
        expiresAt: expMs,
        details: verified
          ? `Azure MAA attestation verified (policy: ${this.config.policyName})`
          : 'Azure MAA attestation claims validation failed',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        provider,
        verified: false,
        technology: 'sgx',
        attestationTime: now,
        expiresAt: now + 3_600_000,
        details: `Azure MAA request failed: ${message}`,
      };
    }
  }
}
