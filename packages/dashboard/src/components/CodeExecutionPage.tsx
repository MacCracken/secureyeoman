import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Terminal,
  Loader2,
  Play,
  Square,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import {
  executeCode,
  fetchExecutionSessions,
  terminateExecutionSession,
  fetchExecutionHistory,
  approveExecution,
  rejectExecution,
  fetchExecutionConfig,
} from '../api/client';

type TabId = 'execute' | 'sessions' | 'history';

const STATUS_ICONS: Record<string, React.ReactNode> = {
  active: <CheckCircle className="w-3.5 h-3.5 text-green-500" />,
  idle: <Clock className="w-3.5 h-3.5 text-yellow-500" />,
  terminated: <Square className="w-3.5 h-3.5 text-muted-foreground" />,
  error: <XCircle className="w-3.5 h-3.5 text-red-500" />,
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/10 text-green-500 border-green-500/20',
  idle: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  terminated: 'bg-muted text-muted-foreground border-border',
  error: 'bg-red-500/10 text-red-500 border-red-500/20',
};

export function CodeExecutionPage() {
  const [activeTab, setActiveTab] = useState<TabId>('execute');

  const { data: configData } = useQuery({
    queryKey: ['executionConfig'],
    queryFn: fetchExecutionConfig,
  });

  const enabled = (configData?.config as Record<string, unknown>)?.enabled === true;

  if (!enabled) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Code Execution</h1>
        <div className="card p-8 text-center">
          <Terminal className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">Code Execution Not Enabled</h2>
          <p className="text-muted-foreground text-sm">
            Enable sandboxed code execution in your configuration to use this feature.
          </p>
          <pre className="mt-4 text-xs bg-muted p-3 rounded text-left inline-block">
{`execution:
  enabled: true`}
          </pre>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'execute', label: 'Execute' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Code Execution</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'execute' && <ExecuteTab />}
      {activeTab === 'sessions' && <SessionsTab />}
      {activeTab === 'history' && <HistoryTab />}
    </div>
  );
}

// ── Execute Tab ──────────────────────────────────────────────────

function ExecuteTab() {
  const [code, setCode] = useState('');
  const [runtime, setRuntime] = useState('node');
  const [sessionId, setSessionId] = useState('');
  const [timeout, setTimeout] = useState(30000);
  const [result, setResult] = useState<{
    id: string;
    sessionId: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    duration: number;
    truncated: boolean;
  } | null>(null);

  const executeMut = useMutation({
    mutationFn: executeCode,
    onSuccess: (data) => {
      setResult(data);
    },
  });

  const handleExecute = () => {
    if (!code.trim()) return;
    setResult(null);
    executeMut.mutate({
      runtime,
      code,
      sessionId: sessionId || undefined,
      timeout,
    });
  };

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">Runtime</label>
            <select
              value={runtime}
              onChange={(e) => setRuntime(e.target.value)}
              className="input text-sm py-1.5 px-2 w-36"
            >
              <option value="node">Node.js</option>
              <option value="python">Python</option>
              <option value="shell">Shell</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Session ID (optional)</label>
            <input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="input text-sm py-1.5 px-2 w-48"
              placeholder="auto-generated"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Timeout (ms)</label>
            <input
              type="number"
              value={timeout}
              onChange={(e) => setTimeout(Number(e.target.value))}
              className="input text-sm py-1.5 px-2 w-28"
              min={1000}
              max={300000}
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Code</label>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="input w-full text-sm py-2 min-h-[200px] resize-y font-mono"
            placeholder={
              runtime === 'node'
                ? 'console.log("Hello, world!");'
                : runtime === 'python'
                  ? 'print("Hello, world!")'
                  : 'echo "Hello, world!"'
            }
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExecute}
            disabled={!code.trim() || executeMut.isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {executeMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Execute
          </button>
          {executeMut.isError && (
            <span className="text-xs text-destructive">
              {executeMut.error instanceof Error ? executeMut.error.message : 'Execution failed'}
            </span>
          )}
        </div>
      </div>

      {result && (
        <div className="card">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <h3 className="card-title text-sm">Output</h3>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className={`flex items-center gap-1 ${result.exitCode === 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {result.exitCode === 0 ? (
                    <CheckCircle className="w-3.5 h-3.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  Exit: {result.exitCode}
                </span>
                <span>{formatDuration(result.duration)}</span>
                <span>Session: {result.sessionId.slice(0, 8)}</span>
                {result.truncated && (
                  <span className="flex items-center gap-1 text-yellow-500">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Truncated
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="card-content space-y-2">
            {result.stdout && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">stdout</p>
                <pre className="text-xs bg-muted p-3 rounded whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
                  {result.stdout}
                </pre>
              </div>
            )}
            {result.stderr && (
              <div>
                <p className="text-xs font-medium text-destructive mb-1">stderr</p>
                <pre className="text-xs bg-destructive/10 p-3 rounded whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
                  {result.stderr}
                </pre>
              </div>
            )}
            {!result.stdout && !result.stderr && (
              <p className="text-xs text-muted-foreground italic">No output</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sessions Tab ─────────────────────────────────────────────────

function SessionsTab() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['executionSessions'],
    queryFn: fetchExecutionSessions,
    refetchInterval: 5000,
  });

  const terminateMut = useMutation({
    mutationFn: terminateExecutionSession,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['executionSessions'] });
    },
  });

  const sessions = data?.sessions ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-muted-foreground text-sm">No active sessions</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => (
        <div key={session.id} className="card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {STATUS_ICONS[session.status] ?? <Clock className="w-3.5 h-3.5 text-muted-foreground" />}
              <span className="text-sm font-medium font-mono">{session.id.slice(0, 12)}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_COLORS[session.status] ?? 'bg-muted text-muted-foreground border-border'}`}>
                {session.status}
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {session.runtime}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-muted-foreground text-right">
                <div>Created: {new Date(session.createdAt).toLocaleString()}</div>
                <div>Last active: {new Date(session.lastActivity).toLocaleString()}</div>
              </div>
              <button
                onClick={() => terminateMut.mutate(session.id)}
                className="btn-ghost p-1.5 rounded text-destructive hover:bg-destructive/10"
                title="Terminate session"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── History Tab ──────────────────────────────────────────────────

function HistoryTab() {
  const queryClient = useQueryClient();
  const [sessionFilter, setSessionFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['executionHistory', sessionFilter],
    queryFn: () =>
      fetchExecutionHistory({
        sessionId: sessionFilter || undefined,
        limit: 50,
      }),
    refetchInterval: 5000,
  });

  const approveMut = useMutation({
    mutationFn: approveExecution,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['executionHistory'] });
    },
  });

  const rejectMut = useMutation({
    mutationFn: rejectExecution,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['executionHistory'] });
    },
  });

  const executions = data?.executions ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={sessionFilter}
          onChange={(e) => setSessionFilter(e.target.value)}
          className="input text-sm py-1.5 px-2 w-60"
          placeholder="Filter by session ID..."
        />
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && executions.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-muted-foreground text-sm">No execution history</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Session</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Exit Code</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Duration</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Time</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {executions.map((exec) => (
              <tr
                key={exec.id}
                className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                onClick={() => setExpandedId(expandedId === exec.id ? null : exec.id)}
              >
                <td className="px-3 py-2">
                  {exec.exitCode === 0 ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{exec.sessionId.slice(0, 8)}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${
                    exec.exitCode === 0
                      ? 'bg-green-500/10 text-green-500 border-green-500/20'
                      : 'bg-red-500/10 text-red-500 border-red-500/20'
                  }`}>
                    {exec.exitCode}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{formatDuration(exec.duration)}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(exec.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => approveMut.mutate(exec.id)}
                      className="btn-ghost p-1 rounded text-green-500 hover:bg-green-500/10"
                      title="Approve"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => rejectMut.mutate(exec.id)}
                      className="btn-ghost p-1 rounded text-red-500 hover:bg-red-500/10"
                      title="Reject"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {expandedId && (() => {
        const exec = executions.find((e) => e.id === expandedId);
        if (!exec) return null;
        return (
          <div className="card p-4 space-y-2">
            <h4 className="text-sm font-medium">Execution Detail: {exec.id.slice(0, 12)}</h4>
            {exec.stdout && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">stdout</p>
                <pre className="text-xs bg-muted p-2 rounded whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                  {exec.stdout}
                </pre>
              </div>
            )}
            {exec.stderr && (
              <div>
                <p className="text-xs font-medium text-destructive mb-1">stderr</p>
                <pre className="text-xs bg-destructive/10 p-2 rounded whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                  {exec.stderr}
                </pre>
              </div>
            )}
            {!exec.stdout && !exec.stderr && (
              <p className="text-xs text-muted-foreground italic">No output recorded</p>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
