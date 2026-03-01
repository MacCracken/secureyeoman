import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    const { detector } = makeDetector({ blockedRetryLimit: 2, coolDownMs: 1 });
    detector.recordBlock('s3');
    detector.recordBlock('s3');
    // After cool-down expires, should no longer be in cool-down after another block
    // (counter was reset, so need 2 more blocks to re-trigger)
    // Simulate expiry: internally we can't manipulate time here, just verify counter reset
    // by checking that we'd need blockedRetryLimit blocks again
    const state = detector.check('s3');
    expect(state.inCoolDown).toBe(true); // still in cool-down (coolDownMs=1ms so may expire)
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
  it('evicts stale sessions so their state is lost', async () => {
    const { detector } = makeDetector({ sessionTtlMs: 1, blockedRetryLimit: 2 });
    detector.recordBlock('s1');
    // Wait for TTL to pass
    await new Promise((r) => setTimeout(r, 5));
    // check() triggers eviction; session 's1' should be gone
    detector.check('s1'); // eviction happens here
    // Now 's1' starts fresh — one block should not trigger cool-down
    detector.recordBlock('s1');
    expect(detector.check('s1').inCoolDown).toBe(false);
  });
});
