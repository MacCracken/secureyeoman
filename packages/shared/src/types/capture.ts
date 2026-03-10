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

// ── Video Streaming Types ──────────────────────────────────────────────────

export type VideoSource = 'agnos' | 'local_camera' | 'local_screen';

export interface VideoStreamSession {
  id: string;
  userId: string;
  source: VideoSource;
  status: 'active' | 'stopped' | 'error';
  fps: number;
  frameCount: number;
  startedAt: number;
  stoppedAt?: number;
}

export interface VideoStreamFrame {
  sessionId: string;
  sequence: number;
  imageBase64: string;
  mimeType: string;
  timestamp: number;
  width?: number;
  height?: number;
  analysis?: string;
}

/** WebSocket message types for video streaming. */
export type VideoStreamWsMessage =
  | { type: 'frame'; frame: VideoStreamFrame }
  | { type: 'session_started'; session: VideoStreamSession }
  | { type: 'session_stopped'; session: VideoStreamSession }
  | { type: 'session_error'; sessionId: string; error: string }
  | { type: 'subscribe'; sessionId: string }
  | { type: 'unsubscribe'; sessionId: string };

export interface VideoStreamSourceInfo {
  id: VideoSource;
  name: string;
  available: boolean;
  description: string;
}
