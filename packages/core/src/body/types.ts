/**
 * Body Module — Types
 *
 * The Body represents the agent's vital signs (Heartbeat) and physical
 * interfaces, sensors, and actuators.
 *
 * Current:
 * - Heartbeat (periodic self-checks: system health, memory, logs, integrations)
 *
 * TODO (v2/v3):
 * - Sensor interfaces (camera, microphone, screen capture)
 * - Actuator interfaces (keyboard, mouse, system commands)
 * - Peripheral management (USB, Bluetooth, serial)
 * - Hardware abstraction layer
 * - Body awareness (system resources, capabilities)
 */

export type { BodyConfig } from '@secureyeoman/shared';

/**
 * Capture resources for RBAC permissions
 * @see ADR 015: RBAC Permissions for Capture
 */
export type CaptureResource =
  | 'capture.screen' // Screen capture/recording
  | 'capture.camera' // Camera/microphone access
  | 'capture.clipboard' // Clipboard access
  | 'capture.keystrokes'; // Keystroke logging (highly restricted)

/**
 * Capture actions for RBAC permissions
 * @see ADR 015: RBAC Permissions for Capture
 */
export type CaptureAction =
  | 'capture' // Initiate capture
  | 'stream' // Stream live feed
  | 'configure' // Change capture settings
  | 'review'; // Review captured data

/**
 * Target types for capture
 */
export type CaptureTargetType = 'display' | 'window' | 'application' | 'region';

/**
 * Screen/display region
 */
export interface ScreenRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Capture target specification
 */
export interface CaptureTarget {
  type: CaptureTargetType;
  id?: string; // Display ID, window ID, app bundle ID
  name?: string; // Human-readable name
  region?: ScreenRegion;
}

/**
 * Capture duration configuration
 */
export interface CaptureDuration {
  maxSeconds: number; // Maximum capture time
  warningAt?: number; // Warn at N seconds remaining
}

/**
 * Video/image resolution options
 */
export type CaptureResolution = 'native' | '1080p' | '720p' | '480p' | '360p';

/**
 * Compression quality levels
 */
export type CompressionLevel = 'lossless' | 'high' | 'medium' | 'low';

/**
 * Capture format options
 */
export type CaptureFormat = 'png' | 'jpeg' | 'webp' | 'mp4' | 'webm';

/**
 * Quality settings for capture
 */
export interface CaptureQuality {
  resolution: CaptureResolution;
  frameRate: number; // FPS for video
  compression: CompressionLevel;
  format: CaptureFormat;
}

/**
 * Content filtering options
 */
export interface CaptureFilters {
  blurRegions?: { x: number; y: number; w: number; h: number }[];
  redactPatterns?: string[]; // Regex patterns to redact
  excludeWindows?: string[]; // Window titles to exclude
}

/**
 * Usage restrictions for captured data
 */
export interface CaptureRestrictions {
  singleUse?: boolean; // One capture then auto-revoke
  readOnly?: boolean; // No storage, view only
  noNetwork?: boolean; // Prevent network transmission
  watermark?: boolean; // Add identifying watermark
  noAudio?: boolean; // Exclude audio from capture
}

/**
 * Capture scope definition for permission conditions
 * Used to validate capture requests against role limits
 *
 * @see ADR 014: Screen Capture Security Architecture
 * @see NEXT_STEP_03: Scope Limiting Controls
 */
export interface CaptureScope {
  /** Resource type being captured */
  resource: CaptureResource;

  /** What to capture (screen, window, app, region) */
  target?: CaptureTarget;

  /** How long to capture */
  duration: CaptureDuration;

  /** Quality settings */
  quality: CaptureQuality;

  /** Why capture is needed */
  purpose: string;

  /** Content filtering options */
  filters?: CaptureFilters;

  /** Usage restrictions */
  restrictions?: CaptureRestrictions;
}

/**
 * Simple capture scope for consent/permission checks
 * Backward compatible with NEXT_STEP_02
 */
export interface SimpleCaptureScope {
  resource: CaptureResource;
  target?: string;
  duration: number;
  quality: string;
  purpose: string;
}

/**
 * Convert detailed scope to simple scope
 */
export function toSimpleScope(scope: CaptureScope): SimpleCaptureScope {
  return {
    resource: scope.resource,
    target: scope.target?.id || scope.target?.name,
    duration: scope.duration.maxSeconds,
    quality: scope.quality.resolution,
    purpose: scope.purpose,
  };
}

/**
 * Body capability types for the Body prompt section
 * @see ADR 012: Heart Extraction from Body
 */
export type BodyCapability =
  | 'vision' // Camera/screen capture input
  | 'limb_movement' // Keyboard/mouse/system command output
  | 'auditory' // Microphone/speaker I/O
  | 'haptic'; // Tactile feedback

/**
 * Body capability status
 */
export interface BodyCapabilityStatus {
  capability: BodyCapability;
  configured: boolean;
  available: boolean;
  details?: string;
}

/**
 * Window information for target discovery
 */
export interface WindowInfo {
  id: string;
  title: string;
  appName: string;
  bounds: ScreenRegion;
  isVisible: boolean;
  isSystemWindow: boolean;
  ownerPid?: number;
}

/**
 * Display/monitor information
 */
export interface DisplayInfo {
  id: string;
  name: string;
  bounds: ScreenRegion;
  isPrimary: boolean;
  scaleFactor: number;
}

/**
 * Application information
 */
export interface ApplicationInfo {
  id: string;
  name: string;
  bundleId?: string;
  pid?: number;
  icon?: string;
}
