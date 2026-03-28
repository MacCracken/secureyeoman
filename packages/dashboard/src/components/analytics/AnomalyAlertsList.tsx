/**
 * AnomalyAlertsList — table showing usage anomaly alerts with severity badges.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { fetchAnomalies, type UsageAnomalyItem } from '../../api/client';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  low: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

const ANOMALY_TYPES = [
  'all',
  'message_rate_spike',
  'off_hours_activity',
  'credential_stuffing',
] as const;

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function AnomalyAlertsList() {
  const [typeFilter, setTypeFilter] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['anomalies', typeFilter],
    queryFn: () =>
      fetchAnomalies({
        limit: 50,
        anomalyType: typeFilter === 'all' ? undefined : typeFilter,
      }),
    refetchInterval: 30_000,
  });

  const anomalies = data?.anomalies ?? [];

  return (
    <div data-testid="anomaly-alerts-list">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {ANOMALY_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => {
              setTypeFilter(type);
            }}
            className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
              typeFilter === type
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {type === 'all' ? 'All' : type.replace(/_/g, ' ')}
          </button>
        ))}
        {data?.total != null && (
          <span className="text-xs text-muted-foreground ml-auto">{data.total} total</span>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading anomalies...</div>
      ) : anomalies.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-muted-foreground">
          <AlertTriangle className="w-8 h-8 mb-2 opacity-30" />
          <div className="text-sm">No anomalies detected</div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {anomalies.map((a: UsageAnomalyItem) => (
            <div
              key={a.id}
              className="flex items-center gap-2 p-2 rounded-md border bg-card/50 text-sm"
            >
              <span
                className={`px-1.5 py-0.5 text-xs rounded border ${SEVERITY_COLORS[a.severity] ?? SEVERITY_COLORS.low}`}
              >
                {a.severity}
              </span>
              <span className="font-medium">{a.anomalyType.replace(/_/g, ' ')}</span>
              {a.userId && (
                <span className="text-muted-foreground text-xs">user: {a.userId.slice(0, 8)}</span>
              )}
              <span className="text-muted-foreground text-xs ml-auto">{timeAgo(a.detectedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
