/**
 * Synapse gRPC Bridge
 *
 * Implements bidirectional gRPC transport between SecureYeoman and Synapse.
 *
 * - YeomanBridgeServer: gRPC server on SY side (port 8421) — receives
 *   capability announcements, inbound jobs, job status reports, and model
 *   registrations from Synapse.
 *
 * - SynapseGrpcClient: gRPC client that connects to Synapse's SynapseService
 *   for streaming training metrics and inference tokens.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import type { SecureLogger } from '../../logging/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import type { SynapseStore } from './synapse-store.js';
import type { SynapseRegistry } from './synapse-registry.js';
import type {
  SynapseBridgeConfig,
  SynapseStreamMetrics,
} from './types.js';

// ── Proto loading ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = join(__dirname, 'bridge.proto');

function loadProto(): grpc.GrpcObject {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(packageDefinition);
}

// ── YeomanBridge Server ──────────────────────────────────────────────────────

export class YeomanBridgeServer {
  private server: grpc.Server | null = null;
  private readonly logger: SecureLogger;

  constructor(
    private readonly config: SynapseBridgeConfig,
    private readonly store: SynapseStore,
    private readonly registry: SynapseRegistry,
    logger: SecureLogger
  ) {
    this.logger = logger.child({ component: 'yeoman-bridge-grpc' });
  }

  async start(): Promise<void> {
    const proto = loadProto();
    const bridge = (proto.synapse as grpc.GrpcObject).bridge as grpc.GrpcObject;
    const YeomanBridge = bridge.YeomanBridge as grpc.ServiceClientConstructor;

    this.server = new grpc.Server();

    this.server.addService(YeomanBridge.service, {
      announceCapabilities: this._handleAnnounceCapabilities.bind(this),
      submitInboundJob: this._handleSubmitInboundJob.bind(this),
      reportJobStatus: this._handleReportJobStatus.bind(this),
      registerModel: this._handleRegisterModel.bind(this),
    });

    const credentials = this.config.tlsCert && this.config.tlsKey
      ? grpc.ServerCredentials.createSsl(null, [{
          cert_chain: Buffer.from(this.config.tlsCert),
          private_key: Buffer.from(this.config.tlsKey),
        }])
      : grpc.ServerCredentials.createInsecure();

    return new Promise((resolve, reject) => {
      this.server!.bindAsync(
        `0.0.0.0:${this.config.grpcPort}`,
        credentials,
        (err) => {
          if (err) {
            this.logger.error({ error: toErrorMessage(err) }, 'gRPC server bind failed');
            reject(err);
            return;
          }
          this.logger.info({ port: this.config.grpcPort }, 'YeomanBridge gRPC server started');
          resolve();
        }
      );
    });
  }

  shutdown(): void {
    if (this.server) {
      this.server.forceShutdown();
      this.server = null;
      this.logger.info({}, 'YeomanBridge gRPC server stopped');
    }
  }

  // ── RPC handlers ─────────────────────────────────────────────────────

  private async _handleAnnounceCapabilities(
    call: grpc.ServerUnaryCall<Record<string, unknown>, Record<string, unknown>>,
    callback: grpc.sendUnaryData<Record<string, unknown>>
  ): Promise<void> {
    try {
      const req = call.request;
      const instanceId = req.instanceId as string;
      const capabilities = {
        gpuCount: req.gpuCount as number,
        totalGpuMemoryMb: req.totalGpuMemoryMb as number,
        supportedMethods: req.supportedMethods as string[],
        loadedModels: req.loadedModels as string[],
      };

      await this.store.recordCapabilityAnnouncement(instanceId, capabilities);

      // Update registry if instance is known
      const existing = this.registry.get(instanceId);
      if (existing) {
        this.registry.updateHeartbeat(instanceId, {
          instanceId,
          timestamp: Date.now(),
          loadedModels: capabilities.loadedModels,
          gpuMemoryFreeMb: capabilities.totalGpuMemoryMb,
          activeTrainingJobs: 0,
        });
      }

      this.logger.info({ instanceId }, 'capability announcement received via gRPC');
      callback(null, { success: true, message: 'capabilities recorded' });
    } catch (err) {
      this.logger.error({ error: toErrorMessage(err) }, 'announceCapabilities failed');
      callback({ code: grpc.status.INTERNAL, message: toErrorMessage(err) });
    }
  }

  private async _handleSubmitInboundJob(
    call: grpc.ServerUnaryCall<Record<string, unknown>, Record<string, unknown>>,
    callback: grpc.sendUnaryData<Record<string, unknown>>
  ): Promise<void> {
    try {
      const req = call.request;
      const job = await this.store.createInboundJob(req.instanceId as string, {
        synapseSourceJobId: req.synapseSourceJobId as string,
        jobType: (req.jobType as string) as 'evaluation' | 'data_curation' | 'model_export' | 'custom',
        description: req.description as string,
        payload: req.payloadJson ? JSON.parse(req.payloadJson as string) : {},
      });

      this.logger.info({ inboundJobId: job.id, jobType: req.jobType }, 'inbound job submitted via gRPC');
      callback(null, { id: job.id, status: job.status });
    } catch (err) {
      this.logger.error({ error: toErrorMessage(err) }, 'submitInboundJob failed');
      callback({ code: grpc.status.INTERNAL, message: toErrorMessage(err) });
    }
  }

  private async _handleReportJobStatus(
    call: grpc.ServerUnaryCall<Record<string, unknown>, Record<string, unknown>>,
    callback: grpc.sendUnaryData<Record<string, unknown>>
  ): Promise<void> {
    try {
      const req = call.request;
      const synapseJobId = req.synapseJobId as string;

      const delegated = await this.store.getDelegatedJobBySynapseId(synapseJobId);
      if (!delegated) {
        callback({ code: grpc.status.NOT_FOUND, message: `Unknown synapse job: ${synapseJobId}` });
        return;
      }

      await this.store.updateDelegatedJobStatus(delegated.id, {
        status: req.status as string,
        currentStep: req.step as number,
        currentLoss: req.loss as number,
        currentEpoch: req.epoch as number,
        errorMessage: req.errorMessage as string,
        modelOutputPath: req.modelOutputPath as string,
      });

      this.logger.info({ synapseJobId, status: req.status }, 'job status reported via gRPC');
      callback(null, { success: true, message: 'status updated' });
    } catch (err) {
      this.logger.error({ error: toErrorMessage(err) }, 'reportJobStatus failed');
      callback({ code: grpc.status.INTERNAL, message: toErrorMessage(err) });
    }
  }

  private async _handleRegisterModel(
    call: grpc.ServerUnaryCall<Record<string, unknown>, Record<string, unknown>>,
    callback: grpc.sendUnaryData<Record<string, unknown>>
  ): Promise<void> {
    try {
      const req = call.request;
      await this.store.registerModel(
        req.instanceId as string,
        {
          modelName: req.modelName as string,
          modelPath: req.modelPath as string,
          baseModel: req.baseModel as string,
          trainingMethod: req.trainingMethod as string,
        },
        (req.jobId as string) || undefined
      );

      this.logger.info({ modelName: req.modelName, instanceId: req.instanceId }, 'model registered via gRPC');
      callback(null, { success: true, message: 'model registered' });
    } catch (err) {
      this.logger.error({ error: toErrorMessage(err) }, 'registerModel failed');
      callback({ code: grpc.status.INTERNAL, message: toErrorMessage(err) });
    }
  }
}

// ── SynapseService gRPC Client ──────────────────────────────────────────────

export class SynapseGrpcClient {
  private client: grpc.Client | null = null;
  private readonly logger: SecureLogger;

  constructor(
    private readonly grpcUrl: string,
    logger: SecureLogger
  ) {
    this.logger = logger.child({ component: 'synapse-grpc-client' });
  }

  connect(): void {
    const proto = loadProto();
    const bridge = (proto.synapse as grpc.GrpcObject).bridge as grpc.GrpcObject;
    const SynapseService = bridge.SynapseService as grpc.ServiceClientConstructor;

    const url = this.grpcUrl.replace(/^https?:\/\//, '');
    this.client = new SynapseService(url, grpc.credentials.createInsecure());
    this.logger.info({ grpcUrl: url }, 'connected to Synapse gRPC service');
  }

  close(): void {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }

  /**
   * Stream real-time training metrics for a job.
   */
  async *streamTrainingMetrics(jobId: string): AsyncGenerator<SynapseStreamMetrics> {
    if (!this.client) throw new Error('gRPC client not connected');

    const call = (this.client as unknown as {
      streamTrainingMetrics: (req: Record<string, unknown>) => grpc.ClientReadableStream<Record<string, unknown>>;
    }).streamTrainingMetrics({ jobId });

    try {
      for await (const msg of call) {
        yield {
          jobId: msg.jobId as string,
          step: msg.step as number,
          loss: msg.loss as number,
          epoch: msg.epoch as number,
          gpuMemoryUsedMb: msg.gpuMemoryUsedMb as number,
          timestamp: msg.timestamp as number,
        };
      }
    } finally {
      call.cancel();
    }
  }

  /**
   * Stream inference tokens.
   */
  async *streamInference(
    model: string,
    prompt: string,
    maxTokens: number
  ): AsyncGenerator<{ text: string; done: boolean }> {
    if (!this.client) throw new Error('gRPC client not connected');

    const call = (this.client as unknown as {
      streamInference: (req: Record<string, unknown>) => grpc.ClientReadableStream<Record<string, unknown>>;
    }).streamInference({ model, prompt, maxTokens });

    try {
      for await (const msg of call) {
        yield {
          text: msg.text as string,
          done: msg.done as boolean,
        };
      }
    } finally {
      call.cancel();
    }
  }

  /**
   * Get capabilities of the remote Synapse instance.
   */
  async getCapabilities(): Promise<{
    instanceId: string;
    gpuCount: number;
    totalGpuMemoryMb: number;
    supportedMethods: string[];
    loadedModels: string[];
    version: string;
  }> {
    if (!this.client) throw new Error('gRPC client not connected');

    return new Promise((resolve, reject) => {
      (this.client as unknown as {
        getCapabilities: (
          req: Record<string, unknown>,
          cb: (err: grpc.ServiceError | null, res?: Record<string, unknown>) => void
        ) => void;
      }).getCapabilities({}, (err, res) => {
        if (err) return reject(err);
        resolve({
          instanceId: res!.instanceId as string,
          gpuCount: res!.gpuCount as number,
          totalGpuMemoryMb: res!.totalGpuMemoryMb as number,
          supportedMethods: res!.supportedMethods as string[],
          loadedModels: res!.loadedModels as string[],
          version: res!.version as string,
        });
      });
    });
  }

  /**
   * Submit a training job via gRPC (alternative to REST).
   */
  async submitTrainingJob(req: {
    baseModel: string;
    datasetPath: string;
    method: string;
    configJson?: string;
    syJobId?: string;
    syJobType?: string;
  }): Promise<{ jobId: string }> {
    if (!this.client) throw new Error('gRPC client not connected');

    return new Promise((resolve, reject) => {
      (this.client as unknown as {
        submitTrainingJob: (
          req: Record<string, unknown>,
          cb: (err: grpc.ServiceError | null, res?: Record<string, unknown>) => void
        ) => void;
      }).submitTrainingJob(
        {
          baseModel: req.baseModel,
          datasetPath: req.datasetPath,
          method: req.method,
          configJson: req.configJson ?? '',
          syJobId: req.syJobId ?? '',
          syJobType: req.syJobType ?? 'finetune',
        },
        (err, res) => {
          if (err) return reject(err);
          resolve({ jobId: res!.jobId as string });
        }
      );
    });
  }
}
