/**
 * TEE (Trusted Execution Environment) shared types for Phase 129
 *
 * Defines interfaces for remote attestation providers, hardware detection,
 * and vendor-specific attestation documents.
 */

import type { ProviderAttestationResult } from './tee-attestation.js';

// ---------------------------------------------------------------------------
// Remote attestation
// ---------------------------------------------------------------------------

/** Pluggable remote attestation provider. */
export interface RemoteAttestationProvider {
  name: string;
  verifyAsync(provider: string): Promise<ProviderAttestationResult>;
}

/** Enriched attestation report with request metadata. */
export interface AttestationReport {
  provider: string;
  result: ProviderAttestationResult;
  timestamp: number;
  requestId?: string;
}

// ---------------------------------------------------------------------------
// Vendor-specific attestation types
// ---------------------------------------------------------------------------

/** Azure MAA (Microsoft Azure Attestation) JWT token. */
export interface AzureMaaToken {
  token: string;
  issuedAt: number;
  expiresAt: number;
  policyName: string;
}

/** NVIDIA Confidential Computing GPU attestation result. */
export interface NvidiaGpuAttestation {
  gpuUuid: string;
  confidentialComputeMode: boolean;
  driverVersion: string;
  attestationStatus: 'verified' | 'failed' | 'unavailable';
}

/** AWS Nitro Enclave attestation document. */
export interface NitroAttestationDocument {
  moduleId: string;
  digest: string;
  timestamp: number;
  pcrs: Record<string, string>;
  certificate: string;
  cabundle: string[];
}

// ---------------------------------------------------------------------------
// Hardware detection
// ---------------------------------------------------------------------------

/** Result of local TEE hardware capability detection. */
export interface TeeHardwareDetection {
  sgxAvailable: boolean;
  sevAvailable: boolean;
  tpmAvailable: boolean;
  nvidiaCC: boolean;
}
