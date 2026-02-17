import { useState, useCallback } from 'react';
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
  Clock,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Download,
  Calendar,
  Plus,
  X,
  Edit2,
  Trash2,
  FileText,
  Heart,
  Play,
  Pause,
  ChevronDown,
  Server,
  Activity,
  Database,
  Cpu,
  Network,
  Link,
} from 'lucide-react';
import {
  fetchSecurityEvents,
  fetchAuditEntries,
  verifyAuditChain,
  fetchTasks,
  createTask,
  deleteTask,
  updateTask,
  fetchHeartbeatTasks,
  fetchReports,
  generateReport,
  downloadReport,
  fetchHealth,
  fetchMetrics,
  fetchAuditStats,
  fetchMcpServers,
} from '../api/client';
import type { ReportSummary } from '../api/client';
import { ConfirmDialog } from './common/ConfirmDialog';
import type {
  MetricsSnapshot,
  HealthStatus,
  SecurityEvent,
  AuditEntry,
  Task,
  HeartbeatTask,
  McpServerConfig,
} from '../types';

type TabType = 'overview' | 'audit' | 'tasks' | 'reports' | 'nodes';

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

const STATUS_ICONS: Record<string, React.ReactNode> = {
  completed: <CheckCircle className="w-4 h-4 text-success" />,
  failed: <XCircle className="w-4 h-4 text-destructive" />,
  timeout: <AlertTriangle className="w-4 h-4 text-warning" />,
  running: <Loader2 className="w-4 h-4 text-info animate-spin" />,
  pending: <Clock className="w-4 h-4 text-muted-foreground" />,
  cancelled: <XCircle className="w-4 h-4 text-muted-foreground" />,
};

const STATUS_COLORS: Record<string, string> = {
  completed: 'badge-success',
  failed: 'badge-error',
  timeout: 'badge-warning',
  running: 'badge-info',
  pending: 'badge',
  cancelled: 'badge',
};

export function SecurityPage() {
  const location = useLocation();
  const getInitialTab = (): TabType => {
    const path = location.pathname;
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'audit') return 'audit';
    if (tabParam === 'tasks' || path.includes('/tasks')) return 'tasks';
    if (tabParam === 'reports' || path.includes('/reports')) return 'reports';
    if (tabParam === 'nodes') return 'nodes';
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
            Monitor security events, manage tasks, and generate reports
          </p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => {
            setActiveTab('overview');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          Overview
        </button>
        <button
          onClick={() => {
            setActiveTab('audit');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'audit'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileText className="w-4 h-4" />
          Audit Log
        </button>
        <button
          onClick={() => {
            setActiveTab('tasks');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'tasks'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Clock className="w-4 h-4" />
          Tasks
        </button>
        <button
          onClick={() => {
            setActiveTab('reports');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'reports'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileText className="w-4 h-4" />
          Reports
        </button>
        <button
          onClick={() => {
            setActiveTab('nodes');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'nodes'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Server className="w-4 h-4" />
          System
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

      {activeTab === 'tasks' && <TasksTab />}

      {activeTab === 'reports' && <ReportsTab />}

      {activeTab === 'nodes' && <NodeDetailsTab />}
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

function formatInterval(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function TasksTab() {
  const [searchParams, setSearchParams] = useState({ offset: '0', status: '', type: '' });
  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', searchParams],
    queryFn: () =>
      fetchTasks({
        offset: Number(searchParams.offset),
        limit: 10,
        status: searchParams.status || undefined,
        type: searchParams.type || undefined,
      }),
    refetchInterval: 10000,
  });

  const { data: heartbeatData, isLoading: heartbeatLoading } = useQuery({
    queryKey: ['heartbeat-tasks'],
    queryFn: fetchHeartbeatTasks,
    refetchInterval: 10000,
  });

  const heartbeatTasks = heartbeatData?.tasks ?? [];
  const [heartbeatOpen, setHeartbeatOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('heartbeat') === '1';
  });
  const activeCount = heartbeatTasks.filter((t) => t.enabled).length;

  return (
    <div className="space-y-6">
      {/* Heartbeat Tasks Section — collapsible */}
      <div className="card">
        <button
          onClick={() => {
            setHeartbeatOpen((prev) => !prev);
          }}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Heartbeat Tasks</h3>
            {heartbeatTasks.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {activeCount}/{heartbeatTasks.length} active
              </span>
            )}
          </div>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${heartbeatOpen ? '' : '-rotate-90'}`}
          />
        </button>

        {heartbeatOpen && (
          <div className="border-t border-border">
            {heartbeatLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : heartbeatTasks.length === 0 ? (
              <div className="p-6 text-center">
                <Heart className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No heartbeat tasks configured</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {heartbeatTasks.map((task) => (
                  <div
                    key={task.name}
                    className={`p-4 border-l-4 ${task.enabled ? 'border-l-success' : 'border-l-muted-foreground/30'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {task.enabled ? (
                          <Play className="w-4 h-4 text-success" />
                        ) : (
                          <Pause className="w-4 h-4 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium text-sm">{task.name}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="badge text-xs">{task.type}</span>
                            {task.intervalMs && (
                              <span className="text-xs text-muted-foreground">
                                every {formatInterval(task.intervalMs)}
                              </span>
                            )}
                            {task.lastRunAt ? (
                              <span className="text-xs text-muted-foreground">
                                last run {new Date(task.lastRunAt).toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">never run</span>
                            )}
                            {task.personalityName && (
                              <span className="text-xs text-muted-foreground">
                                {task.personalityName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className={`badge ${task.enabled ? 'badge-success' : 'badge'}`}>
                        {task.enabled ? 'enabled' : 'disabled'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Regular Tasks Section */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">Task History</h3>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={searchParams.status}
              onChange={(e) => {
                setSearchParams({ ...searchParams, status: e.target.value, offset: '0' });
              }}
              className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Status</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="running">Running</option>
              <option value="pending">Pending</option>
            </select>
            <select
              value={searchParams.type}
              onChange={(e) => {
                setSearchParams({ ...searchParams, type: e.target.value, offset: '0' });
              }}
              className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Types</option>
              <option value="execute">Execute</option>
              <option value="query">Query</option>
              <option value="file">File</option>
              <option value="network">Network</option>
              <option value="system">System</option>
            </select>
          </div>
        </div>

        {tasksLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !tasksData?.tasks.length ? (
          <div className="card p-12 text-center">
            <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No tasks found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasksData.tasks.map((task) => (
              <div key={task.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {STATUS_ICONS[task.status] || <Clock className="w-4 h-4" />}
                    <div>
                      <p className="font-medium text-sm">{task.name || task.id}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.type} • {new Date(task.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <span className={`badge ${STATUS_COLORS[task.status] || 'badge'}`}>
                    {task.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tasksData && tasksData.total > 10 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => {
                setSearchParams({
                  ...searchParams,
                  offset: String(Math.max(0, Number(searchParams.offset) - 10)),
                });
              }}
              disabled={Number(searchParams.offset) <= 0}
              className="btn btn-ghost"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-muted-foreground">
              {Number(searchParams.offset) + 1}-
              {Math.min(Number(searchParams.offset) + 10, tasksData.total)} of {tasksData.total}
            </span>
            <button
              onClick={() => {
                setSearchParams({
                  ...searchParams,
                  offset: String(Number(searchParams.offset) + 10),
                });
              }}
              disabled={Number(searchParams.offset) + 10 >= tasksData.total}
              className="btn btn-ghost"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
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
            onClick={() => setFilters({ level: '', event: '', from: '', to: '', offset: 0 })}
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
              onClick={() =>
                setFilters({
                  level: preset.level,
                  event: preset.event,
                  from: preset.from ?? '',
                  to: preset.to ?? '',
                  offset: 0,
                })
              }
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
            onClick={() => setShowSavePreset(true)}
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
              onChange={(e) => setPresetName(e.target.value)}
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
            className="btn btn-primary flex items-center gap-2"
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
        <p className="text-xs text-muted-foreground mt-1">
          Status for each system component
        </p>
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
