import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import {
  Send,
  Loader2,
  Bot,
  User,
  ChevronDown,
  ArrowDownToLine,
  Terminal,
  Play,
  Trash2,
  ChevronRight,
  File,
  Folder,
  Mic,
  Square,
  Clock,
  CheckCircle,
  XCircle,
  Sparkles,
  Settings,
  Plus,
  X,
  Split,
  Wrench,
  Star,
  Eye,
  Brain,
  Cpu,
  Globe,
} from 'lucide-react';
import {
  fetchPersonalities,
  executeTerminalCommand,
  fetchExecutionSessions,
  terminateExecutionSession,
  fetchExecutionHistory,
  approveExecution,
  rejectExecution,
  fetchExecutionConfig,
  fetchSecurityPolicy,
  addMemory,
  fetchModelInfo,
  switchModel,
} from '../api/client';
import { useChatStream } from '../hooks/useChat';
import { ThinkingBlock } from './ThinkingBlock';
import { useVoice } from '../hooks/useVoice';
import { usePushToTalk } from '../hooks/usePushToTalk';
import { useTheme } from '../hooks/useTheme';
import { VoiceOverlay } from './VoiceOverlay';
import type { Personality, ChatMessage, CreationEvent } from '../types';
import { sanitizeText } from '../utils/sanitize';
import { ChatMarkdown } from './ChatMarkdown';
import { Link, useNavigate } from 'react-router-dom';
import { ModelWidget } from './ModelWidget';
import { AgentWorldWidget } from './AgentWorldWidget';
import { AdvancedEditorPage } from './AdvancedEditor/AdvancedEditorPage';

type MonacoEditor = Parameters<OnMount>[0];

// ── Multi-Terminal types / helpers ───────────────────────────────

interface TerminalTab {
  id: string;
  label: string;
  output: string[];
  input: string;
  running: boolean;
}

function genTerminalId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function makeTerminalTab(n: number): TerminalTab {
  return { id: genTerminalId(), label: `Terminal ${n}`, output: [], input: '', running: false };
}

const MAX_TERMINAL_TABS = 4;

interface MultiTerminalProps {
  outputRef: React.MutableRefObject<string>;
  onCommandComplete?: (command: string, output: string) => void;
}

function MultiTerminal({ outputRef, onCommandComplete }: MultiTerminalProps) {
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [makeTerminalTab(1)]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addTab = () => {
    if (tabs.length >= MAX_TERMINAL_TABS) return;
    const t = makeTerminalTab(tabs.length + 1);
    setTabs((prev) => [...prev, t]);
    setActiveId(t.id);
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        const t = makeTerminalTab(1);
        setActiveId(t.id);
        return [t];
      }
      if (activeId === id) setActiveId(next[next.length - 1].id);
      return next;
    });
  };

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];

  // Keep outputRef in sync with active tab's output
  useEffect(() => {
    outputRef.current = activeTab.output.join('\n');
  }, [activeTab.output, outputRef]);

  const runMutation = useMutation({
    mutationFn: ({ command, cwd }: { command: string; cwd: string }) =>
      executeTerminalCommand(command, cwd),
    onMutate: ({ command }) => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeId ? { ...t, output: [...t.output, `$ ${command}`], running: true } : t
        )
      );
    },
    onSuccess: (data, { command }) => {
      const output = data.output || data.error || '(no output)';
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeId ? { ...t, output: [...t.output, output], input: '', running: false } : t
        )
      );
      onCommandComplete?.(command, output);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    },
    onError: (err) => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeId
            ? {
                ...t,
                output: [...t.output, `Error: ${err instanceof Error ? err.message : String(err)}`],
                running: false,
              }
            : t
        )
      );
    },
  });

  const submit = useCallback(() => {
    const cmd = activeTab.input.trim();
    if (!cmd || activeTab.running) return;
    runMutation.mutate({ command: cmd, cwd: '/tmp' });
  }, [activeTab, runMutation]);

  const setInput = (val: string) => {
    setTabs((prev) => prev.map((t) => (t.id === activeId ? { ...t, input: val } : t)));
  };

  return (
    <div
      className="flex flex-col h-full overflow-hidden bg-background"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Tab bar */}
      <div className="flex items-center border-b border-border bg-muted/30 px-2 gap-1 overflow-x-auto flex-shrink-0">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-t text-xs cursor-pointer select-none flex-shrink-0 ${
              t.id === activeId
                ? 'bg-background text-foreground border border-b-background border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setActiveId(t.id);
            }}
          >
            <Terminal className="w-3 h-3" />
            {t.label}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.id);
              }}
              className="ml-0.5 rounded hover:bg-muted p-0.5"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
        {tabs.length < MAX_TERMINAL_TABS && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              addTab();
            }}
            className="px-1.5 py-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted/50 transition-colors flex-shrink-0"
            title="New terminal"
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Output */}
      <div className="flex-1 overflow-y-auto font-mono text-xs p-3 space-y-0.5 bg-black/30">
        {activeTab.output.length === 0 && <span className="text-muted-foreground">Ready.</span>}
        {activeTab.output.map((line, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap break-all ${
              line.startsWith('$')
                ? 'text-muted-foreground'
                : line.startsWith('Error:')
                  ? 'text-red-400/90'
                  : 'text-green-400/90'
            }`}
          >
            {line}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-border px-3 py-2 bg-muted/20 flex-shrink-0">
        <span className="font-mono text-xs text-primary/70 flex-shrink-0">$</span>
        <input
          ref={inputRef}
          className="flex-1 bg-transparent font-mono text-xs outline-none text-foreground placeholder:text-muted-foreground/40 caret-primary"
          placeholder="command..."
          value={activeTab.input}
          onChange={(e) => {
            setInput(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={activeTab.running}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          onClick={submit}
          disabled={activeTab.running || !activeTab.input.trim()}
          className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors flex-shrink-0"
        >
          {activeTab.running ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

type BottomTab = 'terminal' | 'sessions' | 'history';

interface EditorTab {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  isDirty: boolean;
}

const LANG_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  sh: 'shell',
  bash: 'shell',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
  html: 'html',
  css: 'css',
  sql: 'sql',
  xml: 'xml',
  toml: 'toml',
};

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return LANG_MAP[ext] ?? 'plaintext';
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function createEditorTab(name: string, cwd: string, content = ''): EditorTab {
  return {
    id: generateId(),
    name,
    path: `${cwd}/${name}`,
    content,
    language: detectLanguage(name),
    isDirty: false,
  };
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

// ── Status maps (from CodeExecutionPage) ─────────────────────────

const SESSION_STATUS_ICONS: Record<string, React.ReactNode> = {
  active: <CheckCircle className="w-3.5 h-3.5 text-green-500" />,
  idle: <Clock className="w-3.5 h-3.5 text-yellow-500" />,
  terminated: <Square className="w-3.5 h-3.5 text-muted-foreground" />,
  error: <XCircle className="w-3.5 h-3.5 text-red-500" />,
};

const SESSION_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/10 text-green-500 border-green-500/20',
  idle: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  terminated: 'bg-muted text-muted-foreground border-border',
  error: 'bg-red-500/10 text-red-500 border-red-500/20',
};

// ── Bottom Tab: Sessions ─────────────────────────────────────────

function SessionsPanel() {
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
      <div className="flex justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="py-4 text-center">
        <p className="text-muted-foreground text-xs">No active sessions</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 p-2 overflow-y-auto">
      {sessions.map((session) => (
        <div
          key={session.id}
          className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-muted/30 text-xs"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {SESSION_STATUS_ICONS[session.status] ?? (
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            <span className="font-mono">{session.id.slice(0, 12)}</span>
            <span
              className={`px-1.5 py-0.5 rounded border ${SESSION_STATUS_COLORS[session.status] ?? 'bg-muted text-muted-foreground border-border'}`}
            >
              {session.status}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              {session.runtime}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground hidden sm:inline">
              {new Date(session.lastActivity).toLocaleTimeString()}
            </span>
            <button
              onClick={() => {
                terminateMut.mutate(session.id);
              }}
              className="btn-ghost p-1 rounded text-destructive hover:bg-destructive/10"
              title="Terminate session"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Bottom Tab: History ──────────────────────────────────────────

function HistoryPanel() {
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
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b">
        <input
          value={sessionFilter}
          onChange={(e) => {
            setSessionFilter(e.target.value);
          }}
          className="bg-card border border-border rounded text-xs py-1 px-2 w-48"
          placeholder="Filter by session ID..."
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && executions.length === 0 && (
          <div className="py-4 text-center">
            <p className="text-muted-foreground text-xs">No execution history</p>
          </div>
        )}

        {executions.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-2 py-1.5 font-medium text-muted-foreground">Status</th>
                <th className="px-2 py-1.5 font-medium text-muted-foreground">Session</th>
                <th className="px-2 py-1.5 font-medium text-muted-foreground">Exit</th>
                <th className="px-2 py-1.5 font-medium text-muted-foreground">Duration</th>
                <th className="px-2 py-1.5 font-medium text-muted-foreground">Time</th>
                <th className="px-2 py-1.5 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {executions.map((exec) => (
                <tr
                  key={exec.id}
                  className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                  onClick={() => {
                    setExpandedId(expandedId === exec.id ? null : exec.id);
                  }}
                >
                  <td className="px-2 py-1.5">
                    {exec.exitCode === 0 ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-500" />
                    )}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{exec.sessionId.slice(0, 8)}</td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`px-1 py-0.5 rounded border ${
                        exec.exitCode === 0
                          ? 'bg-green-500/10 text-green-500 border-green-500/20'
                          : 'bg-red-500/10 text-red-500 border-red-500/20'
                      }`}
                    >
                      {exec.exitCode}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {formatDuration(exec.duration)}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {new Date(exec.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="px-2 py-1.5">
                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <button
                        onClick={() => {
                          approveMut.mutate(exec.id);
                        }}
                        className="btn-ghost p-0.5 rounded text-green-500 hover:bg-green-500/10"
                        title="Approve"
                      >
                        <CheckCircle className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => {
                          rejectMut.mutate(exec.id);
                        }}
                        className="btn-ghost p-0.5 rounded text-red-500 hover:bg-red-500/10"
                        title="Reject"
                      >
                        <XCircle className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {expandedId &&
          (() => {
            const exec = executions.find((e) => e.id === expandedId);
            if (!exec) return null;
            return (
              <div className="mx-2 my-1 p-2 rounded bg-muted/30 space-y-1">
                <h4 className="text-xs font-medium">Detail: {exec.id.slice(0, 12)}</h4>
                {exec.stdout && (
                  <pre className="text-[10px] bg-muted p-1.5 rounded whitespace-pre-wrap max-h-24 overflow-y-auto font-mono">
                    {exec.stdout}
                  </pre>
                )}
                {exec.stderr && (
                  <pre className="text-[10px] bg-destructive/10 p-1.5 rounded whitespace-pre-wrap max-h-24 overflow-y-auto font-mono">
                    {exec.stderr}
                  </pre>
                )}
                {!exec.stdout && !exec.stderr && (
                  <p className="text-[10px] text-muted-foreground italic">No output recorded</p>
                )}
              </div>
            );
          })()}
      </div>
    </div>
  );
}

// ── Execution gate wrapper ───────────────────────────────────────

function ExecutionGated({ children }: { children: React.ReactNode }) {
  const { data: configData } = useQuery({
    queryKey: ['executionConfig'],
    queryFn: fetchExecutionConfig,
  });

  const { data: securityPolicy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
    staleTime: 30000,
  });

  const enabled = configData?.config?.enabled === true || securityPolicy?.allowExecution === true;

  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-4">
        <Terminal className="w-8 h-8 text-muted-foreground mb-2" />
        <p className="text-xs font-medium">Code Execution Not Enabled</p>
        <p className="text-[10px] text-muted-foreground mt-1">
          Enable sandboxed execution in Security settings.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

// ── Main Component ───────────────────────────────────────────────

export function EditorPage() {
  const { data: policy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
    staleTime: 30000,
  });
  if (policy?.allowAdvancedEditor) return <AdvancedEditorPage />;
  return <StandardEditorPage />;
}

function StandardEditorPage() {
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tabs, setTabs] = useState<EditorTab[]>(() => [createEditorTab('untitled.ts', '/tmp')]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);
  const [filesPanelOpen, setFilesPanelOpen] = useState(false);
  const [cwd, setCwd] = useState('/tmp');
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [selectedPersonalityId, setSelectedPersonalityIdRaw] = useState<string | null>(() =>
    localStorage.getItem('soul:editorPersonalityId')
  );
  const setSelectedPersonalityId = (id: string | null) => {
    if (id) localStorage.setItem('soul:editorPersonalityId', id);
    else localStorage.removeItem('soul:editorPersonalityId');
    setSelectedPersonalityIdRaw(id);
  };
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>('terminal');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const [editorSettings, setEditorSettings] = useState({
    fontSize: 14,
    tabSize: 2,
    minimap: false,
    wordWrap: true,
    lineNumbers: true,
  });
  const editorRef = useRef<MonacoEditor | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Terminal output ref (feeds watch mode in chat) ──
  const terminalOutputRef = useRef<string>('');

  // ── Memory ──
  const [memoryEnabled, setMemoryEnabled] = useState(
    () => localStorage.getItem('editor:memoryEnabled') !== 'false'
  );

  // ── Model ──
  const [modelOpen, setModelOpen] = useState(false);
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const { data: modelInfo } = useQuery({
    queryKey: ['model-info'],
    queryFn: fetchModelInfo,
    staleTime: 30000,
  });

  // ── Chat visibility ──
  const [showChat, setShowChat] = useState(
    () => localStorage.getItem('editor:showChat') !== 'false'
  );

  // ── Agent World ──
  const [showWorld, setShowWorld] = useState(
    () => localStorage.getItem('editor:showWorld') === 'true'
  );
  const [worldViewMode, setWorldViewMode] = useState<'grid' | 'map' | 'large'>(
    () => (localStorage.getItem('world:viewMode') ?? 'grid') as 'grid' | 'map' | 'large'
  );

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const filename = activeTab?.name ?? 'untitled.ts';
  const language = activeTab?.language ?? 'typescript';
  const editorContent = activeTab?.content ?? '';

  const updateTabContent = useCallback(
    (content: string) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, content, isDirty: true } : t))
      );
    },
    [activeTabId]
  );

  const updateTabName = useCallback(
    (name: string) => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId
            ? { ...t, name, path: `${cwd}/${name}`, language: detectLanguage(name), isDirty: true }
            : t
        )
      );
    },
    [activeTabId, cwd]
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const newTabs = prev.filter((t) => t.id !== tabId);
        if (newTabs.length === 0) {
          return [createEditorTab('untitled.ts', cwd)];
        }
        return newTabs;
      });
      if (activeTabId === tabId) {
        setActiveTabId(tabs[0]?.id ?? tabs[0].id);
      }
    },
    [activeTabId, tabs, cwd]
  );

  const createNewTab = useCallback(() => {
    const newTab = createEditorTab('untitled.ts', cwd);
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, [cwd]);

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });

  const personalities = personalitiesData?.personalities ?? [];
  const defaultPersonality =
    personalities.find((p) => p.isDefault) ??
    [...personalities].sort((a, b) => a.name.localeCompare(b.name))[0];
  const effectivePersonalityId = selectedPersonalityId ?? defaultPersonality?.id ?? null;
  const currentPersonality = personalities.find((p) => p.id === effectivePersonalityId);

  const hasVision = currentPersonality?.body?.capabilities?.includes('vision') ?? false;
  const [watchEnabled, setWatchEnabled] = useState(false);

  // saveMemory — called by MultiTerminal after each command completes
  const saveMemory = useCallback(
    (command: string, output: string) => {
      if (!memoryEnabled) return;
      void addMemory({
        type: 'episodic',
        content: `Command: ${command}\nOutput: ${output}`,
        source: 'workspace',
        context: effectivePersonalityId ? { personalityId: effectivePersonalityId } : {},
        importance: 0.5,
      }).then(() => {
        void queryClient.invalidateQueries({ queryKey: ['workspace-memories'] });
      });
    },
    [memoryEnabled, effectivePersonalityId, queryClient]
  );

  // Auto-switch model when personality changes
  useEffect(() => {
    if (currentPersonality?.defaultModel) {
      void switchModel({
        provider: currentPersonality.defaultModel.provider,
        model: currentPersonality.defaultModel.model,
      }).then(() => {
        void queryClient.invalidateQueries({ queryKey: ['model-info'] });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePersonalityId, queryClient]);

  const { messages, sendMessage, isPending, streamingThinking, streamingContent, activeToolCalls } =
    useChatStream({
      personalityId: effectivePersonalityId,
      editorContent: watchEnabled ? terminalOutputRef.current || undefined : undefined,
    });

  // Local chat input state (decoupled from useChatStream)
  const [chatInput, setChatInput] = useState('');
  const handleSend = useCallback(() => {
    const trimmed = chatInput.trim();
    if (!trimmed || isPending) return;
    sendMessage(trimmed);
    setChatInput('');
  }, [chatInput, isPending, sendMessage]);

  const [hadActiveTools, setHadActiveTools] = useState(false);
  useEffect(() => {
    if (activeToolCalls.length > 0) setHadActiveTools(true);
  }, [activeToolCalls.length]);
  useEffect(() => {
    if (!isPending) setHadActiveTools(false);
  }, [isPending]);

  const voice = useVoice();

  const ptt = usePushToTalk(
    { hotkey: 'ctrl+shift+v', maxDurationMs: 60000, silenceTimeoutMs: 2000 },
    (transcript) => {
      if (transcript) {
        setChatInput((prev) => prev + transcript);
      }
    }
  );

  useEffect(() => {
    loader.config({ paths: { vs: '/vs' } });
  }, []);

  // Minimal mutation used by the Run Code button (output rendered in MultiTerminal by user)
  const runCodeMutation = useMutation({
    mutationFn: ({ command, cwd }: { command: string; cwd: string }) =>
      executeTerminalCommand(command, cwd),
    onSuccess: (result) => {
      if (result.cwd) setCwd(result.cwd);
    },
  });

  // Feed voice transcript into chat input
  useEffect(() => {
    if (voice.transcript) {
      setChatInput((prev) => prev + voice.transcript);
      voice.clearTranscript();
    }
  }, [voice.transcript, voice.clearTranscript]);

  // Speak assistant messages when voice is enabled
  const lastMsgCount = useRef(0);
  useEffect(() => {
    if (messages.length > lastMsgCount.current) {
      const latest = messages[messages.length - 1];
      if (latest.role === 'assistant' && voice.voiceEnabled) {
        voice.speak(latest.content);
      }
    }
    lastMsgCount.current = messages.length;
  }, [messages.length, voice.voiceEnabled, voice.speak, messages]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isPending]);

  // Update tab language when filename changes
  useEffect(() => {
    if (activeTab && activeTab.name !== filename) {
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, language: detectLanguage(t.name) } : t))
      );
    }
  }, [activeTabId]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({ theme: isDark ? 'vs-dark' : 'vs' });
    }
  }, [isDark]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.updateOptions({ theme: isDark ? 'vs-dark' : 'vs' });
  };

  const handleSendToChat = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const selection = editor.getSelection();
    let text = '';
    if (selection && !selection.isEmpty()) {
      text = editor.getModel()?.getValueInRange(selection) ?? '';
    } else {
      text = editor.getValue();
    }

    if (!text.trim()) return;
    setChatInput(`\`\`\`${language}\n${text}\n\`\`\``);
  }, [language]);

  const RUN_COMMANDS: Record<string, string> = {
    python: 'python3',
    python3: 'python3',
    py: 'python3',
    javascript: 'node',
    js: 'node',
    typescript: 'npx ts-node',
    ts: 'npx ts-node',
    bash: 'bash',
    sh: 'bash',
    shell: 'bash',
    ruby: 'ruby',
    go: 'go run',
    rust: '', // cargo run needs project structure
  };

  const handleRunCode = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const selection = editor.getSelection();
    let code = '';
    if (selection && !selection.isEmpty()) {
      code = editor.getModel()?.getValueInRange(selection) ?? '';
    } else {
      code = editor.getValue();
    }

    if (!code.trim()) return;

    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const runner = RUN_COMMANDS[ext] || RUN_COMMANDS[language] || 'node';

    const filePath = `${cwd}/${filename}`;

    if (!runner) return;

    const writeCommand = `cat << 'FRIDAY_EOF' > "${filePath}"\n${code}\nFRIDAY_EOF`;
    const runCommand = runner.includes(' ') ? `${runner} ${filePath}` : `${runner} "${filePath}"`;

    runCodeMutation.mutate({ command: `${writeCommand} && ${runCommand}`, cwd });
  }, [filename, language, cwd, runCodeMutation]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'Enter':
            e.preventDefault();
            handleRunCode();
            break;
          case 's':
            e.preventDefault();
            setTabs((prev) =>
              prev.map((t) => (t.id === activeTabId ? { ...t, isDirty: false } : t))
            );
            break;
          case 'n':
            if (e.shiftKey) {
              e.preventDefault();
              createNewTab();
            }
            break;
        }
      }
      if (e.key === 'Escape') {
        setSettingsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeTabId, handleRunCode, createNewTab]);

  const handleInsertAtCursor = useCallback((msg: ChatMessage) => {
    const editor = editorRef.current;
    if (!editor) return;

    const codeBlockMatch = /```[\w]*\n([\s\S]*?)```/.exec(msg.content);
    const textToInsert = codeBlockMatch ? codeBlockMatch[1] : msg.content;

    const position = editor.getPosition();
    if (position) {
      editor.executeEdits('insert-from-chat', [
        {
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
          text: textToInsert,
        },
      ]);
      editor.focus();
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const BOTTOM_TABS: { id: BottomTab; label: string }[] = [
    { id: 'terminal', label: 'Terminal' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] sm:h-[calc(100vh-140px)]">
      {/* Page header */}
      <div className="pb-3 border-b mb-3">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Editor</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Write, run, and debug code with AI-assisted execution and sandboxed sessions
        </p>
      </div>

      {/* Three-panel responsive layout: Editor | Chat side by side, Bottom panel */}
      <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto">
        {/* Top row — Code Editor & Chat side by side */}
        <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 lg:min-h-0">
          {/* Left panel — Code Editor */}
          <div
            className={`flex flex-col flex-1 ${showChat ? 'lg:flex-[60]' : ''} min-h-[250px] lg:min-h-0 border rounded-lg overflow-hidden bg-card`}
          >
            {/* Editor toolbar with tabs */}
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 flex-wrap">
              <button
                onClick={() => {
                  setFilesPanelOpen(!filesPanelOpen);
                }}
                className="btn-ghost p-1 rounded"
                title="Toggle files panel"
              >
                <ChevronRight
                  className={`w-4 h-4 transition-transform ${filesPanelOpen ? 'rotate-90' : ''}`}
                />
              </button>

              {/* Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto max-w-[200px] sm:max-w-[300px]">
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono whitespace-nowrap ${
                      tab.id === activeTabId
                        ? 'bg-primary/10 text-primary border border-primary/30'
                        : 'hover:bg-muted/50 text-muted-foreground'
                    }`}
                    onClick={() => {
                      setActiveTabId(tab.id);
                    }}
                  >
                    {renamingTabId === tab.id ? (
                      <input
                        type="text"
                        value={renameValue}
                        autoFocus
                        className="max-w-[100px] bg-transparent border-b border-primary outline-none font-mono text-xs w-[80px]"
                        onChange={(e) => {
                          setRenameValue(e.target.value);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (renameValue.trim()) {
                              setTabs((prev) =>
                                prev.map((t) =>
                                  t.id === tab.id
                                    ? {
                                        ...t,
                                        name: renameValue.trim(),
                                        path: `${cwd}/${renameValue.trim()}`,
                                        language: detectLanguage(renameValue.trim()),
                                        isDirty: true,
                                      }
                                    : t
                                )
                              );
                            }
                            setRenamingTabId(null);
                          } else if (e.key === 'Escape') {
                            setRenamingTabId(null);
                          }
                        }}
                        onBlur={() => {
                          if (renameValue.trim()) {
                            setTabs((prev) =>
                              prev.map((t) =>
                                t.id === tab.id
                                  ? {
                                      ...t,
                                      name: renameValue.trim(),
                                      path: `${cwd}/${renameValue.trim()}`,
                                      language: detectLanguage(renameValue.trim()),
                                      isDirty: true,
                                    }
                                  : t
                              )
                            );
                          }
                          setRenamingTabId(null);
                        }}
                      />
                    ) : (
                      <span
                        className="max-w-[80px] sm:max-w-[120px] truncate"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setActiveTabId(tab.id);
                          setRenamingTabId(tab.id);
                          setRenameValue(tab.name);
                        }}
                        title="Double-click to rename"
                      >
                        {tab.name}
                      </span>
                    )}
                    {tab.isDirty && renamingTabId !== tab.id && (
                      <span className="text-primary">●</span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                      className="hover:text-destructive ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button onClick={createNewTab} className="btn-ghost p-1 rounded" title="New file">
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded hidden sm:inline">
                {language}
              </span>
              <div className="flex-1" />

              {/* Toolbar buttons */}
              <button
                onClick={() => {
                  setSettingsOpen(!settingsOpen);
                }}
                className={`btn-ghost p-1.5 rounded ${settingsOpen ? 'bg-primary/10 text-primary' : ''}`}
                title="Editor settings"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setSplitView(!splitView);
                }}
                className={`btn-ghost p-1.5 rounded ${splitView ? 'bg-primary/10 text-primary' : ''}`}
                title="Toggle split view"
              >
                <Split className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleRunCode}
                disabled={runCodeMutation.isPending || !editorContent.trim()}
                className="btn-ghost text-xs px-2 sm:px-3 py-1.5 rounded border hover:border-primary flex items-center gap-1"
                title="Run code in terminal (Ctrl+Enter)"
              >
                <Play className="w-3 h-3" />
                <span className="hidden sm:inline">Run</span>
              </button>
              <button
                onClick={handleSendToChat}
                className="btn-ghost text-xs px-2 sm:px-3 py-1.5 rounded border hover:border-primary"
                title="Send selected text (or all) to chat"
              >
                <span className="hidden sm:inline">Send to Chat</span>
                <span className="sm:hidden">Send</span>
              </button>
              {/* Memory toggle */}
              <button
                onClick={() => {
                  const n = !memoryEnabled;
                  localStorage.setItem('editor:memoryEnabled', String(n));
                  setMemoryEnabled(n);
                }}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors ${
                  memoryEnabled
                    ? 'bg-primary/15 border-primary/50 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
                title={memoryEnabled ? 'Memory on — commands saved across sessions' : 'Memory off'}
              >
                <Brain className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Mem</span>
              </button>

              {/* Model selector */}
              <div className="relative">
                <button
                  ref={modelBtnRef}
                  onClick={() => {
                    setModelOpen((v) => !v);
                  }}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
                  title="Switch model"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline max-w-[70px] truncate">
                    {modelInfo?.current.model ?? 'Model'}
                  </span>
                </button>
                {modelOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50">
                    <ModelWidget
                      onClose={() => {
                        setModelOpen(false);
                      }}
                      onModelSwitch={() => {
                        setModelOpen(false);
                        void queryClient.invalidateQueries({ queryKey: ['model-info'] });
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Chat toggle */}
              <button
                onClick={() => {
                  const n = !showChat;
                  localStorage.setItem('editor:showChat', String(n));
                  setShowChat(n);
                }}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors ${
                  showChat
                    ? 'bg-primary/15 border-primary/50 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
                title={showChat ? 'Hide chat panel' : 'Show chat panel'}
              >
                <Bot className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Chat</span>
              </button>

              {/* Agent World toggle */}
              <button
                onClick={() => {
                  const n = !showWorld;
                  localStorage.setItem('editor:showWorld', String(n));
                  setShowWorld(n);
                }}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors ${
                  showWorld
                    ? 'bg-primary/15 border-primary/50 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
                title={showWorld ? 'Hide agent world' : 'Show agent world'}
              >
                <Globe className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">World</span>
              </button>
            </div>

            {/* Collapsible Files Panel */}
            <div
              className={`border-b bg-muted transition-all ${filesPanelOpen ? 'max-h-64' : 'max-h-0'} overflow-hidden`}
            >
              <div className="px-3 py-2 space-y-2">
                <div className="flex items-center gap-2">
                  <Folder className="w-3 h-3 text-muted-foreground" />
                  <input
                    type="text"
                    value={cwd}
                    onChange={(e) => {
                      setCwd(e.target.value);
                    }}
                    className="flex-1 bg-transparent border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="/path/to/folder"
                    title="Working directory"
                  />
                </div>
                <div className="space-y-1">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTabId(tab.id);
                      }}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-mono text-left hover:bg-muted/50 ${
                        tab.id === activeTabId ? 'bg-primary/10 text-primary' : ''
                      }`}
                    >
                      <File className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{tab.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Settings Panel */}
            {settingsOpen && (
              <div className="border-b bg-muted/50 px-3 py-2 space-y-2">
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Font Size:</span>
                    <input
                      type="number"
                      min={10}
                      max={24}
                      value={editorSettings.fontSize}
                      onChange={(e) => {
                        setEditorSettings((s) => ({
                          ...s,
                          fontSize: parseInt(e.target.value) || 14,
                        }));
                      }}
                      className="w-14 bg-card border border-border rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Tab Size:</span>
                    <select
                      value={editorSettings.tabSize}
                      onChange={(e) => {
                        setEditorSettings((s) => ({ ...s, tabSize: parseInt(e.target.value) }));
                      }}
                      className="bg-card border border-border rounded px-2 py-1 text-xs"
                    >
                      <option value={2}>2</option>
                      <option value={4}>4</option>
                      <option value={8}>8</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editorSettings.minimap}
                      onChange={(e) => {
                        setEditorSettings((s) => ({ ...s, minimap: e.target.checked }));
                      }}
                      className="rounded"
                    />
                    <span className="text-muted-foreground">Minimap</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editorSettings.wordWrap}
                      onChange={(e) => {
                        setEditorSettings((s) => ({ ...s, wordWrap: e.target.checked }));
                      }}
                      className="rounded"
                    />
                    <span className="text-muted-foreground">Word Wrap</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editorSettings.lineNumbers}
                      onChange={(e) => {
                        setEditorSettings((s) => ({ ...s, lineNumbers: e.target.checked }));
                      }}
                      className="rounded"
                    />
                    <span className="text-muted-foreground">Line Numbers</span>
                  </label>
                </div>
              </div>
            )}

            {/* Monaco Editor */}
            <div className={`flex-1 min-h-0 ${splitView ? 'flex gap-1' : ''}`}>
              <Editor
                height="100%"
                width={splitView ? '50%' : '100%'}
                language={language}
                theme={isDark ? 'vs-dark' : 'vs'}
                value={editorContent}
                onChange={(value) => {
                  updateTabContent(value ?? '');
                }}
                onMount={handleEditorMount}
                options={{
                  minimap: { enabled: editorSettings.minimap },
                  fontSize: editorSettings.fontSize,
                  tabSize: editorSettings.tabSize,
                  lineNumbers: editorSettings.lineNumbers ? 'on' : 'off',
                  wordWrap: editorSettings.wordWrap ? 'on' : 'off',
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  padding: { top: 8 },
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                }}
              />
              {splitView && (
                <Editor
                  height="100%"
                  width="50%"
                  language={language}
                  theme={isDark ? 'vs-dark' : 'vs'}
                  value={editorContent}
                  onChange={(value) => {
                    updateTabContent(value ?? '');
                  }}
                  options={{
                    minimap: { enabled: editorSettings.minimap },
                    fontSize: editorSettings.fontSize,
                    tabSize: editorSettings.tabSize,
                    lineNumbers: editorSettings.lineNumbers ? 'on' : 'off',
                    wordWrap: editorSettings.wordWrap ? 'on' : 'off',
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    padding: { top: 8 },
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    readOnly: true,
                  }}
                />
              )}
            </div>
          </div>

          {/* Right panel — Chat Sidebar */}
          {showChat && (
            <div className="flex flex-col flex-1 lg:flex-[40] min-h-[200px] lg:min-h-0 border rounded-lg overflow-hidden bg-card">
              {/* Sidebar header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
                <Bot className="w-4 h-4 text-primary flex-shrink-0" />
                {currentPersonality?.isDefault && (
                  <span title="Default personality">
                    <Star className="w-3 h-3 fill-current text-primary flex-shrink-0" />
                  </span>
                )}

                {/* Personality selector */}
                <div className="relative flex-1 min-w-0">
                  <select
                    value={effectivePersonalityId ?? ''}
                    onChange={(e) => {
                      setSelectedPersonalityId(e.target.value || null);
                    }}
                    className="w-full bg-transparent border border-border rounded px-2 py-1 text-xs appearance-none pr-6 focus:outline-none focus:ring-1 focus:ring-primary truncate"
                  >
                    <option value="">Default Assistant</option>
                    {personalities.map((p: Personality) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.isActive ? ' (active)' : ''}
                        {p.isDefault ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
                </div>
                <button
                  onClick={() => {
                    localStorage.setItem('editor:showChat', 'false');
                    setShowChat(false);
                  }}
                  className="text-muted-foreground hover:text-foreground flex-shrink-0"
                  title="Close chat"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                {messages.length === 0 && (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      {personalitiesData && personalities.length === 0 ? (
                        <>
                          <p className="text-xs font-medium">No personalities configured.</p>
                          <p className="text-xs mt-1">
                            <Link to="/personality" className="text-primary hover:underline">
                              Create a personality
                            </Link>{' '}
                            to start chatting.
                          </p>
                        </>
                      ) : (
                        <p className="text-xs">
                          Chat with {currentPersonality?.name ?? 'the assistant'} about your code.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-lg px-3 py-2 ${
                        msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        {msg.role === 'user' ? (
                          <User className="w-3 h-3" />
                        ) : (
                          <Bot className="w-3 h-3" />
                        )}
                        <span className="text-[10px] opacity-70">
                          {msg.role === 'user' ? 'You' : (currentPersonality?.name ?? 'Assistant')}
                        </span>
                      </div>
                      {/* Phase 1 — Thinking */}
                      {msg.role === 'assistant' && msg.thinkingContent && (
                        <ThinkingBlock thinking={msg.thinkingContent} />
                      )}

                      {/* Phase 2 — Tool use (badges + creation outcomes), shown before the response */}
                      {msg.role === 'assistant' &&
                        ((msg.toolCalls?.length ?? 0) > 0 ||
                          (msg.creationEvents?.length ?? 0) > 0) && (
                          <div
                            className={`space-y-0.5 mb-1.5 ${msg.thinkingContent ? 'border-t border-muted-foreground/15 pt-1.5 mt-1' : ''}`}
                          >
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70 mb-1">
                              <Wrench className="w-2.5 h-2.5 shrink-0" />
                              <span>Tools used</span>
                            </div>
                            {/* Tool call badges */}
                            {msg.toolCalls && msg.toolCalls.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-0.5">
                                {msg.toolCalls.map((tc, j) => (
                                  <span
                                    key={j}
                                    className="inline-flex items-center gap-0.5 text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full"
                                  >
                                    <Sparkles className="w-2 h-2" />
                                    {tc.isMcp && tc.serverName
                                      ? `${tc.serverName}: ${tc.toolName}`
                                      : tc.label}
                                  </span>
                                ))}
                              </div>
                            )}
                            {/* Creation outcomes */}
                            {msg.creationEvents?.map((ev: CreationEvent, j: number) => (
                              <div
                                key={j}
                                className="flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20"
                              >
                                <Sparkles className="w-2.5 h-2.5 shrink-0" />
                                <span>
                                  {ev.label} {ev.action ?? 'Created'}:{' '}
                                  <strong className="font-medium">{sanitizeText(ev.name)}</strong>
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                      {/* Phase 3 — Response */}
                      {msg.role === 'assistant' ? (
                        <div
                          className={
                            msg.thinkingContent ||
                            (msg.toolCalls?.length ?? 0) > 0 ||
                            (msg.creationEvents?.length ?? 0) > 0
                              ? 'border-t border-muted-foreground/15 pt-1.5 mt-1'
                              : ''
                          }
                        >
                          <ChatMarkdown content={sanitizeText(msg.content)} size="xs" />
                        </div>
                      ) : (
                        <p className="text-xs whitespace-pre-wrap">{sanitizeText(msg.content)}</p>
                      )}

                      {msg.role === 'assistant' && (
                        <button
                          onClick={() => {
                            handleInsertAtCursor(msg);
                          }}
                          className="flex items-center gap-1 text-[10px] text-primary mt-1.5 hover:underline"
                          title="Insert code at cursor position in editor"
                        >
                          <ArrowDownToLine className="w-3 h-3" />
                          Insert at Cursor
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Live streaming response */}
                {isPending && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-3 py-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Bot className="w-3 h-3" />
                        <span className="text-[10px] opacity-70">
                          {currentPersonality?.name ?? 'Assistant'}
                        </span>
                      </div>

                      {/* Phase 1 — Live thinking */}
                      {streamingThinking && (
                        <ThinkingBlock thinking={streamingThinking} live={true} />
                      )}

                      {/* Phase 2 — Active tool calls */}
                      {activeToolCalls.length > 0 && (
                        <div
                          className={`mb-1 ${streamingThinking ? 'border-t border-muted-foreground/15 pt-1.5 mt-1' : ''}`}
                        >
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70 mb-1">
                            <Wrench className="w-2.5 h-2.5 shrink-0" />
                            <span>Using tools</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {activeToolCalls.map((tc) => (
                              <span
                                key={tc.toolName}
                                className="inline-flex items-center gap-0.5 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full animate-pulse"
                              >
                                <Sparkles className="w-2 h-2" />
                                {tc.isMcp ? `${tc.serverName}: ${tc.toolName}` : tc.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Phase 3 — Response */}
                      {streamingContent ? (
                        <div
                          className={
                            streamingThinking || hadActiveTools
                              ? 'border-t border-muted-foreground/15 pt-1.5 mt-1'
                              : ''
                          }
                        >
                          <p className="text-xs whitespace-pre-wrap">{streamingContent}</p>
                        </div>
                      ) : (
                        !streamingThinking &&
                        activeToolCalls.length === 0 && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="text-[10px] text-muted-foreground animate-pulse">
                              Thinking
                            </span>
                            <div className="flex gap-1">
                              <span
                                className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce"
                                style={{ animationDelay: '0ms' }}
                              />
                              <span
                                className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce"
                                style={{ animationDelay: '150ms' }}
                              />
                              <span
                                className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce"
                                style={{ animationDelay: '300ms' }}
                              />
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Chat input */}
              <div className="border-t px-3 py-2">
                <div className="flex gap-2 items-end">
                  <textarea
                    value={chatInput}
                    onChange={(e) => {
                      setChatInput(e.target.value);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${currentPersonality?.name ?? 'assistant'}...`}
                    disabled={isPending}
                    rows={3}
                    className="flex-1 resize-none rounded border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 min-h-[80px] max-h-[200px]"
                  />
                  <button
                    onClick={voice.toggleVoice}
                    disabled={!voice.supported}
                    className={`btn px-3 py-2 rounded disabled:opacity-50 h-[52px] ${
                      voice.voiceEnabled ? 'btn-primary' : 'btn-ghost'
                    }`}
                    title={voice.voiceEnabled ? 'Voice enabled' : 'Enable voice'}
                  >
                    {voice.isListening ? (
                      <Mic className="w-3 h-3 animate-pulse" />
                    ) : voice.voiceEnabled ? (
                      <Mic className="w-3 h-3" />
                    ) : (
                      <Mic className="w-3 h-3 opacity-50" />
                    )}
                  </button>
                  {hasVision && (
                    <button
                      onClick={() => {
                        setWatchEnabled((v) => !v);
                      }}
                      className={`btn px-3 py-2 rounded h-[52px] ${
                        watchEnabled ? 'btn-primary' : 'btn-ghost'
                      }`}
                      title={
                        watchEnabled
                          ? 'Watch on — terminal output visible to personality'
                          : 'Watch off — enable terminal vision'
                      }
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={handleSend}
                    disabled={!chatInput.trim() || isPending}
                    className="btn btn-ghost px-3 py-2 rounded disabled:opacity-50 h-[52px]"
                  >
                    {isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Send className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>

              <VoiceOverlay
                isActive={ptt.isActive}
                audioLevel={ptt.audioLevel}
                duration={ptt.duration}
                transcript={ptt.transcript}
                error={ptt.error}
              />
            </div>
          )}
        </div>

        {/* Bottom row — Terminal (+ Agent World side-by-side when visible) */}
        <div
          className={`flex ${showWorld ? 'flex-col lg:flex-row' : 'flex-col'} gap-3 h-[200px] sm:h-[220px] lg:h-[240px] flex-shrink-0`}
        >
          {/* Terminal / Sessions / History */}
          <div
            className={`flex flex-col border rounded-lg overflow-hidden bg-card ${showWorld ? 'flex-1 lg:flex-[60]' : 'flex-1'} min-h-0`}
          >
            {/* Tab bar */}
            <div className="flex items-center border-b bg-muted/30 min-w-0">
              <div className="flex flex-shrink-0">
                {BOTTOM_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveBottomTab(tab.id);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeBottomTab === tab.id
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            {activeBottomTab === 'terminal' && (
              <div className="flex-1 min-h-0 overflow-hidden">
                <MultiTerminal outputRef={terminalOutputRef} onCommandComplete={saveMemory} />
              </div>
            )}

            {activeBottomTab === 'sessions' && (
              <ExecutionGated>
                <SessionsPanel />
              </ExecutionGated>
            )}

            {activeBottomTab === 'history' && (
              <ExecutionGated>
                <HistoryPanel />
              </ExecutionGated>
            )}
          </div>

          {/* Agent World panel (right of terminal, same width as chat) */}
          {showWorld && (
            <div className="flex flex-col flex-1 lg:flex-[40] border border-border rounded-lg bg-card overflow-hidden min-h-0">
              <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                  <Globe className="w-3.5 h-3.5" /> Agent World
                </div>
                <div className="flex items-center gap-0.5">
                  {(['grid', 'map', 'large'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setWorldViewMode(m);
                        localStorage.setItem('world:viewMode', m);
                      }}
                      className={`px-1.5 py-0.5 text-[11px] rounded transition-colors ${worldViewMode === m ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      localStorage.setItem('editor:showWorld', 'false');
                      setShowWorld(false);
                    }}
                    className="ml-1 text-muted-foreground hover:text-foreground"
                    title="Close agent world"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 p-2 overflow-auto">
                <AgentWorldWidget
                  maxAgents={8}
                  viewMode={worldViewMode}
                  onAgentClick={(id) => navigate(`/soul/personalities?focus=${id}`)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
