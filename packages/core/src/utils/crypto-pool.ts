/**
 * CryptoPool — A small worker thread pool for offloading SHA-256 and HMAC-SHA256
 * from the main event loop. Uses round-robin dispatch.
 *
 * Falls back to synchronous crypto when the pool is closed or has no workers.
 */

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sha256 as syncSha256, hmacSha256 as syncHmacSha256 } from './crypto.js';
import { nativeAvailable } from '../native/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface CryptoPoolOptions {
  /** Number of worker threads (default: 2) */
  poolSize?: number;
}

interface PendingRequest {
  resolve: (result: string) => void;
  reject: (error: Error) => void;
}

export class CryptoPool {
  private workers: Worker[] = [];
  private nextWorker = 0;
  private pending = new Map<string, PendingRequest>();
  private closed = false;

  constructor(opts: CryptoPoolOptions = {}) {
    const poolSize = opts.poolSize ?? 2;

    // Native Rust module handles crypto in-process — no worker threads needed.
    // Also skip in Bun compiled binary where worker scripts can't resolve.
    if (nativeAvailable || import.meta.url.includes('/$bunfs/')) {
      this.closed = true;
      return;
    }

    // Resolve worker path: use .ts extension when running under tsx/vitest
    const isTs = __filename.endsWith('.ts');
    const workerPath = join(__dirname, isTs ? 'crypto-worker.ts' : 'crypto-worker.js');
    const workerOpts = isTs ? { execArgv: ['--import', 'tsx'] } : {};

    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker(workerPath, workerOpts);
      worker.on('message', (msg: { id: string; result?: string; error?: string }) => {
        const req = this.pending.get(msg.id);
        if (!req) return;
        this.pending.delete(msg.id);
        if (msg.error) {
          req.reject(new Error(msg.error));
        } else {
          req.resolve(msg.result!);
        }
      });
      worker.on('error', (err: Error) => {
        // Reject all pending requests for this worker
        // (worker_threads reassigns error to the worker instance)
        for (const [id, req] of this.pending) {
          req.reject(err);
          this.pending.delete(id);
        }
      });
      this.workers.push(worker);
    }
  }

  private dispatch(op: 'sha256' | 'hmacSha256', data: string, key?: string): Promise<string> {
    if (this.closed || this.workers.length === 0) {
      // Sync fallback
      return Promise.resolve(op === 'sha256' ? syncSha256(data) : syncHmacSha256(data, key!));
    }

    const id = randomUUID();
    const worker = this.workers[this.nextWorker % this.workers.length]!;
    this.nextWorker++;

    return new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, op, data, key });
    });
  }

  /** Compute SHA-256 hash asynchronously via worker thread */
  sha256(data: string): Promise<string> {
    return this.dispatch('sha256', data);
  }

  /** Compute HMAC-SHA256 asynchronously via worker thread */
  hmacSha256(data: string, key: string): Promise<string> {
    return this.dispatch('hmacSha256', data, key);
  }

  /** Terminate all workers and reject pending requests */
  async close(): Promise<void> {
    this.closed = true;

    // Reject pending requests
    for (const [id, req] of this.pending) {
      req.reject(new Error('CryptoPool closed'));
      this.pending.delete(id);
    }

    // Terminate all workers
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
  }
}
