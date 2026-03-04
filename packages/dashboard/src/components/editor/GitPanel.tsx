import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GitBranch,
  RefreshCw,
  Plus,
  Minus,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { executeTerminalCommand } from '../../api/client';

interface StatusFile {
  status: string;
  path: string;
  staged: boolean;
}

function parseStatus(output: string): StatusFile[] {
  if (!output.trim()) return [];
  return output
    .trim()
    .split('\n')
    .filter((line) => line.length >= 4)
    .map((line) => {
      const index = line.charAt(0);
      const worktree = line.charAt(1);
      const path = line.substring(3).trim();
      const staged = index !== ' ' && index !== '?';
      const status =
        index === '?' ? 'untracked' : staged ? `${index} (staged)` : `${worktree} (unstaged)`;
      return { status, path, staged };
    });
}

interface Props {
  cwd: string;
  commitMessage?: string;
  onCommitMessageChange?: (msg: string) => void;
  isGeneratingMessage?: boolean;
  onGenerateMessage?: () => void;
}

export function GitPanel({
  cwd,
  commitMessage: externalMessage,
  onCommitMessageChange,
  isGeneratingMessage,
  onGenerateMessage,
}: Props) {
  const [internalMessage, setInternalMessage] = useState('');
  const commitMessage = externalMessage ?? internalMessage;
  const setCommitMessage = onCommitMessageChange ?? setInternalMessage;

  const [output, setOutput] = useState('');
  const [showDiff, setShowDiff] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [committing, setCommitting] = useState(false);
  const queryClient = useQueryClient();

  const runGit = useCallback(
    async (args: string) => {
      const result = await executeTerminalCommand(`git ${args}`, cwd);
      return result.output || result.error || '';
    },
    [cwd]
  );

  // Branch
  const { data: branch } = useQuery({
    queryKey: ['git-branch', cwd],
    queryFn: async () => {
      const result = await executeTerminalCommand('git branch --show-current', cwd);
      return (result.output || '').trim();
    },
    refetchInterval: 10_000,
  });

  // Status
  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ['git-status', cwd],
    queryFn: async () => {
      const result = await executeTerminalCommand('git status --porcelain', cwd);
      return result.output || '';
    },
    refetchInterval: 10_000,
  });

  const files = useMemo(() => parseStatus(statusData ?? ''), [statusData]);
  const stagedFiles = files.filter((f) => f.staged);
  const unstagedFiles = files.filter((f) => !f.staged);

  // Diff
  const { data: diffData } = useQuery({
    queryKey: ['git-diff', cwd],
    queryFn: async () => {
      const staged = await executeTerminalCommand('git diff --cached', cwd);
      const unstaged = await executeTerminalCommand('git diff', cwd);
      return { staged: staged.output || '', unstaged: unstaged.output || '' };
    },
    refetchInterval: 10_000,
    enabled: showDiff,
  });

  // Log
  const { data: logData } = useQuery({
    queryKey: ['git-log', cwd],
    queryFn: async () => {
      const result = await executeTerminalCommand('git log --oneline -10', cwd);
      return result.output || '';
    },
    refetchInterval: 30_000,
    enabled: showLog,
  });

  const handleStageFile = async (path: string) => {
    await runGit(`add "${path}"`);
    void refetchStatus();
    void queryClient.invalidateQueries({ queryKey: ['git-diff', cwd] });
  };

  const handleUnstageFile = async (path: string) => {
    await runGit(`restore --staged "${path}"`);
    void refetchStatus();
    void queryClient.invalidateQueries({ queryKey: ['git-diff', cwd] });
  };

  const handleStageAll = async () => {
    await runGit('add -A');
    void refetchStatus();
    void queryClient.invalidateQueries({ queryKey: ['git-diff', cwd] });
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setCommitting(true);
    const escaped = commitMessage.replace(/"/g, '\\"');
    const result = await runGit(`commit -m "${escaped}"`);
    setOutput(result);
    setCommitMessage('');
    setCommitting(false);
    void refetchStatus();
    void queryClient.invalidateQueries({ queryKey: ['git-log', cwd] });
    void queryClient.invalidateQueries({ queryKey: ['git-diff', cwd] });
  };

  const activeDiff = diffData?.staged || diffData?.unstaged || '';

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="git-panel">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b bg-muted/30 flex-shrink-0">
        <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Git</span>
        {branch && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">
            {branch}
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => {
            void refetchStatus();
            void queryClient.invalidateQueries({ queryKey: ['git-diff', cwd] });
            void queryClient.invalidateQueries({ queryKey: ['git-log', cwd] });
          }}
          className="text-muted-foreground hover:text-foreground p-0.5"
          title="Refresh"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Staged files */}
        <div className="px-3 pt-2 pb-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Staged ({stagedFiles.length})
            </span>
          </div>
          {stagedFiles.length === 0 && (
            <div className="text-[10px] text-muted-foreground/60 py-1">No staged changes</div>
          )}
          {stagedFiles.map((f) => (
            <div key={f.path} className="flex items-center gap-1 text-xs py-0.5 group">
              <button
                onClick={() => void handleUnstageFile(f.path)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                title="Unstage"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="text-green-500 font-mono text-[10px] w-4">{f.status.charAt(0)}</span>
              <span className="font-mono truncate text-[11px]">{f.path}</span>
            </div>
          ))}
        </div>

        {/* Unstaged files */}
        <div className="px-3 pt-1 pb-2 border-b">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Changes ({unstagedFiles.length})
            </span>
            {unstagedFiles.length > 0 && (
              <button
                onClick={() => void handleStageAll()}
                className="text-[10px] text-primary hover:underline"
              >
                Stage All
              </button>
            )}
          </div>
          {unstagedFiles.length === 0 && (
            <div className="text-[10px] text-muted-foreground/60 py-1">No unstaged changes</div>
          )}
          {unstagedFiles.map((f) => (
            <div key={f.path} className="flex items-center gap-1 text-xs py-0.5 group">
              <button
                onClick={() => void handleStageFile(f.path)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                title="Stage"
              >
                <Plus className="w-3 h-3" />
              </button>
              <span className="text-yellow-500 font-mono text-[10px] w-4">
                {f.status.charAt(0)}
              </span>
              <span className="font-mono truncate text-[11px]">{f.path}</span>
            </div>
          ))}
        </div>

        {/* Commit form */}
        <div className="px-3 py-2 border-b space-y-1.5">
          <div className="flex items-center gap-1">
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Commit message..."
              className="flex-1 bg-background border rounded px-2 py-1.5 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary min-h-[48px] max-h-[96px]"
              rows={2}
              data-testid="commit-message-input"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {onGenerateMessage && (
              <button
                onClick={onGenerateMessage}
                disabled={isGeneratingMessage || stagedFiles.length === 0}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border hover:bg-muted disabled:opacity-40"
                title="Generate commit message with AI"
                data-testid="generate-message-btn"
              >
                {isGeneratingMessage ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <span>✨</span>
                )}
                <span>Generate</span>
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={() => void handleCommit()}
              disabled={!commitMessage.trim() || committing}
              className="flex items-center gap-1 text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              data-testid="commit-btn"
            >
              {committing && <Loader2 className="w-3 h-3 animate-spin" />}
              Commit
            </button>
          </div>
        </div>

        {/* Diff section */}
        <div className="px-3 py-1.5">
          <button
            onClick={() => setShowDiff((v) => !v)}
            className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground"
          >
            {showDiff ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Diff
          </button>
          {showDiff && activeDiff && (
            <pre className="mt-1 rounded border p-2 bg-muted/30 font-mono text-[10px] max-h-[200px] overflow-auto whitespace-pre-wrap"
              data-testid="diff-output"
            >
              {activeDiff.split('\n').map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith('+') && !line.startsWith('+++')
                      ? 'text-green-500'
                      : line.startsWith('-') && !line.startsWith('---')
                        ? 'text-red-500'
                        : line.startsWith('@@')
                          ? 'text-blue-400'
                          : ''
                  }
                >
                  {line}
                </div>
              ))}
            </pre>
          )}
          {showDiff && !activeDiff && (
            <div className="text-[10px] text-muted-foreground/60 py-1 mt-1">No diff to show</div>
          )}
        </div>

        {/* Log section */}
        <div className="px-3 py-1.5">
          <button
            onClick={() => setShowLog((v) => !v)}
            className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground"
          >
            {showLog ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Log
          </button>
          {showLog && logData && (
            <pre className="mt-1 rounded border p-2 bg-muted/30 font-mono text-[10px] max-h-[120px] overflow-auto"
              data-testid="log-output"
            >
              {logData}
            </pre>
          )}
        </div>

        {/* Command output */}
        {output && (
          <div className="px-3 py-1.5">
            <pre className="rounded border p-2 bg-muted/30 font-mono text-[10px] max-h-[100px] overflow-auto">
              {output}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
