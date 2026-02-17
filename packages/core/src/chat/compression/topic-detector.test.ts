/**
 * Topic Boundary Detector Tests
 */

import { describe, it, expect } from 'vitest';
import {
  isTopicBoundary,
  type TopicBoundaryConfig,
  type BoundaryCheckInput,
} from './topic-detector.js';

const config: TopicBoundaryConfig = {
  keywords: ['new topic', "let's move on", 'moving on', 'anyway', 'switching to'],
  silenceMinutes: 15,
  tokenThreshold: 2000,
};

describe('isTopicBoundary', () => {
  describe('keyword detection', () => {
    it('detects "new topic" keyword', () => {
      const result = isTopicBoundary(
        {
          content: 'Okay, new topic — what about deployment?',
          timestamp: 1000,
          currentTopicTokens: 0,
        },
        config
      );
      expect(result.isBoundary).toBe(true);
      expect(result.reason).toBe('keyword');
      expect(result.matchedKeyword).toBe('new topic');
    });

    it('detects "let\'s move on" keyword', () => {
      const result = isTopicBoundary(
        { content: "Let's move on to the next item", timestamp: 1000, currentTopicTokens: 0 },
        config
      );
      expect(result.isBoundary).toBe(true);
      expect(result.reason).toBe('keyword');
    });

    it('detects keywords case-insensitively', () => {
      const result = isTopicBoundary(
        { content: 'SWITCHING TO a different topic', timestamp: 1000, currentTopicTokens: 0 },
        config
      );
      expect(result.isBoundary).toBe(true);
      expect(result.matchedKeyword).toBe('switching to');
    });

    it('does not detect absent keywords', () => {
      const result = isTopicBoundary(
        {
          content: 'This is just a normal message about code',
          timestamp: 1000,
          currentTopicTokens: 0,
        },
        config
      );
      expect(result.isBoundary).toBe(false);
    });
  });

  describe('temporal gap detection', () => {
    it('detects gap exceeding threshold', () => {
      const prevTimestamp = 1000;
      const timestamp = prevTimestamp + 16 * 60 * 1000; // 16 minutes later

      const result = isTopicBoundary(
        {
          content: 'Hello again',
          timestamp,
          previousTimestamp: prevTimestamp,
          currentTopicTokens: 0,
        },
        config
      );
      expect(result.isBoundary).toBe(true);
      expect(result.reason).toBe('gap');
    });

    it('does not trigger for short gaps', () => {
      const prevTimestamp = 1000;
      const timestamp = prevTimestamp + 5 * 60 * 1000; // 5 minutes

      const result = isTopicBoundary(
        {
          content: 'Quick follow-up',
          timestamp,
          previousTimestamp: prevTimestamp,
          currentTopicTokens: 0,
        },
        config
      );
      expect(result.isBoundary).toBe(false);
    });

    it('ignores gap when no previous timestamp', () => {
      const result = isTopicBoundary(
        { content: 'First message', timestamp: Date.now(), currentTopicTokens: 0 },
        config
      );
      expect(result.isBoundary).toBe(false);
    });

    it('detects gap exactly at threshold', () => {
      const prevTimestamp = 1000;
      const timestamp = prevTimestamp + 15 * 60 * 1000; // exactly 15 minutes

      const result = isTopicBoundary(
        { content: 'Hi', timestamp, previousTimestamp: prevTimestamp, currentTopicTokens: 0 },
        config
      );
      expect(result.isBoundary).toBe(true);
      expect(result.reason).toBe('gap');
    });
  });

  describe('token threshold detection', () => {
    it('detects when token threshold exceeded', () => {
      const result = isTopicBoundary(
        { content: 'Another message', timestamp: 1000, currentTopicTokens: 2500 },
        config
      );
      expect(result.isBoundary).toBe(true);
      expect(result.reason).toBe('threshold');
    });

    it('detects at exact threshold', () => {
      const result = isTopicBoundary(
        { content: 'Message', timestamp: 1000, currentTopicTokens: 2000 },
        config
      );
      expect(result.isBoundary).toBe(true);
      expect(result.reason).toBe('threshold');
    });

    it('does not trigger below threshold', () => {
      const result = isTopicBoundary(
        { content: 'Short', timestamp: 1000, currentTopicTokens: 500 },
        config
      );
      expect(result.isBoundary).toBe(false);
    });
  });

  describe('priority ordering', () => {
    it('keyword takes precedence over gap and threshold', () => {
      const result = isTopicBoundary(
        {
          content: 'Moving on now',
          timestamp: 1000 + 20 * 60 * 1000,
          previousTimestamp: 1000,
          currentTopicTokens: 5000,
        },
        config
      );
      expect(result.reason).toBe('keyword');
    });

    it('gap takes precedence over threshold', () => {
      const result = isTopicBoundary(
        {
          content: 'Hello',
          timestamp: 1000 + 20 * 60 * 1000,
          previousTimestamp: 1000,
          currentTopicTokens: 5000,
        },
        config
      );
      expect(result.reason).toBe('gap');
    });
  });

  describe('default config', () => {
    it('works without explicit config', () => {
      const result = isTopicBoundary({
        content: "Let's move on",
        timestamp: 1000,
        currentTopicTokens: 0,
      });
      expect(result.isBoundary).toBe(true);
    });
  });
});
