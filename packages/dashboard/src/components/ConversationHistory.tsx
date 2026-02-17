/**
 * ConversationHistory — Tiered view of compressed conversation history.
 * Shows messages (green), topics (blue), and bulk (gray) summaries.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare,
  BookOpen,
  Archive,
  Loader2,
  ChevronDown,
  ChevronRight,
  Scissors,
} from 'lucide-react';
import {
  fetchConversationHistory,
  sealConversationTopic,
  fetchCompressedContext,
  type HistoryEntry,
} from '../api/client';
import { sanitizeText } from '../utils/sanitize';

const TIER_CONFIG = {
  message: {
    label: 'Messages',
    color: 'border-green-500/30 bg-green-500/5',
    icon: MessageSquare,
    textColor: 'text-green-400',
  },
  topic: {
    label: 'Topics',
    color: 'border-blue-500/30 bg-blue-500/5',
    icon: BookOpen,
    textColor: 'text-blue-400',
  },
  bulk: {
    label: 'Bulk',
    color: 'border-gray-500/30 bg-gray-500/5',
    icon: Archive,
    textColor: 'text-gray-400',
  },
};

export function ConversationHistory({ conversationId }: { conversationId: string }) {
  const queryClient = useQueryClient();
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [showContext, setShowContext] = useState(false);

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['conversationHistory', conversationId],
    queryFn: () => fetchConversationHistory(conversationId),
    refetchInterval: 10000,
    enabled: !!conversationId,
  });

  const { data: contextData } = useQuery({
    queryKey: ['compressedContext', conversationId],
    queryFn: () => fetchCompressedContext(conversationId),
    enabled: showContext && !!conversationId,
  });

  const sealMutation = useMutation({
    mutationFn: () => sealConversationTopic(conversationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversationHistory', conversationId] });
    },
  });

  const entries = historyData?.entries ?? [];
  const messageEntries = entries.filter((e: HistoryEntry) => e.tier === 'message');
  const topicEntries = entries.filter((e: HistoryEntry) => e.tier === 'topic');
  const bulkEntries = entries.filter((e: HistoryEntry) => e.tier === 'bulk');

  const totalTokens = entries.reduce((sum: number, e: HistoryEntry) => sum + e.tokenCount, 0);

  const toggleExpanded = (id: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Token Budget Progress */}
      <div className="grid grid-cols-3 gap-2">
        {(['message', 'topic', 'bulk'] as const).map((tier) => {
          const tierEntries =
            tier === 'message' ? messageEntries : tier === 'topic' ? topicEntries : bulkEntries;
          const tokens = tierEntries.reduce(
            (sum: number, e: HistoryEntry) => sum + e.tokenCount,
            0
          );
          const config = TIER_CONFIG[tier];
          const Icon = config.icon;

          return (
            <div key={tier} className={`rounded-lg border p-2 ${config.color}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={`w-3 h-3 ${config.textColor}`} />
                <span className="text-xs font-medium">{config.label}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {tierEntries.length} entries / {tokens} tokens
              </div>
              <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${config.textColor.replace('text-', 'bg-')}`}
                  style={{
                    width: `${totalTokens > 0 ? Math.min(100, (tokens / totalTokens) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            sealMutation.mutate();
          }}
          disabled={sealMutation.isPending}
          className="flex items-center gap-1 text-xs px-2 py-1 bg-muted hover:bg-muted/80 rounded transition-colors"
        >
          <Scissors className="w-3 h-3" />
          {sealMutation.isPending ? 'Sealing...' : 'Seal Topic'}
        </button>
        <button
          onClick={() => {
            setShowContext(!showContext);
          }}
          className="flex items-center gap-1 text-xs px-2 py-1 bg-muted hover:bg-muted/80 rounded transition-colors"
        >
          {showContext ? 'Hide' : 'Show'} Context
        </button>
      </div>

      {/* Compressed Context View */}
      {showContext && contextData && (
        <div className="bg-muted/20 rounded-lg p-3 border text-xs space-y-2">
          <div className="font-medium">
            Compressed Context ({contextData.totalTokens ?? 0} tokens)
          </div>
          <div className="text-muted-foreground">
            Budget: msgs={contextData.tokenBudget?.messages ?? 0}, topics=
            {contextData.tokenBudget?.topics ?? 0}, bulk={contextData.tokenBudget?.bulk ?? 0}
          </div>
        </div>
      )}

      {/* Entries List */}
      <div className="space-y-1">
        {entries.map((entry: HistoryEntry) => {
          const config = TIER_CONFIG[entry.tier];
          const Icon = config.icon;
          const isExpanded = expandedEntries.has(entry.id);

          return (
            <div key={entry.id} className={`rounded border ${config.color}`}>
              <button
                onClick={() => {
                  toggleExpanded(entry.id);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                <Icon className={`w-3 h-3 ${config.textColor}`} />
                <span className="text-xs truncate flex-1">
                  {sanitizeText(entry.content.substring(0, 80))}
                </span>
                <span className="text-[10px] text-muted-foreground">{entry.tokenCount}t</span>
                {entry.sealedAt && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">
                    sealed
                  </span>
                )}
              </button>
              {isExpanded && (
                <div className="px-3 pb-2 text-xs whitespace-pre-wrap text-muted-foreground border-t border-muted/50 pt-2">
                  {sanitizeText(entry.content)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No history entries yet. Start a conversation to see compressed history.
        </p>
      )}
    </div>
  );
}
