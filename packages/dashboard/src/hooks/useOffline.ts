/**
 * useOffline — React hook for offline status detection and mutation sync.
 *
 * Provides:
 *   - `isOnline` — reactive online/offline status
 *   - `pendingCount` — number of queued mutations
 *   - `syncPending()` — replay queued mutations when back online
 */

import { useState, useEffect, useCallback } from 'react';
import { drainMutations, removeMutation } from '../lib/offline-db';

export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

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
    if (syncing) return;
    setSyncing(true);
    try {
      const mutations = await drainMutations();
      for (const m of mutations) {
        try {
          await fetch(m.url, {
            method: m.method,
            headers: { 'Content-Type': 'application/json' },
            body: m.body ? JSON.stringify(m.body) : undefined,
          });
          await removeMutation(m.id);
        } catch {
          // Stop on first failure — remaining mutations stay queued
          break;
        }
      }
      const remaining = await drainMutations();
      setPendingCount(remaining.length);
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  // Auto-sync on reconnect
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      void syncPending();
    }
  }, [isOnline, pendingCount, syncPending]);

  return { isOnline, pendingCount, syncing, syncPending };
}
