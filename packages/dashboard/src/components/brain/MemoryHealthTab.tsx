/**
 * Memory Health Tab — Phase 118
 *
 * Displays memory health gauge, audit history, importance distribution,
 * compression savings, and pending approvals.
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Heart,
  AlertCircle,
  Clock,
  TrendingDown,
  Archive,
  CheckCircle,
  Loader2,
  Play,
} from 'lucide-react';
import {
  fetchMemoryHealth,
  fetchAuditReports,
  triggerMemoryAudit,
  approveAuditReport,
} from '../../api/client';

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-muted/30">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color ?? ''}`}>{value}</p>
    </div>
  );
}

function HealthGauge({ score }: { score: number }) {
  const color =
    score >= 80 ? 'text-success' : score >= 50 ? 'text-warning' : 'text-destructive';
  const bgColor =
    score >= 80 ? 'bg-success/20' : score >= 50 ? 'bg-warning/20' : 'bg-destructive/20';

  return (
    <div className="flex items-center gap-4">
      <div
        className={`w-20 h-20 rounded-full flex items-center justify-center ${bgColor}`}
      >
        <span className={`text-2xl font-bold ${color}`}>{score}</span>
      </div>
      <div>
        <p className={`text-sm font-medium ${color}`}>
          {score >= 80 ? 'Healthy' : score >= 50 ? 'Needs Attention' : 'Degraded'}
        </p>
        <p className="text-xs text-muted-foreground">Memory health score</p>
      </div>
    </div>
  );
}

export default function MemoryHealthTab() {
  const queryClient = useQueryClient();
  const [auditScope, setAuditScope] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const { data: healthData, isLoading: healthLoading } = useQuery({
    queryKey: ['memory-health'],
    queryFn: () => fetchMemoryHealth(),
    refetchInterval: 30000,
  });

  const { data: reportsData, isLoading: reportsLoading } = useQuery({
    queryKey: ['audit-reports'],
    queryFn: () => fetchAuditReports({ limit: 20 }),
    refetchInterval: 30000,
  });

  const runAuditMutation = useMutation({
    mutationFn: (scope: string) => triggerMemoryAudit({ scope }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['audit-reports'] });
      void queryClient.invalidateQueries({ queryKey: ['memory-health'] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveAuditReport(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['audit-reports'] });
    },
  });

  const handleRunAudit = useCallback(() => {
    runAuditMutation.mutate(auditScope);
  }, [auditScope, runAuditMutation]);

  const health = healthData?.health;
  const reports = reportsData?.reports ?? [];
  const pendingReports = reports.filter((r) => r.status === 'pending_approval');

  if (healthLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0 overflow-hidden">
      {/* Health Overview */}
      <div className="card">
        <div className="card-header flex flex-row items-center gap-2 p-3 sm:p-4">
          <Heart className="w-4 h-4 text-muted-foreground" />
          <h2 className="card-title text-sm sm:text-base">Memory Health</h2>
        </div>
        <div className="card-content space-y-4 p-3 sm:p-4 pt-0 sm:pt-0">
          {health && <HealthGauge score={health.healthScore} />}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<Heart className="w-4 h-4 text-primary" />}
              label="Total Memories"
              value={String(health?.totalMemories ?? 0)}
            />
            <StatCard
              icon={<TrendingDown className="w-4 h-4 text-warning" />}
              label="Avg Importance"
              value={(health?.avgImportance ?? 0).toFixed(3)}
            />
            <StatCard
              icon={<Clock className="w-4 h-4 text-orange-500" />}
              label="Expiring (7d)"
              value={String(health?.expiringWithin7Days ?? 0)}
            />
            <StatCard
              icon={<Archive className="w-4 h-4 text-blue-500" />}
              label="Compressed"
              value={String(health?.compressionSavings ?? 0)}
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Last audit:</span>
            <span>
              {health?.lastAuditAt
                ? `${new Date(health.lastAuditAt).toLocaleString()} (${health.lastAuditScope})`
                : 'Never'}
            </span>
          </div>
        </div>
      </div>

      {/* Manual Audit Trigger */}
      <div className="card">
        <div className="card-header flex flex-row items-center justify-between p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4 text-muted-foreground" />
            <h2 className="card-title text-sm sm:text-base">Run Audit</h2>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={auditScope}
              onChange={(e) =>
                setAuditScope(e.target.value as 'daily' | 'weekly' | 'monthly')
              }
              className="bg-card border border-border rounded-lg px-2 py-1 text-sm"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <button
              onClick={handleRunAudit}
              disabled={runAuditMutation.isPending}
              className="flex items-center gap-2 btn btn-ghost text-sm px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20"
            >
              {runAuditMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Run
            </button>
          </div>
        </div>
      </div>

      {/* Pending Approvals */}
      {pendingReports.length > 0 && (
        <div className="card">
          <div className="card-header flex flex-row items-center gap-2 p-3 sm:p-4">
            <AlertCircle className="w-4 h-4 text-warning" />
            <h2 className="card-title text-sm sm:text-base">
              Pending Approvals ({pendingReports.length})
            </h2>
          </div>
          <div className="card-content p-3 sm:p-4 pt-0 sm:pt-0">
            {pendingReports.map((report) => (
              <div
                key={String(report.id)}
                className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
              >
                <div>
                  <span className="text-sm font-medium">{String(report.scope)} audit</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {report.startedAt
                      ? new Date(report.startedAt as number).toLocaleString()
                      : ''}
                  </span>
                </div>
                <button
                  onClick={() => approveMutation.mutate(String(report.id))}
                  disabled={approveMutation.isPending}
                  className="flex items-center gap-1 btn btn-ghost text-xs px-3 py-1 bg-success/10 text-success hover:bg-success/20"
                >
                  <CheckCircle className="w-3 h-3" />
                  Approve
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit History */}
      <div className="card">
        <div className="card-header flex flex-row items-center gap-2 p-3 sm:p-4">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h2 className="card-title text-sm sm:text-base">Audit History</h2>
        </div>
        <div className="card-content p-3 sm:p-4 pt-0 sm:pt-0">
          {reportsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No audits run yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Time</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Scope</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Status</th>
                    <th className="pb-2 font-medium text-muted-foreground">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.slice(0, 20).map((report) => {
                    const statusColor =
                      report.status === 'completed'
                        ? 'bg-success/10 text-success'
                        : report.status === 'failed'
                          ? 'bg-destructive/10 text-destructive'
                          : report.status === 'pending_approval'
                            ? 'bg-warning/10 text-warning'
                            : 'bg-blue-500/10 text-blue-500';

                    return (
                      <tr key={String(report.id)} className="border-b border-border/50">
                        <td className="py-2 pr-4 tabular-nums">
                          {report.startedAt
                            ? new Date(report.startedAt as number).toLocaleString()
                            : 'N/A'}
                        </td>
                        <td className="py-2 pr-4">{String(report.scope)}</td>
                        <td className="py-2 pr-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}
                          >
                            {String(report.status)}
                          </span>
                        </td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {report.error ? String(report.error).substring(0, 50) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
