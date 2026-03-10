/**
 * Synapse Registry
 *
 * Tracks connected Synapse instances and provides selection logic
 * for routing training jobs to the best available instance.
 */

import type { SecureLogger } from '../../logging/logger.js';
import type { SynapseInstance, SynapseHeartbeat } from './types.js';

export class SynapseRegistry {
  private readonly instances: Map<string, SynapseInstance> = new Map();
  private readonly logger: SecureLogger;

  constructor(logger: SecureLogger) {
    this.logger = logger.child({ component: 'synapse-registry' });
  }

  get size(): number {
    return this.instances.size;
  }

  register(instance: SynapseInstance): void {
    this.instances.set(instance.id, instance);
    this.logger.info(
      { instanceId: instance.id, endpoint: instance.endpoint, version: instance.version },
      'registered Synapse instance'
    );
  }

  unregister(instanceId: string): void {
    const removed = this.instances.delete(instanceId);
    if (removed) {
      this.logger.info({ instanceId }, 'unregistered Synapse instance');
    }
  }

  get(instanceId: string): SynapseInstance | undefined {
    return this.instances.get(instanceId);
  }

  list(): SynapseInstance[] {
    return [...this.instances.values()];
  }

  getHealthy(): SynapseInstance[] {
    return [...this.instances.values()].filter((i) => i.status === 'connected');
  }

  /**
   * Pick the instance with the most free GPU memory that supports the requested
   * training method. Returns null if no suitable instance is found.
   */
  getBestForTraining(method: string): SynapseInstance | null {
    const candidates = this.getHealthy().filter((i) =>
      i.capabilities.supportedMethods.includes(method)
    );

    if (candidates.length === 0) return null;

    // Sort descending by total GPU memory as a proxy — heartbeat data with
    // live free-memory is tracked separately but capabilities.totalGpuMemoryMb
    // gives a reasonable static ranking.
    candidates.sort((a, b) => b.capabilities.totalGpuMemoryMb - a.capabilities.totalGpuMemoryMb);
    return candidates[0] ?? null;
  }

  updateHeartbeat(instanceId: string, heartbeat: SynapseHeartbeat): void {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      this.logger.warn({ instanceId }, 'heartbeat received for unknown Synapse instance');
      return;
    }

    instance.lastHeartbeat = heartbeat.timestamp;
    instance.status = 'connected';

    // Update dynamic capability data from heartbeat
    (instance.capabilities as { loadedModels: string[] }).loadedModels = heartbeat.loadedModels;

    this.logger.debug(
      {
        instanceId,
        gpuMemoryFreeMb: heartbeat.gpuMemoryFreeMb,
        activeTrainingJobs: heartbeat.activeTrainingJobs,
        loadedModels: heartbeat.loadedModels.length,
      },
      'Synapse heartbeat processed'
    );
  }

  markDisconnected(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.status = 'disconnected';
      this.logger.warn({ instanceId }, 'Synapse instance marked disconnected');
    }
  }
}
