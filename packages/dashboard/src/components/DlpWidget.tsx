/**
 * DlpWidget — DLP overview dashboard widget.
 * Shows classification counts, recent egress events, and policy status.
 *
 * Phase 136-F — DLP Egress Monitoring
 */

import { useQuery } from '@tanstack/react-query';
import { getAccessToken } from '../api/client';

interface ClassificationCounts {
  records: { classificationLevel: string }[];
  total: number;
}

interface EgressEvent {
  id: string;
  destinationType: string;
  actionTaken: string;
  classificationLevel: string | null;
  bytesSent: number;
  createdAt: number;
}

interface EgressQueryResult {
  events: EgressEvent[];
  total: number;
}

interface PolicyQueryResult {
  policies: { id: string; name: string; enabled: boolean; action: string }[];
  total: number;
}

async function fetchApi<T>(path: string): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function DlpWidget() {
  const { data: classData, isLoading: clsLoading } = useQuery<ClassificationCounts>({
    queryKey: ['dlp-classifications'],
    queryFn: () => fetchApi('/api/v1/security/dlp/classifications?limit=1000'),
    refetchInterval: 30_000,
  });

  const { data: egressData, isLoading: egressLoading } = useQuery<EgressQueryResult>({
    queryKey: ['dlp-egress-recent'],
    queryFn: () => fetchApi('/api/v1/security/dlp/egress/stats'),
    refetchInterval: 30_000,
  });

  const { data: policyData, isLoading: policyLoading } = useQuery<PolicyQueryResult>({
    queryKey: ['dlp-policies'],
    queryFn: () => fetchApi('/api/v1/security/dlp/policies'),
    refetchInterval: 60_000,
  });

  const isLoading = clsLoading || egressLoading || policyLoading;

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-zinc-400">Loading DLP data...</div>
    );
  }

  if (!classData && !egressData && !policyData) {
    return (
      <div className="p-4 text-sm text-zinc-500">DLP data unavailable</div>
    );
  }

  // Compute classification counts
  const clsCounts: Record<string, number> = {};
  if (classData?.records) {
    for (const r of classData.records) {
      const level = r.classificationLevel || 'unclassified';
      clsCounts[level] = (clsCounts[level] ?? 0) + 1;
    }
  }

  const levelColors: Record<string, string> = {
    public: 'text-green-400',
    internal: 'text-blue-400',
    confidential: 'text-yellow-400',
    restricted: 'text-red-400',
  };

  const policies = policyData?.policies ?? [];
  const enabledPolicies = policies.filter((p) => p.enabled).length;
  const totalPolicies = policies.length;

  return (
    <div className="flex flex-col gap-3 p-4 text-sm">
      <h3 className="text-base font-semibold text-zinc-200">
        Data Loss Prevention
      </h3>

      {/* Classification Overview */}
      <div className="rounded border border-zinc-700 p-3">
        <div className="mb-2 font-medium text-zinc-300">Classification Overview</div>
        <div className="grid grid-cols-2 gap-2">
          {['public', 'internal', 'confidential', 'restricted'].map((level) => (
            <div key={level} className="flex items-center justify-between">
              <span className={levelColors[level] ?? 'text-zinc-400'}>
                {level}
              </span>
              <span className="text-zinc-300 font-mono text-xs">
                {clsCounts[level] ?? 0}
              </span>
            </div>
          ))}
        </div>
        {classData?.total !== undefined && (
          <div className="mt-2 text-xs text-zinc-500">
            {classData.total} total classifications
          </div>
        )}
      </div>

      {/* Egress Stats */}
      {egressData && (
        <div className="rounded border border-zinc-700 p-3">
          <div className="mb-2 font-medium text-zinc-300">Egress Activity</div>
          {'totalEvents' in egressData ? (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-400">Total Events</span>
                <span className="text-zinc-300 font-mono">
                  {(egressData as any).totalEvents}
                </span>
              </div>
              {(egressData as any).byAction &&
                Object.entries((egressData as any).byAction).map(([action, count]) => (
                  <div key={action} className="flex justify-between">
                    <span
                      className={
                        action === 'blocked'
                          ? 'text-red-400'
                          : action === 'warned'
                            ? 'text-yellow-400'
                            : 'text-zinc-400'
                      }
                    >
                      {action}
                    </span>
                    <span className="text-zinc-300 font-mono">{count as number}</span>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-xs text-zinc-500">No egress data available</div>
          )}
        </div>
      )}

      {/* Policy Status */}
      <div className="rounded border border-zinc-700 p-3">
        <div className="mb-2 font-medium text-zinc-300">Policy Status</div>
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 rounded bg-zinc-700">
            <div
              className="h-2 rounded bg-green-500"
              style={{
                width: totalPolicies > 0 ? `${(enabledPolicies / totalPolicies) * 100}%` : '0%',
              }}
            />
          </div>
          <span className="text-xs text-zinc-400">
            {enabledPolicies}/{totalPolicies}
          </span>
        </div>
        <div className="mt-2 space-y-1">
          {policies.slice(0, 5).map((p) => (
            <div key={p.id} className="flex items-center justify-between text-xs">
              <span className={p.enabled ? 'text-zinc-300' : 'text-zinc-500'}>
                {p.name}
              </span>
              <span
                className={
                  p.action === 'block'
                    ? 'text-red-400'
                    : p.action === 'warn'
                      ? 'text-yellow-400'
                      : 'text-zinc-400'
                }
              >
                {p.action}
              </span>
            </div>
          ))}
        </div>
        {totalPolicies === 0 && (
          <div className="text-xs text-zinc-500">No policies configured</div>
        )}
      </div>
    </div>
  );
}
