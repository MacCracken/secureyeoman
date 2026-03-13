/**
 * Audit Forwarder — Batches audit events and forwards to parent SY instance.
 *
 * Reuses the AGNOS hooks pattern: buffer up to `batchSize` events (default 50),
 * flush on a timer interval (default 5s), or flush immediately when the buffer
 * reaches capacity.
 *
 * Events are forwarded via POST to the parent's `/api/v1/audit/forward` endpoint.
 * Failures are non-fatal — audit events are dropped if the parent is unreachable
 * to avoid backpressure on the agent runtime.
 */

import type { SecureLogger } from '../logging/logger.js';

export interface AuditForwarderConfig {
  /** Parent SY instance URL */
  parentUrl: string;
  /** Agent registration token for parent auth */
  registrationToken?: string;
  /** Max events to batch before flushing. Default: 50 */
  batchSize?: number;
  /** Flush interval in ms. Default: 5_000 */
  flushIntervalMs?: number;
  /** Timeout for forward requests in ms. Default: 10_000 */
  timeoutMs?: number;
}

export interface AuditEvent {
  event: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
  userId?: string;
  metadata?: Record<string, unknown>;
}

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_FLUSH_INTERVAL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 10_000;

export class AuditForwarder {
  private readonly parentUrl: string;
  private readonly registrationToken?: string;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly logger?: SecureLogger;

  private readonly buffer: AuditEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  /** Tracks total events forwarded (for diagnostics) */
  private forwarded = 0;
  /** Tracks total events dropped due to errors */
  private dropped = 0;

  constructor(config: AuditForwarderConfig, logger?: SecureLogger) {
    this.parentUrl = config.parentUrl.replace(/\/$/, '');
    this.registrationToken = config.registrationToken;
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
    this.flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.logger = logger?.child({ component: 'audit-forwarder' });
  }

  /** Start the flush timer. */
  start(): void {
    if (this.timer) return;
    this.stopped = false;

    this.timer = setInterval(() => {
      this.flush().catch(() => {});
    }, this.flushIntervalMs);

    // Unref so the timer doesn't prevent process exit
    if (this.timer.unref) this.timer.unref();

    this.logger?.debug(
      { batchSize: this.batchSize, flushIntervalMs: this.flushIntervalMs },
      'Audit forwarder started'
    );
  }

  /** Buffer an audit event for forwarding. */
  record(event: AuditEvent): void {
    if (this.stopped) return;

    this.buffer.push(event);

    // Flush immediately when buffer is full
    if (this.buffer.length >= this.batchSize) {
      this.flush().catch(() => {});
    }
  }

  /** Flush buffered events to the parent. */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, this.buffer.length);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.registrationToken) {
        headers.Authorization = `Bearer ${this.registrationToken}`;
      }

      const response = await fetch(`${this.parentUrl}/api/v1/audit/forward`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source: 'agent',
          events: batch,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (response.ok) {
        this.forwarded += batch.length;
        this.logger?.debug(
          { count: batch.length, total: this.forwarded },
          'Audit events forwarded'
        );
      } else {
        this.dropped += batch.length;
        this.logger?.debug(
          { status: response.status, count: batch.length },
          'Audit forward rejected by parent'
        );
      }
    } catch (err) {
      this.dropped += batch.length;
      this.logger?.debug(
        { error: err instanceof Error ? err.message : String(err), count: batch.length },
        'Audit forward failed'
      );
    }
  }

  /** Stop the forwarder, flushing any remaining events. */
  async stop(): Promise<void> {
    this.stopped = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Final flush
    await this.flush();

    this.logger?.debug(
      { forwarded: this.forwarded, dropped: this.dropped },
      'Audit forwarder stopped'
    );
  }

  /** Current buffer size. */
  get bufferSize(): number {
    return this.buffer.length;
  }

  /** Total events successfully forwarded. */
  get totalForwarded(): number {
    return this.forwarded;
  }

  /** Total events dropped due to errors. */
  get totalDropped(): number {
    return this.dropped;
  }
}
