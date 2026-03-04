/**
 * Worker thread script for offloading crypto operations from the main event loop.
 * Handles SHA-256 and HMAC-SHA256 computations.
 */

import { parentPort } from 'node:worker_threads';
import { createHash, createHmac } from 'node:crypto';

interface CryptoRequest {
  id: number;
  op: 'sha256' | 'hmacSha256';
  data: string;
  key?: string;
}

interface CryptoResponse {
  id: number;
  result?: string;
  error?: string;
}

parentPort!.on('message', (msg: CryptoRequest) => {
  try {
    let result: string;
    if (msg.op === 'sha256') {
      result = createHash('sha256').update(msg.data).digest('hex');
    } else {
      result = createHmac('sha256', msg.key!).update(msg.data).digest('hex');
    }
    parentPort!.postMessage({ id: msg.id, result } satisfies CryptoResponse);
  } catch (err) {
    parentPort!.postMessage({
      id: msg.id,
      error: err instanceof Error ? err.message : 'Unknown worker error',
    } satisfies CryptoResponse);
  }
});
