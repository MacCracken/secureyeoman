/* eslint-disable react-hooks/purity */
/**
 * Notification Bell
 *
 * In-app notifications from WebSocket security and task events (local, localStorage-backed)
 * plus server-persisted notifications pushed via the `notifications` WebSocket channel
 * (Phase 51: Real-Time Infrastructure).
 *
 * Local notifications (security, task WS events) continue to work as before.
 * Server notifications (heartbeat alerts, etc.) are DB-backed: they persist across
 * reloads and markRead calls the REST API.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  X,
  Check,
  Trash2,
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { sanitizeText } from '../utils/sanitize';
import { markNotificationRead, markAllNotificationsRead, deleteNotification } from '../api/client';
import type { WebSocketMessage, ServerNotification } from '../types';

// ─── Local notification type (localStorage-backed) ────────────────────────────

interface LocalNotification {
  id: string;
  /** Discriminator: undefined means legacy local notification */
  origin: 'local';
  type: 'security' | 'task_completed' | 'task_failed';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

// ─── Unified display type ─────────────────────────────────────────────────────

interface DisplayNotification {
  /** Unique key for rendering */
  key: string;
  /** 'server' = DB-backed (markRead via API), 'local' = localStorage-backed */
  origin: 'server' | 'local';
  dbId?: string;
  type: string;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const STORAGE_KEY = 'friday_notifications';
const MAX_LOCAL = 50;

function loadLocal(): LocalNotification[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveLocal(notifications: LocalNotification[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, MAX_LOCAL)));
}

// ─── Convert WS message to local notification ─────────────────────────────────

function wsMessageToLocal(msg: WebSocketMessage): LocalNotification | null {
  const ts = msg.timestamp || Date.now();
  const payload = msg.payload as Record<string, unknown> | undefined;

  if (msg.channel === 'security' && payload) {
    return {
      id: `sec-${ts}-${Math.random().toString(36).slice(2, 6)}`,
      origin: 'local',
      type: 'security',
      title: String(payload.type ?? 'Security Event').replace(/_/g, ' '),
      message: String(payload.message ?? 'Security event detected'),
      timestamp: ts,
      read: false,
    };
  }

  if (msg.channel === 'tasks' && payload) {
    const status = String(payload.status ?? '');
    if (status === 'completed' || status === 'failed') {
      return {
        id: `task-${ts}-${Math.random().toString(36).slice(2, 6)}`,
        origin: 'local',
        type: status === 'completed' ? 'task_completed' : 'task_failed',
        title: `Task ${status}`,
        message: String(payload.name ?? payload.id ?? 'Unknown task'),
        timestamp: ts,
        read: false,
      };
    }
  }

  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationBell() {
  const [localNotifications, setLocalNotifications] = useState<LocalNotification[]>(loadLocal);
  // Server notifications pushed via WS (kept in component state, not React Query,
  // so they appear instantly without a round-trip)
  const [serverNotifications, setServerNotifications] = useState<DisplayNotification[]>([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const serverNotificationsRef = useRef(serverNotifications);
  serverNotificationsRef.current = serverNotifications;
  const queryClient = useQueryClient();
  const { lastMessage, subscribe } = useWebSocket('/ws/metrics');

  // Subscribe to the notifications channel on mount
  useEffect(() => {
    subscribe(['notifications']);
  }, [subscribe]);

  // Process incoming WS messages
  useEffect(() => {
    if (!lastMessage) return;

    // Server notification pushed from notifications channel
    if (lastMessage.channel === 'notifications' && lastMessage.payload) {
      const payload = lastMessage.payload as { notification?: ServerNotification };
      const n = payload.notification;
      if (n) {
        const display: DisplayNotification = {
          key: `srv-${n.id}`,
          origin: 'server',
          dbId: n.id,
          type: n.type,
          title: n.title,
          message: n.body,
          timestamp: n.createdAt,
          read: n.readAt != null,
        };
        setServerNotifications((prev) => {
          if (prev.some((x) => x.key === display.key)) return prev;
          return [display, ...prev].slice(0, 50);
        });
        // Invalidate any queries using notifications data
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
      return;
    }

    // Local WS event (security, task)
    const local = wsMessageToLocal(lastMessage);
    if (!local) return;
    setLocalNotifications((prev) => {
      if (prev.some((n) => n.id === local.id)) return prev;
      const next = [local, ...prev].slice(0, MAX_LOCAL);
      saveLocal(next);
      return next;
    });
  }, [lastMessage, queryClient]);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
    };
  }, []);

  // ── Merged display list (server first, then local; newest first by timestamp) ──

  const localDisplays: DisplayNotification[] = localNotifications.map((n) => ({
    key: `loc-${n.id}`,
    origin: 'local' as const,
    type: n.type,
    title: n.title,
    message: n.message,
    timestamp: n.timestamp,
    read: n.read,
  }));

  const allNotifications: DisplayNotification[] = [...serverNotifications, ...localDisplays]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 50);

  const unreadCount = allNotifications.filter((n) => !n.read).length;

  // ── Actions ──────────────────────────────────────────────────────────────────

  const markAsRead = useCallback(
    (item: DisplayNotification) => {
      if (item.origin === 'server' && item.dbId) {
        void markNotificationRead(item.dbId).catch(() => {
          /* non-fatal */
        });
        setServerNotifications((prev) =>
          prev.map((n) => (n.key === item.key ? { ...n, read: true } : n))
        );
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      } else {
        setLocalNotifications((prev) => {
          const next = prev.map((n) =>
            n.id === item.key.replace('loc-', '') ? { ...n, read: true } : n
          );
          saveLocal(next);
          return next;
        });
      }
    },
    [queryClient]
  );

  const markAllRead = useCallback(() => {
    // Mark server notifications
    void markAllNotificationsRead().catch(() => {
      /* non-fatal */
    });
    setServerNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    // Mark local notifications
    setLocalNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      saveLocal(next);
      return next;
    });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, [queryClient]);

  const removeItem = useCallback(
    (item: DisplayNotification) => {
      if (item.origin === 'server' && item.dbId) {
        void deleteNotification(item.dbId).catch(() => {
          /* non-fatal */
        });
        setServerNotifications((prev) => prev.filter((n) => n.key !== item.key));
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      } else {
        const localId = item.key.replace('loc-', '');
        setLocalNotifications((prev) => {
          const next = prev.filter((n) => n.id !== localId);
          saveLocal(next);
          return next;
        });
      }
    },
    [queryClient]
  );

  const clearAll = useCallback(() => {
    // Server notifications: delete each (fire-and-forget)
    for (const n of serverNotificationsRef.current) {
      if (n.dbId)
        void deleteNotification(n.dbId).catch(() => {
          /* non-fatal */
        });
    }
    setServerNotifications([]);
    // Local notifications
    setLocalNotifications([]);
    saveLocal([]);
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, [queryClient]);

  // ── Icon helpers ──────────────────────────────────────────────────────────────

  const iconForType = (type: string) => {
    switch (type) {
      case 'security':
        return <Shield className="w-4 h-4 text-warning flex-shrink-0" />;
      case 'task_completed':
        return <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />;
      case 'task_failed':
        return <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />;
      case 'heartbeat_alert':
        return <Activity className="w-4 h-4 text-warning flex-shrink-0" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
    }
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
        }}
        className="btn-ghost p-2 relative rounded-md border border-transparent hover:border-border"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-card border rounded-md shadow-lg z-50 max-h-96 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <h3 className="text-sm font-medium">Notifications</h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="btn-ghost p-1 text-xs text-muted-foreground hover:text-foreground"
                  aria-label="Mark all as read"
                  title="Mark all read"
                >
                  <Check className="w-3 h-3" />
                </button>
              )}
              {allNotifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="btn-ghost p-1 text-xs text-muted-foreground hover:text-destructive"
                  aria-label="Clear all notifications"
                  title="Clear all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Notification List */}
          <div className="overflow-y-auto flex-1">
            {allNotifications.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No notifications
              </div>
            ) : (
              allNotifications.map((n) => (
                <div
                  key={n.key}
                  className={`w-full px-3 py-2 border-b last:border-0 flex gap-2 ${
                    n.read ? 'opacity-60' : ''
                  }`}
                >
                  <button
                    onClick={() => {
                      markAsRead(n);
                    }}
                    className="flex gap-2 flex-1 min-w-0 text-left hover:bg-muted/30 transition-colors rounded"
                  >
                    {iconForType(n.type)}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p
                          className={`text-xs font-medium truncate ${n.read ? '' : 'text-foreground'}`}
                        >
                          {sanitizeText(n.title)}
                        </p>
                        {!n.read && (
                          <span className="w-1.5 h-1.5 bg-primary rounded-full flex-shrink-0 ml-1" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {sanitizeText(n.message)}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatTime(n.timestamp)}
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      removeItem(n);
                    }}
                    className="btn-ghost p-1 text-muted-foreground hover:text-destructive flex-shrink-0 self-start mt-0.5"
                    aria-label={`Dismiss: ${n.title}`}
                    title="Dismiss"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
