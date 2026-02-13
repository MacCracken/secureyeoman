/**
 * Security Events Component
 *
 * Displays security events, audit status, and threat indicators.
 * Supports event acknowledgment and investigation.
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  RefreshCw,
  Eye,
  Check,
  X,
  Settings,
} from 'lucide-react';
import { fetchSecurityEvents, verifyAuditChain } from '../api/client';
import { Link } from 'react-router-dom';
import type { MetricsSnapshot, SecurityEvent } from '../types';

interface SecurityEventsProps {
  metrics?: MetricsSnapshot;
}

const SEVERITY_ICONS: Record<string, React.ReactNode> = {
  info: <Info className="w-4 h-4 text-info" />,
  warn: <AlertTriangle className="w-4 h-4 text-warning" />,
  error: <XCircle className="w-4 h-4 text-destructive" />,
  critical: <ShieldAlert className="w-4 h-4 text-destructive" />,
};

const SEVERITY_COLORS: Record<string, string> = {
  info: 'border-l-info',
  warn: 'border-l-warning',
  error: 'border-l-destructive',
  critical: 'border-l-destructive bg-destructive/5',
};

const ACK_STORAGE_KEY = 'friday_acknowledged_events';

function loadAcknowledged(): Set<string> {
  try {
    const stored = localStorage.getItem(ACK_STORAGE_KEY);
    return new Set(stored ? JSON.parse(stored) : []);
  } catch {
    return new Set();
  }
}

function saveAcknowledged(ids: Set<string>): void {
  localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(Array.from(ids)));
}

export function SecurityEvents({ metrics }: SecurityEventsProps) {
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean;
    entriesChecked: number;
    error?: string;
  } | null>(null);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(loadAcknowledged);
  const [investigatingEvent, setInvestigatingEvent] = useState<SecurityEvent | null>(null);

  const { data: eventsData } = useQuery({
    queryKey: ['security-events'],
    queryFn: () => fetchSecurityEvents({ limit: 20 }),
    refetchInterval: 10000,
  });

  const events = eventsData?.events ?? [];

  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      const result = await verifyAuditChain();
      setVerificationResult(result);
    } finally {
      setVerifying(false);
    }
  };

  const acknowledgeEvent = useCallback((eventId: string) => {
    setAcknowledged((prev) => {
      const next = new Set(prev);
      next.add(eventId);
      saveAcknowledged(next);
      return next;
    });
  }, []);

  const acknowledgeAll = useCallback(() => {
    setAcknowledged((prev) => {
      const next = new Set(prev);
      for (const e of events) next.add(e.id);
      saveAcknowledged(next);
      return next;
    });
  }, [events]);

  const unacknowledgedCount = events.filter((e) => !acknowledged.has(e.id)).length;

  return (
    <div className="space-y-6">
      {/* Security Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Audit Chain Status */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium">Audit Chain</h3>
            <button
              onClick={handleVerifyChain}
              disabled={verifying}
              className="btn-ghost p-2"
              aria-label="Verify audit chain"
            >
              <RefreshCw className={`w-4 h-4 ${verifying ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {metrics?.security?.auditChainValid ? (
              <>
                <ShieldCheck className="w-10 h-10 text-success" />
                <div>
                  <p className="font-semibold text-success">Valid</p>
                  <p className="text-xs text-muted-foreground">
                    {metrics?.security?.auditEntriesTotal ?? 0} entries
                  </p>
                </div>
              </>
            ) : (
              <>
                <ShieldX className="w-10 h-10 text-destructive" />
                <div>
                  <p className="font-semibold text-destructive">Invalid</p>
                  <p className="text-xs text-muted-foreground">Requires attention</p>
                </div>
              </>
            )}
          </div>

          {verificationResult && (
            <div
              className={`mt-3 p-2 rounded text-xs ${
                verificationResult.valid
                  ? 'bg-success/10 text-success'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {verificationResult.valid
                ? `Verified ${verificationResult.entriesChecked} entries`
                : verificationResult.error || 'Verification failed'}
            </div>
          )}
        </div>

        {/* Authentication Stats */}
        <div className="card p-4">
          <h3 className="font-medium mb-4">Authentication</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Attempts</span>
              <span className="font-mono">{metrics?.security?.authAttemptsTotal ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-success">Success</span>
              <span className="font-mono">{metrics?.security?.authSuccessTotal ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-destructive">Failures</span>
              <span className="font-mono">{metrics?.security?.authFailuresTotal ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Active Sessions</span>
              <span className="font-mono">{metrics?.security?.activeSessions ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Threat Summary */}
        <div className="card p-4">
          <h3 className="font-medium mb-4">Threat Summary</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Rate Limit Hits</span>
              <span
                className={`font-mono ${(metrics?.security?.rateLimitHitsTotal ?? 0) > 0 ? 'text-warning' : ''}`}
              >
                {metrics?.security?.rateLimitHitsTotal ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Blocked Requests</span>
              <span
                className={`font-mono ${(metrics?.security?.blockedRequestsTotal ?? 0) > 0 ? 'text-warning' : ''}`}
              >
                {metrics?.security?.blockedRequestsTotal ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-destructive">Injection Attempts</span>
              <span
                className={`font-mono ${(metrics?.security?.injectionAttemptsTotal ?? 0) > 0 ? 'text-destructive font-bold' : ''}`}
              >
                {metrics?.security?.injectionAttemptsTotal ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Permission Denials</span>
              <span className="font-mono">{metrics?.security?.permissionDenialsTotal ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Events */}
      <div className="card">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-medium">Recent Security Events</h3>
            {unacknowledgedCount > 0 && (
              <>
                <span className="text-xs text-muted-foreground">
                  {unacknowledgedCount} unacknowledged
                </span>
                <button
                  onClick={acknowledgeAll}
                  className="btn-ghost px-2 py-1 text-xs flex items-center gap-1"
                  aria-label="Acknowledge all events"
                >
                  <Check className="w-3 h-3" /> Ack All
                </button>
              </>
            )}
          </div>
          <Link to="/security-settings" className="btn-ghost p-2" aria-label="Security settings">
            <Settings className="w-4 h-4" />
          </Link>
        </div>
        <div className="divide-y">
          {events.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No security events recorded</p>
            </div>
          ) : (
            events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                isAcknowledged={acknowledged.has(event.id)}
                onAcknowledge={() => acknowledgeEvent(event.id)}
                onInvestigate={() => setInvestigatingEvent(event)}
              />
            ))
          )}
        </div>
      </div>

      {/* Investigation Panel */}
      {investigatingEvent && (
        <InvestigationPanel
          event={investigatingEvent}
          onClose={() => setInvestigatingEvent(null)}
        />
      )}
    </div>
  );
}

interface EventRowProps {
  event: SecurityEvent;
  isAcknowledged: boolean;
  onAcknowledge: () => void;
  onInvestigate: () => void;
}

function EventRow({ event, isAcknowledged, onAcknowledge, onInvestigate }: EventRowProps) {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div
      className={`p-4 border-l-4 ${SEVERITY_COLORS[event.severity] ?? 'border-l-muted'} ${
        isAcknowledged ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {SEVERITY_ICONS[event.severity]}
          <div className="min-w-0">
            <p className="font-medium">{event.type.replace(/_/g, ' ')}</p>
            <p className="text-sm text-muted-foreground">{event.message}</p>
            {event.userId && (
              <p className="text-xs text-muted-foreground mt-1">User: {event.userId}</p>
            )}
            {event.ipAddress && (
              <p className="text-xs text-muted-foreground">IP: {event.ipAddress}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatTime(event.timestamp)}
          </span>
          {!isAcknowledged && (
            <button
              onClick={onAcknowledge}
              className="btn-ghost p-1 text-muted-foreground hover:text-success"
              aria-label={`Acknowledge event ${event.id}`}
              title="Acknowledge"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onInvestigate}
            className="btn-ghost p-1 text-muted-foreground hover:text-primary"
            aria-label={`Investigate event ${event.id}`}
            title="Investigate"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function InvestigationPanel({ event, onClose }: { event: SecurityEvent; onClose: () => void }) {
  return (
    <div className="card border-primary">
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" />
          Event Investigation
        </h3>
        <button onClick={onClose} className="btn-ghost p-1" aria-label="Close investigation panel">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 space-y-4">
        {/* Event Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Event ID</p>
            <p className="font-mono text-xs">{event.id}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Type</p>
            <p>{event.type.replace(/_/g, ' ')}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Severity</p>
            <div className="flex items-center gap-1">
              {SEVERITY_ICONS[event.severity]}
              <span className="capitalize">{event.severity}</span>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Timestamp</p>
            <p>{new Date(event.timestamp).toLocaleString()}</p>
          </div>
          {event.userId && (
            <div>
              <p className="text-xs text-muted-foreground">User ID</p>
              <p>{event.userId}</p>
            </div>
          )}
          {event.ipAddress && (
            <div>
              <p className="text-xs text-muted-foreground">IP Address</p>
              <p className="font-mono">{event.ipAddress}</p>
            </div>
          )}
        </div>

        {/* Full Message */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Message</p>
          <div className="bg-muted/30 rounded p-3 text-sm">{event.message}</div>
        </div>

        {/* Timeline hint */}
        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Related audit trail and event timeline will be available when correlation ID tracking is
            implemented.
          </p>
        </div>
      </div>
    </div>
  );
}
