/**
 * NotificationManager — Phase 51: Real-Time Infrastructure
 *
 * Thin orchestration layer on top of NotificationStorage.
 * Creates DB records and broadcasts to connected WebSocket clients.
 *
 * Usage:
 *   const n = await notificationManager.notify({ type, title, body, level, source });
 *   // → persisted + broadcast to 'notifications' WS channel
 */

import type {
  NotificationStorage,
  Notification,
  NewNotification,
  ListNotificationsOptions,
  ListNotificationsResult,
  NotificationLevel,
} from './notification-storage.js';

export type { Notification, NotificationLevel };

export interface NotifyParams {
  type: string;
  title: string;
  body: string;
  level?: NotificationLevel;
  source?: string;
  metadata?: Record<string, unknown>;
}

export class NotificationManager {
  private _broadcast: ((payload: unknown) => void) | undefined;

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

    return notification;
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
}
