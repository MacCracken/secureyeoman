/**
 * GatewayAnalyticsTab — API Gateway usage analytics (Phase 80)
 *
 * Shows per-key usage summaries (requests, tokens, errors, latency)
 * and a drill-down request log for any selected key.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart2,
  Key,
  AlertCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  Activity,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { fetchApiKeys, fetchApiKeyUsage, fetchApiKeyUsageSummary } from '../../api/client';
import type { ApiKeyUsageSummary, ApiKeyUsageRow } from '../../types';

// ─── helpers ──────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtMs(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  return `${Math.round(ms)}ms`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function StatPill({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: 'error' | 'warn';
}) {
  const color =
    highlight === 'error'
      ? 'text-red-400'
      : highlight === 'warn'
        ? 'text-yellow-400'
        : 'text-foreground';
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}

// ─── Drill-down log ────────────────────────────────────────────────────

function UsageLogPanel({
  keyId,
  keyName,
  onClose,
}: {
  keyId: string;
  keyName: string;
  onClose: () => void;
}) {
  const now = Date.now();
  const [from] = useState(() => now - 24 * 60 * 60 * 1000);

  const { data, isLoading, error } = useQuery({
    queryKey: ['apiKeyUsage', keyId, from],
    queryFn: () => fetchApiKeyUsage(keyId, from, now),
  });

  const rows: ApiKeyUsageRow[] = data?.usage ?? [];

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium text-sm">{keyName} — Request Log (24 h)</span>
        </div>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm p-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      ) : error ? (
        <div className="p-3 text-sm text-red-400">Failed to load usage log.</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4 text-center">
          No requests in the last 24 hours.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Time</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Tokens</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Latency</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                  Personality
                </th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Error</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                    {fmtDate(row.timestamp)}
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`font-mono ${
                        row.statusCode >= 500
                          ? 'text-red-400'
                          : row.statusCode >= 400
                            ? 'text-yellow-400'
                            : 'text-green-400'
                      }`}
                    >
                      {row.statusCode}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right">{fmt(row.tokensUsed)}</td>
                  <td className="px-3 py-1.5 text-right">{fmtMs(row.latencyMs)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[120px]">
                    {row.personalityId ?? '—'}
                  </td>
                  <td className="px-3 py-1.5 text-red-400 truncate max-w-[180px]">
                    {row.errorMessage ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Summary row ──────────────────────────────────────────────────────

function SummaryRow({
  summary,
  keyName,
  expanded,
  onToggle,
}: {
  summary: ApiKeyUsageSummary;
  keyName: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const errorRate =
    summary.requests24h > 0 ? ((summary.errors24h / summary.requests24h) * 100).toFixed(1) : '0.0';
  const errorHighlight =
    summary.errors24h > 0
      ? summary.errors24h / summary.requests24h > 0.1
        ? 'error'
        : 'warn'
      : undefined;

  return (
    <>
      <tr className="border-b border-border/50 hover:bg-muted/20 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </span>
            <Key className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{keyName}</p>
              <p className="text-xs text-muted-foreground font-mono">{summary.keyPrefix}…</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">{fmt(summary.requests24h)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{fmt(summary.tokens24h)}</td>
        <td
          className={`px-3 py-2.5 text-right tabular-nums ${
            errorHighlight === 'error'
              ? 'text-red-400'
              : errorHighlight === 'warn'
                ? 'text-yellow-400'
                : ''
          }`}
        >
          {fmt(summary.errors24h)}{' '}
          <span className="text-muted-foreground text-xs">({errorRate}%)</span>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
          {fmtMs(summary.p50LatencyMs)}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
          {fmtMs(summary.p95LatencyMs)}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/50">
          <td colSpan={6} className="px-3 py-3">
            <UsageLogPanel keyId={summary.keyId} keyName={keyName} onClose={onToggle} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main GatewayAnalyticsTab ─────────────────────────────────────────

export function GatewayAnalyticsTab() {
  const [expandedKeyId, setExpandedKeyId] = useState<string | null>(null);

  const {
    data: summaryData,
    isLoading: summaryLoading,
    error: summaryError,
  } = useQuery({
    queryKey: ['apiKeyUsageSummary'],
    queryFn: fetchApiKeyUsageSummary,
    refetchInterval: 60_000,
  });

  const { data: keysData, isLoading: keysLoading } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: fetchApiKeys,
  });

  const summary: ApiKeyUsageSummary[] = summaryData?.summary ?? [];
  const keys = keysData?.keys ?? [];
  const isLoading = summaryLoading || keysLoading;

  // Build a lookup from keyId to key name
  const keyNameMap = new Map<string, string>(keys.map((k) => [k.id, k.name]));

  // Aggregate totals
  const totalRequests = summary.reduce((s, r) => s + r.requests24h, 0);
  const totalTokens = summary.reduce((s, r) => s + r.tokens24h, 0);
  const totalErrors = summary.reduce((s, r) => s + r.errors24h, 0);
  const avgP95 =
    summary.length > 0 ? summary.reduce((s, r) => s + r.p95LatencyMs, 0) / summary.length : 0;

  function toggleExpand(keyId: string) {
    setExpandedKeyId((prev) => (prev === keyId ? null : keyId));
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Gateway Analytics</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Per-API-key usage metrics for the last 24 hours.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border border-border rounded-lg p-3 bg-card space-y-1">
          <StatPill
            icon={<Activity className="w-3 h-3" />}
            label="Requests (24 h)"
            value={fmt(totalRequests)}
          />
        </div>
        <div className="border border-border rounded-lg p-3 bg-card space-y-1">
          <StatPill
            icon={<Zap className="w-3 h-3" />}
            label="Tokens (24 h)"
            value={fmt(totalTokens)}
          />
        </div>
        <div className="border border-border rounded-lg p-3 bg-card space-y-1">
          <StatPill
            icon={<AlertTriangle className="w-3 h-3" />}
            label="Errors (24 h)"
            value={fmt(totalErrors)}
            highlight={
              totalErrors > 0
                ? totalErrors / Math.max(totalRequests, 1) > 0.1
                  ? 'error'
                  : 'warn'
                : undefined
            }
          />
        </div>
        <div className="border border-border rounded-lg p-3 bg-card space-y-1">
          <StatPill
            icon={<Clock className="w-3 h-3" />}
            label="Avg p95 Latency"
            value={fmtMs(avgP95)}
          />
        </div>
      </div>

      {/* Per-key table */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading usage data…
        </div>
      ) : summaryError ? (
        <div className="p-3 rounded border border-destructive bg-destructive/10 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Failed to load usage data.
        </div>
      ) : summary.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
          <BarChart2 className="w-8 h-8 opacity-30" />
          <p className="text-sm">No API key activity in the last 24 hours.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">
                    Key
                  </th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">
                    Requests
                  </th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">
                    Tokens
                  </th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">
                    Errors
                  </th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">
                    p50
                  </th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">
                    p95
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <SummaryRow
                    key={s.keyId}
                    summary={s}
                    keyName={keyNameMap.get(s.keyId) ?? s.keyPrefix}
                    expanded={expandedKeyId === s.keyId}
                    onToggle={() => {
                      toggleExpand(s.keyId);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
