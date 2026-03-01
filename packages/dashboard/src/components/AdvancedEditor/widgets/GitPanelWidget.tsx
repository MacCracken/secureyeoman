import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GitBranch, RefreshCw } from 'lucide-react';
import { executeTerminalCommand } from '../../../api/client';

interface Props {
  worktreeId?: string;
}

export function GitPanelWidget({ worktreeId }: Props) {
  const cwd = worktreeId ? `.worktrees/${worktreeId}` : '.';
  const [commitMsg, setCommitMsg] = useState('');
  const [output, setOutput] = useState('');

  const runGit = useCallback(async (args: string) => {
    const result = await executeTerminalCommand(`git ${args}`, cwd);
    setOutput(result.output || result.error);
  }, [cwd]);

  const { data: statusData, refetch } = useQuery({
    queryKey: ['git-status', cwd],
    queryFn: async () => {
      const result = await executeTerminalCommand('git status --short', cwd);
      return result.output;
    },
    refetchInterval: 10_000,
  });

  return (
    <div className="flex flex-col h-full text-xs p-2 space-y-2">
      <div className="flex items-center gap-1 font-medium">
        <GitBranch className="w-3.5 h-3.5" />
        Git Panel
        <button onClick={() => void refetch()} className="ml-auto text-muted-foreground hover:text-foreground">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
      <div className="rounded border p-1.5 bg-muted/30 font-mono text-[10px] max-h-20 overflow-auto">
        <pre>{statusData || 'Clean working tree'}</pre>
      </div>
      <div className="flex gap-1">
        <button onClick={() => void runGit('add -A')} className="px-2 py-1 rounded border hover:bg-muted">Stage All</button>
        <button onClick={() => void runGit('diff --stat')} className="px-2 py-1 rounded border hover:bg-muted">Diff</button>
        <button onClick={() => void runGit('log --oneline -5')} className="px-2 py-1 rounded border hover:bg-muted">Log</button>
      </div>
      <div className="flex gap-1">
        <input
          className="flex-1 text-xs rounded border px-1.5 py-1 bg-background"
          placeholder="Commit message..."
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
        />
        <button
          onClick={() => {
            if (commitMsg) void runGit(`commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
          }}
          className="px-2 py-1 rounded border hover:bg-muted"
          disabled={!commitMsg}
        >
          Commit
        </button>
      </div>
      {output && (
        <div className="rounded border p-1.5 bg-muted/30 font-mono text-[10px] max-h-24 overflow-auto">
          <pre>{output}</pre>
        </div>
      )}
    </div>
  );
}
