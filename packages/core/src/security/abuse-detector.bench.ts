/**
 * AbuseDetector Performance Benchmarks
 *
 * Session check at scale, eviction performance, signal recording.
 *
 * Run:  cd packages/core && npx vitest bench
 */

import { bench, describe } from 'vitest';
import { AbuseDetector } from './abuse-detector.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDetector(): AbuseDetector {
  const d = new AbuseDetector(
    {
      enabled: true,
      topicPivotThreshold: 0.3,
      blockedRetryLimit: 3,
      coolDownMs: 60_000,
      sessionTtlMs: 3_600_000,
    },
    () => {}
  );
  return d;
}

// ── Benchmarks ────────────────────────────────────────────────────────────────

describe('AbuseDetector.check — varying session counts', () => {
  bench('100 sessions', () => {
    const detector = makeDetector();
    for (let i = 0; i < 100; i++) {
      detector.recordMessage(`sess-${i}`, `message ${i}`);
    }
    for (let i = 0; i < 100; i++) {
      detector.check(`sess-${i}`);
    }
    detector.stop();
  });

  bench('1000 sessions', () => {
    const detector = makeDetector();
    for (let i = 0; i < 1000; i++) {
      detector.recordMessage(`sess-${i}`, `message ${i}`);
    }
    for (let i = 0; i < 1000; i++) {
      detector.check(`sess-${i}`);
    }
    detector.stop();
  });
});

describe('AbuseDetector.recordMessage — topic pivot detection', () => {
  bench('sequential messages (same topic)', () => {
    const detector = makeDetector();
    for (let i = 0; i < 50; i++) {
      detector.recordMessage('sess-1', 'tell me about security best practices for web apps');
    }
    detector.stop();
  });

  bench('pivoting messages (different topics)', () => {
    const detector = makeDetector();
    const topics = [
      'tell me about security',
      'what is the weather like',
      'help me write python code',
      'explain quantum physics',
      'describe cooking recipes',
    ];
    for (let i = 0; i < 50; i++) {
      detector.recordMessage('sess-1', topics[i % topics.length]!);
    }
    detector.stop();
  });
});

describe('AbuseDetector.recordBlock — threshold detection', () => {
  bench('record blocks up to threshold (100 sessions)', () => {
    const detector = makeDetector();
    for (let i = 0; i < 100; i++) {
      detector.recordBlock(`sess-${i}`);
      detector.recordBlock(`sess-${i}`);
    }
    detector.stop();
  });
});
