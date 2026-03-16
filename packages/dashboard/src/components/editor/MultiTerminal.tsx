import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Terminal, Play, Plus, X, Loader2 } from 'lucide-react';
import { executeTerminalCommand } from '../../api/client';

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

export interface MultiTerminalProps {
  outputRef: React.MutableRefObject<string>;
  onCommandComplete?: (command: string, output: string) => void;
}

export function MultiTerminal({ outputRef, onCommandComplete }: MultiTerminalProps) {
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
            aria-label="New terminal"
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
