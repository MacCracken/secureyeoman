/**
 * AWS CloudWatch Logs Provider (Phase 139)
 *
 * Sends SIEM events to AWS CloudWatch Logs using the PutLogEvents API.
 * Uses SigV4 signing via the same pattern as our Polly/Transcribe providers.
 *
 * https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutLogEvents.html
 */

import type { SiemProvider, SiemEvent } from './siem-forwarder.js';
import { createHmac, createHash } from 'node:crypto';

export interface CloudWatchConfig {
  /** AWS region, e.g. "us-east-1" */
  region: string;
  /** CloudWatch log group name */
  logGroupName: string;
  /** CloudWatch log stream name */
  logStreamName: string;
  /** AWS access key ID (or from env) */
  accessKeyId?: string;
  /** AWS secret access key (or from env) */
  secretAccessKey?: string;
  /** AWS session token for temporary credentials */
  sessionToken?: string;
  /** Timeout per request in ms */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class CloudWatchProvider implements SiemProvider {
  readonly name = 'cloudwatch';
  private readonly config: CloudWatchConfig;

  constructor(config: CloudWatchConfig) {
    this.config = config;
  }

  async send(events: SiemEvent[]): Promise<void> {
    const logEvents = events.map((e) => ({
      timestamp: new Date(e.timestamp).getTime(),
      message: JSON.stringify({
        event_type: e.event,
        severity: e.severity,
        source: e.source,
        message: e.message,
        trace_id: e.traceId,
        span_id: e.spanId,
        correlation_id: e.correlationId,
        tenant_id: e.tenantId,
        user_id: e.userId,
        ...e.metadata,
      }),
    }));

    const body = JSON.stringify({
      logGroupName: this.config.logGroupName,
      logStreamName: this.config.logStreamName,
      logEvents,
    });

    const accessKeyId = this.config.accessKeyId ?? process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = this.config.secretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY;
    const sessionToken = this.config.sessionToken ?? process.env.AWS_SESSION_TOKEN;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials required for CloudWatch provider');
    }

    const host = `logs.${this.config.region}.amazonaws.com`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const dateStamp = amzDate.slice(0, 8);

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'Logs_20140328.PutLogEvents',
      'X-Amz-Date': amzDate,
      Host: host,
    };
    if (sessionToken) {
      headers['X-Amz-Security-Token'] = sessionToken;
    }

    const signedHeaders = Object.keys(headers)
      .map((k) => k.toLowerCase())
      .sort()
      .join(';');

    const canonicalHeaders = Object.keys(headers)
      .map((k) => `${k.toLowerCase()}:${(headers[k] ?? '').trim()}`)
      .sort()
      .join('\n') + '\n';

    const payloadHash = createHash('sha256').update(body).digest('hex');
    const canonicalRequest = [
      'POST', '/', '', canonicalHeaders, signedHeaders, payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.config.region}/logs/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256', amzDate, credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const signingKey = getSignatureKey(secretAccessKey, dateStamp, this.config.region, 'logs');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    headers.Authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const resp = await fetch(`https://${host}/`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`CloudWatch PutLogEvents returned ${resp.status}: ${text.slice(0, 200)}`);
    }
  }
}

function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
  const kRegion = createHmac('sha256', kDate).update(region).digest();
  const kService = createHmac('sha256', kRegion).update(service).digest();
  return createHmac('sha256', kService).update('aws4_request').digest();
}
