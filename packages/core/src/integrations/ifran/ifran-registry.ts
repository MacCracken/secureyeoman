/**
 * Ifran Registry
 *
 * Tracks connected Ifran instances and provides selection logic
 * for routing training jobs to the best available instance.
 */

import type { SecureLogger } from '../../logging/logger.js';
import type { IfranInstance, IfranHeartbeat } from './types.js';

export class IfranRegistry {
  private readonly instances = new Map<string, IfranInstance>();
  private readonly gpuMemoryFree = new Map<string, number>();
  private readonly activeJobCounts = new Map<string, number>();
  private readonly logger: SecureLogger;

  constructor(logger: SecureLogger) {
    this.logger = logger.child({ component: 'ifran-registry' });
  }

  get size(): number {
    return this.instances.size;
  }

  register(instance: IfranInstance): void {
    this.instances.set(instance.id, instance);
    this.logger.info(
      { instanceId: instance.id, endpoint: instance.endpoint, version: instance.version },
      'registered Ifran instance'
    );
  }

  unregister(instanceId: string): void {
    const removed = this.instances.delete(instanceId);
    this.gpuMemoryFree.delete(instanceId);
    this.activeJobCounts.delete(instanceId);
    if (removed) {
      this.logger.info({ instanceId }, 'unregistered Ifran instance');
    }
  }

  get(instanceId: string): IfranInstance | undefined {
    return this.instances.get(instanceId);
  }

  list(): IfranInstance[] {
    return [...this.instances.values()];
  }

  getHealthy(): IfranInstance[] {
    return [...this.instances.values()].filter((i) => i.status === 'connected');
  }

  /**
   * Pick the instance with the most free GPU memory that supports the requested
   * training method. Falls back to total GPU memory when live data is unavailable.
   * Breaks ties by fewest active training jobs.
   */
  getBestForTraining(method: string): IfranInstance | null {
    const candidates = this.getHealthy().filter((i) =>
      i.capabilities.supportedMethods.includes(method)
    );

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      const freeA = this.gpuMemoryFree.get(a.id) ?? a.capabilities.totalGpuMemoryMb;
      const freeB = this.gpuMemoryFree.get(b.id) ?? b.capabilities.totalGpuMemoryMb;
      if (freeB !== freeA) return freeB - freeA;
      // Tie-break: fewer active jobs wins
      const jobsA = this.activeJobCounts.get(a.id) ?? 0;
      const jobsB = this.activeJobCounts.get(b.id) ?? 0;
      return jobsA - jobsB;
    });
    return candidates[0] ?? null;
  }

  updateHeartbeat(instanceId: string, heartbeat: IfranHeartbeat): void {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      this.logger.warn({ instanceId }, 'heartbeat received for unknown Ifran instance');
      return;
    }

    instance.lastHeartbeat = heartbeat.timestamp;
    instance.status = 'connected';

    // Update dynamic capability data from heartbeat
    (instance.capabilities as { loadedModels: string[] }).loadedModels = heartbeat.loadedModels;

    // Track live resource utilization for instance selection
    this.gpuMemoryFree.set(instanceId, heartbeat.gpuMemoryFreeMb);
    this.activeJobCounts.set(instanceId, heartbeat.activeTrainingJobs);

    this.logger.debug(
      {
        instanceId,
        gpuMemoryFreeMb: heartbeat.gpuMemoryFreeMb,
        activeTrainingJobs: heartbeat.activeTrainingJobs,
        loadedModels: heartbeat.loadedModels.length,
      },
      'Ifran heartbeat processed'
    );
  }

  getGpuMemoryFreeMb(instanceId: string): number | undefined {
    return this.gpuMemoryFree.get(instanceId);
  }

  markDisconnected(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.status = 'disconnected';
      this.logger.warn({ instanceId }, 'Ifran instance marked disconnected');
    }
  }
}
