import { useQuery } from '@tanstack/react-query';
import { X, Trophy, Minus } from 'lucide-react';
import { fetchConversation } from '../../api/client';
import type { ConversationDetail } from '../../types';

interface ReplayDiffViewProps {
  sourceId: string;
  replayId: string;
  pairwiseWinner?: 'source' | 'replay' | 'tie' | null;
  sourceQualityScore?: number | null;
  replayQualityScore?: number | null;
  onClose: () => void;
}

function WinnerBadge({ winner }: { winner: 'source' | 'replay' | 'tie' | null | undefined }) {
  if (!winner) return null;
  const colors: Record<string, string> = {
    source: 'bg-blue-500/15 text-blue-500',
    replay: 'bg-green-500/15 text-green-500',
    tie: 'bg-yellow-500/15 text-yellow-500',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${colors[winner]}`}
      data-testid="winner-badge"
    >
      {winner === 'tie' ? <Minus className="w-3 h-3" /> : <Trophy className="w-3 h-3" />}
      {winner === 'tie' ? 'Tie' : `${winner.charAt(0).toUpperCase()}${winner.slice(1)} wins`}
    </span>
  );
}

export function ReplayDiffView({
  sourceId,
  replayId,
  pairwiseWinner,
  sourceQualityScore,
  replayQualityScore,
  onClose,
}: ReplayDiffViewProps) {
  const { data: sourceConv } = useQuery<ConversationDetail>({
    queryKey: ['conversation', sourceId],
    queryFn: () => fetchConversation(sourceId),
  });

  const { data: replayConv } = useQuery<ConversationDetail>({
    queryKey: ['conversation', replayId],
    queryFn: () => fetchConversation(replayId),
  });

  const sourceMessages = sourceConv?.messages ?? [];
  const replayMessages = replayConv?.messages ?? [];

  // Pair up messages: user messages appear once spanning both columns
  const pairs: {
    type: 'user' | 'assistant';
    sourceContent?: string;
    replayContent?: string;
    userContent?: string;
  }[] = [];

  let si = 0;
  let ri = 0;
  while (si < sourceMessages.length || ri < replayMessages.length) {
    const sm = sourceMessages[si];
    const rm = replayMessages[ri];

    if (sm?.role === 'user') {
      pairs.push({ type: 'user', userContent: sm.content });
      si++;
      if (rm?.role === 'user') ri++; // skip matching user msg in replay
    } else if (rm?.role === 'user') {
      pairs.push({ type: 'user', userContent: rm.content });
      ri++;
    } else {
      pairs.push({
        type: 'assistant',
        sourceContent: sm?.content,
        replayContent: rm?.content,
      });
      if (sm) si++;
      if (rm) ri++;
    }
  }

  return (
    <div className="flex flex-col h-full border-l bg-card" data-testid="replay-diff-view">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Replay Comparison</h3>
          <WinnerBadge winner={pairwiseWinner} />
        </div>
        <button onClick={onClose} className="btn-ghost p-1 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-2 border-b text-xs font-medium">
        <div className="px-4 py-2 border-r flex items-center justify-between">
          <span>Source: {sourceConv?.title ?? 'Loading...'}</span>
          {sourceQualityScore != null && (
            <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {sourceQualityScore.toFixed(2)}
            </span>
          )}
        </div>
        <div className="px-4 py-2 flex items-center justify-between">
          <span>Replay: {replayConv?.title ?? 'Loading...'}</span>
          {replayQualityScore != null && (
            <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {replayQualityScore.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {pairs.map((pair, i) => {
          if (pair.type === 'user') {
            return (
              <div
                key={i}
                className="px-4 py-3 border-b bg-primary/5 text-sm"
                data-testid={`diff-user-${i}`}
              >
                <span className="text-xs font-medium text-muted-foreground">User</span>
                <p className="mt-1">{pair.userContent}</p>
              </div>
            );
          }
          return (
            <div
              key={i}
              className="grid grid-cols-2 border-b text-sm"
              data-testid={`diff-assistant-${i}`}
            >
              <div className="px-4 py-3 border-r">
                {pair.sourceContent ?? (
                  <span className="text-muted-foreground italic">No response</span>
                )}
              </div>
              <div className="px-4 py-3">
                {pair.replayContent ?? (
                  <span className="text-muted-foreground italic">No response</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
