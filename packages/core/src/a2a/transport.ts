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
      const response = await fetch(`${peer.url}/api/v1/a2a/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
