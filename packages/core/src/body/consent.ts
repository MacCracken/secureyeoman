/**
 * Capture Consent Types and Interfaces
 *
 * User consent system for screen capture operations.
 *
 * @see ADR 016: User Consent and Approval Flow
 * @see NEXT_STEP_02: User Consent Layer
 */

import type { CaptureResource, SimpleCaptureScope } from './types.js';

/**
 * Consent status lifecycle
 */
export type ConsentStatus =
  | 'pending' // Waiting for user response
  | 'granted' // User approved
  | 'denied' // User denied
  | 'expired' // Timeout reached without response
  | 'revoked'; // Previously granted but now revoked

/**
 * Capture consent request
 * Represents a user's consent for a specific capture operation
 */
export interface CaptureConsent {
  /** Unique identifier (UUID v4) */
  id: string;

  /** User ID requesting the capture */
  userId: string;

  /** User ID who actually made the request (may differ from userId) */
  requestedBy: string;

  /** Associated session ID */
  sessionId: string;

  // Timing
  /** When the consent was requested (Unix timestamp ms) */
  requestedAt: number;

  /** When the consent expires (Unix timestamp ms) */
  expiresAt: number;

  /** When the consent was granted (Unix timestamp ms) */
  grantedAt?: number;

  /** User ID who granted the consent */
  grantedBy?: string;

  /** When the consent was denied (Unix timestamp ms) */
  deniedAt?: number;

  /** Reason for denial */
  denialReason?: string;

  /** When the consent was revoked (Unix timestamp ms) */
  revokedAt?: number;

  /** User ID who revoked the consent */
  revokedBy?: string;

  // Scope
  /** What can be captured */
  scope: SimpleCaptureScope;

  /** Current status */
  status: ConsentStatus;

  /** Cryptographic signature for integrity */
  signature?: string;

  /** Algorithm used for signature */
  signatureAlgorithm?: 'RS256' | 'ES256' | 'HMAC-SHA256';
}

/**
 * Consent configuration options
 */
export interface ConsentConfig {
  /** Default timeout in milliseconds (default: 30 seconds) */
  defaultTimeoutMs: number;

  /** Maximum allowed timeout in milliseconds (default: 5 minutes) */
  maxTimeoutMs: number;

  /** Whether explicit grant is required (default: true, cannot be disabled) */
  requireExplicitGrant: boolean;

  /** Whether to auto-deny on timeout (default: true) */
  autoDenyOnTimeout: boolean;

  /** Whether to show the purpose to the user (default: true) */
  showPurpose: boolean;

  /** Whether users can revoke consent (default: true) */
  allowRevoke: boolean;

  /** Whether to show visual indicator during capture (default: true) */
  visualIndicator: boolean;

  /** Whether to play audio alert on request (default: true) */
  audioAlert: boolean;

  /** Time after which to require re-approval if idle (default: 5 minutes) */
  requireReapprovalAfterMs: number;
}

/**
 * Default consent configuration
 */
export const DEFAULT_CONSENT_CONFIG: ConsentConfig = {
  defaultTimeoutMs: 30000, // 30 seconds
  maxTimeoutMs: 300000, // 5 minutes
  requireExplicitGrant: true,
  autoDenyOnTimeout: true,
  showPurpose: true,
  allowRevoke: true,
  visualIndicator: true,
  audioAlert: true,
  requireReapprovalAfterMs: 300000, // 5 minutes
};

/**
 * Result of a consent grant operation
 */
export interface ConsentGrantResult {
  success: boolean;
  consent?: CaptureConsent;
  error?: string;
}

/**
 * Consent notification event for WebSocket/real-time updates
 */
export interface ConsentEvent {
  type:
    | 'consent:requested'
    | 'consent:granted'
    | 'consent:denied'
    | 'consent:expired'
    | 'consent:revoked';
  consentId: string;
  userId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

/**
 * Storage interface for consent persistence
 */
export interface ConsentStorage {
  /** Store a consent record */
  save(consent: CaptureConsent): Promise<void>;

  /** Retrieve a consent by ID */
  get(id: string): Promise<CaptureConsent | null>;

  /** Get all pending consents for a user */
  getPending(userId: string): Promise<CaptureConsent[]>;

  /** Get all active (granted) consents for a user */
  getActive(userId: string): Promise<CaptureConsent[]>;

  /** Get consent history for a user */
  getHistory(userId: string, limit?: number): Promise<CaptureConsent[]>;

  /** Update a consent record */
  update(consent: CaptureConsent): Promise<void>;

  /** Delete expired/denied consents older than cutoff */
  cleanup(cutoffTimestamp: number): Promise<number>;
}

/**
 * Cryptographic key pair for consent signing
 */
export interface ConsentKeyPair {
  /** Key ID for rotation tracking */
  keyId: string;

  /** Private key for signing (PKCS#8 PEM or JWK) */
  privateKey: string;

  /** Public key for verification (SPKI PEM or JWK) */
  publicKey: string;

  /** Algorithm */
  algorithm: 'RS256' | 'ES256';

  /** Created timestamp */
  createdAt: number;

  /** Expires timestamp (optional) */
  expiresAt?: number;
}
