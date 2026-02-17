/**
 * History Compression Module — Progressive 3-tier conversation compression.
 */

export type {
  CompressionTier,
  HistoryEntry,
  TopicSummary,
  BulkSummary,
  CompressedContext,
  HistoryCompressorConfig,
} from './types.js';

export { CompressionStorage } from './storage.js';
export { HistoryCompressor, type HistoryCompressorDeps } from './compressor.js';
export {
  isTopicBoundary,
  type TopicBoundaryConfig,
  type BoundaryCheckInput,
  type BoundaryCheckResult,
} from './topic-detector.js';
export { countTokens, countMessageTokens, clearTokenCache } from './token-counter.js';
export { summarizeTopic, summarizeBulk, type SummarizerDeps } from './summarizer.js';
