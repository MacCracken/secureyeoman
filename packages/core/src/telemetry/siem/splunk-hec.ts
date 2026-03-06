/**
 * Splunk HTTP Event Collector (HEC) Provider (Phase 139)
 *
 * Sends batched SIEM events to a Splunk HEC endpoint.
 * https://docs.splunk.com/Documentation/Splunk/latest/Data/UsetheHTTPEventCollector
 */

import type { SiemProvider, SiemEvent } from './siem-forwarder.js';

export interface SplunkHecConfig {
  /** HEC endpoint, e.g. "https://splunk.example.com:8088/services/collector/event" */
  endpoint: string;
  /** HEC token */
  token: string;
  /** Splunk index (optional) */
  index?: string;
  /** Splunk sourcetype (default: "_json") */
  sourceType?: string;
  /** Timeout per request in ms */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class SplunkHecProvider implements SiemProvider {
  readonly name = 'splunk-hec';
  private readonly config: SplunkHecConfig;

  constructor(config: SplunkHecConfig) {
    this.config = config;
  }

  async send(events: SiemEvent[]): Promise<void> {
    const body = events
      .map((e) =>
        JSON.stringify({
          time: Math.floor(new Date(e.timestamp).getTime() / 1000),
          host: 'secureyeoman',
          source: e.source,
          sourcetype: this.config.sourceType ?? '_json',
          ...(this.config.index ? { index: this.config.index } : {}),
          event: {
            event_type: e.event,
            severity: e.severity,
            message: e.message,
            ...e.metadata,
            trace_id: e.traceId,
            span_id: e.spanId,
            correlation_id: e.correlationId,
            tenant_id: e.tenantId,
            user_id: e.userId,
          },
        })
      )
      .join('\n');

    const resp = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Splunk ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Splunk HEC returned ${resp.status}: ${text.slice(0, 200)}`);
    }
  }
}
