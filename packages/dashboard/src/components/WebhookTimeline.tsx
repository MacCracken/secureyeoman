/**
 * WebhookTimeline — Dashboard panel for viewing CI/CD webhook event history.
 *
 * Fetches from /api/v1/webhooks/timeline with filtering and auto-refresh.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWebhookTimeline } from '../api/client';
import type { WebhookTimelineEvent } from '../api/client';

const PROVIDER_LABELS: Record<string, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  jenkins: 'Jenkins',
  northflank: 'Northflank',
  delta: 'Delta',
  travis: 'Travis CI',
};

const CONCLUSION_COLORS: Record<string, string> = {
  success: '#22c55e',
  failure: '#ef4444',
  cancelled: '#f59e0b',
  unknown: '#64748b',
};

const PROVIDERS = ['all', 'github', 'gitlab', 'jenkins', 'northflank', 'delta', 'travis'] as const;

export function WebhookTimeline() {
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [repoFilter, setRepoFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const timelineQuery = useQuery({
    queryKey: ['webhookTimeline', providerFilter, repoFilter, eventFilter],
    queryFn: () =>
      fetchWebhookTimeline({
        provider: providerFilter === 'all' ? undefined : providerFilter,
        repo: repoFilter || undefined,
        event: eventFilter || undefined,
        limit: 50,
      }),
    refetchInterval: 30_000,
  });

  const events = timelineQuery.data?.events ?? [];
  const total = timelineQuery.data?.total ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Webhook Timeline
        </h3>
        <span className="text-[10px] text-muted-foreground/60">
          {total} event{total !== 1 ? 's' : ''} | auto-refresh 30s
        </span>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        <select
          className="text-xs p-1.5 rounded border border-border bg-background"
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
        >
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p === 'all' ? 'All Providers' : PROVIDER_LABELS[p] ?? p}
            </option>
          ))}
        </select>
        <input
          className="text-xs p-1.5 rounded border border-border bg-background flex-1 min-w-[120px]"
          placeholder="Filter by repo..."
          value={repoFilter}
          onChange={(e) => setRepoFilter(e.target.value)}
        />
        <input
          className="text-xs p-1.5 rounded border border-border bg-background flex-1 min-w-[120px]"
          placeholder="Filter by event..."
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
        />
      </div>

      {/* Loading / error states */}
      {timelineQuery.isLoading && (
        <p className="text-xs text-muted-foreground">Loading timeline...</p>
      )}
      {timelineQuery.error && (
        <p className="text-xs text-red-500">{(timelineQuery.error as Error).message}</p>
      )}

      {/* Empty state */}
      {!timelineQuery.isLoading && events.length === 0 && (
        <p className="text-xs text-muted-foreground">No webhook events received yet</p>
      )}

      {/* Event list */}
      <div className="space-y-1">
        {events.map((evt: WebhookTimelineEvent) => (
          <div
            key={evt.id}
            className="card p-2 text-xs cursor-pointer"
            onClick={() => setExpandedId(expandedId === evt.id ? null : evt.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: CONCLUSION_COLORS[evt.conclusion] ?? '#64748b' }}
                />
                <span className="font-medium">
                  {PROVIDER_LABELS[evt.provider] ?? evt.provider}
                </span>
                <span className="text-muted-foreground/60">{evt.event}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground/60">{evt.conclusion}</span>
                <span className="text-muted-foreground/40">
                  {formatTimestamp(evt.receivedAt)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-muted-foreground">
              {evt.ref && <span>ref: {evt.ref}</span>}
              {evt.runId && <span>run: {evt.runId}</span>}
              {evt.repoUrl && (
                <a
                  href={evt.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline truncate max-w-[200px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {evt.repoUrl}
                </a>
              )}
              {evt.logsUrl && (
                <a
                  href={evt.logsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline text-primary"
                  onClick={(e) => e.stopPropagation()}
                >
                  Logs
                </a>
              )}
            </div>

            {/* Expanded metadata */}
            {expandedId === evt.id && (
              <div className="mt-2 p-2 rounded bg-muted/30 overflow-x-auto">
                <pre className="text-[10px] whitespace-pre-wrap break-all">
                  {JSON.stringify(evt.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}
