/**
 * SIEM Forwarder — Abstract base + batch buffering (Phase 139)
 *
 * All SIEM providers implement `SiemProvider.send()` for a batch of events.
 * The forwarder buffers events and flushes on interval or when the batch
 * reaches `batchSize`.  Fire-and-forget — errors are logged, never thrown.
 */

import type { SecureLogger } from '../../logging/logger.js';

export type SiemSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SiemEvent {
  timestamp: string;
  source: string;
  event: string;
  severity: SiemSeverity;
  message: string;
  metadata: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
  correlationId?: string;
  tenantId?: string;
  userId?: string;
}

export interface SiemProvider {
  readonly name: string;
  send(events: SiemEvent[]): Promise<void>;
  close?(): Promise<void>;
}

export interface SiemForwarderConfig {
  provider: SiemProvider;
  batchSize?: number;
  flushIntervalMs?: number;
  logger: SecureLogger;
}

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_FLUSH_INTERVAL_MS = 5_000;

export class SiemForwarder {
  private buffer: SiemEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly provider: SiemProvider;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly logger: SecureLogger;
  private _flushing = false;
  private _stats = { forwarded: 0, errors: 0, dropped: 0 };

  constructor(config: SiemForwarderConfig) {
    this.provider = config.provider;
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
    this.flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.logger = config.logger;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
  }

  forward(event: SiemEvent): void {
    this.buffer.push(event);
    if (this.buffer.length >= this.batchSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this._flushing || this.buffer.length === 0) return;
    this._flushing = true;

    const batch = this.buffer.splice(0, this.batchSize);
    try {
      await this.provider.send(batch);
      this._stats.forwarded += batch.length;
    } catch (err) {
      this._stats.errors++;
      this._stats.dropped += batch.length;
      this.logger.error({
        provider: this.provider.name,
        batchSize: batch.length,
        error: err instanceof Error ? err.message : String(err),
      }, 'SIEM forwarding failed');
    } finally {
      this._flushing = false;
    }
  }

  async close(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
    await this.provider.close?.();
  }

  get stats() {
    return { ...this._stats, pending: this.buffer.length };
  }
}
