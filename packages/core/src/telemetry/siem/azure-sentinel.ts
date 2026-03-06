/**
 * Azure Sentinel (Microsoft Sentinel) CEF Provider (Phase 139)
 *
 * Sends SIEM events to Azure Monitor Data Collection API (DCR-based)
 * with Common Event Format (CEF) mapping.
 *
 * Uses the Azure Monitor Ingestion API:
 * https://learn.microsoft.com/en-us/azure/azure-monitor/logs/logs-ingestion-api-overview
 */

import type { SiemProvider, SiemEvent, SiemSeverity } from './siem-forwarder.js';

export interface AzureSentinelConfig {
  /** Data Collection Endpoint (DCE), e.g. "https://<dce>.ingest.monitor.azure.com" */
  endpoint: string;
  /** Data Collection Rule (DCR) immutable ID */
  ruleId: string;
  /** Stream name in the DCR, e.g. "Custom-SecureYeomanEvents_CL" */
  streamName: string;
  /** Azure AD bearer token (caller manages token acquisition) */
  bearerToken: string;
  /** Timeout per request in ms */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const CEF_SEVERITY_MAP: Record<SiemSeverity, number> = {
  low: 3,
  medium: 5,
  high: 8,
  critical: 10,
};

export class AzureSentinelProvider implements SiemProvider {
  readonly name = 'azure-sentinel';
  private readonly config: AzureSentinelConfig;

  constructor(config: AzureSentinelConfig) {
    this.config = config;
  }

  async send(events: SiemEvent[]): Promise<void> {
    const records = events.map((e) => ({
      TimeGenerated: e.timestamp,
      DeviceVendor: 'SecureYeoman',
      DeviceProduct: 'SecureYeoman',
      DeviceVersion: '1.0',
      DeviceEventClassID: e.event,
      Name: e.event,
      Severity: CEF_SEVERITY_MAP[e.severity] ?? 3,
      Message: e.message,
      SourceSystem: e.source,
      TraceId: e.traceId ?? '',
      SpanId: e.spanId ?? '',
      CorrelationId: e.correlationId ?? '',
      TenantId_CF: e.tenantId ?? '',
      UserId_CF: e.userId ?? '',
      AdditionalData: JSON.stringify(e.metadata),
    }));

    const url =
      `${this.config.endpoint}/dataCollectionRules/${this.config.ruleId}` +
      `/streams/${this.config.streamName}?api-version=2023-01-01`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(records),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Azure Sentinel API returned ${resp.status}: ${text.slice(0, 200)}`);
    }
  }
}
