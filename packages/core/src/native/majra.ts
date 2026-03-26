/**
 * Majra Pub/Sub — TypeScript wrapper for the Rust NAPI bindings.
 *
 * Provides an in-process event bus with MQTT-style wildcard topic matching.
 * Falls back to a simple in-memory implementation when native module is unavailable.
 */

import { native } from './index.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TopicMessage {
  topic: string;
  payload: unknown;
  timestamp: string;
}

export type MessageHandler = (message: TopicMessage) => void;

// ── Pattern Matching ───────────────────────────────────────────────────────

/**
 * Test whether a wildcard pattern matches a concrete topic.
 * `*` matches exactly one segment, `#` matches zero or more trailing segments.
 *
 * Falls back to a JS implementation when native is unavailable.
 */
export function matchesPattern(pattern: string, topic: string): boolean {
  if (native?.majraMatchesPattern) {
    return native.majraMatchesPattern(pattern, topic);
  }
  return matchesPatternJS(pattern, topic);
}

// ── Publish ────────────────────────────────────────────────────────────────

/**
 * Publish a payload to a concrete topic.
 * Returns the number of subscriptions the message was delivered to.
 */
export function publish(topic: string, payload: unknown): number {
  if (native?.majraPublish) {
    return native.majraPublish(topic, JSON.stringify(payload));
  }
  return publishJS(topic, payload);
}

// ── Subscribe ──────────────────────────────────────────────────────────────

/**
 * Subscribe to a wildcard pattern. The handler is called for each matching message.
 */
export function subscribe(pattern: string, handler: MessageHandler): void {
  if (native?.majraSubscribe) {
    native.majraSubscribe(pattern, (json: string) => {
      try {
        const msg = JSON.parse(json) as TopicMessage;
        handler(msg);
      } catch {
        // Malformed message — skip
      }
    });
    return;
  }
  subscribeJS(pattern, handler);
}

// ── Unsubscribe ────────────────────────────────────────────────────────────

/**
 * Remove all subscriptions for a pattern.
 */
export function unsubscribeAll(pattern: string): void {
  if (native?.majraUnsubscribeAll) {
    native.majraUnsubscribeAll(pattern);
    return;
  }
  jsSubs.delete(pattern);
}

// ── Stats ──────────────────────────────────────────────────────────────────

export function patternCount(): number {
  return native?.majraPatternCount?.() ?? jsSubs.size;
}

export function messagesPublished(): number {
  return native?.majraMessagesPublished?.() ?? jsPublishCount;
}

export function cleanupDead(): number {
  return native?.majraCleanupDead?.() ?? 0;
}

// ── JS Fallback ────────────────────────────────────────────────────────────

const jsSubs = new Map<string, MessageHandler[]>();
let jsPublishCount = 0;

function matchesPatternJS(pattern: string, topic: string): boolean {
  const patParts = pattern.split('/');
  const topParts = topic.split('/');

  let pi = 0;
  let ti = 0;

  while (pi < patParts.length && ti < topParts.length) {
    const seg = patParts[pi]!;
    if (seg === '#') return true;
    if (seg !== '*' && seg !== topParts[ti]) return false;
    pi++;
    ti++;
  }

  if (pi < patParts.length && patParts[pi] === '#') return true;
  return pi === patParts.length && ti === topParts.length;
}

function publishJS(topic: string, payload: unknown): number {
  jsPublishCount++;
  const now = new Date().toISOString();
  let delivered = 0;

  for (const [pattern, handlers] of jsSubs) {
    if (matchesPatternJS(pattern, topic)) {
      const msg: TopicMessage = { topic, payload, timestamp: now };
      for (const handler of handlers) {
        try {
          handler(msg);
        } catch {
          // Subscriber error — skip
        }
      }
      delivered += handlers.length;
    }
  }

  return delivered;
}

function subscribeJS(pattern: string, handler: MessageHandler): void {
  const handlers = jsSubs.get(pattern) ?? [];
  handlers.push(handler);
  jsSubs.set(pattern, handlers);
}

// ════════════════════════════════════════════════════════════════════════════
// Rate Limiter
// ════════════════════════════════════════════════════════════════════════════

export interface RatelimitCheckResult {
  allowed: boolean;
  activeKeys: number;
  totalAllowed: number;
  totalRejected: number;
}

export interface RatelimitStats {
  activeKeys: number;
  totalAllowed: number;
  totalRejected: number;
  totalEvicted: number;
}

/**
 * Register a rate limit rule. Converts SY's windowMs/maxRequests to
 * majra's token bucket (rate = maxRequests/windowSecs, burst = maxRequests).
 */
export function ratelimitRegister(ruleName: string, windowMs: number, maxRequests: number): void {
  if (native?.majraRatelimitRegister) {
    native.majraRatelimitRegister(ruleName, windowMs, maxRequests);
    return;
  }
  jsRules.set(ruleName, { windowMs, maxRequests, windows: new Map() });
}

/**
 * Check if a request is allowed for a given rule and key.
 */
export function ratelimitCheck(ruleName: string, key: string): RatelimitCheckResult {
  if (native?.majraRatelimitCheck) {
    return JSON.parse(native.majraRatelimitCheck(ruleName, key)) as RatelimitCheckResult;
  }
  return ratelimitCheckJS(ruleName, key);
}

/**
 * Evict stale keys from a limiter.
 */
export function ratelimitEvict(ruleName: string, maxIdleMs: number): number {
  if (native?.majraRatelimitEvict) {
    return native.majraRatelimitEvict(ruleName, maxIdleMs);
  }
  // JS fallback: clear all windows for this rule when maxIdleMs=0
  const rule = jsRules.get(ruleName);
  if (!rule) return 0;
  const count = rule.windows.size;
  rule.windows.clear();
  return count;
}

/**
 * Reset a specific key within a rule (clear its window).
 */
export function ratelimitResetKey(ruleName: string, key: string): void {
  if (native?.majraRatelimitEvict) {
    // Native: evict all keys with 0 idle time (clears everything for this rule)
    native.majraRatelimitEvict(ruleName, 0);
    return;
  }
  // JS fallback: delete the specific window
  const rule = jsRules.get(ruleName);
  if (rule) {
    rule.windows.delete(`${ruleName}:${key}`);
  }
}

/**
 * Get stats for a limiter.
 */
export function ratelimitStats(ruleName: string): RatelimitStats | null {
  if (native?.majraRatelimitStats) {
    const json = native.majraRatelimitStats(ruleName);
    return json ? (JSON.parse(json) as RatelimitStats) : null;
  }
  const rule = jsRules.get(ruleName);
  return rule
    ? { activeKeys: rule.windows.size, totalAllowed: 0, totalRejected: 0, totalEvicted: 0 }
    : null;
}

/**
 * Remove a registered rule.
 */
export function ratelimitRemove(ruleName: string): boolean {
  if (native?.majraRatelimitRemove) {
    return native.majraRatelimitRemove(ruleName);
  }
  return jsRules.delete(ruleName);
}

// ── JS Fallback (sliding window) ───────────────────────────────────────────

interface JSRule {
  windowMs: number;
  maxRequests: number;
  windows: Map<string, { count: number; windowStart: number }>;
}

const jsRules = new Map<string, JSRule>();

function ratelimitCheckJS(ruleName: string, key: string): RatelimitCheckResult {
  const rule = jsRules.get(ruleName);
  if (!rule) return { allowed: true, activeKeys: 0, totalAllowed: 0, totalRejected: 0 };

  const now = Date.now();
  const windowKey = `${ruleName}:${key}`;
  let window = rule.windows.get(windowKey);

  if (!window || now - window.windowStart >= rule.windowMs) {
    window = { count: 0, windowStart: now };
    rule.windows.set(windowKey, window);
  }

  if (window.count < rule.maxRequests) {
    window.count++;
    return { allowed: true, activeKeys: rule.windows.size, totalAllowed: 0, totalRejected: 0 };
  }

  return { allowed: false, activeKeys: rule.windows.size, totalAllowed: 0, totalRejected: 0 };
}
