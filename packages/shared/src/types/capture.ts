/**
 * Capture Shared Types (Phase 108-D)
 *
 * Types shared between core and dashboard for the capture consent workflow.
 */

export type CaptureConsentStatus = 'pending' | 'granted' | 'denied' | 'expired' | 'revoked';

export interface CaptureConsentRequest {
  id: string;
  requestedBy: string;
  userId: string;
  scope: {
    resource: string;
    duration: number;
    purpose: string;
  };
  status: CaptureConsentStatus;
  expiresAt: number;
  grantedAt?: number;
  signature?: string;
  createdAt: number;
}

export interface CaptureConsentConfig {
  enabled: boolean;
  defaultTimeoutMs: number;
  maxTimeoutMs: number;
}
