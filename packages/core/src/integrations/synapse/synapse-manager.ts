/**
 * Synapse Manager
 *
 * High-level orchestrator for Synapse integration. Manages client lifecycle,
 * heartbeat polling, instance registry, and persistent DB state via SynapseStore.
 * Entry point for all Synapse operations including delegated job tracking.
 */

import type { SecureLogger } from '../../logging/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import type {
  SynapseConfig,
  SynapseInstance,
  SynapseTrainingJobRequest,
  SynapseTrainingJobResponse,
  SynapseHeartbeat,
  SynapseModelRegistration,
} from './types.js';
import { SynapseClient } from './synapse-client.js';
import { SynapseRegistry } from './synapse-registry.js';
import type { SynapseStore, DelegatedJobRow } from './synapse-store.js';
import type { YeomanBridgeServer, SynapseGrpcClient } from './grpc-bridge.js';

export class SynapseManager {
  private readonly config: SynapseConfig;
  private readonly logger: SecureLogger;
  private client: SynapseClient | null = null;
  private readonly registry: SynapseRegistry;
  private readonly store: SynapseStore | null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private grpcServer: YeomanBridgeServer | null = null;
  private grpcClient: SynapseGrpcClient | null = null;

  constructor(config: SynapseConfig, logger: SecureLogger, store?: SynapseStore) {
    this.config = config;
    this.logger = logger.child({ component: 'synapse-manager' });
    this.registry = new SynapseRegistry(logger);
    this.store = store ?? null;
  }

  /**
   * Connect to the configured Synapse instance, fetch its status,
   * and register it in the registry. Persists to DB if store available.
   * Starts heartbeat polling.
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
      await this.store?.upsertInstance(instance);
      this.startHeartbeat(instance.id);
      this.logger.info(
        {
          instanceId: instance.id,
          version: instance.version,
          gpuCount: instance.capabilities.gpuCount,
        },
        'Synapse instance connected'
      );
      // Start gRPC bridge if store is available
      if (this.store && this.config.grpcUrl) {
        try {
          const { YeomanBridgeServer, SynapseGrpcClient } = await import('./grpc-bridge.js');
          const grpcPort = Number(new URL(this.config.grpcUrl).port || 8421);

          this.grpcServer = new YeomanBridgeServer(
            { grpcPort },
            this.store,
            this.registry,
            this.logger
          );
          await this.grpcServer.start();

          this.grpcClient = new SynapseGrpcClient(this.config.grpcUrl, this.logger);
          this.grpcClient.connect();
        } catch (grpcErr) {
          this.logger.warn(
            { error: toErrorMessage(grpcErr) },
            'gRPC bridge init failed (non-fatal, REST-only mode)'
          );
        }
      }
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
    if (this.grpcServer) {
      this.grpcServer.shutdown();
      this.grpcServer = null;
    }
    if (this.grpcClient) {
      this.grpcClient.close();
      this.grpcClient = null;
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

  getStore(): SynapseStore | null {
    return this.store;
  }

  isAvailable(): boolean {
    return this.registry.getHealthy().length > 0;
  }

  getGrpcClient(): SynapseGrpcClient | null {
    return this.grpcClient;
  }

  /**
   * Delegate a training job to the best available Synapse instance.
   * Tracks the delegation in the DB via SynapseStore if available.
   *
   * @param req - Training job specification
   * @param opts - Optional: preferredMethod for instance selection,
   *               syJobId/syJobType to link back to the SY-side job
   * @returns The Synapse job response and optional delegated job record
   */
  async delegateTrainingJob(
    req: SynapseTrainingJobRequest,
    opts?: { preferredMethod?: string; syJobId?: string; syJobType?: string }
  ): Promise<{ response: SynapseTrainingJobResponse; delegatedJob?: DelegatedJobRow }> {
    const method = opts?.preferredMethod ?? req.method;
    const instance = this.registry.getBestForTraining(method);

    if (!instance) {
      throw new Error(`No healthy Synapse instance available for training method "${method}"`);
    }

    this.logger.info(
      { instanceId: instance.id, baseModel: req.baseModel, method },
      'delegating training job to Synapse instance'
    );

    const client = this.getClient();
    const response = await client.submitTrainingJob(req);

    // Persist delegation record
    let delegatedJob: DelegatedJobRow | undefined;
    if (this.store) {
      delegatedJob = await this.store.createDelegatedJob(
        instance.id,
        response.jobId,
        req,
        opts?.syJobId,
        opts?.syJobType ?? 'finetune'
      );
    }

    return { response, delegatedJob };
  }

  /**
   * Poll a delegated job's status from Synapse and update the local record.
   */
  async syncDelegatedJobStatus(delegatedJobId: string): Promise<DelegatedJobRow | null> {
    if (!this.store) return null;

    const job = await this.store.getDelegatedJob(delegatedJobId);
    if (!job) return null;

    try {
      const client = this.getClient();
      const status = await client.getJobStatus(job.synapseJobId);
      return await this.store.updateDelegatedJobStatus(delegatedJobId, {
        status: status.status,
        currentStep: status.step,
        currentLoss: status.loss,
        currentEpoch: status.epoch,
      });
    } catch (err) {
      this.logger.warn(
        { delegatedJobId, error: toErrorMessage(err) },
        'failed to sync delegated job status'
      );
      return job;
    }
  }

  /**
   * Register a model produced by a completed Synapse training job.
   */
  async registerModel(
    instanceId: string,
    reg: SynapseModelRegistration,
    jobId?: string
  ): Promise<void> {
    if (!this.store) {
      this.logger.warn({}, 'cannot register model: no SynapseStore configured');
      return;
    }
    await this.store.registerModel(instanceId, reg, jobId);
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

    this.heartbeatTimer = setInterval(() => {
      void this.pollHeartbeat(instanceId);
    }, this.config.heartbeatIntervalMs);
  }

  private async pollHeartbeat(instanceId: string): Promise<void> {
    const client = this.getClient();
    try {
      const healthy = await client.isHealthy();
      if (!healthy) {
        this.registry.markDisconnected(instanceId);
        await this.store?.markDisconnected(instanceId);
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
      await this.store?.updateHeartbeat(instanceId, heartbeat);
    } catch (err) {
      this.logger.warn({ instanceId, error: toErrorMessage(err) }, 'Synapse heartbeat poll failed');
      this.registry.markDisconnected(instanceId);
      await this.store?.markDisconnected(instanceId);
    }
  }
}
