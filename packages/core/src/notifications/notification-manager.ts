/**
 * NotificationManager — Phase 51: Real-Time Infrastructure
 *                        Phase 55: Fan-out + Cleanup
 *
 * Thin orchestration layer on top of NotificationStorage.
 * Creates DB records and broadcasts to connected WebSocket clients.
 * Phase 55 adds: per-user external fan-out via IntegrationManager,
 * and a daily cleanup job for old notifications.
 *
 * Usage:
 *   const n = await notificationManager.notify({ type, title, body, level, source });
 *   // → persisted + broadcast to 'notifications' WS channel + external fan-out
 */

import type {
  NotificationStorage,
  Notification,
  ListNotificationsOptions,
  ListNotificationsResult,
  NotificationLevel,
} from './notification-storage.js';
import type { UserNotificationPrefsStorage } from './user-notification-prefs-storage.js';
import type { IntegrationManager } from '../integrations/manager.js';

export type { Notification, NotificationLevel };

export interface NotifyParams {
  type: string;
  title: string;
  body: string;
  level?: NotificationLevel;
  source?: string;
  metadata?: Record<string, unknown>;
}

// Numeric rank for level filtering (higher = more severe)
const LEVEL_RANKS: Record<NotificationLevel, number> = {
  info: 0,
  warn: 1,
  error: 2,
  critical: 3,
};

// ── Constants ────────────────────────────────────────────────────────────────

/** Default number of days to retain notifications before cleanup deletes them. */
const DEFAULT_RETENTION_DAYS = 30;

/** Interval between cleanup runs: 24 hours in milliseconds. */
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 86_400_000

/** Milliseconds per day, used to convert retention days to a max-age duration. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class NotificationManager {
  private _broadcast: ((payload: unknown) => void) | undefined;
  private _userPrefsStorage: UserNotificationPrefsStorage | null = null;
  private _integrationManager: IntegrationManager | null = null;
  private _cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly storage: NotificationStorage,
    broadcast?: (payload: unknown) => void
  ) {
    this._broadcast = broadcast;
  }

  /**
   * Wire the WebSocket broadcast callback after the gateway has started.
   * Called once by the gateway during route setup.
   */
  setBroadcast(fn: (payload: unknown) => void): void {
    this._broadcast = fn;
  }

  /** Inject per-user prefs storage (wired by SecureYeoman after init). */
  setUserPrefsStorage(s: UserNotificationPrefsStorage): void {
    this._userPrefsStorage = s;
  }

  /** Inject IntegrationManager for external adapter dispatch (wired by SecureYeoman at Step 6). */
  setIntegrationManager(im: IntegrationManager): void {
    this._integrationManager = im;
  }

  async notify(params: NotifyParams): Promise<Notification> {
    const notification = await this.storage.create({
      type: params.type,
      title: params.title,
      body: params.body,
      level: params.level ?? 'info',
      source: params.source,
      metadata: params.metadata,
    });

    this._broadcast?.({ notification });

    // Fan-out to external adapters based on per-user preferences (fire-and-forget)
    void this._fanout(notification).catch(() => {
      // Fanout errors are non-fatal — logged inside _fanout per-pref
    });

    return notification;
  }

  /** Fan out a notification to all users' configured external channels. */
  private async _fanout(notification: Notification): Promise<void> {
    if (!this._userPrefsStorage || !this._integrationManager) return;

    let prefs;
    try {
      prefs = await this._userPrefsStorage.listAll();
    } catch {
      return; // Non-fatal — storage may not be ready yet
    }

    const notifRank = LEVEL_RANKS[notification.level] ?? 0;
    const nowHour = new Date().getUTCHours();

    for (const pref of prefs) {
      if (!pref.enabled) continue;

      // Level filter
      const minRank = LEVEL_RANKS[pref.minLevel] ?? 0;
      if (notifRank < minRank) continue;

      // Quiet hours filter (handles overnight wrap-around: start > end means overnight)
      if (pref.quietHoursStart != null && pref.quietHoursEnd != null) {
        const s = pref.quietHoursStart;
        const e = pref.quietHoursEnd;
        const inQuiet = e > s ? nowHour >= s && nowHour < e : nowHour >= s || nowHour < e;
        if (inQuiet) continue;
      }

      // Resolve adapter
      let adapter: import('../integrations/types.js').Integration | null;
      if (pref.integrationId) {
        adapter = this._integrationManager.getAdapter(pref.integrationId);
      } else {
        const adapters = this._integrationManager.getAdaptersByPlatform(pref.channel);
        adapter = adapters[0] ?? null;
      }

      if (!adapter) continue;

      try {
        await adapter.sendMessage(pref.chatId, notification.body, {
          subject: notification.title,
        });
      } catch {
        // Per-pref failure is non-fatal — continue with next pref
      }
    }
  }

  getStorage(): NotificationStorage {
    return this.storage;
  }

  async list(opts?: ListNotificationsOptions): Promise<ListNotificationsResult> {
    return this.storage.list(opts);
  }

  async markRead(id: string): Promise<boolean> {
    return this.storage.markRead(id);
  }

  async markAllRead(): Promise<number> {
    return this.storage.markAllRead();
  }

  async delete(id: string): Promise<boolean> {
    return this.storage.delete(id);
  }

  async unreadCount(): Promise<number> {
    return this.storage.unreadCount();
  }

  /**
   * Start a daily cleanup job that deletes notifications older than `retentionDays`.
   * Fires immediately on first call, then every 24 hours.
   */
  startCleanupJob(retentionDays = DEFAULT_RETENTION_DAYS): void {
    const maxAgeMs = retentionDays * MS_PER_DAY;

    const runCleanup = () => {
      void this.storage.deleteOlderThan(maxAgeMs).catch(() => {
        // Non-fatal
      });
    };

    runCleanup(); // fire immediately
    this._cleanupTimer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
    if (this._cleanupTimer.unref) {
      this._cleanupTimer.unref();
    }
  }

  stopCleanupJob(): void {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }
}
