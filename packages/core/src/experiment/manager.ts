/**
 * Experiment Manager — create/start/stop experiments, traffic routing
 */

import type { Experiment, ExperimentCreate } from '@secureyeoman/shared';
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

  async create(data: ExperimentCreate): Promise<Experiment> {
    const exp = await this.storage.create(data);
    this.logger.info('Experiment created', { id: exp.id });
    return exp;
  }

  async get(id: string): Promise<Experiment | null> {
    return await this.storage.get(id);
  }

  async list(): Promise<Experiment[]> {
    return await this.storage.list();
  }

  async delete(id: string): Promise<boolean> {
    const ok = await this.storage.delete(id);
    if (ok) this.logger.info('Experiment deleted', { id });
    return ok;
  }

  async start(id: string): Promise<Experiment | null> {
    const exp = await this.storage.get(id);
    if (!exp || exp.status === 'running') return exp;
    const updated = await this.storage.update(id, { status: 'running', startedAt: Date.now() });
    this.logger.info('Experiment started', { id });
    return updated;
  }

  async stop(id: string): Promise<Experiment | null> {
    const exp = await this.storage.get(id);
    if (exp?.status !== 'running') return exp;
    const updated = await this.storage.update(id, { status: 'completed', completedAt: Date.now() });
    this.logger.info('Experiment stopped', { id });
    return updated;
  }

  async selectVariant(experimentId: string): Promise<string | null> {
    const exp = await this.storage.get(experimentId);
    if (exp?.status !== 'running' || exp.variants.length === 0) return null;
    const rand = Math.random() * 100;
    let cumulative = 0;
    for (const variant of exp.variants) {
      cumulative += variant.trafficPercent;
      if (rand <= cumulative) return variant.id;
    }
    return exp.variants[exp.variants.length - 1]!.id;
  }
}
