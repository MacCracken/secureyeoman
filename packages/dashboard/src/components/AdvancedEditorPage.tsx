import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import {
  Plus,
  X,
  Terminal,
  FolderOpen,
  ClipboardList,
  Play,
  Loader2,
  File,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  fetchPersonalities,
  fetchTasks,
  fetchExecutionSessions,
  executeTerminalCommand,
} from '../api/client';
import { useTheme } from '../hooks/useTheme';
import type { Task } from '../types';

// ── Types ──────────────────────────────────────────────────────────

type MonacoEditor = Parameters<OnMount>[0];

interface EditorTab {
  id: string;
  name: string;
  content: string;
  language: string;
  isDirty: boolean;
}

interface TerminalTab {
  id: string;
  label: string;
  output: string[];
  input: string;
  running: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', rb: 'ruby', rs: 'rust', go: 'go', sh: 'shell', bash: 'shell',
  json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown', html: 'html',
  css: 'css', sql: 'sql', xml: 'xml', toml: 'toml',
};

function detectLanguage(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return LANG_MAP[ext] ?? 'plaintext';
}

function genId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function makeEditorTab(name = 'untitled.ts', content = ''): EditorTab {
  return { id: genId(), name, content, language: detectLanguage(name), isDirty: false };
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

// ── File Manager Panel ─────────────────────────────────────────────

interface FileManagerPanelProps {
  tabs: EditorTab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onNewTab: () => void;
}

function FileManagerPanel({ tabs, activeTabId, onSelect, onNewTab }: FileManagerPanelProps) {
  const { data: sessionsData } = useQuery({
    queryKey: ['execution-sessions'],
    queryFn: fetchExecutionSessions,
    staleTime: 15000,
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <FolderOpen className="w-3.5 h-3.5" />
          Files
        </div>
        <button
          onClick={onNewTab}
          className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          title="New file"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-1">
        {tabs.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">No open files</p>
        )}
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${
              tab.id === activeTabId
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <File className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{tab.name}</span>
            {tab.isDirty && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />}
          </button>
        ))}

        {(sessionsData?.sessions?.length ?? 0) > 0 && (
          <>
            <div className="mt-3 mb-1 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Sessions
            </div>
            {sessionsData!.sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground"
              >
                <Terminal className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate font-mono">{s.runtime}</span>
                <span className={`ml-auto px-1 rounded text-[10px] ${s.status === 'running' ? 'text-blue-400' : 'text-muted-foreground'}`}>
                  {s.status}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── Task Panel ─────────────────────────────────────────────────────

function TaskPanel() {
  const { data } = useQuery({
    queryKey: ['tasks-editor-panel'],
    queryFn: () => fetchTasks({ limit: 30 }),
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const tasks = data?.tasks ?? [];
  const activeCount = tasks.filter((t) => t.status === 'running').length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
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
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          title="Open in Automation"
        >
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-1">
        {tasks.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">No tasks</p>
        )}
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const statusClass = STATUS_COLOR[task.status] ?? 'bg-muted text-muted-foreground';

  return (
    <div className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-muted/30 text-xs">
      <span className={`mt-0.5 px-1 rounded text-[10px] font-medium flex-shrink-0 ${statusClass}`}>
        {task.status.slice(0, 3).toUpperCase()}
      </span>
      <div className="flex-1 min-w-0">
        <p className="truncate text-foreground">{task.name}</p>
        {task.type && (
          <p className="truncate text-muted-foreground text-[10px]">{task.type}</p>
        )}
      </div>
    </div>
  );
}

// ── Multi-Terminal ─────────────────────────────────────────────────

const MAX_TERMINAL_TABS = 4;

function MultiTerminal() {
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [makeTerminalTab(1)]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const endRef = useRef<HTMLDivElement>(null);

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

  const runMutation = useMutation({
    mutationFn: ({ command, cwd }: { command: string; cwd: string }) =>
      executeTerminalCommand(command, cwd),
    onMutate: ({ command }) => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeId
            ? { ...t, output: [...t.output, `$ ${command}`], running: true }
            : t
        )
      );
    },
    onSuccess: (data) => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeId
            ? { ...t, output: [...t.output, data.output || data.error || '(no output)'], input: '', running: false }
            : t
        )
      );
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    },
    onError: (err) => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeId
            ? { ...t, output: [...t.output, `Error: ${err instanceof Error ? err.message : String(err)}`], running: false }
            : t
        )
      );
    },
  });

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];

  const submit = useCallback(() => {
    const cmd = activeTab.input.trim();
    if (!cmd || activeTab.running) return;
    runMutation.mutate({ command: cmd, cwd: '/tmp' });
  }, [activeTab, runMutation]);

  const setInput = (val: string) => {
    setTabs((prev) => prev.map((t) => (t.id === activeId ? { ...t, input: val } : t)));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
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
            onClick={() => setActiveId(t.id)}
          >
            <Terminal className="w-3 h-3" />
            {t.label}
            <button
              onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
              className="ml-0.5 rounded hover:bg-muted p-0.5"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
        {tabs.length < MAX_TERMINAL_TABS && (
          <button
            onClick={addTab}
            className="px-1.5 py-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted/50 transition-colors flex-shrink-0"
            title="New terminal"
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Output */}
      <div className="flex-1 overflow-y-auto font-mono text-xs p-2 space-y-0.5 bg-black/30">
        {activeTab.output.length === 0 && (
          <span className="text-muted-foreground">Ready.</span>
        )}
        {activeTab.output.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all text-green-400/90">{line}</div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-border px-2 py-1.5 bg-muted/20 flex-shrink-0">
        <span className="font-mono text-xs text-muted-foreground">$</span>
        <input
          className="flex-1 bg-transparent font-mono text-xs outline-none text-foreground placeholder:text-muted-foreground/50"
          placeholder="command..."
          value={activeTab.input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          disabled={activeTab.running}
        />
        <button
          onClick={submit}
          disabled={activeTab.running || !activeTab.input.trim()}
          className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
        >
          {activeTab.running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export function AdvancedEditorPage() {
  const { theme } = useTheme();
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>(() => [makeEditorTab()]);
  const [activeEditorTabId, setActiveEditorTabId] = useState(() => editorTabs[0].id);
  const [selectedPersonalityId, setSelectedPersonalityIdRaw] = useState<string | null>(
    () => localStorage.getItem('soul:editorPersonalityId')
  );
  const editorRef = useRef<MonacoEditor | null>(null);

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
  const personalities = personalitiesData?.personalities;

  const activeEditorTab = editorTabs.find((t) => t.id === activeEditorTabId) ?? editorTabs[0];

  const updateContent = useCallback(
    (content: string) => {
      setEditorTabs((prev) =>
        prev.map((t) => (t.id === activeEditorTabId ? { ...t, content, isDirty: true } : t))
      );
    },
    [activeEditorTabId]
  );

  const newTab = useCallback(() => {
    const t = makeEditorTab();
    setEditorTabs((prev) => [...prev, t]);
    setActiveEditorTabId(t.id);
  }, []);

  const closeEditorTab = useCallback(
    (id: string) => {
      setEditorTabs((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (next.length === 0) {
          const t = makeEditorTab();
          setActiveEditorTabId(t.id);
          return [t];
        }
        if (activeEditorTabId === id) setActiveEditorTabId(next[next.length - 1].id);
        return next;
      });
    },
    [activeEditorTabId]
  );

  useEffect(() => {
    loader.config({ paths: { vs: '/vs' } });
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* ── Top toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20 flex-shrink-0">
        <span className="text-sm font-semibold text-foreground">Advanced Editor</span>
        <div className="ml-auto flex items-center gap-2">
          {personalities && personalities.length > 0 && (
            <select
              value={selectedPersonalityId ?? ''}
              onChange={(e) => setSelectedPersonalityId(e.target.value || null)}
              className="text-xs bg-background border border-border rounded px-2 py-1 text-foreground"
            >
              <option value="">No personality</option>
              {personalities.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ── Main content: editor left + panels right ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Monaco editor with tab bar */}
        <div className="flex flex-col flex-[3] overflow-hidden border-r border-border">
          {/* Editor tab bar */}
          <div className="flex items-center border-b border-border bg-muted/20 px-1 gap-0.5 overflow-x-auto flex-shrink-0">
            {editorTabs.map((t) => (
              <div
                key={t.id}
                onClick={() => setActiveEditorTabId(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs cursor-pointer select-none flex-shrink-0 border-r border-border ${
                  t.id === activeEditorTabId
                    ? 'bg-background text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                {t.name}
                {t.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />}
                <button
                  onClick={(e) => { e.stopPropagation(); closeEditorTab(t.id); }}
                  className="rounded hover:bg-muted p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
            <button
              onClick={newTab}
              className="px-2 py-2 text-muted-foreground hover:text-foreground hover:bg-muted/40 flex-shrink-0"
              title="New file"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Monaco editor */}
          <div className="flex-1 overflow-hidden">
            <Editor
              height="100%"
              language={activeEditorTab.language}
              value={activeEditorTab.content}
              theme={theme === 'dark' ? 'vs-dark' : 'light'}
              onChange={(val) => updateContent(val ?? '')}
              onMount={(editor) => { editorRef.current = editor; }}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                wordWrap: 'on',
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
              }}
            />
          </div>
        </div>

        {/* Right: stacked panels */}
        <div className="flex flex-col flex-[2] overflow-hidden">
          {/* File manager (top half) */}
          <div className="flex-1 overflow-hidden border-b border-border">
            <FileManagerPanel
              tabs={editorTabs}
              activeTabId={activeEditorTabId}
              onSelect={setActiveEditorTabId}
              onNewTab={newTab}
            />
          </div>

          {/* Task panel (bottom half) */}
          <div className="flex-1 overflow-hidden">
            <TaskPanel />
          </div>
        </div>
      </div>

      {/* ── Bottom: Multi-terminal ── */}
      <div className="h-48 border-t border-border flex-shrink-0">
        <MultiTerminal />
      </div>
    </div>
  );
}
