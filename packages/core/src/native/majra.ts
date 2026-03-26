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
