/**
 * SecuritySandboxTab — Sandbox Artifact Scanning dashboard (Phase 116)
 *
 * Components: ScanStatsCards, ScanVerdictChart, QuarantineTable,
 * ThreatIntelPanel, RecentScansTable.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  CheckSquare,
  RefreshCw,
} from 'lucide-react';
import {
  fetchScanHistory,
  fetchScanStats,
  fetchQuarantineItems,
  approveQuarantine,
  deleteQuarantine,
  fetchThreatIntelligence,
  fetchSandboxPolicy,
} from '../../api/client';

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color = 'text-foreground',
}: {
  label: string;
  value: string | number;
  icon: typeof Shield;
  color?: string;
}) {
  return (
    <div className="bg-card rounded-lg border border-border p-4 flex items-center gap-3">
      <Icon className={`w-5 h-5 ${color}`} />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
    </div>
  );
}

// ── Verdict badge ────────────────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: string }) {
  const styles: Record<string, string> = {
    pass: 'bg-green-500/10 text-green-600',
    warn: 'bg-yellow-500/10 text-yellow-600',
    quarantine: 'bg-orange-500/10 text-orange-600',
    block: 'bg-red-500/10 text-red-600',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[verdict] ?? 'bg-muted text-muted-foreground'}`}>
      {verdict}
    </span>
  );
}

// ── Severity badge ───────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    critical: 'bg-red-500/10 text-red-600',
    high: 'bg-orange-500/10 text-orange-600',
    medium: 'bg-yellow-500/10 text-yellow-600',
    low: 'bg-blue-500/10 text-blue-600',
    info: 'bg-muted text-muted-foreground',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[severity] ?? 'bg-muted text-muted-foreground'}`}>
      {severity}
    </span>
  );
}

// ── Main Tab ─────────────────────────────────────────────────────────────────

export function SandboxTab() {
  const queryClient = useQueryClient();
  const [scansPage, setScansPage] = useState(0);
  const pageSize = 20;

  // Queries
  const statsQuery = useQuery({
    queryKey: ['sandbox', 'stats'],
    queryFn: fetchScanStats,
    refetchInterval: 30_000,
  });

  const scansQuery = useQuery({
    queryKey: ['sandbox', 'scans', scansPage],
    queryFn: () => fetchScanHistory({ limit: pageSize, offset: scansPage * pageSize }),
    refetchInterval: 30_000,
  });

  const quarantineQuery = useQuery({
    queryKey: ['sandbox', 'quarantine'],
    queryFn: fetchQuarantineItems,
    refetchInterval: 30_000,
  });

  const threatsQuery = useQuery({
    queryKey: ['sandbox', 'threats'],
    queryFn: fetchThreatIntelligence,
    staleTime: 5 * 60_000,
  });

  const policyQuery = useQuery({
    queryKey: ['sandbox', 'policy'],
    queryFn: fetchSandboxPolicy,
    staleTime: 60_000,
  });

  // Mutations
  const approveMut = useMutation({
    mutationFn: (id: string) => approveQuarantine(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox', 'quarantine'] });
      queryClient.invalidateQueries({ queryKey: ['sandbox', 'stats'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteQuarantine(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox', 'quarantine'] });
      queryClient.invalidateQueries({ queryKey: ['sandbox', 'stats'] });
    },
  });

  const stats = statsQuery.data?.stats;
  const scans = scansQuery.data;
  const quarantineItems = quarantineQuery.data?.items ?? [];
  const threats = threatsQuery.data;
  const policy = policyQuery.data?.policy;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Scans" value={stats?.total ?? 0} icon={Shield} />
        <StatCard
          label="Quarantined"
          value={stats?.byVerdict?.quarantine ?? 0}
          icon={AlertTriangle}
          color="text-orange-500"
        />
        <StatCard
          label="Blocked"
          value={stats?.byVerdict?.block ?? 0}
          icon={XCircle}
          color="text-red-500"
        />
        <StatCard
          label="Passed"
          value={stats?.byVerdict?.pass ?? 0}
          icon={CheckCircle}
          color="text-green-500"
        />
      </div>

      {/* Policy Banner */}
      {policy && (
        <div className="bg-card rounded-lg border border-border p-4 text-sm">
          <div className="font-medium mb-1">Externalization Policy</div>
          <div className="text-muted-foreground">
            {policy.enabled ? (
              <>
                Scanning {policy.enabled ? 'enabled' : 'disabled'} | Max artifact:{' '}
                {((policy.maxArtifactSizeBytes ?? 0) / 1024 / 1024).toFixed(1)}MB | Redact secrets:{' '}
                {policy.redactSecrets ? 'yes' : 'no'}
              </>
            ) : (
              'Artifact scanning is currently disabled.'
            )}
          </div>
        </div>
      )}

      {/* Quarantine Table */}
      <div className="bg-card rounded-lg border border-border">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-medium text-sm">Quarantined Artifacts ({quarantineItems.length})</h3>
          <button
            onClick={() => quarantineQuery.refetch()}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        {quarantineItems.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground text-center">
            No quarantined artifacts.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {quarantineItems.map((item: any) => (
              <div key={item.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono truncate">{item.id?.slice(0, 12)}...</div>
                  <div className="text-xs text-muted-foreground">
                    {item.sourceContext ?? 'unknown'} | {item.artifactType ?? 'unknown'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => approveMut.mutate(item.id)}
                    disabled={approveMut.isPending}
                    className="p-1.5 rounded hover:bg-accent text-green-600"
                    title="Approve and release"
                  >
                    <CheckSquare className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteMut.mutate(item.id)}
                    disabled={deleteMut.isPending}
                    className="p-1.5 rounded hover:bg-accent text-red-600"
                    title="Permanently delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Threat Intelligence Panel */}
      {threats && (
        <div className="bg-card rounded-lg border border-border">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-medium text-sm">
              Threat Intelligence ({threats.patternCount ?? 0} patterns)
            </h3>
          </div>
          <div className="p-4 space-y-3">
            <div className="text-xs text-muted-foreground">
              Categories: {(threats.categories ?? []).join(', ')}
            </div>
            <div className="text-xs text-muted-foreground">
              Kill Chain Stages: {(threats.stages ?? []).join(', ')}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {(threats.patterns ?? []).slice(0, 12).map((p: any) => (
                <div key={p.id} className="bg-muted/50 rounded p-2 text-xs">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-muted-foreground">{p.category} | w={p.intentWeight}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent Scans Table */}
      <div className="bg-card rounded-lg border border-border">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-medium text-sm">Recent Scans</h3>
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setScansPage(Math.max(0, scansPage - 1))}
              disabled={scansPage === 0}
              className="px-2 py-1 rounded bg-muted hover:bg-accent disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-muted-foreground">Page {scansPage + 1}</span>
            <button
              onClick={() => setScansPage(scansPage + 1)}
              disabled={(scans?.rows?.length ?? 0) < pageSize}
              className="px-2 py-1 rounded bg-muted hover:bg-accent disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
        {scansQuery.isLoading ? (
          <div className="px-4 py-6 text-center">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : (scans?.rows?.length ?? 0) === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground text-center">
            No scan records found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Verdict</th>
                <th className="px-4 py-2">Severity</th>
                <th className="px-4 py-2">Findings</th>
                <th className="px-4 py-2">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(scans?.rows ?? []).map((row: any) => (
                <tr key={row.id} className="hover:bg-muted/50">
                  <td className="px-4 py-2 font-mono text-xs">{row.id?.slice(0, 8)}</td>
                  <td className="px-4 py-2">{row.source_context ?? row.sourceContext}</td>
                  <td className="px-4 py-2">
                    <VerdictBadge verdict={row.verdict} />
                  </td>
                  <td className="px-4 py-2">
                    <SeverityBadge severity={row.worst_severity ?? row.worstSeverity ?? 'info'} />
                  </td>
                  <td className="px-4 py-2">{row.finding_count ?? row.findingCount ?? 0}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {row.scan_duration_ms ?? row.scanDurationMs ?? 0}ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
