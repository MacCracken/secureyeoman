/**
 * NVIDIA RAA (Remote Attestation API) Provider for Confidential Computing GPUs.
 * Posts to the NVIDIA attestation service and validates GPU confidential compute status.
 */

import type { RemoteAttestationProvider } from '../tee-types.js';
import type { ProviderAttestationResult, TeeTechnology } from '../tee-attestation.js';

export interface NvidiaRaaConfig {
  endpoint: string;
}

export class NvidiaRaaAttestationProvider implements RemoteAttestationProvider {
  readonly name = 'nvidia-raa';
  private readonly config: NvidiaRaaConfig;

  constructor(config: NvidiaRaaConfig) {
    this.config = config;
  }

  async verifyAsync(provider: string): Promise<ProviderAttestationResult> {
    const now = Date.now();

    if (!this.config.endpoint) {
      return {
        provider,
        verified: false,
        technology: null,
        attestationTime: now,
        expiresAt: now + 3_600_000,
        details: 'NVIDIA RAA endpoint not configured',
      };
    }

    const url = `${this.config.endpoint.replace(/\/$/, '')}/v1/attestation/gpu`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider,
          requestType: 'gpu_attestation',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          provider,
          verified: false,
          technology: 'auto',
          attestationTime: now,
          expiresAt: now + 3_600_000,
          details: `NVIDIA RAA returned ${response.status}: ${response.statusText}`,
        };
      }

      const data = (await response.json()) as {
        confidential_compute_mode?: boolean;
        driver_version?: string;
        gpu_uuid?: string;
        attestation_status?: string;
        technology?: string;
      };

      const ccMode = data.confidential_compute_mode === true;
      const verified = ccMode && data.attestation_status === 'verified';

      // Detect technology from response or default to 'auto'
      let technology: TeeTechnology = 'auto';
      if (data.technology === 'sev' || data.technology === 'tdx' || data.technology === 'sgx') {
        technology = data.technology;
      }

      const gpuInfo = data.gpu_uuid ? ` (GPU: ${data.gpu_uuid})` : '';
      const driverInfo = data.driver_version ? `, driver ${data.driver_version}` : '';

      return {
        provider,
        verified,
        technology,
        attestationTime: now,
        expiresAt: now + 3_600_000,
        details: verified
          ? `NVIDIA GPU attestation verified${gpuInfo}${driverInfo}`
          : `NVIDIA GPU attestation failed: CC mode ${ccMode ? 'on' : 'off'}, status ${data.attestation_status ?? 'unknown'}${gpuInfo}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        provider,
        verified: false,
        technology: 'auto',
        attestationTime: now,
        expiresAt: now + 3_600_000,
        details: `NVIDIA RAA request failed: ${message}`,
      };
    }
  }
}
