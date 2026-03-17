import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  ShieldAlert,
  FileText,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  Download,
} from 'lucide-react';
import { fetchAuditEntries, exportAuditLog } from '../../api/client';
import type { AuditEntry } from '../../types';

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

export function AuditLogTab({
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
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const limit = 20;

  const handleExport = useCallback(
    async (format: 'jsonl' | 'csv' | 'syslog') => {
      setExportOpen(false);
      setExporting(true);
      try {
        const fromTs = filters.from ? new Date(filters.from).getTime() : undefined;
        const toTs = filters.to ? new Date(filters.to + 'T23:59:59').getTime() : undefined;
        const blob = await exportAuditLog({
          format,
          from: fromTs,
          to: toTs,
          level: filters.level ? [filters.level] : undefined,
          event: filters.event ? [filters.event] : undefined,
        });
        const ext = format === 'jsonl' ? 'jsonl' : format === 'syslog' ? 'log' : 'csv';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-export.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        // silently ignore — user can retry
      } finally {
        setExporting(false);
      }
    },
    [filters]
  );

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <div className="relative">
            <button
              onClick={() => {
                setExportOpen((v) => !v);
              }}
              disabled={exporting}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Download className="w-3 h-3" />
              )}
              Export
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[120px]">
                <button
                  onClick={() => void handleExport('jsonl')}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50"
                >
                  JSONL
                </button>
                <button
                  onClick={() => void handleExport('csv')}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50"
                >
                  CSV
                </button>
                <button
                  onClick={() => void handleExport('syslog')}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50"
                >
                  Syslog
                </button>
              </div>
            )}
          </div>
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
              // eslint-disable-next-line jsx-a11y/no-autofocus
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
