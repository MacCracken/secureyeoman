/**
 * useOffline — React hook for offline status detection and mutation sync.
 *
 * Provides:
 *   - `isOnline` — reactive online/offline status
 *   - `pendingCount` — number of queued mutations
 *   - `syncPending()` — replay queued mutations when back online
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { replayQueuedRequest } from '../api/client';
import { drainMutations, removeMutation } from '../lib/offline-db';

/**
 * Whether a replayed mutation is finished with: it succeeded, or the server
 * refused it for good (a client error a retry cannot fix). An expired session
 * (401), a timeout, rate limiting and server errors leave it queued.
 */
function settled(status: number): boolean {
  if (status >= 200 && status < 300) return true;
  return status >= 400 && status < 500 && ![401, 408, 429].includes(status);
}

export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
    };
    const goOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Refresh pending count periodically
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const pending = await drainMutations();
      if (mounted) setPendingCount(pending.length);
    };
    void check();
    const interval = setInterval(() => {
      void check();
    }, 10_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Auto-sync when coming back online
  const syncPending = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const mutations = await drainMutations();
      for (const m of mutations) {
        try {
          // With the access token: the bare fetch this used was always 401,
          // and the mutation was dropped anyway.
          const res = await replayQueuedRequest(m.method, m.url, m.body);
          if (!settled(res.status)) break; // keep it, in order, for the next sync
          await removeMutation(m.id);
        } catch {
          // Stop on first failure — remaining mutations stay queued
          break;
        }
      }
      const remaining = await drainMutations();
      setPendingCount(remaining.length);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  // Auto-sync on reconnect
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      void syncPending();
    }
  }, [isOnline, pendingCount, syncPending]);

  return { isOnline, pendingCount, syncing, syncPending };
}
