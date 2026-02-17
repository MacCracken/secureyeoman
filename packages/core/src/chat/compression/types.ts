/**
 * History Compression Types
 *
 * Types for the progressive 3-tier history compression system.
 */

export type CompressionTier = 'message' | 'topic' | 'bulk';

export interface HistoryEntry {
  id: string;
  conversationId: string;
  tier: CompressionTier;
  content: string;
  tokenCount: number;
  sequence: number;
  createdAt: number;
  sealedAt: number | null;
}

export interface TopicSummary {
  id: string;
  conversationId: string;
  content: string;
  tokenCount: number;
  messageCount: number;
  sequence: number;
  createdAt: number;
  sealedAt: number | null;
}

export interface BulkSummary {
  id: string;
  conversationId: string;
  content: string;
  tokenCount: number;
  topicCount: number;
  sequence: number;
  createdAt: number;
}

export interface CompressedContext {
  messages: HistoryEntry[];
  topics: HistoryEntry[];
  bulk: HistoryEntry[];
  totalTokens: number;
  tokenBudget: {
    messages: number;
    topics: number;
    bulk: number;
  };
}

export interface HistoryCompressorConfig {
  enabled: boolean;
  tiers: {
    messagePct: number;
    topicPct: number;
    bulkPct: number;
  };
  maxMessageChars: number;
  topicSummaryTokens: number;
  bulkSummaryTokens: number;
  bulkMergeSize: number;
  topicBoundary: {
    keywords: string[];
    silenceMinutes: number;
    tokenThreshold: number;
  };
  model: string | null;
}
