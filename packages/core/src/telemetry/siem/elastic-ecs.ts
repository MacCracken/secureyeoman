/**
 * Elasticsearch ECS Provider (Phase 139)
 *
 * Sends SIEM events to Elasticsearch using the Bulk API with
 * Elastic Common Schema (ECS) field mapping.
 */

import type { SiemProvider, SiemEvent, SiemSeverity } from './siem-forwarder.js';

export interface ElasticEcsConfig {
  /** Elasticsearch endpoint, e.g. "https://es.example.com:9200" */
  endpoint: string;
  /** Index name or data stream */
  index: string;
  /** API key for authentication (base64 encoded) */
  apiKey?: string;
  /** Basic auth username */
  username?: string;
  /** Basic auth password */
  password?: string;
  /** Timeout per request in ms */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const ECS_SEVERITY_MAP: Record<SiemSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export class ElasticEcsProvider implements SiemProvider {
  readonly name = 'elastic-ecs';
  private readonly config: ElasticEcsConfig;

  constructor(config: ElasticEcsConfig) {
    this.config = config;
  }

  async send(events: SiemEvent[]): Promise<void> {
    const lines: string[] = [];
    for (const e of events) {
      lines.push(JSON.stringify({ index: { _index: this.config.index } }));
      lines.push(
        JSON.stringify({
          '@timestamp': e.timestamp,
          'event.kind': 'event',
          'event.category': [e.source],
          'event.action': e.event,
          'event.severity': ECS_SEVERITY_MAP[e.severity] ?? 1,
          message: e.message,
          'log.level': e.severity,
          'service.name': 'secureyeoman',
          'trace.id': e.traceId,
          'span.id': e.spanId,
          'transaction.id': e.correlationId,
          'user.id': e.userId,
          labels: {
            tenant_id: e.tenantId,
            source: e.source,
          },
          ...e.metadata,
        })
      );
    }
    const body = lines.join('\n') + '\n';

    const headers: Record<string, string> = { 'Content-Type': 'application/x-ndjson' };
    if (this.config.apiKey) {
      headers.Authorization = `ApiKey ${this.config.apiKey}`;
    } else if (this.config.username && this.config.password) {
      headers.Authorization =
        'Basic ' + Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
    }

    const resp = await fetch(`${this.config.endpoint}/_bulk`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Elasticsearch bulk API returned ${resp.status}: ${text.slice(0, 200)}`);
    }
  }
}
