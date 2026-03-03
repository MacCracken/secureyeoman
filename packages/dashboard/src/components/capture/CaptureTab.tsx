/**
 * Capture Management Tab (Phase 108-F)
 *
 * Sub-sections:
 *  - Active Captures: pulsing indicator + stop button
 *  - Pending Consents: approve/deny buttons with auto-refresh
 *  - Capture Settings: duration limits, allowed targets
 */

import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import {
  fetchPendingConsents,
  grantConsent,
  denyConsent,
  revokeConsent,
  fetchActiveRecordings,
  stopRecording,
} from '../../api/client';
import type { CaptureConsentItem, CaptureRecordingItem } from '../../api/client';

const ConsentDialog = lazy(() => import('./ConsentDialog'));

export default function CaptureTab() {
  const [consents, setConsents] = useState<CaptureConsentItem[]>([]);
  const [recordings, setRecordings] = useState<CaptureRecordingItem[]>([]);
  const [selectedConsent, setSelectedConsent] = useState<CaptureConsentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [consentRes, recordingRes] = await Promise.all([
        fetchPendingConsents().catch(() => ({ consents: [] })),
        fetchActiveRecordings().catch(() => ({ recordings: [] })),
      ]);
      setConsents(consentRes.consents);
      setRecordings(recordingRes.recordings);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load capture data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => {
      clearInterval(interval);
    };
  }, [refresh]);

  const handleGrant = async (id: string) => {
    try {
      await grantConsent(id);
      setSelectedConsent(null);
      await refresh();
    } catch {
      setError('Failed to grant consent');
    }
  };

  const handleDeny = async (id: string) => {
    try {
      await denyConsent(id);
      setSelectedConsent(null);
      await refresh();
    } catch {
      setError('Failed to deny consent');
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokeConsent(id);
      await refresh();
    } catch {
      setError('Failed to revoke consent');
    }
  };

  const handleStopRecording = async (sessionId: string) => {
    try {
      await stopRecording(sessionId);
      await refresh();
    } catch {
      setError('Failed to stop recording');
    }
  };

  if (loading) {
    return <div className="p-4 text-zinc-500">Loading capture data...</div>;
  }

  return (
    <div className="space-y-6 p-4">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-3 rounded">
          {error}
        </div>
      )}

      {/* Active Captures */}
      <section>
        <h3 className="text-lg font-semibold mb-3">Active Captures</h3>
        {recordings.length === 0 ? (
          <p className="text-zinc-500 text-sm">No active recordings</p>
        ) : (
          <div className="space-y-2">
            {recordings.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-700 rounded"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="font-mono text-sm">{r.id.slice(0, 8)}</span>
                  <span className="text-zinc-500 text-sm">
                    Started {new Date(r.startedAt).toLocaleTimeString()}
                  </span>
                </div>
                <button
                  onClick={() => handleStopRecording(r.id)}
                  className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                >
                  Stop
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pending Consents */}
      <section>
        <h3 className="text-lg font-semibold mb-3">Pending Consents</h3>
        {consents.length === 0 ? (
          <p className="text-zinc-500 text-sm">No pending consent requests</p>
        ) : (
          <div className="space-y-2">
            {consents.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded"
              >
                <div>
                  <p className="font-medium">{c.scope.resource}</p>
                  <p className="text-sm text-zinc-500">{c.scope.purpose}</p>
                  <p className="text-xs text-zinc-400">
                    Expires in {Math.max(0, Math.ceil((c.expiresAt - Date.now()) / 1000))}s
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDeny(c.id)}
                    className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                  >
                    Deny
                  </button>
                  <button
                    onClick={() => handleGrant(c.id)}
                    className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Capture Settings */}
      <section>
        <h3 className="text-lg font-semibold mb-3">Capture Settings</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="p-3 bg-zinc-50 dark:bg-zinc-700 rounded">
            <span className="text-zinc-500">Default Timeout</span>
            <p className="font-medium">30s</p>
          </div>
          <div className="p-3 bg-zinc-50 dark:bg-zinc-700 rounded">
            <span className="text-zinc-500">Max Duration</span>
            <p className="font-medium">600s</p>
          </div>
          <div className="p-3 bg-zinc-50 dark:bg-zinc-700 rounded">
            <span className="text-zinc-500">Max Active Recordings</span>
            <p className="font-medium">3</p>
          </div>
          <div className="p-3 bg-zinc-50 dark:bg-zinc-700 rounded">
            <span className="text-zinc-500">Consent Required</span>
            <p className="font-medium">Yes</p>
          </div>
        </div>
      </section>

      {/* Consent Dialog */}
      {selectedConsent && (
        <Suspense fallback={null}>
          <ConsentDialog
            consent={selectedConsent}
            onGrant={handleGrant}
            onDeny={handleDeny}
            onClose={() => {
              setSelectedConsent(null);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
