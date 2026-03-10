import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  Brain,
  TrendingUp,
  Loader2,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchMlSummary, fetchSecurityEvents } from '../../api/client';
import type { MlSecuritySummary } from '../../api/client';

const ML_EVENT_TYPES = 'anomaly,injection_attempt,sandbox_violation,secret_access';
const ML_PAGE_SIZE = 20;

const RISK_COLORS: Record<MlSecuritySummary['riskLevel'], string> = {
  low: 'text-success bg-success/10 border-success/30',
  medium: 'text-warning bg-warning/10 border-warning/30',
  high: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
  critical: 'text-destructive bg-destructive/10 border-destructive/30',
};

const SEVERITY_ICONS: Record<string, React.ReactNode> = {
  info: <Info className="w-4 h-4 text-info" />,
  warn: <AlertTriangle className="w-4 h-4 text-warning" />,
  error: <XCircle className="w-4 h-4 text-destructive" />,
  critical: <AlertTriangle className="w-4 h-4 text-destructive" />,
};

const SEVERITY_COLORS: Record<string, string> = {
  info: 'border-l-info',
  warn: 'border-l-warning',
  error: 'border-l-destructive',
  critical: 'border-l-destructive bg-destructive/5',
};

export function MLSecurityTab() {
  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('7d');
  const [typeFilter, setTypeFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['ml-summary', period],
    queryFn: () => fetchMlSummary({ period }),
    refetchInterval: 30_000,
  });

  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ['ml-events', typeFilter, offset],
    queryFn: () =>
      fetchSecurityEvents({
        type: typeFilter || ML_EVENT_TYPES,
        limit: ML_PAGE_SIZE,
        offset,
      }),
    refetchInterval: 15_000,
  });

  const events = eventsData?.events ?? [];
  const total = eventsData?.total ?? 0;
  const pageCount = Math.ceil(total / ML_PAGE_SIZE);
  const currentPage = Math.floor(offset / ML_PAGE_SIZE) + 1;

  const enabled = summary?.enabled ?? false;
  const riskScore = summary?.riskScore ?? 0;
  const riskLevel = summary?.riskLevel ?? 'low';
  const detections = summary?.detections ?? {
    anomaly: 0,
    injectionAttempt: 0,
    sandboxViolation: 0,
    secretAccess: 0,
    total: 0,
  };
  const trend = summary?.trend ?? [];

  const handlePeriodChange = (p: '24h' | '7d' | '30d') => {
    setPeriod(p);
    setOffset(0);
  };

  const handleTypeFilter = (t: string) => {
    setTypeFilter(t);
    setOffset(0);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          ML &amp; Anomaly Detection
        </h3>
        {/* Period selector */}
        <div className="flex gap-1 rounded-lg border border-border p-1 text-xs">
          {(['24h', '7d', '30d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => {
                handlePeriodChange(p);
              }}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Detection status banner */}
      {!enabled ? (
        <div className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
          <span className="text-warning-foreground">
            ML anomaly detection is disabled.{' '}
            <button
              className="underline font-medium"
              onClick={() => {
                window.location.assign('/security?tab=nodes');
              }}
            >
              Enable in Security Settings
            </button>
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm">
          <CheckCircle className="w-4 h-4 text-success shrink-0" />
          <span className="text-success">ML anomaly detection is active.</span>
        </div>
      )}

      {/* Stats row */}
      {summaryLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading summary…
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Risk score card */}
          <div className="card p-4 flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Risk Score</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{riskScore}</p>
              <span
                className={`text-xs font-semibold px-1.5 py-0.5 rounded border capitalize ${RISK_COLORS[riskLevel]}`}
              >
                {riskLevel}
              </span>
            </div>
          </div>
          <div className="card p-4 flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Anomalies</p>
            <p className="text-2xl font-bold">{detections.anomaly}</p>
          </div>
          <div className="card p-4 flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Injections</p>
            <p className="text-2xl font-bold">{detections.injectionAttempt}</p>
          </div>
          <div className="card p-4 flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Sandbox Violations</p>
            <p className="text-2xl font-bold">{detections.sandboxViolation}</p>
          </div>
          <div className="card p-4 flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Credential Scans</p>
            <p className="text-2xl font-bold">{detections.secretAccess}</p>
          </div>
        </div>
      )}

      {/* Detection Activity chart */}
      <div className="card p-4 space-y-3">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          Detection Activity
        </h4>
        {trend.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No detection events in this period.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="bucket"
                tick={{ fontSize: 10 }}
                tickFormatter={(v: string) => v.split('T')[1] ?? v.slice(-5)}
              />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                formatter={(value: number) => [value, 'Detections']}
                labelFormatter={(label: string) => label}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="count" fill="#f59e0b" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ML Event Feed */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h4 className="text-sm font-medium">ML Event Feed</h4>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={typeFilter}
              onChange={(e) => {
                handleTypeFilter(e.target.value);
              }}
              className="text-xs border border-border rounded px-2 py-1 bg-background text-foreground"
            >
              <option value="">All ML Types</option>
              <option value="anomaly">Anomaly</option>
              <option value="injection_attempt">Injection Attempt</option>
              <option value="sandbox_violation">Sandbox Violation</option>
              <option value="secret_access">Credential Scan</option>
            </select>
            {typeFilter && (
              <button
                onClick={() => {
                  handleTypeFilter('');
                }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
        </div>

        {eventsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading events…
          </div>
        ) : events.length === 0 ? (
          <div className="card p-6 text-center text-sm text-muted-foreground">
            No ML events found{typeFilter ? ` for type "${typeFilter}"` : ''}.
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <div
                key={event.id}
                className={`card border-l-4 ${SEVERITY_COLORS[event.severity] ?? 'border-l-border'} cursor-pointer`}
                onClick={() => {
                  setExpandedEvent(expandedEvent === event.id ? null : event.id);
                }}
              >
                <div className="p-3 flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {SEVERITY_ICONS[event.severity] ?? (
                      <Info className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="badge text-xs">{event.type}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                      {event.userId && (
                        <span className="text-xs text-muted-foreground">user: {event.userId}</span>
                      )}
                      {event.ipAddress && (
                        <span className="text-xs text-muted-foreground">ip: {event.ipAddress}</span>
                      )}
                    </div>
                    <p className="text-sm mt-1 truncate">{event.message}</p>
                    {expandedEvent === event.id && (
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground border-t border-border pt-2">
                        <span className="font-medium text-foreground">ID</span>
                        <span className="truncate">{event.id}</span>
                        <span className="font-medium text-foreground">Type</span>
                        <span>{event.type}</span>
                        <span className="font-medium text-foreground">Severity</span>
                        <span>{event.severity}</span>
                        {event.userId && (
                          <>
                            <span className="font-medium text-foreground">User</span>
                            <span>{event.userId}</span>
                          </>
                        )}
                        {event.ipAddress && (
                          <>
                            <span className="font-medium text-foreground">IP</span>
                            <span>{event.ipAddress}</span>
                          </>
                        )}
                        <span className="font-medium text-foreground">Timestamp</span>
                        <span>{new Date(event.timestamp).toISOString()}</span>
                      </div>
                    )}
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${
                      expandedEvent === event.id ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > ML_PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Page {currentPage} of {pageCount} ({total} events)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setOffset(Math.max(0, offset - ML_PAGE_SIZE));
                }}
                disabled={offset === 0}
                className="btn btn-ghost btn-sm flex items-center gap-1 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </button>
              <button
                onClick={() => {
                  setOffset(offset + ML_PAGE_SIZE);
                }}
                disabled={offset + ML_PAGE_SIZE >= total}
                className="btn btn-ghost btn-sm flex items-center gap-1 disabled:opacity-40"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
