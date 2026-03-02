/**
 * Consent Dialog (Phase 108-F)
 *
 * Modal triggered when a capture consent request arrives.
 * Shows scope summary, purpose, countdown, approve/deny buttons.
 */

import { useState, useEffect } from 'react';
import type { CaptureConsentItem } from '../../api/client';

interface ConsentDialogProps {
  consent: CaptureConsentItem;
  onGrant: (id: string) => void;
  onDeny: (id: string) => void;
  onClose: () => void;
}

export default function ConsentDialog({ consent, onGrant, onDeny, onClose }: ConsentDialogProps) {
  const [remaining, setRemaining] = useState(
    Math.max(0, Math.ceil((consent.expiresAt - Date.now()) / 1000))
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const secs = Math.max(0, Math.ceil((consent.expiresAt - Date.now()) / 1000));
      setRemaining(secs);
      if (secs <= 0) {
        clearInterval(timer);
        onClose();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [consent.expiresAt, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">Capture Consent Required</h3>

        <div className="space-y-3 mb-6">
          <div>
            <span className="text-sm text-zinc-500">Resource</span>
            <p className="font-medium">{consent.scope.resource}</p>
          </div>
          <div>
            <span className="text-sm text-zinc-500">Purpose</span>
            <p className="font-medium">{consent.scope.purpose}</p>
          </div>
          <div>
            <span className="text-sm text-zinc-500">Duration</span>
            <p className="font-medium">{consent.scope.duration}s</p>
          </div>
          <div>
            <span className="text-sm text-zinc-500">Requested by</span>
            <p className="font-medium">{consent.requestedBy}</p>
          </div>
        </div>

        <div className="text-center mb-4">
          <span className="text-2xl font-mono tabular-nums">{remaining}s</span>
          <p className="text-xs text-zinc-500">Auto-deny countdown</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => onDeny(consent.id)}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
          >
            Deny
          </button>
          <button
            onClick={() => onGrant(consent.id)}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
