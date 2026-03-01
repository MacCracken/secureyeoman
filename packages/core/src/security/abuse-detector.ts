/**
 * AbuseDetector — Rate-aware Adversarial Abuse Detection
 *
 * Tracks per-session signals that indicate adversarial behaviour:
 *  1. Blocked-message retry rate — repeated re-submissions after a block
 *  2. Topic-pivot rate         — rapid topic switching (often used to bypass checks)
 *  3. Tool-call anomaly        — sudden spike in diversity of tool calls per turn
 *
 * When a configurable threshold is exceeded the session enters a cool-down
 * period and a `suspicious_pattern` event is written to the audit chain.
 *
 * All state is in-memory with TTL eviction; no DB writes.
 *
 * ADR 158.
 */

import type { SecurityConfig } from '@secureyeoman/shared';

// ─── Public types ─────────────────────────────────────────────────────────────

export type AbuseSignal = 'blocked_retry' | 'topic_pivot' | 'tool_anomaly';

export interface AbuseCheckResult {
  /** True if the session is currently in cool-down. */
  inCoolDown: boolean;
  /** ISO timestamp when the cool-down expires. null when not in cool-down. */
  coolDownUntil: string | null;
  /** The signal that most recently triggered the cool-down, if any. */
  triggeringSignal: AbuseSignal | null;
}

// ─── Internal session record ──────────────────────────────────────────────────

interface SessionRecord {
  blockedRetries: number;
  lastWords: string[]; // word-set from the previous message (for pivot detection)
  lastSeenMs: number;
  coolDownUntilMs: number; // 0 = not cooling down
  triggeringSignal: AbuseSignal | null;
}

// ─── AbuseDetector ────────────────────────────────────────────────────────────

export type AuditRecordFn = (params: {
  event: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
}) => void | Promise<void>;

export class AbuseDetector {
  private readonly cfg: SecurityConfig['abuseDetection'];
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly auditRecord: AuditRecordFn;

  constructor(cfg: SecurityConfig['abuseDetection'], auditRecord: AuditRecordFn) {
    this.cfg = cfg;
    this.auditRecord = auditRecord;
  }

  /**
   * Check whether the given session is currently in a cool-down.
   * Call this at the top of the chat handler — before any LLM work — to
   * gate access. Evicts stale sessions as a side-effect.
   */
  check(sessionId: string): AbuseCheckResult {
    if (!this.cfg?.enabled) {
      return { inCoolDown: false, coolDownUntil: null, triggeringSignal: null };
    }
    this.evictStale();
    const rec = this.sessions.get(sessionId);
    if (!rec) {
      return { inCoolDown: false, coolDownUntil: null, triggeringSignal: null };
    }
    const now = Date.now();
    if (rec.coolDownUntilMs > now) {
      return {
        inCoolDown: true,
        coolDownUntil: new Date(rec.coolDownUntilMs).toISOString(),
        triggeringSignal: rec.triggeringSignal,
      };
    }
    return { inCoolDown: false, coolDownUntil: null, triggeringSignal: null };
  }

  /**
   * Record a blocked message for this session.
   * Call after input validation returns blocked=true.
   */
  recordBlock(sessionId: string): void {
    if (!this.cfg?.enabled) return;
    const rec = this.getOrCreate(sessionId);
    rec.blockedRetries += 1;
    if (rec.blockedRetries >= this.cfg.blockedRetryLimit) {
      this.triggerCoolDown(sessionId, rec, 'blocked_retry');
    }
  }

  /**
   * Record a user message and detect topic-pivot anomaly.
   * @param sessionId - session identifier (userId + conversationId recommended)
   * @param messageText - raw user message text
   */
  recordMessage(sessionId: string, messageText: string): void {
    if (!this.cfg?.enabled) return;
    const rec = this.getOrCreate(sessionId);
    const now = Date.now();

    const currentWords = tokenize(messageText);

    if (rec.lastWords.length > 0) {
      const overlapRatio = jaccardOverlap(rec.lastWords, currentWords);
      if (overlapRatio < this.cfg.topicPivotThreshold) {
        // Low overlap → topic has pivoted significantly
        // Only flag if repeated; increment a counter tracked in blockedRetries repurposed below
        // We use a lightweight heuristic: two consecutive pivots within a session = anomaly
        const pivotKey = `${sessionId}:pivots`;
        const pivotRec = this.sessions.get(pivotKey) ?? {
          blockedRetries: 0,
          lastWords: [],
          lastSeenMs: now,
          coolDownUntilMs: 0,
          triggeringSignal: null,
        };
        pivotRec.blockedRetries += 1;
        pivotRec.lastSeenMs = now;
        this.sessions.set(pivotKey, pivotRec);
        if (pivotRec.blockedRetries >= this.cfg.blockedRetryLimit) {
          this.triggerCoolDown(sessionId, rec, 'topic_pivot');
          this.sessions.delete(pivotKey);
        }
      } else {
        // Topic consistent — reset pivot counter
        this.sessions.delete(`${sessionId}:pivots`);
      }
    }

    rec.lastWords = currentWords;
    rec.lastSeenMs = now;
  }

  /**
   * Record tool call diversity for a turn.
   * A sudden spike (> 5 unique tool names in one turn when ≤1 was typical)
   * is flagged as a tool anomaly.
   * @param sessionId - session identifier
   * @param toolNames - array of tool names called in this turn
   */
  recordToolCalls(sessionId: string, toolNames: string[]): void {
    if (!this.cfg?.enabled) return;
    if (toolNames.length <= 5) return; // only flag clear spikes
    const unique = new Set(toolNames).size;
    if (unique > 5) {
      const rec = this.getOrCreate(sessionId);
      this.triggerCoolDown(sessionId, rec, 'tool_anomaly');
    }
  }

  // ─── Internals ───────────────────────────────────────────────────────────────

  private getOrCreate(sessionId: string): SessionRecord {
    let rec = this.sessions.get(sessionId);
    if (!rec) {
      rec = {
        blockedRetries: 0,
        lastWords: [],
        lastSeenMs: Date.now(),
        coolDownUntilMs: 0,
        triggeringSignal: null,
      };
      this.sessions.set(sessionId, rec);
    }
    rec.lastSeenMs = Date.now();
    return rec;
  }

  private triggerCoolDown(sessionId: string, rec: SessionRecord, signal: AbuseSignal): void {
    const now = Date.now();
    rec.coolDownUntilMs = now + this.cfg.coolDownMs;
    rec.triggeringSignal = signal;
    rec.blockedRetries = 0; // reset counter after cool-down trigger

    void this.auditRecord({
      event: 'suspicious_pattern',
      level: 'warn',
      message: `Abuse pattern detected: ${signal}`,
      metadata: {
        sessionId,
        signal,
        coolDownUntil: new Date(rec.coolDownUntilMs).toISOString(),
      },
    });
  }

  /** Remove records that have been idle longer than sessionTtlMs. */
  private evictStale(): void {
    const cutoff = Date.now() - this.cfg.sessionTtlMs;
    for (const [key, rec] of this.sessions) {
      if (rec.lastSeenMs < cutoff) this.sessions.delete(key);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Jaccard overlap: |A ∩ B| / |A ∪ B|. Returns 0 when both sets are empty. */
function jaccardOverlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
