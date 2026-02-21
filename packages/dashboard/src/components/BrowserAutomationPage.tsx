import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Globe,
  Camera,
  MousePointer,
  FileText,
  Code,
  PenTool,
  Loader2,
  CheckCircle,
  XCircle,
  Play,
  ChevronDown,
  ChevronRight,
  Filter,
  X,
} from 'lucide-react';
import { fetchBrowserSessions, closeBrowserSession, fetchMcpConfig } from '../api/client';

type SessionStatus = 'active' | 'closed' | 'failed';

type ToolName =
  | 'browser_navigate'
  | 'browser_screenshot'
  | 'browser_click'
  | 'browser_fill'
  | 'browser_evaluate'
  | 'browser_pdf';

interface BrowserSession {
  id: string;
  status: SessionStatus;
  url?: string;
  title?: string;
  viewportW?: number;
  viewportH?: number;
  screenshot?: string;
  toolName: ToolName;
  durationMs?: number;
  error?: string;
  createdAt: string;
  closedAt?: string;
}

const TOOL_ICONS: Record<ToolName, React.ReactNode> = {
  browser_navigate: <Globe className="w-4 h-4" />,
  browser_screenshot: <Camera className="w-4 h-4" />,
  browser_click: <MousePointer className="w-4 h-4" />,
  browser_fill: <PenTool className="w-4 h-4" />,
  browser_evaluate: <Code className="w-4 h-4" />,
  browser_pdf: <FileText className="w-4 h-4" />,
};

const TOOL_LABELS: Record<ToolName, string> = {
  browser_navigate: 'Navigate',
  browser_screenshot: 'Screenshot',
  browser_click: 'Click',
  browser_fill: 'Fill',
  browser_evaluate: 'Evaluate',
  browser_pdf: 'PDF',
};

const STATUS_STYLES: Record<SessionStatus, { color: string; icon: React.ReactNode }> = {
  active: { color: 'text-blue-500', icon: <Play className="w-3.5 h-3.5" /> },
  closed: { color: 'text-green-500', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  failed: { color: 'text-destructive', icon: <XCircle className="w-3.5 h-3.5" /> },
};

const PAGE_SIZE = 20;

export function BrowserAutomationPage({ embedded }: { embedded?: boolean } = {}) {
  const [statusFilter, setStatusFilter] = useState<SessionStatus | ''>('');
  const [toolFilter, setToolFilter] = useState<ToolName | ''>('');
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: mcpConfig } = useQuery({
    queryKey: ['mcpConfig'],
    queryFn: fetchMcpConfig,
    staleTime: 30000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['browserSessions', statusFilter, toolFilter, page],
    queryFn: () =>
      fetchBrowserSessions({
        status: statusFilter || undefined,
        toolName: toolFilter || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    refetchInterval: 5000,
  });

  const closeMutation = useMutation({
    mutationFn: closeBrowserSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['browserSessions'] });
    },
  });

  const sessions = (data?.sessions ?? []) as unknown as BrowserSession[];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const enabled = mcpConfig?.exposeBrowser ?? false;

  // Stats from current page data
  const activeCount = sessions.filter((s) => s.status === 'active').length;
  const closedCount = sessions.filter((s) => s.status === 'closed').length;
  const failedCount = sessions.filter((s) => s.status === 'failed').length;

  if (!enabled) {
    return (
      <div className="space-y-4 sm:space-y-6 min-w-0 overflow-hidden">
        {!embedded && (
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Browser Automation</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Browser session viewer and lifecycle controls
            </p>
          </div>
        )}
        <div className="border border-yellow-500/30 bg-yellow-500/10 rounded-lg p-3 text-xs sm:text-sm text-yellow-600 dark:text-yellow-400">
          Browser automation is currently disabled. Set MCP_EXPOSE_BROWSER=true to enable browser
          tools.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0 overflow-hidden">
      {/* Header */}
      {!embedded && (
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Browser Automation</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Browser session viewer and lifecycle controls
          </p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <StatCard label="Total Sessions" value={total} />
        <StatCard label="Active" value={activeCount} color="text-blue-500" />
        <StatCard label="Completed" value={closedCount} color="text-green-500" />
        <StatCard label="Failed" value={failedCount} color="text-destructive" />
      </div>

      {/* Filters & Table */}
      <div className="card overflow-hidden">
        <div className="card-header flex flex-row items-center gap-2 p-3 sm:p-4">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <h2 className="card-title text-sm sm:text-base">Sessions</h2>
        </div>
        <div className="card-content space-y-3 p-3 sm:p-4 pt-0 sm:pt-0">
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as SessionStatus | '');
                setPage(0);
              }}
              className="bg-card border border-border rounded-lg text-sm py-1.5 px-2 w-full sm:w-40"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
              <option value="failed">Failed</option>
            </select>

            <select
              value={toolFilter}
              onChange={(e) => {
                setToolFilter(e.target.value as ToolName | '');
                setPage(0);
              }}
              className="bg-card border border-border rounded-lg text-sm py-1.5 px-2 w-full sm:w-48"
            >
              <option value="">All Tools</option>
              <option value="browser_navigate">Navigate</option>
              <option value="browser_screenshot">Screenshot</option>
              <option value="browser_click">Click</option>
              <option value="browser_fill">Fill</option>
              <option value="browser_evaluate">Evaluate</option>
              <option value="browser_pdf">PDF</option>
            </select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No browser sessions found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground text-xs sm:text-sm">
                    <th className="py-1.5 sm:py-2 pr-2 sm:pr-3 w-8"></th>
                    <th className="py-1.5 sm:py-2 pr-2 sm:pr-3">ID</th>
                    <th className="py-1.5 sm:py-2 pr-2 sm:pr-3">Tool</th>
                    <th className="py-1.5 sm:py-2 pr-2 sm:pr-3">URL</th>
                    <th className="py-1.5 sm:py-2 pr-2 sm:pr-3">Status</th>
                    <th className="py-1.5 sm:py-2 pr-2 sm:pr-3">Duration</th>
                    <th className="py-1.5 sm:py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => {
                    const expanded = expandedId === session.id;
                    const status = STATUS_STYLES[session.status] ?? STATUS_STYLES.closed;
                    return (
                      <React.Fragment key={session.id}>
                        <tr
                          className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={() => {
                            setExpandedId(expanded ? null : session.id);
                          }}
                        >
                          <td className="py-1.5 sm:py-2 pr-2 sm:pr-3">
                            {expanded ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                          </td>
                          <td className="py-1.5 sm:py-2 pr-2 sm:pr-3 font-mono text-xs">
                            {session.id.length > 8 ? `${session.id.slice(0, 8)}...` : session.id}
                          </td>
                          <td className="py-1.5 sm:py-2 pr-2 sm:pr-3 text-xs sm:text-sm">
                            <span className="flex items-center gap-1.5">
                              {TOOL_ICONS[session.toolName] ?? <Globe className="w-4 h-4" />}
                              {TOOL_LABELS[session.toolName] ?? session.toolName}
                            </span>
                          </td>
                          <td className="py-1.5 sm:py-2 pr-2 sm:pr-3 max-w-[200px] truncate text-xs sm:text-sm">
                            {session.url ?? '-'}
                          </td>
                          <td className="py-1.5 sm:py-2 pr-2 sm:pr-3 text-xs sm:text-sm">
                            <span className={`flex items-center gap-1 ${status.color}`}>
                              {status.icon}
                              {session.status}
                            </span>
                          </td>
                          <td className="py-1.5 sm:py-2 pr-2 sm:pr-3 text-xs sm:text-sm">
                            {session.durationMs != null ? `${session.durationMs}ms` : '-'}
                          </td>
                          <td className="py-1.5 sm:py-2 text-xs sm:text-sm">
                            {new Date(session.createdAt).toLocaleString()}
                          </td>
                        </tr>
                        {expanded && (
                          <tr key={`${session.id}-detail`} className="border-b bg-muted/20">
                            <td colSpan={7} className="py-3 px-4">
                              <div className="space-y-2 text-xs">
                                {session.title && (
                                  <div>
                                    <span className="font-medium">Title: </span>
                                    {session.title}
                                  </div>
                                )}
                                {(session.viewportW || session.viewportH) && (
                                  <div>
                                    <span className="font-medium">Viewport: </span>
                                    {session.viewportW}x{session.viewportH}
                                  </div>
                                )}
                                {session.error && (
                                  <div>
                                    <span className="font-medium text-destructive">Error: </span>
                                    {session.error}
                                  </div>
                                )}
                                {session.screenshot && (
                                  <div>
                                    <span className="font-medium">Screenshot: </span>
                                    <img
                                      src={`data:image/png;base64,${session.screenshot}`}
                                      alt="Session screenshot"
                                      className="mt-1 rounded border border-border max-w-md max-h-60 object-contain"
                                    />
                                  </div>
                                )}
                                {session.closedAt && (
                                  <div>
                                    <span className="font-medium">Closed at: </span>
                                    {new Date(session.closedAt).toLocaleString()}
                                  </div>
                                )}
                                {session.status === 'active' && (
                                  <button
                                    className="btn-ghost text-xs px-3 py-1 mt-2 flex items-center gap-1 text-destructive hover:bg-destructive/10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      closeMutation.mutate(session.id);
                                    }}
                                    disabled={closeMutation.isPending}
                                  >
                                    <X className="w-3 h-3" />
                                    Close Session
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                Page {page + 1} of {totalPages} ({total} total)
              </span>
              <div className="flex gap-1">
                <button
                  className="btn-ghost text-xs px-2 py-1"
                  disabled={page === 0}
                  onClick={() => {
                    setPage((p) => Math.max(0, p - 1));
                  }}
                >
                  Previous
                </button>
                <button
                  className="btn-ghost text-xs px-2 py-1"
                  disabled={page >= totalPages - 1}
                  onClick={() => {
                    setPage((p) => p + 1);
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="card p-3 sm:p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg sm:text-xl font-bold mt-0.5 ${color ?? ''}`}>{value}</p>
    </div>
  );
}
