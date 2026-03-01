/**
 * TrainingStreamBroadcaster — singleton EventEmitter for real-time training telemetry.
 *
 * Emitters:
 *   - FinetuneManager: emits 'loss' events when it parses "loss:" from container logs
 *   - DistillationManager: emits 'throughput' and 'agreement' after each batch
 *
 * Consumers:
 *   - GET /api/v1/training/stream (SSE) — forwards events to connected browsers
 */

import { EventEmitter } from 'node:events';

export type TrainingStreamEventType = 'loss' | 'throughput' | 'agreement' | 'reward';

export interface TrainingStreamEvent {
  type: TrainingStreamEventType;
  value: number;
  ts: number;
}

class TrainingStreamBroadcaster extends EventEmitter {
  broadcast(event: TrainingStreamEvent): void {
    this.emit('event', event);
  }
}

export const trainingStream = new TrainingStreamBroadcaster();
