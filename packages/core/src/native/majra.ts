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
// DirectChannel — raw broadcast, ~73M msg/s
// ════════════════════════════════════════════════════════════════════════════

export type DirectHandler = (payload: unknown) => void;

/**
 * Publish to the direct broadcast channel. All subscribers receive every message.
 * Returns the number of active receivers.
 */
export function directPublish(payload: unknown): number {
  if (native?.majraDirectPublish) {
    return native.majraDirectPublish(JSON.stringify(payload));
  }
  // JS fallback
  let count = 0;
  for (const handler of jsDirectSubs) {
    try {
      handler(payload);
      count++;
    } catch {
      /* skip */
    }
  }
  return count;
}

/**
 * Subscribe to the direct broadcast channel.
 */
export function directSubscribe(handler: DirectHandler): void {
  if (native?.majraDirectSubscribe) {
    native.majraDirectSubscribe((json: string) => {
      try {
        handler(JSON.parse(json));
      } catch {
        /* skip */
      }
    });
    return;
  }
  jsDirectSubs.push(handler);
}

export function directSubscriberCount(): number {
  return native?.majraDirectSubscriberCount?.() ?? jsDirectSubs.length;
}

export function directMessagesPublished(): number {
  return native?.majraDirectMessagesPublished?.() ?? 0;
}

const jsDirectSubs: DirectHandler[] = [];

// ════════════════════════════════════════════════════════════════════════════
// HashedChannel — hashed topic routing, ~16M msg/s
// ════════════════════════════════════════════════════════════════════════════

export interface HashedMessage {
  topicHash: number;
  timestampNs: number;
  payload: unknown;
}

export type HashedHandler = (message: HashedMessage) => void;

/**
 * Publish to a hashed topic. O(1) — no string allocation on hot path.
 */
export function hashedPublish(topic: string, payload: unknown): number {
  if (native?.majraHashedPublish) {
    return native.majraHashedPublish(topic, JSON.stringify(payload));
  }
  // JS fallback
  const handlers = jsHashedSubs.get(topic) ?? [];
  const msg: HashedMessage = { topicHash: 0, timestampNs: Date.now() * 1e6, payload };
  for (const h of handlers) {
    try {
      h(msg);
    } catch {
      /* skip */
    }
  }
  return handlers.length;
}

/**
 * Subscribe to a hashed topic.
 */
export function hashedSubscribe(topic: string, handler: HashedHandler): void {
  if (native?.majraHashedSubscribe) {
    native.majraHashedSubscribe(topic, (json: string) => {
      try {
        handler(JSON.parse(json) as HashedMessage);
      } catch {
        /* skip */
      }
    });
    return;
  }
  const handlers = jsHashedSubs.get(topic) ?? [];
  handlers.push(handler);
  jsHashedSubs.set(topic, handlers);
}

export function hashedUnsubscribe(topic: string): void {
  if (native?.majraHashedUnsubscribe) {
    native.majraHashedUnsubscribe(topic);
    return;
  }
  jsHashedSubs.delete(topic);
}

export function hashedTopicCount(): number {
  return native?.majraHashedTopicCount?.() ?? jsHashedSubs.size;
}

export function hashedMessagesPublished(): number {
  return native?.majraHashedMessagesPublished?.() ?? 0;
}

const jsHashedSubs = new Map<string, HashedHandler[]>();

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

// ════════════════════════════════════════════════════════════════════════════
// Heartbeat Tracker
// ════════════════════════════════════════════════════════════════════════════

export type HeartbeatStatus = 'online' | 'suspect' | 'offline';

export interface HeartbeatNode {
  id: string;
  status: string;
  metadata: unknown;
}

export interface HeartbeatTransition {
  id: string;
  status: string;
}

/**
 * Register a peer node for heartbeat tracking.
 */
export function heartbeatRegister(id: string, metadata: unknown): void {
  if (native?.majraHeartbeatRegister) {
    native.majraHeartbeatRegister(id, JSON.stringify(metadata));
    return;
  }
  jsHeartbeats.set(id, { status: 'online', lastSeen: Date.now(), metadata });
}

/**
 * Record a heartbeat from a node. Returns true if the node was known.
 */
export function heartbeat(id: string): boolean {
  if (native?.majraHeartbeat) {
    return native.majraHeartbeat(id);
  }
  const node = jsHeartbeats.get(id);
  if (!node) return false;
  node.status = 'online';
  node.lastSeen = Date.now();
  return true;
}

/**
 * Remove a node from tracking.
 */
export function heartbeatDeregister(id: string): boolean {
  if (native?.majraHeartbeatDeregister) {
    return native.majraHeartbeatDeregister(id);
  }
  return jsHeartbeats.delete(id);
}

/**
 * Sweep all nodes, transitioning statuses based on elapsed time.
 * Returns transitions that occurred.
 */
export function heartbeatUpdate(): HeartbeatTransition[] {
  if (native?.majraHeartbeatUpdate) {
    return JSON.parse(native.majraHeartbeatUpdate()) as HeartbeatTransition[];
  }
  return heartbeatUpdateJS();
}

/**
 * Get a node's current state.
 */
export function heartbeatGet(id: string): HeartbeatNode | null {
  if (native?.majraHeartbeatGet) {
    const json = native.majraHeartbeatGet(id);
    return json ? ({ id, ...JSON.parse(json) } as HeartbeatNode) : null;
  }
  const node = jsHeartbeats.get(id);
  return node ? { id, status: node.status, metadata: node.metadata } : null;
}

/**
 * List nodes by status.
 */
export function heartbeatList(status: HeartbeatStatus): HeartbeatNode[] {
  if (native?.majraHeartbeatList) {
    return JSON.parse(native.majraHeartbeatList(status)) as HeartbeatNode[];
  }
  return [...jsHeartbeats.entries()]
    .filter(([, n]) => n.status === status)
    .map(([id, n]) => ({ id, status: n.status, metadata: n.metadata }));
}

/**
 * Total tracked nodes.
 */
export function heartbeatCount(): number {
  return native?.majraHeartbeatCount?.() ?? jsHeartbeats.size;
}

// JS Fallback state
const SUSPECT_MS = 30_000;
const OFFLINE_MS = 90_000;
const jsHeartbeats = new Map<string, { status: string; lastSeen: number; metadata: unknown }>();

function heartbeatUpdateJS(): HeartbeatTransition[] {
  const now = Date.now();
  const transitions: HeartbeatTransition[] = [];
  for (const [id, node] of jsHeartbeats) {
    const elapsed = now - node.lastSeen;
    const prev = node.status;
    if (elapsed >= OFFLINE_MS) node.status = 'offline';
    else if (elapsed >= SUSPECT_MS) node.status = 'suspect';
    else node.status = 'online';
    if (node.status !== prev) transitions.push({ id, status: node.status });
  }
  return transitions;
}

// ════════════════════════════════════════════════════════════════════════════
// Barrier
// ════════════════════════════════════════════════════════════════════════════

export interface BarrierResult {
  status: 'waiting' | 'released' | 'unknown';
  arrived?: number;
  expected?: number;
}

export interface BarrierRecord {
  name: string;
  participants: string[];
  forced: boolean;
}

/**
 * Create a new barrier expecting a set of participants.
 */
export function barrierCreate(name: string, participants: string[]): void {
  if (native?.majraBarrierCreate) {
    native.majraBarrierCreate(name, JSON.stringify(participants));
    return;
  }
  jsBarriers.set(name, { expected: new Set(participants), arrived: new Set() });
}

/**
 * Record a participant's arrival at a barrier.
 */
export function barrierArrive(name: string, participant: string): BarrierResult {
  if (native?.majraBarrierArrive) {
    return JSON.parse(native.majraBarrierArrive(name, participant)) as BarrierResult;
  }
  return barrierArriveJS(name, participant);
}

/**
 * Force a barrier to release by removing a dead participant.
 */
export function barrierForce(name: string, deadParticipant: string): BarrierResult {
  if (native?.majraBarrierForce) {
    return JSON.parse(native.majraBarrierForce(name, deadParticipant)) as BarrierResult;
  }
  const b = jsBarriers.get(name);
  if (!b) return { status: 'unknown' };
  b.expected.delete(deadParticipant);
  if (b.arrived.size >= b.expected.size) return { status: 'released' };
  return { status: 'waiting', arrived: b.arrived.size, expected: b.expected.size };
}

/**
 * Remove a completed barrier and return a record.
 */
export function barrierComplete(name: string): BarrierRecord | null {
  if (native?.majraBarrierComplete) {
    const json = native.majraBarrierComplete(name);
    return json ? (JSON.parse(json) as BarrierRecord) : null;
  }
  const b = jsBarriers.get(name);
  if (!b) return null;
  jsBarriers.delete(name);
  return { name, participants: [...b.arrived], forced: false };
}

/**
 * Number of active barriers.
 */
export function barrierCount(): number {
  return native?.majraBarrierCount?.() ?? jsBarriers.size;
}

// JS Fallback state
const jsBarriers = new Map<string, { expected: Set<string>; arrived: Set<string> }>();

function barrierArriveJS(name: string, participant: string): BarrierResult {
  const b = jsBarriers.get(name);
  if (!b) return { status: 'unknown' };
  b.arrived.add(participant);
  if (b.arrived.size >= b.expected.size) return { status: 'released' };
  return { status: 'waiting', arrived: b.arrived.size, expected: b.expected.size };
}

// ════════════════════════════════════════════════════════════════════════════
// Managed Queue
// ════════════════════════════════════════════════════════════════════════════

export type QueuePriority = 'critical' | 'high' | 'normal' | 'low' | 'background';
export type QueueJobState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface QueueJob {
  id: string;
  priority: string;
  state: string;
  payload: unknown;
}

/**
 * Enqueue a job. Returns the job ID.
 */
export function queueEnqueue(priority: QueuePriority, payload: unknown): string {
  if (native?.majraQueueEnqueue) {
    return native.majraQueueEnqueue(priority, JSON.stringify(payload));
  }
  return queueEnqueueJS(priority, payload);
}

/**
 * Dequeue the next eligible job.
 */
export function queueDequeue(): QueueJob | null {
  if (native?.majraQueueDequeue) {
    const json = native.majraQueueDequeue();
    return json ? (JSON.parse(json) as QueueJob) : null;
  }
  return queueDequeueJS();
}

/**
 * Mark a job as completed.
 */
export function queueComplete(jobId: string): boolean {
  if (native?.majraQueueComplete) {
    return native.majraQueueComplete(jobId);
  }
  const job = jsQueue.get(jobId);
  if (!job || job.state !== 'running') return false;
  job.state = 'completed';
  return true;
}

/**
 * Mark a job as failed.
 */
export function queueFail(jobId: string): boolean {
  if (native?.majraQueueFail) {
    return native.majraQueueFail(jobId);
  }
  const job = jsQueue.get(jobId);
  if (!job || job.state !== 'running') return false;
  job.state = 'failed';
  return true;
}

/**
 * Cancel a job.
 */
export function queueCancel(jobId: string): boolean {
  if (native?.majraQueueCancel) {
    return native.majraQueueCancel(jobId);
  }
  const job = jsQueue.get(jobId);
  if (!job || (job.state !== 'queued' && job.state !== 'running')) return false;
  job.state = 'cancelled';
  return true;
}

/**
 * Get a job's current state.
 */
export function queueGet(jobId: string): QueueJob | null {
  if (native?.majraQueueGet) {
    const json = native.majraQueueGet(jobId);
    return json ? (JSON.parse(json) as QueueJob) : null;
  }
  const job = jsQueue.get(jobId);
  return job ? { id: jobId, priority: job.priority, state: job.state, payload: job.payload } : null;
}

/**
 * Number of currently running jobs.
 */
export function queueRunningCount(): number {
  return native?.majraQueueRunningCount?.() ?? jsQueueRunning;
}

/**
 * Total tracked jobs (all states).
 */
export function queueJobCount(): number {
  return native?.majraQueueJobCount?.() ?? jsQueue.size;
}

// JS Fallback
const PRIORITY_ORDER: QueuePriority[] = ['critical', 'high', 'normal', 'low', 'background'];
const jsQueue = new Map<
  string,
  { priority: QueuePriority; state: QueueJobState; payload: unknown }
>();
let jsQueueRunning = 0;
let jsQueueIdCounter = 0;

function queueEnqueueJS(priority: QueuePriority, payload: unknown): string {
  const id = `jsq-${++jsQueueIdCounter}`;
  jsQueue.set(id, { priority, state: 'queued', payload });
  return id;
}

function queueDequeueJS(): QueueJob | null {
  for (const pri of PRIORITY_ORDER) {
    for (const [id, job] of jsQueue) {
      if (job.state === 'queued' && job.priority === pri) {
        job.state = 'running';
        jsQueueRunning++;
        return { id, priority: job.priority, state: job.state, payload: job.payload };
      }
    }
  }
  return null;
}
