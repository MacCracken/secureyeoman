/**
 * Integration Types (Core-internal)
 *
 * Defines the Integration interface that every platform adapter must implement,
 * and the PlatformAdapter contract for normalizing messages.
 */

import type {
  IntegrationConfig,
  IntegrationCreate,
  UnifiedMessage,
  Platform,
} from '@secureyeoman/shared';
import type { SecureLogger } from '../logging/logger.js';
import type { OAuthTokenService } from '../gateway/oauth-token-service.js';
import type { z } from 'zod';

// ─── Integration Lifecycle ───────────────────────────────────

/**
 * Every platform adapter implements this interface.
 * The IntegrationManager calls init → start → (runtime) → stop.
 */
export interface Integration {
  /** Unique platform identifier */
  readonly platform: Platform;

  /** Optional per-platform rate limit config */
  readonly platformRateLimit?: PlatformRateLimit;

  /** Optional Zod schema for validating this platform's config */
  readonly configSchema?: z.ZodType;

  /** Initialize the adapter (validate config, create SDK clients, etc.) */
  init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void>;

  /** Start listening for inbound messages */
  start(): Promise<void>;

  /** Stop listening and clean up resources */
  stop(): Promise<void>;

  /** Send a message back to the platform */
  sendMessage(chatId: string, text: string, metadata?: Record<string, unknown>): Promise<string>;

  /** Check if the adapter is healthy */
  isHealthy(): boolean;

  /** Test connection credentials without fully starting the adapter */
  testConnection?(): Promise<{ ok: boolean; message: string }>;
}

/**
 * Webhook-capable integration (e.g. GitHub).
 * Extends the base Integration with webhook-specific methods.
 */
export interface WebhookIntegration extends Integration {
  /** The URL path this integration expects webhook POSTs on */
  getWebhookPath(): string;

  /** Verify a webhook payload signature */
  verifyWebhook(payload: string, signature: string): boolean;
}

// ─── Platform Adapter ────────────────────────────────────────

/**
 * Normalizes platform-specific message formats into UnifiedMessage
 * and converts outbound UnifiedMessages back to platform-specific payloads.
 */
export interface PlatformAdapter {
  /** Normalize a raw inbound payload into a UnifiedMessage */
  normalizeInbound(raw: unknown): UnifiedMessage;

  /** Format an outbound message for the platform */
  formatOutbound(message: UnifiedMessage): unknown;
}

// ─── Rate Limiting ───────────────────────────────────────────

export interface PlatformRateLimit {
  /** Maximum messages per second for this platform */
  maxPerSecond: number;
}

/** Default rate limits per platform */
export const DEFAULT_RATE_LIMITS: Record<string, PlatformRateLimit> = {
  telegram: { maxPerSecond: 30 },
  discord: { maxPerSecond: 50 },
  slack: { maxPerSecond: 1 },
  github: { maxPerSecond: 30 },
  imessage: { maxPerSecond: 5 },
  googlechat: { maxPerSecond: 5 },
  gmail: { maxPerSecond: 2 },
  email: { maxPerSecond: 2 },
  cli: { maxPerSecond: 100 },
  webhook: { maxPerSecond: 30 },
  googlecalendar: { maxPerSecond: 10 },
  notion: { maxPerSecond: 3 },
  gitlab: { maxPerSecond: 10 },
  jira: { maxPerSecond: 10 },
  aws: { maxPerSecond: 10 },
  azure: { maxPerSecond: 10 },
  figma: { maxPerSecond: 5 },
  stripe: { maxPerSecond: 25 },
  zapier: { maxPerSecond: 10 },
  qq: { maxPerSecond: 30 },
  dingtalk: { maxPerSecond: 20 },
  line: { maxPerSecond: 30 },
  linear: { maxPerSecond: 10 },
};

// ─── Dependencies ────────────────────────────────────────────

export interface IntegrationDeps {
  logger: SecureLogger;
  onMessage: (message: UnifiedMessage) => Promise<void>;
  /** OAuth token service — provides valid (auto-refreshed) tokens for Google services (optional) */
  oauthTokenService?: OAuthTokenService | null;
  /** Multimodal manager for vision/STT/TTS processing (optional) */
  multimodalManager?: {
    analyzeImage: (req: {
      imageBase64: string;
      mimeType: string;
      prompt?: string;
    }) => Promise<{ description: string }>;
    transcribeAudio: (req: { audioBase64: string; format: string }) => Promise<{ text: string }>;
    synthesizeSpeech: (req: {
      text: string;
      voice?: string;
      model?: string;
      responseFormat?: string;
    }) => Promise<{ audioBase64: string; format: string }>;
  } | null;
}

// ─── Integration Registry Entry ──────────────────────────────

export interface IntegrationRegistryEntry {
  integration: Integration;
  config: IntegrationConfig;
  healthy: boolean;
  startedAt?: number;
}
