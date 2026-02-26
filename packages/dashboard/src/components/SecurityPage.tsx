import { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  RefreshCw,
  Eye,
  Check,
  Settings,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Download,
  Plus,
  X,
  FileText,
  ChevronDown,
  ChevronUp,
  Server,
  Activity,
  Database,
  Cpu,
  Network,
  Link,
  Brain,
  TrendingUp,
  Lock,
  LockOpen,
  RefreshCcw,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  fetchSecurityEvents,
  fetchAuditEntries,
  verifyAuditChain,
  fetchReports,
  generateReport,
  downloadReport,
  fetchHealth,
  fetchMetrics,
  fetchAuditStats,
  fetchMcpServers,
  fetchMlSummary,
  fetchTlsStatus,
  fetchSecurityPolicy,
  fetchAutonomyOverview,
  fetchAuditRuns,
  createAuditRun,
  fetchAuditRun,
  updateAuditItem,
  finalizeAuditRun,
  emergencyStop,
} from '../api/client';
import type { ReportSummary, MlSecuritySummary } from '../api/client';
import { ConfirmDialog } from './common/ConfirmDialog';
import { RiskAssessmentTab } from './RiskAssessmentTab';
import type {
  MetricsSnapshot,
  HealthStatus,
  SecurityEvent,
  AuditEntry,
  McpServerConfig,
  AutonomyOverview,
  AutonomyOverviewItem,
  AuditRun,
  ChecklistItem,
  AuditItemStatus,
  AutonomyLevel,
} from '../types';

type TabType = 'overview' | 'audit' | 'ml' | 'reports' | 'nodes' | 'autonomy' | 'risk';

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


export function SecurityPage() {
  const location = useLocation();
  const getInitialTab = (): TabType => {
    const path = location.pathname;
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'audit') return 'audit';
    if (tabParam === 'ml') return 'ml';
    if (tabParam === 'reports' || path.includes('/reports')) return 'reports';
    if (tabParam === 'nodes') return 'nodes';
    if (tabParam === 'autonomy') return 'autonomy';
    if (tabParam === 'risk') return 'risk';
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean;
    entriesChecked: number;
    error?: string;
  } | null>(null);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(loadAcknowledged);
  const [auditReviewed, setAuditReviewed] = useState<Set<string>>(loadReviewedAudit);

  const markAuditReviewed = useCallback((ids: string[]) => {
    setAuditReviewed((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      saveReviewedAudit(next);
      return next;
    });
  }, []);

  const markAllAuditReviewed = useCallback(async () => {
    try {
      const result = await fetchAuditEntries({ limit: 10000, offset: 0 });
      const allIds = result.entries.map((e) => e.id);
      markAuditReviewed(allIds);
    } catch {
      // fallback: no-op
    }
  }, [markAuditReviewed]);

  const { data: policy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
    refetchInterval: 60_000,
  });

  const mlEnabled = policy?.allowAnomalyDetection ?? false;

  // Redirect away from the ML tab if the policy disables anomaly detection
  useEffect(() => {
    if (policy !== undefined && !policy.allowAnomalyDetection && activeTab === 'ml') {
      setActiveTab('overview');
    }
  }, [policy, activeTab]);

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
      // Verification is an audit of the entire chain — mark all entries reviewed
      await markAllAuditReviewed();
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
      events.forEach((e: SecurityEvent) => next.add(e.id));
      saveAcknowledged(next);
      return next;
    });
  }, [events]);

  const visibleEvents = events.filter((e: SecurityEvent) => !acknowledged.has(e.id));
  const criticalCount = events.filter((e: SecurityEvent) => e.severity === 'critical').length;
  const warningCount = events.filter((e: SecurityEvent) => e.severity === 'warn').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-primary flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Security
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Monitor security events, audit logs, and system health
          </p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'overview'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          Overview
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'audit'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileText className="w-4 h-4" />
          Audit Log
        </button>
        <button
          onClick={() => setActiveTab('autonomy')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'autonomy'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Lock className="w-4 h-4" />
          Autonomy
        </button>
        {mlEnabled && (
          <button
            onClick={() => setActiveTab('ml')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'ml'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            data-testid="tab-ml"
          >
            <Brain className="w-4 h-4" />
            ML
          </button>
        )}
        <button
          onClick={() => setActiveTab('reports')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'reports'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileText className="w-4 h-4" />
          Reports
        </button>
        <button
          onClick={() => setActiveTab('nodes')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'nodes'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Server className="w-4 h-4" />
          System
        </button>
        <button
          onClick={() => setActiveTab('risk')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'risk'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Risk
        </button>
      </div>

      {activeTab === 'overview' && (
        <SecurityOverviewTab
          events={visibleEvents}
          criticalCount={criticalCount}
          warningCount={warningCount}
          verifying={verifying}
          verificationResult={verificationResult}
          onVerify={handleVerifyChain}
          onAcknowledge={acknowledgeEvent}
          onAcknowledgeAll={acknowledgeAll}
          onViewAuditLog={() => {
            setActiveTab('audit');
          }}
        />
      )}

      {activeTab === 'audit' && (
        <AuditLogTab
          reviewed={auditReviewed}
          onMarkReviewed={markAuditReviewed}
          onMarkAllReviewed={markAllAuditReviewed}
        />
      )}

      {activeTab === 'ml' && <MLSecurityTab />}

      {activeTab === 'reports' && <ReportsTab />}

      {activeTab === 'nodes' && <NodeDetailsTab />}

      {activeTab === 'autonomy' && <AutonomyTab />}

      {activeTab === 'risk' && <RiskAssessmentTab />}
    </div>
  );
}

// ─── Autonomy Tab ─────────────────────────────────────────────────────────────

function AutonomyTab() {
  const queryClient = useQueryClient();
  const [activePanel, setActivePanel] = useState<'overview' | 'wizard' | 'registry'>('overview');
  const [filterLevel, setFilterLevel] = useState<AutonomyLevel | ''>('');
  const [wizardRunId, setWizardRunId] = useState<string | null>(null);
  const [wizardName, setWizardName] = useState('');
  const [wizardStep, setWizardStep] = useState<0 | 'A' | 'B' | 'C' | 'D' | 'done'>(0);
  const [stopTarget, setStopTarget] = useState<AutonomyOverviewItem | null>(null);

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['autonomy-overview'],
    queryFn: fetchAutonomyOverview,
  });

  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ['autonomy-audit-runs'],
    queryFn: fetchAuditRuns,
  });

  const { data: activeRun, refetch: refetchRun } = useQuery({
    queryKey: ['autonomy-audit-run', wizardRunId],
    queryFn: () => fetchAuditRun(wizardRunId!),
    enabled: !!wizardRunId,
  });

  const createRunMut = useMutation({
    mutationFn: (name: string) => createAuditRun(name),
    onSuccess: (run) => {
      setWizardRunId(run.id);
      setWizardStep('A');
      void queryClient.invalidateQueries({ queryKey: ['autonomy-audit-runs'] });
    },
  });

  const updateItemMut = useMutation({
    mutationFn: ({ itemId, status, note }: { itemId: string; status: AuditItemStatus; note: string }) =>
      updateAuditItem(wizardRunId!, itemId, { status, note }),
    onSuccess: () => void refetchRun(),
  });

  const finalizeMut = useMutation({
    mutationFn: () => finalizeAuditRun(wizardRunId!),
    onSuccess: (run) => {
      setWizardStep('done');
      void queryClient.invalidateQueries({ queryKey: ['autonomy-audit-runs'] });
      setWizardRunId(run.id);
    },
  });

  const stopMut = useMutation({
    mutationFn: ({ type, id }: { type: 'skill' | 'workflow'; id: string }) =>
      emergencyStop(type, id),
    onSuccess: () => {
      setStopTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['autonomy-overview'] });
    },
  });

  const LEVEL_COLORS: Record<AutonomyLevel, string> = {
    L1: 'text-success bg-success/10',
    L2: 'text-info bg-info/10',
    L3: 'text-warning bg-warning/10',
    L4: 'text-orange-500 bg-orange-50',
    L5: 'text-destructive bg-destructive/10',
  };

  const allItems = overview
    ? (Object.values(overview.byLevel).flat() as AutonomyOverviewItem[])
    : [];
  const filteredItems = filterLevel ? allItems.filter((i) => i.autonomyLevel === filterLevel) : allItems;
  const l5Items = overview ? overview.byLevel['L5'] ?? [] : [];

  const sections: Array<{ key: 'A' | 'B' | 'C' | 'D'; label: string }> = [
    { key: 'A', label: 'Section A — Inventory' },
    { key: 'B', label: 'Section B — Level Review' },
    { key: 'C', label: 'Section C — Authority & Accountability' },
    { key: 'D', label: 'Section D — Gap Remediation' },
  ];

  const sectionOrder: Array<0 | 'A' | 'B' | 'C' | 'D' | 'done'> = [0, 'A', 'B', 'C', 'D', 'done'];

  const nextSection = (cur: 'A' | 'B' | 'C' | 'D' | 'done'): 'B' | 'C' | 'D' | 'done' => {
    const map: Record<string, 'B' | 'C' | 'D' | 'done'> = { A: 'B', B: 'C', C: 'D', D: 'done' };
    return map[cur] ?? 'done';
  };

  return (
    <div className="space-y-6">
      {/* Emergency stop confirmation */}
      {stopTarget && (
        <ConfirmDialog
          open
          title="Emergency Stop"
          message={`Disable ${stopTarget.type} "${stopTarget.name}" (${stopTarget.autonomyLevel})? This will set it to disabled. The action will be audited.`}
          confirmLabel="Stop"
          destructive
          onConfirm={() => stopMut.mutate({ type: stopTarget.type, id: stopTarget.id })}
          onCancel={() => setStopTarget(null)}
        />
      )}

      {/* Panel switcher */}
      <div className="flex gap-2 flex-wrap">
        {(['overview', 'wizard', 'registry'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setActivePanel(p)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              activePanel === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {p === 'overview' ? 'Overview' : p === 'wizard' ? 'Audit Wizard' : 'Emergency Stop Registry'}
          </button>
        ))}
      </div>

      {/* ── Overview panel ── */}
      {activePanel === 'overview' && (
        <div className="space-y-4">
          {/* Totals */}
          <div className="grid grid-cols-5 gap-3">
            {(['L1', 'L2', 'L3', 'L4', 'L5'] as AutonomyLevel[]).map((l) => (
              <button
                key={l}
                onClick={() => setFilterLevel(filterLevel === l ? '' : l)}
                className={`card p-3 text-center cursor-pointer border-2 transition-colors ${
                  filterLevel === l ? 'border-primary' : 'border-transparent'
                }`}
              >
                <div className={`text-2xl font-bold ${LEVEL_COLORS[l].split(' ')[0]}`}>
                  {overview?.totals[l] ?? 0}
                </div>
                <div className="text-xs font-medium mt-1">{l}</div>
              </button>
            ))}
          </div>

          {overviewLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

          {/* Items table */}
          {filteredItems.length > 0 && (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">Name</th>
                    <th className="text-left p-3">Type</th>
                    <th className="text-left p-3">Level</th>
                    <th className="text-left p-3">Stop Procedure</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="p-3 font-medium">{item.name}</td>
                      <td className="p-3 text-muted-foreground capitalize">{item.type}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${LEVEL_COLORS[item.autonomyLevel]}`}>
                          {item.autonomyLevel}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground max-w-xs truncate">
                        {item.emergencyStopProcedure ?? <span className="italic">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!overviewLoading && filteredItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No items at this level.</p>
          )}
        </div>
      )}

      {/* ── Audit Wizard panel ── */}
      {activePanel === 'wizard' && (
        <div className="space-y-4 max-w-3xl">
          {wizardStep === 0 && (
            <div className="card p-6 space-y-4">
              <h3 className="font-semibold text-lg">Start Autonomy Audit</h3>
              <p className="text-sm text-muted-foreground">
                Enter a name for this audit run, then work through sections A–D to document your review.
              </p>
              <input
                className="input w-full"
                placeholder="Audit name (e.g. Q1 2026 Autonomy Review)"
                value={wizardName}
                onChange={(e) => setWizardName(e.target.value)}
              />
              <button
                className="btn btn-ghost"
                disabled={!wizardName.trim() || createRunMut.isPending}
                onClick={() => createRunMut.mutate(wizardName.trim())}
              >
                {createRunMut.isPending ? 'Starting…' : 'Start Audit'}
              </button>

              {/* Previous runs */}
              {runs.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Previous Runs</h4>
                  <div className="space-y-1">
                    {runs.map((run) => (
                      <button
                        key={run.id}
                        className="w-full text-left p-2 rounded hover:bg-muted text-sm flex justify-between"
                        onClick={() => {
                          setWizardRunId(run.id);
                          setWizardStep(run.status === 'completed' ? 'done' : 'A');
                        }}
                      >
                        <span>{run.name}</span>
                        <span className={`text-xs ${run.status === 'completed' ? 'text-success' : 'text-warning'}`}>
                          {run.status}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {(['A', 'B', 'C', 'D'] as const).includes(wizardStep as any) && activeRun && (
            <div className="card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  {sections.find((s) => s.key === wizardStep)?.label ?? ''}
                </h3>
                <span className="text-xs text-muted-foreground">{activeRun.name}</span>
              </div>
              <div className="space-y-3">
                {activeRun.items
                  .filter((item: ChecklistItem) => item.section === wizardStep)
                  .map((item: ChecklistItem) => (
                    <div key={item.id} className="p-3 border rounded-lg space-y-2">
                      <p className="text-sm">{item.text}</p>
                      <div className="flex gap-2 flex-wrap">
                        {(['pass', 'fail', 'deferred', 'pending'] as AuditItemStatus[]).map((s) => (
                          <button
                            key={s}
                            onClick={() =>
                              updateItemMut.mutate({ itemId: item.id, status: s, note: item.note })
                            }
                            className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                              item.status === s
                                ? s === 'pass' ? 'bg-success text-success-foreground' :
                                  s === 'fail' ? 'bg-destructive text-destructive-foreground' :
                                  s === 'deferred' ? 'bg-warning text-warning-foreground' :
                                  'bg-muted text-muted-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                      <input
                        className="input w-full text-xs"
                        placeholder="Notes (optional)"
                        value={item.note}
                        onChange={(e) =>
                          updateItemMut.mutate({ itemId: item.id, status: item.status, note: e.target.value })
                        }
                      />
                    </div>
                  ))}
              </div>
              <div className="flex justify-between pt-2">
                <button className="btn btn-ghost text-sm" onClick={() => setWizardStep(0)}>
                  Back to list
                </button>
                {wizardStep !== 'D' ? (
                  <button
                    className="btn btn-ghost text-sm"
                    onClick={() => setWizardStep(nextSection(wizardStep as 'A' | 'B' | 'C' | 'D'))}
                  >
                    Next section →
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost text-sm"
                    disabled={finalizeMut.isPending}
                    onClick={() => finalizeMut.mutate()}
                  >
                    {finalizeMut.isPending ? 'Generating…' : 'Finalize & Generate Report'}
                  </button>
                )}
              </div>
            </div>
          )}

          {wizardStep === 'done' && activeRun && (
            <div className="card p-6 space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-success" />
                <h3 className="font-semibold">Audit Complete: {activeRun.name}</h3>
              </div>
              <div className="flex gap-4 text-sm">
                <span className="text-success">✅ Pass: {activeRun.items.filter((i: ChecklistItem) => i.status === 'pass').length}</span>
                <span className="text-destructive">❌ Fail: {activeRun.items.filter((i: ChecklistItem) => i.status === 'fail').length}</span>
                <span className="text-warning">⏳ Deferred: {activeRun.items.filter((i: ChecklistItem) => i.status === 'deferred').length}</span>
              </div>
              {activeRun.reportMarkdown && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">View Report</summary>
                  <pre className="mt-2 p-4 bg-muted rounded text-xs overflow-auto max-h-96 whitespace-pre-wrap">
                    {activeRun.reportMarkdown}
                  </pre>
                </details>
              )}
              <button className="btn btn-ghost text-sm" onClick={() => setWizardStep(0)}>
                ← Back to audit list
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Emergency Stop Registry panel ── */}
      {activePanel === 'registry' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 p-4 bg-destructive/10 rounded-lg text-sm text-destructive">
            <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>
              Emergency stop immediately disables the skill or workflow. In-flight runs are not cancelled.
              This action is audited. Admin role required.
            </p>
          </div>

          {overviewLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

          {l5Items.length === 0 && !overviewLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">No L5 items found.</p>
          )}

          {l5Items.length > 0 && (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">Name</th>
                    <th className="text-left p-3">Type</th>
                    <th className="text-left p-3">Stop Procedure</th>
                    <th className="text-left p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {l5Items.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="p-3 font-medium">{item.name}</td>
                      <td className="p-3 capitalize text-muted-foreground">{item.type}</td>
                      <td className="p-3 text-xs text-muted-foreground max-w-xs">
                        {item.emergencyStopProcedure ?? <span className="italic text-warning">No procedure documented</span>}
                      </td>
                      <td className="p-3">
                        <button
                          className="btn btn-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs"
                          onClick={() => setStopTarget(item)}
                        >
                          Emergency Stop
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SecurityOverviewTab({
  events,
  criticalCount,
  warningCount,
  verifying,
  verificationResult,
  onVerify,
  onAcknowledge,
  onAcknowledgeAll,
  onViewAuditLog,
}: {
  events: SecurityEvent[];
  criticalCount: number;
  warningCount: number;
  verifying: boolean;
  verificationResult: { valid: boolean; entriesChecked: number; error?: string } | null;
  onVerify: () => void;
  onAcknowledge: (id: string) => void;
  onAcknowledgeAll: () => void;
  onViewAuditLog: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <ShieldAlert className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Critical</p>
              <p className="text-2xl font-bold">{criticalCount}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/10">
              <AlertTriangle className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Warnings</p>
              <p className="text-2xl font-bold">{warningCount}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10">
              <ShieldCheck className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Audit Status</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={onVerify}
                  disabled={verifying}
                  className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
                >
                  {verifying ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  {verificationResult
                    ? verificationResult.valid
                      ? 'Verified'
                      : 'Failed'
                    : 'Verify'}
                </button>
                <button
                  onClick={onViewAuditLog}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" />
                  View Log
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Events</p>
              <p className="text-2xl font-bold">{events.length}</p>
            </div>
          </div>
        </div>
        <TlsCertStatusCard />
      </div>

      {verificationResult && (
        <div
          className={`card p-4 border-l-4 ${
            verificationResult.valid
              ? 'border-l-success bg-success/5'
              : 'border-l-destructive bg-destructive/5'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {verificationResult.valid ? (
                <CheckCircle className="w-5 h-5 text-success" />
              ) : (
                <XCircle className="w-5 h-5 text-destructive" />
              )}
              <span className="font-medium">
                {verificationResult.valid
                  ? `Audit chain verified (${verificationResult.entriesChecked} entries)`
                  : verificationResult.error || 'Verification failed'}
              </span>
            </div>
            <button
              onClick={onViewAuditLog}
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              <FileText className="w-4 h-4" />
              View Audit Log
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Recent Security Events</h3>
        <button
          onClick={onAcknowledgeAll}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Acknowledge all
        </button>
      </div>

      {events.length === 0 ? (
        <div className="card p-8 text-center">
          <ShieldCheck className="w-12 h-12 mx-auto text-success mb-3" />
          <p className="text-muted-foreground">No security events</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <div
              key={event.id}
              className={`card p-4 border-l-4 ${SEVERITY_COLORS[event.severity] || 'border-l-info'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  {SEVERITY_ICONS[event.severity] || <Info className="w-4 h-4" />}
                  <div>
                    <p className="font-medium text-sm">{event.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{event.type}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(event.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    onAcknowledge(event.id);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                  title="Acknowledge"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── TlsCertStatusCard ─────────────────────────────────────────────────
// Shows TLS certificate status: enabled/disabled, expiry, auto-gen badge.

function TlsCertStatusCard() {
  const queryClient = useQueryClient();
  const { data: tlsStatus, isLoading } = useQuery({
    queryKey: ['tls-status'],
    queryFn: fetchTlsStatus,
    refetchInterval: 60_000,
  });

  const generateMutation = useMutation({
    mutationFn: () => import('../api/client').then((m) => m.generateTlsCert()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tls-status'] });
    },
  });

  if (isLoading) {
    return (
      <div className="card p-4 flex items-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading TLS status…</span>
      </div>
    );
  }

  if (!tlsStatus) return null;

  const statusColor = !tlsStatus.enabled
    ? 'text-muted-foreground'
    : tlsStatus.expired
      ? 'text-destructive'
      : tlsStatus.expiryWarning
        ? 'text-warning'
        : 'text-success';

  const bgColor = !tlsStatus.enabled
    ? 'bg-muted/10'
    : tlsStatus.expired
      ? 'bg-destructive/10'
      : tlsStatus.expiryWarning
        ? 'bg-warning/10'
        : 'bg-success/10';

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-lg ${bgColor} shrink-0`}>
            {tlsStatus.enabled ? (
              <Lock className={`w-5 h-5 ${statusColor}`} />
            ) : (
              <LockOpen className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">TLS / HTTPS</p>
            <p className={`font-semibold ${statusColor}`}>
              {!tlsStatus.enabled
                ? 'Disabled'
                : tlsStatus.expired
                  ? 'Cert expired'
                  : tlsStatus.expiryWarning
                    ? `Expires in ${tlsStatus.daysUntilExpiry}d`
                    : tlsStatus.daysUntilExpiry !== null
                      ? `Valid · ${tlsStatus.daysUntilExpiry}d`
                      : 'Enabled'}
            </p>
            {tlsStatus.autoGenerated && (
              <span className="text-xs text-muted-foreground">(self-signed)</span>
            )}
          </div>
        </div>
        {tlsStatus.enabled && tlsStatus.autoGenerated && (
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            title="Regenerate self-signed cert"
            className="btn btn-ghost btn-xs shrink-0 flex items-center gap-1"
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCcw className="w-3 h-3" />
            )}
            Regen
          </button>
        )}
      </div>
    </div>
  );
}

const AUDIT_REVIEWED_KEY = 'friday_reviewed_audit';

function loadReviewedAudit(): Set<string> {
  try {
    const stored = localStorage.getItem(AUDIT_REVIEWED_KEY);
    return new Set(stored ? JSON.parse(stored) : []);
  } catch {
    return new Set();
  }
}

function saveReviewedAudit(ids: Set<string>): void {
  localStorage.setItem(AUDIT_REVIEWED_KEY, JSON.stringify(Array.from(ids)));
}

const LEVEL_ICONS = {
  info: { unreviewed: <Info className="w-4 h-4 text-info" />, border: 'border-l-info' },
  warn: {
    unreviewed: <AlertTriangle className="w-4 h-4 text-warning" />,
    border: 'border-l-warning',
  },
  error: {
    unreviewed: <XCircle className="w-4 h-4 text-destructive" />,
    border: 'border-l-destructive',
  },
  security: {
    unreviewed: <ShieldAlert className="w-4 h-4 text-destructive" />,
    border: 'border-l-destructive bg-destructive/5',
  },
} as const;

const AUDIT_FILTER_PRESETS_KEY = 'secureyeoman:audit-filter-presets';

interface AuditFilterPreset {
  name: string;
  level: string;
  event: string;
  from?: string;
  to?: string;
}

function loadPresets(): AuditFilterPreset[] {
  try {
    const raw = localStorage.getItem(AUDIT_FILTER_PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePresets(presets: AuditFilterPreset[]) {
  localStorage.setItem(AUDIT_FILTER_PRESETS_KEY, JSON.stringify(presets));
}

function AuditLogTab({
  reviewed,
  onMarkReviewed,
  onMarkAllReviewed,
}: {
  reviewed: Set<string>;
  onMarkReviewed: (ids: string[]) => void;
  onMarkAllReviewed: () => void;
}) {
  const [filters, setFilters] = useState({ level: '', event: '', offset: 0, from: '', to: '' });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [presets, setPresets] = useState<AuditFilterPreset[]>(loadPresets);
  const [presetName, setPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);
  const limit = 20;

  const fromTs = filters.from ? new Date(filters.from).getTime() : undefined;
  const toTs = filters.to ? new Date(filters.to + 'T23:59:59').getTime() : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['audit-entries', filters],
    queryFn: () =>
      fetchAuditEntries({
        level: filters.level || undefined,
        event: filters.event || undefined,
        from: fromTs,
        to: toTs,
        limit,
        offset: filters.offset,
      }),
    refetchInterval: 15000,
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const unreviewedCount = entries.filter((e: AuditEntry) => !reviewed.has(e.id)).length;

  const markPageReviewed = useCallback(() => {
    onMarkReviewed(entries.map((e: AuditEntry) => e.id));
  }, [entries, onMarkReviewed]);

  const handleToggleExpand = useCallback(
    (id: string) => {
      setExpandedId((prev) => (prev === id ? null : id));
      if (!reviewed.has(id)) {
        onMarkReviewed([id]);
      }
    },
    [reviewed, onMarkReviewed]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold">Audit Log</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {total > 0
              ? `${total} total entries${unreviewedCount > 0 ? ` \u00b7 ${unreviewedCount} unreviewed` : ''}`
              : 'View and verify audit chain entries'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreviewedCount > 0 && (
            <button
              onClick={markPageReviewed}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <Check className="w-3 h-3" />
              Mark page reviewed
            </button>
          )}
          <button
            onClick={onMarkAllReviewed}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <CheckCircle className="w-3 h-3" />
            Mark all reviewed
          </button>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-end gap-2">
        <select
          value={filters.level}
          onChange={(e) => {
            setFilters({ ...filters, level: e.target.value, offset: 0 });
          }}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Levels</option>
          <option value="info">Info</option>
          <option value="warn">Warning</option>
          <option value="error">Error</option>
          <option value="security">Security</option>
        </select>
        <select
          value={filters.event}
          onChange={(e) => {
            setFilters({ ...filters, event: e.target.value, offset: 0 });
          }}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Events</option>
          <option value="auth_success">Auth Success</option>
          <option value="auth_failure">Auth Failure</option>
          <option value="rate_limit">Rate Limit</option>
          <option value="injection_attempt">Injection Attempt</option>
          <option value="permission_denied">Permission Denied</option>
          <option value="anomaly">Anomaly</option>
          <option value="sandbox_violation">Sandbox Violation</option>
          <option value="config_change">Config Change</option>
          <option value="secret_access">Secret Access</option>
          <option value="task_start">Task Start</option>
          <option value="task_complete">Task Complete</option>
          <option value="task_fail">Task Fail</option>
          <option value="mcp_tool_call">MCP Tool Call</option>
          <option value="diagnostic_call">Diagnostic Call</option>
        </select>
        <div className="flex items-center gap-1">
          <label className="text-xs text-muted-foreground">From</label>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => {
              setFilters({ ...filters, from: e.target.value, offset: 0 });
            }}
            className="bg-card border border-border rounded-lg px-2 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-xs text-muted-foreground">To</label>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => {
              setFilters({ ...filters, to: e.target.value, offset: 0 });
            }}
            className="bg-card border border-border rounded-lg px-2 py-2 text-sm"
          />
        </div>
        {(filters.level || filters.event || filters.from || filters.to) && (
          <button
            onClick={() => {
              setFilters({ level: '', event: '', from: '', to: '', offset: 0 });
            }}
            className="text-xs text-primary hover:underline py-2"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Presets */}
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((preset, i) => (
          <div key={i} className="flex items-center gap-0.5">
            <button
              onClick={() => {
                setFilters({
                  level: preset.level,
                  event: preset.event,
                  from: preset.from ?? '',
                  to: preset.to ?? '',
                  offset: 0,
                });
              }}
              className="px-2.5 py-1 text-xs rounded-full border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors"
            >
              {preset.name}
            </button>
            <button
              onClick={() => {
                const updated = presets.filter((_, j) => j !== i);
                setPresets(updated);
                savePresets(updated);
              }}
              className="text-muted-foreground hover:text-destructive text-xs px-0.5"
              title="Remove preset"
            >
              ×
            </button>
          </div>
        ))}
        {!showSavePreset ? (
          <button
            onClick={() => {
              setShowSavePreset(true);
            }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            title="Save current filters as preset"
          >
            + Save preset
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={presetName}
              onChange={(e) => {
                setPresetName(e.target.value);
              }}
              placeholder="Preset name"
              className="bg-card border border-border rounded px-2 py-1 text-xs w-28"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && presetName.trim()) {
                  const newPreset: AuditFilterPreset = {
                    name: presetName.trim(),
                    level: filters.level,
                    event: filters.event,
                    from: filters.from || undefined,
                    to: filters.to || undefined,
                  };
                  const updated = [...presets, newPreset];
                  setPresets(updated);
                  savePresets(updated);
                  setPresetName('');
                  setShowSavePreset(false);
                }
                if (e.key === 'Escape') {
                  setShowSavePreset(false);
                  setPresetName('');
                }
              }}
            />
            <button
              onClick={() => {
                if (presetName.trim()) {
                  const newPreset: AuditFilterPreset = {
                    name: presetName.trim(),
                    level: filters.level,
                    event: filters.event,
                    from: filters.from || undefined,
                    to: filters.to || undefined,
                  };
                  const updated = [...presets, newPreset];
                  setPresets(updated);
                  savePresets(updated);
                  setPresetName('');
                  setShowSavePreset(false);
                }
              }}
              className="text-xs text-primary"
            >
              Save
            </button>
            <button
              onClick={() => {
                setShowSavePreset(false);
                setPresetName('');
              }}
              className="text-xs text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No audit entries found</p>
          {(filters.level || filters.event || filters.from || filters.to) && (
            <button
              onClick={() => {
                setFilters({ level: '', event: '', from: '', to: '', offset: 0 });
              }}
              className="text-sm text-primary hover:underline mt-2"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry: AuditEntry) => {
            const level = LEVEL_ICONS[entry.level as keyof typeof LEVEL_ICONS] ?? LEVEL_ICONS.info;
            const isExpanded = expandedId === entry.id;
            const isReviewed = reviewed.has(entry.id);
            const icon = isReviewed ? (
              <CheckCircle className="w-4 h-4 text-muted-foreground/50" />
            ) : (
              level.unreviewed
            );

            return (
              <div
                key={entry.id}
                className={`card border-l-4 ${level.border} cursor-pointer transition-all hover:bg-muted/30 ${!isReviewed ? ' bg-muted/10' : ''} ${isExpanded ? 'shadow-md' : ''}`}
                onClick={() => {
                  handleToggleExpand(entry.id);
                }}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {icon}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-sm truncate ${isReviewed ? 'text-muted-foreground' : 'font-medium'}`}
                          >
                            {entry.message || entry.event}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`badge text-xs font-medium ${entry.level === 'error' ? 'bg-red-500/20 text-red-400' : entry.level === 'warn' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'}`}
                          >
                            {entry.event}
                          </span>
                          <span
                            className={`badge text-xs ${entry.level === 'error' ? 'bg-red-500/20 text-red-400' : entry.level === 'warn' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-muted text-muted-foreground'}`}
                          >
                            {entry.level}
                          </span>
                          {entry.userId && (
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              👤 {entry.userId.slice(0, 12)}...
                            </span>
                          )}
                          {entry.taskId && (
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              📋 {entry.taskId.slice(0, 8)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <span
                            className="font-mono text-primary/60 bg-primary/5 px-1.5 py-0.5 rounded"
                            title="Chain sequence number"
                          >
                            #{entry.sequence}
                          </span>
                          <span className="text-muted-foreground/50">|</span>
                          <span className="tabular-nums">
                            {new Date(entry.timestamp).toLocaleString()}
                          </span>
                          {entry.signature && (
                            <span
                              className="ml-auto flex items-center gap-1 text-green-500/70"
                              title="Cryptographically signed"
                            >
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                                />
                              </svg>
                              verified
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                      {isExpanded ? (
                        <ChevronLeft className="w-4 h-4 rotate-[-90deg]" />
                      ) : (
                        <ChevronRight className="w-4 h-4 rotate-90" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border space-y-2 text-xs">
                      <div className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1">
                        <span className="text-muted-foreground">ID</span>
                        <span className="font-mono truncate">{entry.id}</span>
                        <span className="text-muted-foreground">Sequence</span>
                        <span>{entry.sequence}</span>
                        {entry.userId && (
                          <>
                            <span className="text-muted-foreground">User ID</span>
                            <span className="font-mono">{entry.userId}</span>
                          </>
                        )}
                        {entry.taskId && (
                          <>
                            <span className="text-muted-foreground">Task ID</span>
                            <span className="font-mono">{entry.taskId}</span>
                          </>
                        )}
                        {entry.signature && (
                          <>
                            <span className="text-muted-foreground">Signature</span>
                            <span className="font-mono truncate">{entry.signature}</span>
                          </>
                        )}
                        {entry.previousHash && (
                          <>
                            <span className="text-muted-foreground">Prev Hash</span>
                            <span className="font-mono truncate">{entry.previousHash}</span>
                          </>
                        )}
                      </div>
                      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                        <div>
                          <p className="text-muted-foreground mb-1">Metadata</p>
                          <pre className="bg-muted/50 rounded p-2 overflow-x-auto text-xs">
                            {JSON.stringify(entry.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {total > limit && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => {
              setFilters({ ...filters, offset: Math.max(0, filters.offset - limit) });
            }}
            disabled={filters.offset <= 0}
            className="btn btn-ghost"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-muted-foreground">
            {filters.offset + 1}-{Math.min(filters.offset + limit, total)} of {total}
          </span>
          <button
            onClick={() => {
              setFilters({ ...filters, offset: filters.offset + limit });
            }}
            disabled={filters.offset + limit >= total}
            className="btn btn-ghost"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

const ML_EVENT_TYPES = 'anomaly,injection_attempt,sandbox_violation,secret_access';
const ML_PAGE_SIZE = 20;

const RISK_COLORS: Record<MlSecuritySummary['riskLevel'], string> = {
  low: 'text-success bg-success/10 border-success/30',
  medium: 'text-warning bg-warning/10 border-warning/30',
  high: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
  critical: 'text-destructive bg-destructive/10 border-destructive/30',
};

function MLSecurityTab() {
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
              onClick={() => handlePeriodChange(p)}
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
              onClick={() => window.location.assign('/security?tab=nodes')}
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
              onChange={(e) => handleTypeFilter(e.target.value)}
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
                onClick={() => handleTypeFilter('')}
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
                onClick={() =>
                  setExpandedEvent(expandedEvent === event.id ? null : event.id)
                }
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
                        <span className="text-xs text-muted-foreground">
                          user: {event.userId}
                        </span>
                      )}
                      {event.ipAddress && (
                        <span className="text-xs text-muted-foreground">
                          ip: {event.ipAddress}
                        </span>
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
                onClick={() => setOffset(Math.max(0, offset - ML_PAGE_SIZE))}
                disabled={offset === 0}
                className="btn btn-ghost btn-sm flex items-center gap-1 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </button>
              <button
                onClick={() => setOffset(offset + ML_PAGE_SIZE)}
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

function ReportsTab() {
  const queryClient = useQueryClient();
  const [format, setFormat] = useState('json');
  const { data, isLoading } = useQuery({ queryKey: ['reports'], queryFn: fetchReports });
  const mutation = useMutation({
    mutationFn: generateReport,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });

  const handleDownload = async (report: ReportSummary) => {
    try {
      const blob = await downloadReport(report.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `report-${report.id}.${report.format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // download failed silently
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Audit Reports</h3>
          <p className="text-xs text-muted-foreground mt-1">Generate and download audit reports</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={format}
            onChange={(e) => {
              setFormat(e.target.value);
            }}
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="json">JSON</option>
            <option value="html">HTML</option>
            <option value="csv">CSV</option>
          </select>
          <button
            className="btn btn-ghost flex items-center gap-2"
            onClick={() => {
              mutation.mutate({
                title: `Audit Report - ${new Date().toLocaleDateString()}`,
                format,
              });
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {mutation.isPending ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>

      {mutation.isPending && (
        <div className="card p-4 flex items-center gap-3 border-primary/30 bg-primary/5">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <p className="text-sm text-primary">Generating report, please wait...</p>
        </div>
      )}

      {mutation.isError && (
        <div className="card p-4 flex items-center gap-3 border-destructive/30 bg-destructive/5">
          <XCircle className="w-5 h-5 text-destructive" />
          <p className="text-sm text-destructive">Failed to generate report. Please try again.</p>
        </div>
      )}

      {mutation.isSuccess && !mutation.isPending && (
        <div className="card p-4 flex items-center gap-3 border-green-500/30 bg-green-500/5">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <p className="text-sm text-green-600">Report generated successfully.</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : !data?.reports.length && !mutation.isPending ? (
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No reports generated yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data?.reports.map((report) => (
            <div key={report.id} className="card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium text-sm">{report.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {report.format.toUpperCase()} • {new Date(report.generatedAt).toLocaleString()}{' '}
                    • {report.entryCount} entries
                  </p>
                </div>
              </div>
              <button className="btn btn-ghost text-xs" onClick={() => handleDownload(report)}>
                <Download className="w-4 h-4 mr-1" />
                Download
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Node Details Tab ─────────────────────────────────────────────────

interface NodeDef {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const NODE_DEFS: NodeDef[] = [
  { id: 'agent', label: 'Agent Core', icon: <Shield className="w-4 h-4" /> },
  { id: 'tasks', label: 'Task Queue', icon: <Activity className="w-4 h-4" /> },
  { id: 'database', label: 'Postgres', icon: <Server className="w-4 h-4" /> },
  { id: 'audit', label: 'Audit Chain', icon: <Database className="w-4 h-4" /> },
  { id: 'resources', label: 'Memory', icon: <Cpu className="w-4 h-4" /> },
  { id: 'security', label: 'Security', icon: <Network className="w-4 h-4" /> },
  { id: 'mcp', label: 'MCP Servers', icon: <Link className="w-4 h-4" /> },
];

function getNodeStatus(
  nodeId: string,
  health?: HealthStatus,
  metrics?: MetricsSnapshot,
  mcpServers?: McpServerConfig[]
): 'ok' | 'warning' | 'error' {
  switch (nodeId) {
    case 'agent':
      return health?.status === 'ok' ? 'ok' : 'error';
    case 'tasks':
      return (metrics?.tasks?.queueDepth ?? 0) > 10 ? 'warning' : 'ok';
    case 'database':
      return health?.checks?.database ? 'ok' : 'error';
    case 'audit':
      return health?.checks?.auditChain ? 'ok' : 'error';
    case 'resources':
      return (metrics?.resources?.memoryPercent ?? 0) > 80 ? 'warning' : 'ok';
    case 'security':
      return (metrics?.security?.injectionAttemptsTotal ?? 0) > 0 ? 'warning' : 'ok';
    case 'mcp': {
      const total = mcpServers?.length ?? 0;
      const enabled = mcpServers?.filter((s) => s.enabled).length ?? 0;
      return total === 0 ? 'warning' : enabled > 0 ? 'ok' : 'error';
    }
    default:
      return 'ok';
  }
}

const NODE_STATUS_BADGE: Record<string, { className: string; label: string }> = {
  ok: { className: 'badge-success', label: 'OK' },
  warning: { className: 'badge-warning', label: 'Warning' },
  error: { className: 'badge-error', label: 'Error' },
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatNodeUptime(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${minutes}m`;
}

function NodePanel({
  def,
  health,
  metrics,
  auditStats,
  mcpServers,
  expanded,
  onToggle,
}: {
  def: NodeDef;
  health?: HealthStatus;
  metrics?: MetricsSnapshot;
  auditStats?: {
    totalEntries: number;
    oldestEntry?: number;
    lastVerification?: number;
    chainValid: boolean;
    dbSizeEstimateMb?: number;
  };
  mcpServers?: McpServerConfig[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = getNodeStatus(def.id, health, metrics, mcpServers);
  const badge = NODE_STATUS_BADGE[status];

  const renderDetails = () => {
    switch (def.id) {
      case 'agent':
        return (
          <>
            <DetailRow label="Status" value={health?.status ?? 'unknown'} />
            <DetailRow label="Version" value={health?.version ?? '-'} />
            <DetailRow
              label="Uptime"
              value={health?.uptime ? formatNodeUptime(health.uptime) : '-'}
            />
            <DetailRow label="Active Tasks" value={metrics?.tasks?.inProgress ?? 0} />
            <DetailRow label="Queue Depth" value={metrics?.tasks?.queueDepth ?? 0} />
            <DetailRow
              label="Success Rate"
              value={`${((metrics?.tasks?.successRate ?? 0) * 100).toFixed(1)}%`}
            />
          </>
        );
      case 'tasks':
        return (
          <>
            <DetailRow label="Queue Depth" value={metrics?.tasks?.queueDepth ?? 0} />
            <DetailRow label="In Progress" value={metrics?.tasks?.inProgress ?? 0} />
            <DetailRow label="Total Tasks" value={metrics?.tasks?.total ?? 0} />
            <DetailRow
              label="Success Rate"
              value={`${((metrics?.tasks?.successRate ?? 0) * 100).toFixed(1)}%`}
            />
            <DetailRow
              label="Failure Rate"
              value={`${((metrics?.tasks?.failureRate ?? 0) * 100).toFixed(1)}%`}
            />
            <DetailRow
              label="Avg Duration"
              value={formatDuration(metrics?.tasks?.avgDurationMs ?? 0)}
            />
            <DetailRow
              label="P95 Duration"
              value={formatDuration(metrics?.tasks?.p95DurationMs ?? 0)}
            />
            <DetailRow
              label="P99 Duration"
              value={formatDuration(metrics?.tasks?.p99DurationMs ?? 0)}
            />
          </>
        );
      case 'database':
        return (
          <>
            <DetailRow label="Connection" value={health?.checks?.database ? 'Connected' : 'Down'} />
            <DetailRow label="Audit Entries" value={auditStats?.totalEntries ?? 0} />
            <DetailRow label="Chain Valid" value={auditStats?.chainValid ? 'Yes' : 'No'} />
            <DetailRow
              label="Last Verification"
              value={
                auditStats?.lastVerification
                  ? new Date(auditStats.lastVerification).toLocaleString()
                  : 'Never'
              }
            />
            <DetailRow
              label="DB Size"
              value={
                auditStats?.dbSizeEstimateMb != null
                  ? auditStats.dbSizeEstimateMb >= 1024
                    ? `${(auditStats.dbSizeEstimateMb / 1024).toFixed(2)} GB`
                    : auditStats.dbSizeEstimateMb >= 1
                      ? `${auditStats.dbSizeEstimateMb.toFixed(1)} MB`
                      : `${(auditStats.dbSizeEstimateMb * 1024).toFixed(0)} KB`
                  : '-'
              }
            />
          </>
        );
      case 'audit':
        return (
          <>
            <DetailRow label="Chain Status" value={auditStats?.chainValid ? 'Valid' : 'Invalid'} />
            <DetailRow label="Total Entries" value={auditStats?.totalEntries ?? 0} />
            <DetailRow
              label="Oldest Entry"
              value={
                auditStats?.oldestEntry ? new Date(auditStats.oldestEntry).toLocaleString() : '-'
              }
            />
            <DetailRow
              label="Last Verification"
              value={
                auditStats?.lastVerification
                  ? new Date(auditStats.lastVerification).toLocaleString()
                  : 'Never'
              }
            />
            <DetailRow
              label="DB Size"
              value={
                auditStats?.dbSizeEstimateMb != null
                  ? auditStats.dbSizeEstimateMb >= 1024
                    ? `${(auditStats.dbSizeEstimateMb / 1024).toFixed(2)} GB`
                    : auditStats.dbSizeEstimateMb >= 1
                      ? `${auditStats.dbSizeEstimateMb.toFixed(1)} MB`
                      : `${(auditStats.dbSizeEstimateMb * 1024).toFixed(0)} KB`
                  : '-'
              }
            />
          </>
        );
      case 'resources': {
        const r = metrics?.resources;
        return (
          <>
            <DetailRow label="Memory Used" value={`${(r?.memoryUsedMb ?? 0).toFixed(1)} MB`} />
            <DetailRow label="Memory Limit" value={`${(r?.memoryLimitMb ?? 0).toFixed(0)} MB`} />
            <DetailRow label="Memory %" value={`${(r?.memoryPercent ?? 0).toFixed(1)}%`} />
            <DetailRow label="CPU %" value={`${(r?.cpuPercent ?? 0).toFixed(1)}%`} />
            <DetailRow label="Disk Used" value={`${(r?.diskUsedMb ?? 0).toFixed(1)} MB`} />
            <DetailRow label="Tokens Today" value={r?.tokensUsedToday ?? 0} />
            <DetailRow label="Cached Tokens" value={r?.tokensCachedToday ?? 0} />
            <DetailRow label="API Calls" value={r?.apiCallsTotal ?? 0} />
            <DetailRow label="API Errors" value={r?.apiErrorsTotal ?? 0} />
            <DetailRow label="API Latency" value={formatDuration(r?.apiLatencyAvgMs ?? 0)} />
            <DetailRow label="Cost Today" value={`$${(r?.costUsdToday ?? 0).toFixed(4)}`} />
            <DetailRow label="Cost Month" value={`$${(r?.costUsdMonth ?? 0).toFixed(4)}`} />
          </>
        );
      }
      case 'security': {
        const s = metrics?.security;
        return (
          <>
            <DetailRow label="Auth Attempts" value={s?.authAttemptsTotal ?? 0} />
            <DetailRow label="Auth Success" value={s?.authSuccessTotal ?? 0} />
            <DetailRow label="Auth Failures" value={s?.authFailuresTotal ?? 0} />
            <DetailRow label="Active Sessions" value={s?.activeSessions ?? 0} />
            <DetailRow label="Blocked Requests" value={s?.blockedRequestsTotal ?? 0} />
            <DetailRow label="Injection Attempts" value={s?.injectionAttemptsTotal ?? 0} />
            <DetailRow label="Rate Limit Hits" value={s?.rateLimitHitsTotal ?? 0} />
            {s?.eventsBySeverity && Object.keys(s.eventsBySeverity).length > 0 && (
              <DetailRow
                label="Events by Severity"
                value={Object.entries(s.eventsBySeverity)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(', ')}
              />
            )}
          </>
        );
      }
      case 'mcp': {
        const servers = mcpServers ?? [];
        const enabled = servers.filter((s) => s.enabled).length;
        return (
          <>
            <DetailRow label="Enabled / Total" value={`${enabled} / ${servers.length}`} />
            {servers.map((s) => (
              <DetailRow
                key={s.id}
                label={s.name}
                value={
                  <span className="flex items-center gap-2">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${s.enabled ? 'bg-green-500' : 'bg-muted-foreground'}`}
                    />
                    {s.transport}
                    {s.description ? ` — ${s.description}` : ''}
                  </span>
                }
              />
            ))}
          </>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="card">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span
            className={
              status === 'ok'
                ? 'text-green-500'
                : status === 'warning'
                  ? 'text-warning'
                  : 'text-destructive'
            }
          >
            {def.icon}
          </span>
          <span className="font-semibold text-sm">{def.label}</span>
          <span className={`badge ${badge.className} text-xs`}>{badge.label}</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? '' : '-rotate-90'}`}
        />
      </button>
      {expanded && (
        <div className="border-t border-border p-4">
          <div className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2">{renderDetails()}</div>
        </div>
      )}
    </div>
  );
}

function NodeDetailsTab() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nodeParam = params.get('node');

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    return nodeParam ? new Set([nodeParam]) : new Set<string>();
  });

  const toggleNode = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 5000,
  });

  const { data: metrics } = useQuery({
    queryKey: ['metrics'],
    queryFn: fetchMetrics,
    refetchInterval: 5000,
  });

  const { data: auditStats } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: fetchAuditStats,
    refetchInterval: 15000,
  });

  const { data: mcpData } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: fetchMcpServers,
    refetchInterval: 30000,
  });

  const mcpServers = mcpData?.servers;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold">System</h3>
        <p className="text-xs text-muted-foreground mt-1">Status for each system component</p>
      </div>
      <div className="space-y-3">
        {NODE_DEFS.map((def) => (
          <NodePanel
            key={def.id}
            def={def}
            health={health}
            metrics={metrics}
            auditStats={auditStats}
            mcpServers={mcpServers}
            expanded={expandedNodes.has(def.id)}
            onToggle={() => {
              toggleNode(def.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}
