/**
 * Synapse Manager
 *
 * High-level orchestrator for Synapse integration. Manages client lifecycle,
 * heartbeat polling, and instance registry. Entry point for all Synapse operations.
 */

import type { SecureLogger } from '../../logging/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import type {
  SynapseConfig,
  SynapseInstance,
  SynapseTrainingJobRequest,
  SynapseTrainingJobResponse,
  SynapseHeartbeat,
} from './types.js';
import { SynapseClient } from './synapse-client.js';
import { SynapseRegistry } from './synapse-registry.js';

export class SynapseManager {
  private readonly config: SynapseConfig;
  private readonly logger: SecureLogger;
  private client: SynapseClient | null = null;
  private readonly registry: SynapseRegistry;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: SynapseConfig, logger: SecureLogger) {
    this.config = config;
    this.logger = logger.child({ component: 'synapse-manager' });
    this.registry = new SynapseRegistry(logger);
  }

  /**
   * Connect to the configured Synapse instance, fetch its status,
   * and register it in the registry. Starts heartbeat polling.
   */
  async init(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info({}, 'Synapse integration disabled');
      return;
    }

    this.logger.info({ apiUrl: this.config.apiUrl }, 'initializing Synapse connection');

    const client = this.getClient();
    try {
      const status = await client.getStatus();
      const instance: SynapseInstance = {
        ...status,
        status: 'connected',
        lastHeartbeat: Date.now(),
      };
      this.registry.register(instance);
      this.startHeartbeat(instance.id);
      this.logger.info(
        {
          instanceId: instance.id,
          version: instance.version,
          gpuCount: instance.capabilities.gpuCount,
        },
        'Synapse instance connected'
      );
    } catch (err) {
      this.logger.error({ error: toErrorMessage(err) }, 'failed to connect to Synapse');
      throw err;
    }
  }

  shutdown(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.logger.info({}, 'Synapse manager shut down');
  }

  getClient(): SynapseClient {
    if (!this.client) {
      this.client = new SynapseClient(this.config, this.logger);
    }
    return this.client;
  }

  getRegistry(): SynapseRegistry {
    return this.registry;
  }

  isAvailable(): boolean {
    return this.registry.getHealthy().length > 0;
  }

  /**
   * Delegate a training job to the best available Synapse instance.
   * If preferredMethod is provided it is used for instance selection,
   * otherwise the request's method field is used.
   */
  async delegateTrainingJob(
    req: SynapseTrainingJobRequest,
    preferredMethod?: string
  ): Promise<SynapseTrainingJobResponse> {
    const method = preferredMethod ?? req.method;
    const instance = this.registry.getBestForTraining(method);

    if (!instance) {
      throw new Error(`No healthy Synapse instance available for training method "${method}"`);
    }

    this.logger.info(
      { instanceId: instance.id, baseModel: req.baseModel, method },
      'delegating training job to Synapse instance'
    );

    // For now we only support a single configured instance, so we reuse our client.
    // When multi-instance support is added, create a client per endpoint.
    const client = this.getClient();
    return client.submitTrainingJob(req);
  }

  getStatus(): { instances: SynapseInstance[]; healthy: number; total: number } {
    const instances = this.registry.list();
    const healthy = this.registry.getHealthy().length;
    return { instances, healthy, total: instances.length };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private startHeartbeat(instanceId: string): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(async () => {
      await this.pollHeartbeat(instanceId);
    }, this.config.heartbeatIntervalMs);
  }

  private async pollHeartbeat(instanceId: string): Promise<void> {
    const client = this.getClient();
    try {
      const healthy = await client.isHealthy();
      if (!healthy) {
        this.registry.markDisconnected(instanceId);
        return;
      }

      const status = await client.getStatus();
      const heartbeat: SynapseHeartbeat = {
        instanceId: status.id,
        timestamp: Date.now(),
        loadedModels: status.capabilities.loadedModels,
        gpuMemoryFreeMb: status.capabilities.totalGpuMemoryMb, // approximation until dedicated heartbeat endpoint
        activeTrainingJobs: 0,
      };
      this.registry.updateHeartbeat(instanceId, heartbeat);
    } catch (err) {
      this.logger.warn({ instanceId, error: toErrorMessage(err) }, 'Synapse heartbeat poll failed');
      this.registry.markDisconnected(instanceId);
    }
  }
}
