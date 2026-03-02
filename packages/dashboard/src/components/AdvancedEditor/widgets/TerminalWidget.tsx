import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Play, Pin, ChevronDown } from 'lucide-react';
import { executeTerminalCommand } from '../../../api/client';

interface WorktreeInfo {
  id: string;
  path: string;
  branch: string;
  createdAt: string;
}

interface Props {
  worktreeId?: string;
  onFreezeOutput?: (command: string, output: string, exitCode: number) => void;
}

export function TerminalWidget({ worktreeId, onFreezeOutput }: Props) {
  const [cwd, setCwd] = useState(worktreeId ? `.worktrees/${worktreeId}` : '.');
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<
    { command: string; output: string; error: string; exitCode: number }[]
  >([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [running, setRunning] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  const { data: worktreesData } = useQuery<{ worktrees: WorktreeInfo[] }>({
    queryKey: ['worktrees'],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken') ?? '';
      const res = await fetch('/api/v1/terminal/worktrees', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { worktrees: [] };
      return res.json() as Promise<{ worktrees: WorktreeInfo[] }>;
    },
    staleTime: 60_000,
  });

  const { data: techStack } = useQuery({
    queryKey: ['tech-stack', cwd],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken') ?? '';
      const res = await fetch(`/api/v1/terminal/tech-stack?cwd=${encodeURIComponent(cwd)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { stacks: [] as string[], allowedCommands: [] as string[] };
      return res.json() as Promise<{ stacks: string[]; allowedCommands: string[] }>;
    },
    staleTime: 60_000,
  });

  const allowedCommands = techStack?.allowedCommands ?? [];

  const runCommand = useCallback(async () => {
    if (!command.trim() || running) return;
    const cmd = command.trim();
    setCommand('');
    setHistoryIdx(-1);
    setRunning(true);
    try {
      const result = await executeTerminalCommand(cmd, cwd);
      if (result.cwd && result.cwd !== cwd) setCwd(result.cwd);
      setHistory((prev) => [
        ...prev,
        { command: cmd, output: result.output, error: result.error, exitCode: result.exitCode },
      ]);
    } catch {
      setHistory((prev) => [
        ...prev,
        { command: cmd, output: '', error: 'Request failed', exitCode: 1 },
      ]);
    } finally {
      setRunning(false);
    }
  }, [command, cwd, running]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      void runCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const cmds = history.map((h) => h.command);
      const nextIdx = Math.min(historyIdx + 1, cmds.length - 1);
      setHistoryIdx(nextIdx);
      setCommand(cmds[cmds.length - 1 - nextIdx] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(nextIdx);
      if (nextIdx === -1) setCommand('');
      else setCommand(history[history.length - 1 - nextIdx]?.command ?? '');
    }
  };

  return (
    <div className="flex flex-col h-full text-xs font-mono">
      {/* Tech stack hint */}
      {techStack && techStack.stacks.length > 0 && (
        <div className="px-2 py-1 bg-muted/40 border-b text-[10px] text-muted-foreground truncate">
          Detected: {techStack.stacks.join(', ')} | Allowed:{' '}
          {allowedCommands.slice(0, 8).join(', ')}
          {allowedCommands.length > 8 ? '...' : ''}
        </div>
      )}

      {/* Worktree selector */}
      {(worktreesData?.worktrees?.length ?? 0) > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 border-b">
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
          <select
            className="text-[10px] bg-transparent border-none outline-none flex-1"
            value={worktreeId ?? ''}
            onChange={(e) => {
              const id = e.target.value;
              setCwd(id ? `.worktrees/${id}` : '.');
            }}
          >
            <option value="">Main branch</option>
            {worktreesData?.worktrees?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.id} ({w.branch})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Output area */}
      <div ref={outputRef} className="flex-1 overflow-y-auto p-2 space-y-2 bg-background">
        {history.map((entry, i) => (
          <div key={i}>
            <div className="text-primary">$ {entry.command}</div>
            {entry.output && (
              <pre className="whitespace-pre-wrap text-foreground">{entry.output}</pre>
            )}
            {entry.error && (
              <pre className="whitespace-pre-wrap text-destructive">{entry.error}</pre>
            )}
            {onFreezeOutput && (entry.output || entry.error) && (
              <button
                onClick={() => {
                  onFreezeOutput(entry.command, entry.output || entry.error, entry.exitCode);
                }}
                className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground mt-0.5"
              >
                <Pin className="w-2.5 h-2.5" /> Pin Output
              </button>
            )}
          </div>
        ))}
        {running && <div className="text-muted-foreground animate-pulse">Running...</div>}
      </div>

      {/* Input */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-t bg-muted/20">
        <span className="text-muted-foreground">
          {cwd.length > 20 ? '...' + cwd.slice(-18) : cwd} $
        </span>
        <input
          className="flex-1 bg-transparent outline-none text-xs font-mono"
          value={command}
          onChange={(e) => {
            setCommand(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Enter command..."
          disabled={running}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          onClick={() => void runCommand()}
          disabled={running}
          className="text-muted-foreground hover:text-foreground"
        >
          <Play className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
