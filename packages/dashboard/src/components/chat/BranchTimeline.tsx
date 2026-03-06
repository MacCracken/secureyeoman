/**
 * BranchTimeline — Chronological view of when branches were created.
 *
 * Shows a vertical timeline with branch creation points, model used,
 * quality scores, and branch depth indicators.
 */

import { useMemo } from 'react';
import { Clock, GitBranch, MessageSquare } from 'lucide-react';
import type { BranchTreeNode } from '../../types';

interface BranchTimelineProps {
  tree: BranchTreeNode | null;
  activeConversationId: string | null;
  onNavigate: (conversationId: string) => void;
}

interface TimelineEntry {
  id: string;
  title: string;
  depth: number;
  messageCount: number;
  qualityScore: number | null;
  model: string | null;
  branchLabel: string | null;
  forkMessageIndex: number | null;
  isRoot: boolean;
}

function collectEntries(
  node: BranchTreeNode,
  depth: number,
  isRoot: boolean,
  entries: TimelineEntry[]
): void {
  entries.push({
    id: node.conversationId,
    title: node.title,
    depth,
    messageCount: node.messageCount,
    qualityScore: node.qualityScore,
    model: node.model,
    branchLabel: node.branchLabel,
    forkMessageIndex: node.forkMessageIndex,
    isRoot,
  });
  for (const child of node.children) {
    collectEntries(child, depth + 1, false, entries);
  }
}

const DEPTH_COLORS = [
  'border-blue-500 bg-blue-500',
  'border-purple-500 bg-purple-500',
  'border-cyan-500 bg-cyan-500',
  'border-amber-500 bg-amber-500',
  'border-emerald-500 bg-emerald-500',
  'border-rose-500 bg-rose-500',
];

function qualityColor(score: number | null): string {
  if (score == null) return 'text-muted-foreground';
  if (score >= 0.8) return 'text-green-400';
  if (score >= 0.6) return 'text-blue-400';
  if (score >= 0.4) return 'text-yellow-400';
  if (score >= 0.2) return 'text-orange-400';
  return 'text-red-400';
}

export function BranchTimeline({ tree, activeConversationId, onNavigate }: BranchTimelineProps) {
  const entries = useMemo(() => {
    if (!tree) return [];
    const result: TimelineEntry[] = [];
    collectEntries(tree, 0, true, result);
    return result;
  }, [tree]);

  if (entries.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground" data-testid="branch-timeline-empty">
        No branches to display
      </div>
    );
  }

  return (
    <div className="space-y-0 p-4" data-testid="branch-timeline">
      {entries.map((entry, i) => {
        const isActive = entry.id === activeConversationId;
        const depthColor = DEPTH_COLORS[entry.depth % DEPTH_COLORS.length]!;
        const isLast = i === entries.length - 1;

        return (
          <div key={entry.id} className="flex gap-3" data-testid={`timeline-entry-${i}`}>
            {/* Timeline connector */}
            <div className="flex flex-col items-center w-5">
              <div className={`w-3 h-3 rounded-full border-2 shrink-0 ${depthColor}`} />
              {!isLast && <div className="w-0.5 flex-1 bg-border" />}
            </div>

            {/* Content */}
            <button
              onClick={() => onNavigate(entry.id)}
              className={`flex-1 text-left border rounded-lg p-2.5 mb-2 transition-colors hover:bg-accent/50 ${
                isActive ? 'ring-2 ring-primary bg-primary/5' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {entry.isRoot ? (
                    <Clock className="w-3 h-3 text-muted-foreground" />
                  ) : (
                    <GitBranch className="w-3 h-3 text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium truncate max-w-[180px]">
                    {entry.title}
                  </span>
                </div>
                {entry.qualityScore != null && (
                  <span
                    className={`text-[10px] font-mono font-bold ${qualityColor(entry.qualityScore)}`}
                    data-testid={`quality-${i}`}
                  >
                    {entry.qualityScore.toFixed(3)}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <MessageSquare className="w-2.5 h-2.5" />
                  {entry.messageCount}
                </span>
                {entry.model && (
                  <span className="px-1 py-0.5 rounded bg-muted font-mono truncate max-w-[100px]">
                    {entry.model}
                  </span>
                )}
                {entry.branchLabel && (
                  <span className="px-1 py-0.5 rounded bg-primary/10 text-primary truncate max-w-[80px]">
                    {entry.branchLabel}
                  </span>
                )}
                {entry.forkMessageIndex != null && (
                  <span>forked @ msg {entry.forkMessageIndex}</span>
                )}
                <span className="ml-auto">depth {entry.depth}</span>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
