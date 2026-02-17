/**
 * AWS Integration
 *
 * AWS adapter using direct REST API calls (no SDK dependency).
 * Supports Lambda invocation and STS identity verification.
 * No webhooks — polling or event-driven via the agent loop.
 */

import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
import type { Integration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';
import { createHmac, createHash } from 'crypto';

// ─── Config types ─────────────────────────────────────────

interface AwsConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  defaultLambda?: string;
}

export class AwsIntegration implements Integration {
  readonly platform: Platform = 'aws';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 10 };

  private config: IntegrationConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;
  private accessKeyId = '';
  private secretAccessKey = '';
  private region = '';
  private defaultLambda = '';

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;

    const ac = config.config as unknown as AwsConfig;
    this.accessKeyId = ac.accessKeyId;
    this.secretAccessKey = ac.secretAccessKey;
    this.region = ac.region || 'us-east-1';
    this.defaultLambda = ac.defaultLambda ?? '';

    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new Error('AWS integration requires accessKeyId and secretAccessKey');
    }

    this.logger?.info('AWS integration initialized', { region: this.region });
  }

  async start(): Promise<void> {
    if (!this.config) throw new Error('Integration not initialized');
    if (this.running) return;
    this.running = true;
    this.logger?.info('AWS integration started');
  }

  async stop(): Promise<void> {
    this.running = false;
    this.logger?.info('AWS integration stopped');
  }

  /**
   * Send a message by invoking an AWS Lambda function.
   * chatId = Lambda function name (or uses defaultLambda).
   */
  async sendMessage(
    chatId: string,
    text: string,
    _metadata?: Record<string, unknown>
  ): Promise<string> {
    const functionName = chatId || this.defaultLambda;
    if (!functionName) {
      throw new Error('No Lambda function name provided and no defaultLambda configured');
    }

    const host = `lambda.${this.region}.amazonaws.com`;
    const path = `/2015-03-31/functions/${encodeURIComponent(functionName)}/invocations`;
    const body = JSON.stringify({ message: text });

    const headers = this.signRequest('POST', host, path, body, 'lambda');

    const resp = await fetch(`https://${host}${path}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body,
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Lambda invocation failed: ${err}`);
    }

    const result = await resp.text();
    return `lambda-${functionName}-${Date.now()}`;
  }

  isHealthy(): boolean {
    return this.running;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const host = `sts.${this.region}.amazonaws.com`;
      const path = '/?Action=GetCallerIdentity&Version=2011-06-15';
      const headers = this.signRequest('GET', host, path, '', 'sts');

      const resp = await fetch(`https://${host}${path}`, { headers });

      if (!resp.ok) {
        const err = await resp.text();
        return { ok: false, message: `AWS STS error: ${err}` };
      }

      const text = await resp.text();
      const arnMatch = text.match(/<Arn>(.*?)<\/Arn>/);
      const accountMatch = text.match(/<Account>(.*?)<\/Account>/);
      return {
        ok: true,
        message: `Connected as ${arnMatch?.[1] ?? 'unknown'} (Account: ${accountMatch?.[1] ?? 'unknown'})`,
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  // ─── AWS Signature V4 helpers ──────────────────────────

  private signRequest(
    method: string,
    host: string,
    path: string,
    body: string,
    service: string
  ): Record<string, string> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const payloadHash = createHash('sha256').update(body).digest('hex');

    const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-date';

    const canonicalPath = path.split('?')[0]!;
    const canonicalQuerystring = path.includes('?') ? path.split('?')[1]! : '';

    const canonicalRequest = [
      method,
      canonicalPath,
      canonicalQuerystring,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/${service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const signingKey = this.getSignatureKey(dateStamp, service);
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    return {
      host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
  }

  private getSignatureKey(dateStamp: string, service: string): Buffer {
    const kDate = createHmac('sha256', `AWS4${this.secretAccessKey}`)
      .update(dateStamp)
      .digest();
    const kRegion = createHmac('sha256', kDate).update(this.region).digest();
    const kService = createHmac('sha256', kRegion).update(service).digest();
    return createHmac('sha256', kService).update('aws4_request').digest();
  }
}
