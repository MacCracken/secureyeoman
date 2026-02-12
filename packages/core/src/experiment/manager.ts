/**
 * Experiment Manager — create/start/stop experiments, traffic routing
 */

import type { Experiment, ExperimentCreate } from '@friday/shared';
import type { SecureLogger } from '../logging/logger.js';
import { ExperimentStorage } from './storage.js';

export interface ExperimentManagerDeps {
  logger: SecureLogger;
}

export class ExperimentManager {
  private storage: ExperimentStorage;
  private logger: SecureLogger;

  constructor(storage: ExperimentStorage, deps: ExperimentManagerDeps) {
    this.storage = storage;
    this.logger = deps.logger;
  }

  create(data: ExperimentCreate): Experiment { const exp = this.storage.create(data); this.logger.info('Experiment created', { id: exp.id }); return exp; }
  get(id: string): Experiment | null { return this.storage.get(id); }
  list(): Experiment[] { return this.storage.list(); }
  delete(id: string): boolean { const ok = this.storage.delete(id); if (ok) this.logger.info('Experiment deleted', { id }); return ok; }

  start(id: string): Experiment | null {
    const exp = this.storage.get(id);
    if (!exp || exp.status === 'running') return exp;
    const updated = this.storage.update(id, { status: 'running', startedAt: Date.now() });
    this.logger.info('Experiment started', { id });
    return updated;
  }

  stop(id: string): Experiment | null {
    const exp = this.storage.get(id);
    if (!exp || exp.status !== 'running') return exp;
    const updated = this.storage.update(id, { status: 'completed', completedAt: Date.now() });
    this.logger.info('Experiment stopped', { id });
    return updated;
  }

  selectVariant(experimentId: string): string | null {
    const exp = this.storage.get(experimentId);
    if (!exp || exp.status !== 'running' || exp.variants.length === 0) return null;
    const rand = Math.random() * 100;
    let cumulative = 0;
    for (const variant of exp.variants) {
      cumulative += variant.trafficPercent;
      if (rand <= cumulative) return variant.id;
    }
    return exp.variants[exp.variants.length - 1]!.id;
  }
}
