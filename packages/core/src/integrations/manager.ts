/**
 * IntegrationManager — Manages platform integration lifecycle.
 *
 * Handles registration, start/stop, health tracking, auto-reconnect,
 * per-platform rate limiting, and config CRUD for all platform adapters.
 */

import type {
  IntegrationConfig,
  IntegrationCreate,
  IntegrationUpdate,
  Platform,
} from '@friday/shared';
import type { IntegrationStorage } from './storage.js';
import type { Integration, IntegrationDeps, IntegrationRegistryEntry, PlatformRateLimit } from './types.js';
import { DEFAULT_RATE_LIMITS } from './types.js';
import type { SecureLogger } from '../logging/logger.js';

export interface IntegrationManagerDeps {
  logger: SecureLogger;
  onMessage: IntegrationDeps['onMessage'];
}

export interface AutoReconnectConfig {
  /** Health check interval in ms (default 30s) */
  healthCheckIntervalMs?: number;
  /** Max reconnect retries before giving up (default 5) */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default 1000) */
  baseDelayMs?: number;
}

interface ReconnectState {
  retryCount: number;
  nextRetryAt: number;
}

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
  maxPerSecond: number;
}

export class IntegrationManager {
  private readonly storage: IntegrationStorage;
  private readonly deps: IntegrationManagerDeps;
  private readonly registry = new Map<string, IntegrationRegistryEntry>();
  private readonly factories = new Map<Platform, () => Integration>();

  // Auto-reconnect
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private readonly reconnectState = new Map<string, ReconnectState>();
  private readonly autoReconnect: Required<AutoReconnectConfig>;

  // Rate limiting
  private readonly rateBuckets = new Map<string, RateLimitBucket>();

  constructor(
    storage: IntegrationStorage,
    deps: IntegrationManagerDeps,
    reconnectConfig?: AutoReconnectConfig,
  ) {
    this.storage = storage;
    this.deps = deps;
    this.autoReconnect = {
      healthCheckIntervalMs: reconnectConfig?.healthCheckIntervalMs ?? 30_000,
      maxRetries: reconnectConfig?.maxRetries ?? 5,
      baseDelayMs: reconnectConfig?.baseDelayMs ?? 1000,
    };
  }

  // ── Factory Registration ─────────────────────────────────

  registerPlatform(platform: Platform, factory: () => Integration): void {
    this.factories.set(platform, factory);
    this.deps.logger.info(`Registered integration platform: ${platform}`);
  }

  getAvailablePlatforms(): Platform[] {
    return [...this.factories.keys()];
  }

  // ── Config CRUD ──────────────────────────────────────────

  createIntegration(data: IntegrationCreate): IntegrationConfig {
    if (!this.factories.has(data.platform)) {
      throw new Error(`Platform "${data.platform}" is not registered`);
    }
    return this.storage.createIntegration(data);
  }

  getIntegration(id: string): IntegrationConfig | null {
    return this.storage.getIntegration(id);
  }

  listIntegrations(filter?: { platform?: Platform; enabled?: boolean }): IntegrationConfig[] {
    return this.storage.listIntegrations(filter);
  }

  updateIntegration(id: string, data: IntegrationUpdate): IntegrationConfig | null {
    return this.storage.updateIntegration(id, data);
  }

  deleteIntegration(id: string): boolean {
    // Stop if running
    const entry = this.registry.get(id);
    if (entry) {
      void this.stopIntegration(id);
    }
    return this.storage.deleteIntegration(id);
  }

  // ── Lifecycle ────────────────────────────────────────────

  async startIntegration(id: string): Promise<void> {
    const config = this.storage.getIntegration(id);
    if (!config) throw new Error(`Integration ${id} not found`);
    if (!config.enabled) throw new Error(`Integration ${id} is disabled`);

    // Already running?
    if (this.registry.has(id)) {
      this.deps.logger.warn(`Integration ${id} is already running`);
      return;
    }

    const factory = this.factories.get(config.platform);
    if (!factory) throw new Error(`No adapter registered for platform "${config.platform}"`);

    const integration = factory();
    const entry: IntegrationRegistryEntry = {
      integration,
      config,
      healthy: false,
    };

    try {
      await integration.init(config, {
        logger: this.deps.logger.child({ integration: id, platform: config.platform }),
        onMessage: this.deps.onMessage,
      });

      await integration.start();

      entry.healthy = true;
      entry.startedAt = Date.now();
      this.registry.set(id, entry);
      this.storage.updateStatus(id, 'connected');
      this.reconnectState.delete(id);

      this.deps.logger.info(`Integration started: ${config.displayName} (${config.platform})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.storage.updateStatus(id, 'error', message);
      this.deps.logger.error(`Failed to start integration ${id}: ${message}`);
      throw err;
    }
  }

  async stopIntegration(id: string): Promise<void> {
    const entry = this.registry.get(id);
    if (!entry) return;

    try {
      await entry.integration.stop();
    } catch (err) {
      this.deps.logger.error(`Error stopping integration ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }

    this.registry.delete(id);
    this.reconnectState.delete(id);
    this.rateBuckets.delete(id);
    this.storage.updateStatus(id, 'disconnected');
    this.deps.logger.info(`Integration stopped: ${id}`);
  }

  async startAll(): Promise<void> {
    const enabled = this.storage.listIntegrations({ enabled: true });
    for (const config of enabled) {
      try {
        await this.startIntegration(config.id);
      } catch (err) {
        this.deps.logger.error(`Failed to auto-start integration ${config.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  async stopAll(): Promise<void> {
    const ids = [...this.registry.keys()];
    for (const id of ids) {
      await this.stopIntegration(id);
    }
  }

  // ── Health + Auto-Reconnect ───────────────────────────────

  isRunning(id: string): boolean {
    return this.registry.has(id);
  }

  isHealthy(id: string): boolean {
    const entry = this.registry.get(id);
    return entry?.integration.isHealthy() ?? false;
  }

  getRunningCount(): number {
    return this.registry.size;
  }

  startHealthChecks(): void {
    if (this.healthCheckTimer) return;
    this.healthCheckTimer = setInterval(
      () => void this.runHealthChecks(),
      this.autoReconnect.healthCheckIntervalMs,
    );
    if (this.healthCheckTimer.unref) {
      this.healthCheckTimer.unref();
    }
  }

  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /** Runs a single health check cycle. Public for testing. */
  async runHealthChecks(): Promise<void> {
    for (const [id, entry] of this.registry) {
      const healthy = entry.integration.isHealthy();
      entry.healthy = healthy;

      if (!healthy) {
        this.deps.logger.warn(`Integration ${id} unhealthy, attempting reconnect`);
        await this.attemptReconnect(id, entry);
      }
    }
  }

  private async attemptReconnect(id: string, entry: IntegrationRegistryEntry): Promise<void> {
    let state = this.reconnectState.get(id);
    if (!state) {
      state = { retryCount: 0, nextRetryAt: 0 };
      this.reconnectState.set(id, state);
    }

    if (state.retryCount >= this.autoReconnect.maxRetries) {
      this.deps.logger.error(`Integration ${id} exceeded max reconnect retries (${this.autoReconnect.maxRetries}), setting error status`);
      this.registry.delete(id);
      this.storage.updateStatus(id, 'error', 'Max reconnect retries exceeded');
      this.reconnectState.delete(id);
      return;
    }

    const now = Date.now();
    if (now < state.nextRetryAt) {
      return; // Not yet time for next retry
    }

    state.retryCount++;
    const delay = this.autoReconnect.baseDelayMs * Math.pow(2, state.retryCount - 1);
    state.nextRetryAt = now + delay;

    try {
      await entry.integration.stop();
    } catch {
      // Ignore stop errors during reconnect
    }

    this.registry.delete(id);

    try {
      await this.startIntegration(id);
      this.deps.logger.info(`Integration ${id} reconnected after ${state.retryCount} attempt(s)`);
      this.reconnectState.delete(id);
    } catch (err) {
      this.deps.logger.warn(`Integration ${id} reconnect attempt ${state.retryCount} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Rate Limiting ─────────────────────────────────────────

  private getRateLimit(entry: IntegrationRegistryEntry): PlatformRateLimit {
    return (
      entry.integration.platformRateLimit ??
      DEFAULT_RATE_LIMITS[entry.config.platform] ??
      { maxPerSecond: 30 }
    );
  }

  private checkRateLimit(integrationId: string, entry: IntegrationRegistryEntry): boolean {
    const limit = this.getRateLimit(entry);
    const now = Date.now();
    let bucket = this.rateBuckets.get(integrationId);

    if (!bucket) {
      bucket = { tokens: limit.maxPerSecond, lastRefill: now, maxPerSecond: limit.maxPerSecond };
      this.rateBuckets.set(integrationId, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(bucket.maxPerSecond, bucket.tokens + elapsed * bucket.maxPerSecond);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  // ── Send Message ─────────────────────────────────────────

  async sendMessage(integrationId: string, chatId: string, text: string, metadata?: Record<string, unknown>): Promise<string> {
    const entry = this.registry.get(integrationId);
    if (!entry) throw new Error(`Integration ${integrationId} is not running`);

    if (!this.checkRateLimit(integrationId, entry)) {
      throw new Error(`Rate limit exceeded for integration ${integrationId} (${entry.config.platform})`);
    }

    const platformMessageId = await entry.integration.sendMessage(chatId, text, metadata);

    this.storage.storeMessage({
      integrationId,
      platform: entry.config.platform,
      direction: 'outbound',
      senderId: 'agent',
      senderName: 'FRIDAY',
      chatId,
      text,
      attachments: [],
      metadata: metadata ?? {},
      platformMessageId,
      timestamp: Date.now(),
    });

    return platformMessageId;
  }

  // ── Cleanup ──────────────────────────────────────────────

  async close(): Promise<void> {
    this.stopHealthChecks();
    await this.stopAll();
    this.storage.close();
  }
}
