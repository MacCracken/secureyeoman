/**
 * OfflineBanner — Shows a persistent banner when the app is offline
 * and displays pending mutation count with a sync button.
 */

import { useOffline } from '../hooks/useOffline';

export function OfflineBanner() {
  const { isOnline, pendingCount, syncing, syncPending } = useOffline();

  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-medium shadow-lg ${
        isOnline ? 'bg-yellow-900/90 text-yellow-100' : 'bg-red-900/90 text-red-100'
      }`}
    >
      {!isOnline && <span className="mr-2">You are offline.</span>}
      {pendingCount > 0 && (
        <>
          <span>
            {pendingCount} pending change{pendingCount !== 1 ? 's' : ''}
          </span>
          {isOnline && (
            <button
              onClick={() => void syncPending()}
              disabled={syncing}
              className="ml-2 rounded bg-yellow-700 px-2 py-0.5 text-xs hover:bg-yellow-600 disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Sync now'}
            </button>
          )}
        </>
      )}
      {!isOnline && pendingCount === 0 && <span>Changes will sync when back online.</span>}
    </div>
  );
}
