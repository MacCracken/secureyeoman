import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  X,
  Terminal,
  ClipboardList,
  Play,
  Loader2,
  ExternalLink,
  Brain,
  Cpu,
  Eye,
  Send,
  Bot,
  User,
  Globe,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import {
  fetchPersonalities,
  fetchTasks,
  fetchExecutionSessions,
  executeTerminalCommand,
  addMemory,
  fetchModelInfo,
  switchModel,
  sendChatMessage,
} from '../api/client';
import { ModelWidget } from './ModelWidget';
import { AgentWorldWidget } from './AgentWorldWidget';
import type { Task } from '../types';

// ── Types ──────────────────────────────────────────────────────────

interface TerminalTab {
  id: string;
  label: string;
  output: string[];
  input: string;
  running: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// ── Helpers ────────────────────────────────────────────────────────

function genId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function makeTerminalTab(n: number): TerminalTab {
  return { id: genId(), label: `Terminal ${n}`, output: [], input: '', running: false };
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  running: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-muted text-muted-foreground',
  timeout: 'bg-orange-500/20 text-orange-400',
};

// ── Sessions Panel ─────────────────────────────────────────────────

function SessionsPanel() {
  const { data: sessionsData } = useQuery({
    queryKey: ['execution-sessions'],
    queryFn: fetchExecutionSessions,
    staleTime: 15000,
  });

  const sessions = sessionsData?.sessions ?? [];

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider flex-shrink-0">
        <Terminal className="w-3.5 h-3.5" />
        Sessions
      </div>
      <div className="overflow-y-auto p-1" style={{ maxHeight: '120px' }}>
        {sessions.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">No active sessions</p>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground"
          >
            <Terminal className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate font-mono">{s.runtime}</span>
            <span
              className={`ml-auto px-1 rounded text-[10px] ${s.status === 'running' ? 'text-blue-400' : 'text-muted-foreground'}`}
            >
              {s.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Task Panel ─────────────────────────────────────────────────────

function TaskPanel() {
  const { data } = useQuery({
    queryKey: ['tasks-editor-panel'],
    queryFn: () => fetchTasks({ limit: 20 }),
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const tasks = data?.tasks ?? [];
  const activeCount = tasks.filter((t) => t.status === 'running').length;

  return (
    <div className="flex flex-col border-t border-border" style={{ maxHeight: '180px' }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <ClipboardList className="w-3.5 h-3.5" />
          Tasks
          {activeCount > 0 && (
            <span className="ml-1 bg-blue-500/20 text-blue-400 px-1 rounded text-[10px]">
              {activeCount} running
            </span>
          )}
        </div>
        <Link
          to="/automation"
          className="text-muted-foreground hover:text-foreground"
          title="Open in Automation"
        >
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
      <div className="overflow-y-auto p-1">
        {tasks.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">No tasks</p>}
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-start gap-2 px-2 py-1 rounded hover:bg-muted/30 text-xs"
          >
            <span
              className={`mt-0.5 px-1 rounded text-[10px] font-medium flex-shrink-0 ${STATUS_COLOR[task.status] ?? 'bg-muted text-muted-foreground'}`}
            >
              {task.status.slice(0, 3).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <p className="truncate text-foreground">{task.name}</p>
              {task.type && (
                <p className="truncate text-muted-foreground text-[10px]">{task.type}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Multi-Terminal ─────────────────────────────────────────────────

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

      {/* Input — editor-style caret */}
      <div className="flex items-center gap-2 border-t border-border px-3 py-2 bg-muted/20 flex-shrink-0">
        <span className="font-mono text-xs text-primary/70 flex-shrink-0">$</span>
        <div className="relative flex-1 flex items-center">
          <input
            ref={inputRef}
            className="w-full bg-transparent font-mono text-xs outline-none text-foreground placeholder:text-muted-foreground/40 caret-primary"
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
        </div>
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

// ── Inline Chat ────────────────────────────────────────────────────

interface InlineChatProps {
  personalityId: string | null;
  personalityName: string | null;
  memoryEnabled: boolean;
  terminalContext: string;
  hasVision: boolean;
}

function InlineChat({
  personalityId,
  personalityName,
  memoryEnabled,
  terminalContext,
  hasVision,
}: InlineChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Synthetic task ID used to signal chat-in-progress to AgentWorldWidget
  const chatTaskId = personalityId ? `__chat_${personalityId}` : null;

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = { id: genId(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    // Inject a synthetic running task so AgentWorldWidget shows the personality
    // as active while waiting for the chat response. The task is removed in
    // `finally` — no server round-trip required.
    if (personalityId) {
      const syntheticTask: Task = {
        id: chatTaskId!,
        type: 'chat',
        name: 'Chat response',
        status: 'running',
        createdAt: Date.now(),
        startedAt: Date.now(),
        securityContext: { personalityId },
      };
      queryClient.setQueryData(
        ['world-tasks-running'],
        (old: { tasks: Task[]; total: number } | undefined) => ({
          tasks: [...(old?.tasks ?? []).filter((t) => t.id !== chatTaskId), syntheticTask],
          total: (old?.total ?? 0) + 1,
        })
      );
    }

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const editorContent = terminalContext
        ? `[Current terminal output]\n${terminalContext.slice(-2000)}`
        : undefined;

      const res = await sendChatMessage({
        message: text,
        history,
        personalityId: personalityId ?? undefined,
        editorContent,
        memoryEnabled,
        saveAsMemory: memoryEnabled,
      });

      const assistantMsg: ChatMessage = {
        id: genId(),
        role: 'assistant',
        content: res.content,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errMsg: ChatMessage = {
        id: genId(),
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Failed to send message'}`,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      // Remove the synthetic task — widget reverts to real server state immediately
      if (personalityId) {
        queryClient.setQueryData(
          ['world-tasks-running'],
          (old: { tasks: Task[]; total: number } | undefined) => ({
            tasks: (old?.tasks ?? []).filter((t) => t.id !== chatTaskId),
            total: Math.max(0, (old?.total ?? 0) - 1),
          })
        );
      }
      setSending(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [input, sending, messages, personalityId, memoryEnabled, terminalContext, queryClient, chatTaskId]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background border-t border-border">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/20 flex-shrink-0">
        <Bot className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium text-foreground">
          {personalityName ?? 'Assistant'}
        </span>
        {hasVision && terminalContext.trim() && (
          <span title="Terminal output is visible to the assistant">
            <Eye className="w-3 h-3 text-primary/50" />
          </span>
        )}
        {messages.length > 0 && (
          <button
            onClick={() => {
              setMessages([]);
            }}
            className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground px-1 py-2">
            Chat with {personalityName ?? 'the assistant'}. Terminal output is shared as context.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.role === 'assistant' && (
              <Bot className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
            )}
            <div
              className={`max-w-[85%] rounded px-2 py-1.5 text-xs whitespace-pre-wrap break-words ${
                m.role === 'user' ? 'bg-primary/15 text-foreground' : 'bg-muted/50 text-foreground'
              }`}
            >
              {m.content}
            </div>
            {m.role === 'user' && (
              <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
            )}
          </div>
        ))}
        {sending && (
          <div className="flex gap-2 justify-start">
            <Bot className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
            <div className="bg-muted/50 rounded px-2 py-1.5 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin inline" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div
        className="flex items-center gap-2 border-t border-border px-3 py-2 bg-muted/20 flex-shrink-0"
        onClick={() => inputRef.current?.focus()}
      >
        <input
          ref={inputRef}
          className="flex-1 bg-transparent text-xs outline-none text-foreground placeholder:text-muted-foreground/40 caret-primary"
          placeholder={`Message ${personalityName ?? 'assistant'}...`}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          disabled={sending}
          autoComplete="off"
        />
        <button
          onClick={() => void send()}
          disabled={sending || !input.trim()}
          className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors flex-shrink-0"
        >
          {sending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export function AdvancedEditorPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // ── Personality ──
  const [selectedPersonalityId, setSelectedPersonalityIdRaw] = useState<string | null>(() =>
    localStorage.getItem('soul:editorPersonalityId')
  );
  const setSelectedPersonalityId = (id: string | null) => {
    if (id) localStorage.setItem('soul:editorPersonalityId', id);
    else localStorage.removeItem('soul:editorPersonalityId');
    setSelectedPersonalityIdRaw(id);
  };

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
    staleTime: 30000,
  });
  const personalities = personalitiesData?.personalities ?? [];
  const defaultPersonality =
    personalities.find((p) => p.isDefault) ??
    [...personalities].sort((a, b) => a.name.localeCompare(b.name))[0];
  const effectivePersonalityId = selectedPersonalityId ?? defaultPersonality?.id ?? null;
  const personality =
    personalities.find((p) => p.id === effectivePersonalityId) ?? defaultPersonality ?? null;

  // ── Memory ──
  const [memoryEnabled, setMemoryEnabled] = useState(
    () => localStorage.getItem('editor:memoryEnabled') !== 'false'
  );
  const toggleMemory = () => {
    const next = !memoryEnabled;
    localStorage.setItem('editor:memoryEnabled', String(next));
    setMemoryEnabled(next);
  };

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

  // ── Model ──
  const [modelOpen, setModelOpen] = useState(false);
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const { data: modelInfo } = useQuery({
    queryKey: ['model-info'],
    queryFn: fetchModelInfo,
    staleTime: 30000,
  });

  // Auto-switch model when personality changes
  useEffect(() => {
    if (personality?.defaultModel) {
      void switchModel({
        provider: personality.defaultModel.provider,
        model: personality.defaultModel.model,
      }).then(() => {
        void queryClient.invalidateQueries({ queryKey: ['model-info'] });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePersonalityId, queryClient]);

  // ── Vision / Watch ──
  const hasVision = personality?.body?.capabilities?.includes('vision') ?? false;
  const [watchEnabled, setWatchEnabled] = useState(false);
  const terminalOutputRef = useRef<string>('');

  // ── Agent World panel ──
  const [showWorld, setShowWorld] = useState(
    () => localStorage.getItem('editor:showWorld') === 'true'
  );
  const [worldViewMode, setWorldViewMode] = useState<'grid' | 'map' | 'large'>(
    () => (localStorage.getItem('world:viewMode') ?? 'grid') as 'grid' | 'map' | 'large'
  );
  const setAndPersistWorldView = (m: 'grid' | 'map' | 'large') => {
    setWorldViewMode(m);
    localStorage.setItem('world:viewMode', m);
  };
  const toggleWorld = () => {
    setShowWorld((v) => {
      const next = !v;
      localStorage.setItem('editor:showWorld', String(next));
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20 flex-shrink-0">
        <Terminal className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-semibold text-foreground">Workspace</span>

        <div className="flex items-center gap-1.5 ml-auto">
          {/* Memory toggle */}
          <button
            onClick={toggleMemory}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
              memoryEnabled
                ? 'bg-primary/15 border-primary text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
            title={memoryEnabled ? 'Memory on — commands saved across sessions' : 'Memory off'}
          >
            <Brain className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{memoryEnabled ? 'Memory On' : 'Memory Off'}</span>
          </button>

          {/* Watch toggle (vision only) */}
          {hasVision && (
            <button
              onClick={() => {
                setWatchEnabled((v) => !v);
              }}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                watchEnabled
                  ? 'bg-primary/15 border-primary text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
              title={
                watchEnabled
                  ? 'Watch on — personality can see terminal output'
                  : 'Watch off — enable terminal vision'
              }
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Watch</span>
            </button>
          )}

          {/* Agent World toggle */}
          <button
            onClick={toggleWorld}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
              showWorld
                ? 'bg-primary/15 border-primary text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
            title={showWorld ? 'Hide agent world' : 'Show agent world — live personality activity'}
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">World</span>
          </button>

          {/* Model selector */}
          <div className="relative">
            <button
              ref={modelBtnRef}
              onClick={() => {
                setModelOpen((v) => !v);
              }}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground transition-colors"
              title="Switch model"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span className="hidden sm:inline max-w-[80px] truncate">
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

          {/* Personality selector */}
          {personalities.length > 0 && (
            <select
              value={effectivePersonalityId ?? ''}
              onChange={(e) => {
                setSelectedPersonalityId(e.target.value || null);
              }}
              className="text-xs bg-background border border-border rounded px-2 py-1 text-foreground max-w-[120px]"
            >
              <option value="">No personality</option>
              {personalities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isDefault ? ' ★' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar */}
        <div className="flex flex-col w-56 flex-shrink-0 border-r border-border overflow-hidden">
          <SessionsPanel />
          <TaskPanel />
        </div>

        {/* Right: Terminal + Chat stacked */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Terminal — dominant */}
          <div className="flex-[3] min-h-0 overflow-hidden">
            <MultiTerminal outputRef={terminalOutputRef} onCommandComplete={saveMemory} />
          </div>

          {/* Inline chat */}
          <div className="flex-[2] min-h-0 overflow-hidden">
            <InlineChat
              personalityId={effectivePersonalityId}
              personalityName={personality?.name ?? null}
              memoryEnabled={memoryEnabled}
              terminalContext={watchEnabled ? terminalOutputRef.current : ''}
              hasVision={hasVision && watchEnabled}
            />
          </div>

          {/* Agent World panel (collapsible) */}
          {showWorld && (
            <div className="flex-none border-t border-border bg-background overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20 border-b border-border">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Globe className="w-3.5 h-3.5" />
                  <span className="font-medium">Agent World</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => setAndPersistWorldView('grid')}
                      className={`px-1.5 py-0.5 text-[11px] rounded transition-colors ${worldViewMode === 'grid' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                      title="Card grid view"
                      aria-pressed={worldViewMode === 'grid'}
                    >
                      ≡ Grid
                    </button>
                    <button
                      onClick={() => setAndPersistWorldView('map')}
                      className={`px-1.5 py-0.5 text-[11px] rounded transition-colors ${worldViewMode === 'map' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                      title="World map view"
                      aria-pressed={worldViewMode === 'map'}
                    >
                      ⊞ Map
                    </button>
                    <button
                      onClick={() => setAndPersistWorldView('large')}
                      className={`px-1.5 py-0.5 text-[11px] rounded transition-colors ${worldViewMode === 'large' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                      title="Large zone view"
                      aria-pressed={worldViewMode === 'large'}
                    >
                      ⊟ Large
                    </button>
                  </div>
                  <button
                    onClick={toggleWorld}
                    className="text-muted-foreground hover:text-foreground transition-colors ml-1"
                    title="Close agent world"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="p-2 overflow-x-auto">
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
