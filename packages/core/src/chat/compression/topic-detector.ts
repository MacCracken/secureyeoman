/**
 * Topic Boundary Detector
 *
 * Detects topic boundaries in conversation history using:
 * 1. Explicit keywords ("new topic", "let's move on", etc.)
 * 2. Temporal gaps (silence exceeding threshold)
 * 3. Token count thresholds
 */

export interface TopicBoundaryConfig {
  keywords: string[];
  silenceMinutes: number;
  tokenThreshold: number;
}

const DEFAULT_CONFIG: TopicBoundaryConfig = {
  keywords: ['new topic', "let's move on", 'moving on', 'anyway', 'switching to'],
  silenceMinutes: 15,
  tokenThreshold: 2000,
};

export interface BoundaryCheckInput {
  content: string;
  timestamp: number;
  previousTimestamp?: number;
  currentTopicTokens: number;
}

export interface BoundaryCheckResult {
  isBoundary: boolean;
  reason?: 'keyword' | 'gap' | 'threshold';
  matchedKeyword?: string;
}

/**
 * Check if the given message represents a topic boundary.
 */
export function isTopicBoundary(
  input: BoundaryCheckInput,
  config: TopicBoundaryConfig = DEFAULT_CONFIG
): BoundaryCheckResult {
  const contentLower = input.content.toLowerCase();

  // Check keywords
  for (const keyword of config.keywords) {
    if (contentLower.includes(keyword.toLowerCase())) {
      return { isBoundary: true, reason: 'keyword', matchedKeyword: keyword };
    }
  }

  // Check temporal gap
  if (input.previousTimestamp) {
    const gapMs = input.timestamp - input.previousTimestamp;
    const gapMinutes = gapMs / 60000;
    if (gapMinutes >= config.silenceMinutes) {
      return { isBoundary: true, reason: 'gap' };
    }
  }

  // Check token threshold
  if (input.currentTopicTokens >= config.tokenThreshold) {
    return { isBoundary: true, reason: 'threshold' };
  }

  return { isBoundary: false };
}
