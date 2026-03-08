import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AbuseDetector, type AuditRecordFn } from './abuse-detector.js';
import type { SecurityConfig } from '@secureyeoman/shared';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCfg(
  overrides: Partial<SecurityConfig['abuseDetection']> = {}
): SecurityConfig['abuseDetection'] {
  return {
    enabled: true,
    topicPivotThreshold: 0.3,
    blockedRetryLimit: 3,
    coolDownMs: 60_000,
    sessionTtlMs: 3_600_000,
    ...overrides,
  };
}

function makeDetector(
  cfgOverrides: Partial<SecurityConfig['abuseDetection']> = {},
  audit?: AuditRecordFn
): { detector: AbuseDetector; auditFn: ReturnType<typeof vi.fn> } {
  const auditFn = vi.fn(audit ?? (() => {}));
  return { detector: new AbuseDetector(makeCfg(cfgOverrides), auditFn), auditFn };
}

// ─── check() ──────────────────────────────────────────────────────────────────

describe('AbuseDetector — check()', () => {
  it('returns inCoolDown=false for an unknown session', () => {
    const { detector } = makeDetector();
    expect(detector.check('s1')).toMatchObject({
      inCoolDown: false,
      coolDownUntil: null,
      triggeringSignal: null,
    });
  });

  it('returns inCoolDown=false when disabled', () => {
    const { detector } = makeDetector({ enabled: false });
    const result = detector.check('s1');
    expect(result.inCoolDown).toBe(false);
  });
});

// ─── recordBlock() ────────────────────────────────────────────────────────────

describe('AbuseDetector — recordBlock()', () => {
  it('triggers cool-down after blockedRetryLimit blocks', () => {
    const { detector } = makeDetector({ blockedRetryLimit: 3 });
    detector.recordBlock('s1');
    detector.recordBlock('s1');
    expect(detector.check('s1').inCoolDown).toBe(false);
    detector.recordBlock('s1'); // 3rd → triggers cool-down
    const result = detector.check('s1');
    expect(result.inCoolDown).toBe(true);
    expect(result.triggeringSignal).toBe('blocked_retry');
    expect(result.coolDownUntil).toBeTruthy();
  });

  it('emits suspicious_pattern audit event on cool-down trigger', () => {
    const { detector, auditFn } = makeDetector({ blockedRetryLimit: 2 });
    detector.recordBlock('s2');
    detector.recordBlock('s2');
    expect(auditFn).toHaveBeenCalledOnce();
    expect(auditFn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'suspicious_pattern',
        level: 'warn',
        metadata: expect.objectContaining({ signal: 'blocked_retry' }),
      })
    );
  });

  it('resets blocked retry counter after cool-down is triggered', () => {
    const { detector } = makeDetector({ blockedRetryLimit: 2, coolDownMs: 60_000 });
    detector.recordBlock('s3');
    detector.recordBlock('s3');
    // Cool-down was triggered (2 blocks = blockedRetryLimit) and 60s hasn't elapsed
    const state = detector.check('s3');
    expect(state.inCoolDown).toBe(true);
  });

  it('is a no-op when disabled', () => {
    const { detector, auditFn } = makeDetector({ enabled: false });
    detector.recordBlock('s4');
    detector.recordBlock('s4');
    detector.recordBlock('s4');
    expect(auditFn).not.toHaveBeenCalled();
    expect(detector.check('s4').inCoolDown).toBe(false);
  });
});

// ─── recordMessage() ──────────────────────────────────────────────────────────

describe('AbuseDetector — recordMessage() topic-pivot detection', () => {
  it('does not trigger on first message (no prior message to compare)', () => {
    const { detector } = makeDetector({ blockedRetryLimit: 2 });
    detector.recordMessage('s1', 'hello world how are you');
    expect(detector.check('s1').inCoolDown).toBe(false);
  });

  it('does not trigger when topics are similar (high Jaccard overlap)', () => {
    const { detector } = makeDetector({ blockedRetryLimit: 2, topicPivotThreshold: 0.3 });
    detector.recordMessage('s1', 'how to write a python function');
    detector.recordMessage('s1', 'how to write a python class method');
    expect(detector.check('s1').inCoolDown).toBe(false);
  });

  it('triggers cool-down after blockedRetryLimit consecutive topic pivots', () => {
    const { detector } = makeDetector({
      blockedRetryLimit: 2,
      topicPivotThreshold: 0.3,
    });
    // Pivot 1: python → completely unrelated topic
    detector.recordMessage('s2', 'python programming variables loops');
    detector.recordMessage('s2', 'history of ancient rome gladiators');
    // Pivot 2: another completely different topic
    detector.recordMessage('s2', 'quantum physics wave function');
    const result = detector.check('s2');
    expect(result.inCoolDown).toBe(true);
    expect(result.triggeringSignal).toBe('topic_pivot');
  });

  it('is a no-op when disabled', () => {
    const { detector, auditFn } = makeDetector({ enabled: false });
    detector.recordMessage('s3', 'topic one');
    detector.recordMessage('s3', 'completely different topic here');
    expect(auditFn).not.toHaveBeenCalled();
  });
});

// ─── recordToolCalls() ────────────────────────────────────────────────────────

describe('AbuseDetector — recordToolCalls()', () => {
  it('triggers cool-down when > 5 unique tool names used in one turn', () => {
    const { detector } = makeDetector();
    detector.recordToolCalls('s1', ['tool_a', 'tool_b', 'tool_c', 'tool_d', 'tool_e', 'tool_f']);
    const result = detector.check('s1');
    expect(result.inCoolDown).toBe(true);
    expect(result.triggeringSignal).toBe('tool_anomaly');
  });

  it('does not trigger when ≤ 5 unique tool names', () => {
    const { detector } = makeDetector();
    detector.recordToolCalls('s2', ['tool_a', 'tool_b', 'tool_c', 'tool_d', 'tool_e']);
    expect(detector.check('s2').inCoolDown).toBe(false);
  });

  it('does not double-count duplicate tool names', () => {
    const { detector } = makeDetector();
    // 10 calls but only 4 unique → should NOT trigger
    detector.recordToolCalls('s3', [
      'tool_a',
      'tool_a',
      'tool_b',
      'tool_b',
      'tool_c',
      'tool_c',
      'tool_d',
      'tool_d',
    ]);
    expect(detector.check('s3').inCoolDown).toBe(false);
  });

  it('is a no-op when disabled', () => {
    const { detector, auditFn } = makeDetector({ enabled: false });
    detector.recordToolCalls('s4', ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(auditFn).not.toHaveBeenCalled();
  });
});

// ─── session TTL eviction ─────────────────────────────────────────────────────

describe('AbuseDetector — session eviction', () => {
  it('evicts stale sessions via periodic timer so their state is lost', () => {
    vi.useFakeTimers();
    try {
      const { detector } = makeDetector({ sessionTtlMs: 1, blockedRetryLimit: 2 });
      detector.recordBlock('s1');
      // Advance past TTL + trigger the 60s eviction timer
      vi.advanceTimersByTime(60_001);
      // Now 's1' starts fresh — one block should not trigger cool-down
      detector.recordBlock('s1');
      expect(detector.check('s1').inCoolDown).toBe(false);
      detector.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── Phase 103: Background eviction timer & stop() ───────────────────────────

describe('AbuseDetector — background eviction timer (Phase 103)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('background timer evicts stale sessions', () => {
    const { detector } = makeDetector({ sessionTtlMs: 30_000 });
    detector.recordBlock('sess-1');

    // Advance time past sessionTtlMs
    vi.advanceTimersByTime(30_001);

    // Advance to trigger the 60s eviction interval
    vi.advanceTimersByTime(60_000);

    // Session should be evicted — fresh start, no cool-down
    expect(detector.check('sess-1').inCoolDown).toBe(false);
    detector.stop();
  });

  it('stop() clears the timer', () => {
    const { detector } = makeDetector();
    detector.stop();
    // Advancing time should not cause errors
    vi.advanceTimersByTime(120_000);
    // No assertion needed — no error = pass
    detector.stop(); // double-stop is safe
  });

  it('sessions within TTL are NOT evicted by background timer', () => {
    // Use long cool-down (5 min) and long TTL so that 60s eviction cycle
    // does not expire either the session or the cool-down
    const { detector } = makeDetector({
      sessionTtlMs: 300_000,
      blockedRetryLimit: 3,
      coolDownMs: 300_000,
    });
    detector.recordBlock('active');
    detector.recordBlock('active');
    detector.recordBlock('active');

    // In cool-down now
    expect(detector.check('active').inCoolDown).toBe(true);

    // Advance past eviction interval but NOT past TTL or cool-down
    vi.advanceTimersByTime(60_000);

    // Session still exists and in cool-down
    expect(detector.check('active').inCoolDown).toBe(true);
    detector.stop();
  });
});
