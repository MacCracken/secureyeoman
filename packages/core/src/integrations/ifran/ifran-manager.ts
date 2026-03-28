/**
 * Ifran Manager
 *
 * High-level orchestrator for Ifran integration. Manages client lifecycle,
 * heartbeat polling, instance registry, and persistent DB state via IfranStore.
 * Entry point for all Ifran operations including delegated job tracking.
 */

import type { SecureLogger } from '../../logging/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import type {
  IfranConfig,
  IfranInstance,
  IfranTrainingJobRequest,
  IfranTrainingJobResponse,
  IfranHeartbeat,
  IfranModelRegistration,
} from './types.js';
import { IfranClient } from './ifran-client.js';
import { IfranRegistry } from './ifran-registry.js';
import type { IfranStore, DelegatedJobRow } from './ifran-store.js';
import type { YeomanBridgeServer, IfranGrpcClient } from './grpc-bridge.js';

export class IfranManager {
  private readonly config: IfranConfig;
  private readonly logger: SecureLogger;
  private client: IfranClient | null = null;
  private readonly registry: IfranRegistry;
  private readonly store: IfranStore | null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private grpcServer: YeomanBridgeServer | null = null;
  private grpcClient: IfranGrpcClient | null = null;

  constructor(config: IfranConfig, logger: SecureLogger, store?: IfranStore) {
    this.config = config;
    this.logger = logger.child({ component: 'ifran-manager' });
    this.registry = new IfranRegistry(logger);
    this.store = store ?? null;
  }

  /**
   * Connect to the configured Ifran instance, fetch its status,
   * and register it in the registry. Persists to DB if store available.
   * Starts heartbeat polling.
   */
  async init(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info({}, 'Ifran integration disabled');
      return;
    }

    this.logger.info({ apiUrl: this.config.apiUrl }, 'initializing Ifran connection');

    const client = this.getClient();
    try {
      const status = await client.getStatus();
      const instance: IfranInstance = {
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
        'Ifran instance connected'
      );
      // Start gRPC bridge if store is available
      if (this.store && this.config.grpcUrl) {
        try {
          const { YeomanBridgeServer, IfranGrpcClient } = await import('./grpc-bridge.js');
          const grpcPort = Number(new URL(this.config.grpcUrl).port || 8421);

          this.grpcServer = new YeomanBridgeServer(
            { grpcPort },
            this.store,
            this.registry,
            this.logger
          );
          await this.grpcServer.start();

          this.grpcClient = new IfranGrpcClient(this.config.grpcUrl, this.logger);
          this.grpcClient.connect();
        } catch (grpcErr) {
          this.logger.warn(
            { error: toErrorMessage(grpcErr) },
            'gRPC bridge init failed (non-fatal, REST-only mode)'
          );
        }
      }
    } catch (err) {
      this.logger.error({ error: toErrorMessage(err) }, 'failed to connect to Ifran');
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
    this.logger.info({}, 'Ifran manager shut down');
  }

  getClient(): IfranClient {
    if (!this.client) {
      this.client = new IfranClient(this.config, this.logger);
    }
    return this.client;
  }

  getRegistry(): IfranRegistry {
    return this.registry;
  }

  getStore(): IfranStore | null {
    return this.store;
  }

  isAvailable(): boolean {
    return this.registry.getHealthy().length > 0;
  }

  getGrpcClient(): IfranGrpcClient | null {
    return this.grpcClient;
  }

  /**
   * Delegate a training job to the best available Ifran instance.
   * Tracks the delegation in the DB via IfranStore if available.
   *
   * @param req - Training job specification
   * @param opts - Optional: preferredMethod for instance selection,
   *               syJobId/syJobType to link back to the SY-side job
   * @returns The Ifran job response and optional delegated job record
   */
  async delegateTrainingJob(
    req: IfranTrainingJobRequest,
    opts?: { preferredMethod?: string; syJobId?: string; syJobType?: string }
  ): Promise<{ response: IfranTrainingJobResponse; delegatedJob?: DelegatedJobRow }> {
    const method = opts?.preferredMethod ?? req.method;
    const instance = this.registry.getBestForTraining(method);

    if (!instance) {
      throw new Error(`No healthy Ifran instance available for training method "${method}"`);
    }

    this.logger.info(
      { instanceId: instance.id, baseModel: req.baseModel, method },
      'delegating training job to Ifran instance'
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
   * Poll a delegated job's status from Ifran and update the local record.
   */
  async syncDelegatedJobStatus(delegatedJobId: string): Promise<DelegatedJobRow | null> {
    if (!this.store) return null;

    const job = await this.store.getDelegatedJob(delegatedJobId);
    if (!job) return null;

    try {
      const client = this.getClient();
      const status = await client.getJobStatus(job.ifranJobId);
      return await this.store.updateDelegatedJobStatus(delegatedJobId, {
        status: status.status,
        currentStep: status.step,
        currentLoss: status.loss ?? undefined,
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
   * Register a model produced by a completed Ifran training job.
   */
  async registerModel(
    instanceId: string,
    reg: IfranModelRegistration,
    jobId?: string
  ): Promise<void> {
    if (!this.store) {
      this.logger.warn({}, 'cannot register model: no IfranStore configured');
      return;
    }
    await this.store.registerModel(instanceId, reg, jobId);
  }

  getStatus(): { instances: IfranInstance[]; healthy: number; total: number } {
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
    const wasDisconnected = this.registry.get(instanceId)?.status !== 'connected';

    try {
      const healthy = await client.isHealthy();
      if (!healthy) {
        this.registry.markDisconnected(instanceId);
        await this.store?.markDisconnected(instanceId);
        return;
      }

      const status = await client.getStatus();

      // Reconnection: if instance was previously disconnected, re-register
      // with fresh capabilities and log the recovery
      if (wasDisconnected) {
        this.logger.info(
          { instanceId, version: status.version },
          'Ifran instance reconnected after disconnect'
        );
        const instance: IfranInstance = {
          ...status,
          status: 'connected',
          lastHeartbeat: Date.now(),
        };
        this.registry.register(instance);
        await this.store?.upsertInstance(instance);
        return;
      }

      // _gpuMemoryFreeMb is set by the client from Ifran GPU telemetry
      const extStatus = status as IfranInstance & { _gpuMemoryFreeMb?: number };
      const heartbeat: IfranHeartbeat = {
        instanceId: status.id,
        timestamp: Date.now(),
        loadedModels: status.capabilities.loadedModels,
        gpuMemoryFreeMb: extStatus._gpuMemoryFreeMb ?? status.capabilities.totalGpuMemoryMb,
        activeTrainingJobs: 0,
      };
      this.registry.updateHeartbeat(instanceId, heartbeat);
      await this.store?.updateHeartbeat(instanceId, heartbeat);
    } catch (err) {
      this.logger.warn({ instanceId, error: toErrorMessage(err) }, 'Ifran heartbeat poll failed');
      this.registry.markDisconnected(instanceId);
      await this.store?.markDisconnected(instanceId);
    }
  }
}
