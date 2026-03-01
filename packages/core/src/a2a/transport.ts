import { trace } from '@opentelemetry/api';
import type { A2AMessage, PeerAgent } from './types.js';
import type { SecureLogger } from '../logging/logger.js';

export class RemoteDelegationTransport {
  private readonly logger: SecureLogger;

  constructor(deps: { logger: SecureLogger }) {
    this.logger = deps.logger;
  }

  async send(peer: PeerAgent, message: A2AMessage): Promise<boolean> {
    try {
      const payload = JSON.stringify(message);

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      // Propagate W3C trace context to the remote peer for distributed tracing
      const span = trace.getActiveSpan();
      if (span) {
        const ctx = span.spanContext();
        if (ctx.traceId && ctx.traceId !== '00000000000000000000000000000000') {
          headers['traceparent'] = `00-${ctx.traceId}-${ctx.spanId}-01`;
        }
      }

      const response = await fetch(`${peer.url}/api/v1/a2a/receive`, {
        method: 'POST',
        headers,
        body: payload,
        signal: AbortSignal.timeout(10000),
      });
      return response.ok;
    } catch (err) {
      this.logger.warn('Failed to send A2A message', {
        peerId: peer.id,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      return false;
    }
  }
}
