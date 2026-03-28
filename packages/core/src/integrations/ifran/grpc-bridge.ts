/**
 * Ifran gRPC Bridge
 *
 * Implements bidirectional gRPC transport between SecureYeoman and Ifran.
 *
 * - YeomanBridgeServer: gRPC server on SY side — receives GPU allocation
 *   requests, progress reports, scale-out requests, and model registrations
 *   from Ifran. Matches Ifran's YeomanBridge service definition.
 *
 * - IfranGrpcClient: gRPC client that connects to Ifran's IfranBridge
 *   service for submitting training jobs, streaming job status, pulling models,
 *   and running inference.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import type { SecureLogger } from '../../logging/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import type { IfranStore } from './ifran-store.js';
import type { IfranRegistry } from './ifran-registry.js';
import type { IfranBridgeConfig, IfranStreamMetrics } from './types.js';

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
// Implements the YeomanBridge service that Ifran calls into SY.

export class YeomanBridgeServer {
  private server: grpc.Server | null = null;
  private readonly logger: SecureLogger;

  constructor(
    private readonly config: IfranBridgeConfig,
    private readonly store: IfranStore,
    private readonly registry: IfranRegistry,
    logger: SecureLogger
  ) {
    this.logger = logger.child({ component: 'yeoman-bridge-grpc' });
  }

  async start(): Promise<void> {
    const proto = loadProto();
    const bridge = (proto.ifran as grpc.GrpcObject).bridge as grpc.GrpcObject;
    const YeomanBridge = bridge.YeomanBridge as grpc.ServiceClientConstructor;

    this.server = new grpc.Server();

    this.server.addService(YeomanBridge.service, {
      requestGpuAllocation: (...args: Parameters<typeof this._handleRequestGpuAllocation>) => {
        void this._handleRequestGpuAllocation(...args);
      },
      reportProgress: (...args: Parameters<typeof this._handleReportProgress>) => {
        void this._handleReportProgress(...args);
      },
      requestScaleOut: (...args: Parameters<typeof this._handleRequestScaleOut>) => {
        void this._handleRequestScaleOut(...args);
      },
      registerCompletedModel: (...args: Parameters<typeof this._handleRegisterCompletedModel>) => {
        void this._handleRegisterCompletedModel(...args);
      },
    });

    const credentials =
      this.config.tlsCert && this.config.tlsKey
        ? grpc.ServerCredentials.createSsl(null, [
            {
              cert_chain: Buffer.from(this.config.tlsCert),
              private_key: Buffer.from(this.config.tlsKey),
            },
          ])
        : grpc.ServerCredentials.createInsecure();

    return new Promise((resolve, reject) => {
      this.server!.bindAsync(`0.0.0.0:${this.config.grpcPort}`, credentials, (err) => {
        if (err) {
          this.logger.error({ error: toErrorMessage(err) }, 'gRPC server bind failed');
          reject(err);
          return;
        }
        this.logger.info({ port: this.config.grpcPort }, 'YeomanBridge gRPC server started');
        resolve();
      });
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

  private async _handleRequestGpuAllocation(
    call: grpc.ServerUnaryCall<Record<string, unknown>, Record<string, unknown>>,
    callback: grpc.sendUnaryData<Record<string, unknown>>
  ): Promise<void> {
    try {
      const req = call.request;
      const memoryMb = req.memoryMb as number;
      const gpuCount = req.gpuCount as number;

      this.logger.info({ memoryMb, gpuCount }, 'GPU allocation request received from Ifran');

      // Find healthy instances with available GPU resources.
      // Use heartbeat free memory when available, fall back to total.
      const healthy = this.registry.getHealthy();
      const deviceIds: number[] = [];
      let granted = false;

      for (const instance of healthy) {
        const freeMem =
          this.registry.getGpuMemoryFreeMb(instance.id) ?? instance.capabilities.totalGpuMemoryMb;
        if (freeMem >= memoryMb) {
          // Grant GPUs from this instance (assign sequential device IDs)
          for (let i = 0; i < Math.min(gpuCount, instance.capabilities.gpuCount); i++) {
            deviceIds.push(i);
          }
          if (deviceIds.length >= gpuCount) {
            granted = true;
            break;
          }
        }
      }

      callback(null, { deviceIds, granted });
    } catch (err) {
      this.logger.error({ error: toErrorMessage(err) }, 'requestGpuAllocation failed');
      callback({ code: grpc.status.INTERNAL, message: toErrorMessage(err) });
    }
  }

  private async _handleReportProgress(
    call: grpc.ServerReadableStream<Record<string, unknown>, Record<string, unknown>>,
    callback: grpc.sendUnaryData<Record<string, unknown>>
  ): Promise<void> {
    try {
      for await (const update of call) {
        const jobId = update.jobId as string;
        const status = update.status as string;
        const loss = update.loss as number;
        const step = update.step as number;

        // Find delegated job by Ifran job ID and update it
        const delegated = await this.store.getDelegatedJobByIfranId(jobId);
        if (delegated) {
          await this.store.updateDelegatedJobStatus(delegated.id, {
            status: status.toLowerCase(),
            currentStep: step,
            currentLoss: loss,
          });
        }

        this.logger.debug({ jobId, status, step, loss }, 'progress update received from Ifran');
      }

      callback(null, {});
    } catch (err) {
      this.logger.error({ error: toErrorMessage(err) }, 'reportProgress failed');
      callback({ code: grpc.status.INTERNAL, message: toErrorMessage(err) });
    }
  }

  private async _handleRequestScaleOut(
    call: grpc.ServerUnaryCall<Record<string, unknown>, Record<string, unknown>>,
    callback: grpc.sendUnaryData<Record<string, unknown>>
  ): Promise<void> {
    try {
      const req = call.request;
      const additionalInstances = req.additionalInstances as number;
      const reason = req.reason as string;

      this.logger.info({ additionalInstances, reason }, 'scale-out request received from Ifran');

      // For now, SY doesn't auto-scale — return available instance endpoints
      const healthy = this.registry.getHealthy();
      const endpoints = healthy.map((i) => i.endpoint);

      callback(null, {
        approved: endpoints.length > 0,
        instanceEndpoints: endpoints,
      });
    } catch (err) {
      this.logger.error({ error: toErrorMessage(err) }, 'requestScaleOut failed');
      callback({ code: grpc.status.INTERNAL, message: toErrorMessage(err) });
    }
  }

  private async _handleRegisterCompletedModel(
    call: grpc.ServerUnaryCall<Record<string, unknown>, Record<string, unknown>>,
    callback: grpc.sendUnaryData<Record<string, unknown>>
  ): Promise<void> {
    try {
      const req = call.request;
      // Resolve instance ID: prefer peer address from gRPC metadata,
      // then fall back to the single connected instance if only one exists.
      // gRPC getPeer() returns "ipv4:HOST:PORT" or "ipv6:[HOST]:PORT".
      const peerAddr = call.getPeer?.() ?? '';
      const peerHost = peerAddr
        .replace(/^ipv[46]:/, '')
        .replace(/:\d+$/, '')
        .replace(/[[\]]/g, '');
      const instances = this.registry.getHealthy();
      const instanceId =
        instances.find((i) => peerHost && i.endpoint.includes(peerHost))?.id ??
        (instances.length === 1 ? instances[0]!.id : 'unknown');

      await this.store.registerModel(instanceId, {
        modelName: req.modelName as string,
        modelPath: req.modelPath as string,
        baseModel: req.baseModel as string,
        trainingMethod: req.trainingMethod as string,
      });

      this.logger.info({ modelName: req.modelName, instanceId }, 'model registered via gRPC');
      callback(null, {});
    } catch (err) {
      this.logger.error({ error: toErrorMessage(err) }, 'registerCompletedModel failed');
      callback({ code: grpc.status.INTERNAL, message: toErrorMessage(err) });
    }
  }
}

// ── IfranBridge gRPC Client ───────────────────────────────────────────────
// Connects to Ifran's IfranBridge service.

export class IfranGrpcClient {
  private client: grpc.Client | null = null;
  private readonly logger: SecureLogger;

  constructor(
    private readonly grpcUrl: string,
    logger: SecureLogger
  ) {
    this.logger = logger.child({ component: 'ifran-grpc-client' });
  }

  connect(): void {
    const proto = loadProto();
    const bridge = (proto.ifran as grpc.GrpcObject).bridge as grpc.GrpcObject;
    const IfranBridge = bridge.IfranBridge as grpc.ServiceClientConstructor;

    const url = this.grpcUrl.replace(/^https?:\/\//, '');
    this.client = new IfranBridge(url, grpc.credentials.createInsecure());
    this.logger.info({ grpcUrl: url }, 'connected to Ifran gRPC service');
  }

  close(): void {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }

  /**
   * Stream real-time job status updates.
   */
  async *streamJobStatus(jobId: string): AsyncGenerator<IfranStreamMetrics> {
    if (!this.client) throw new Error('gRPC client not connected');

    const call = (
      this.client as unknown as {
        getJobStatus: (
          req: Record<string, unknown>
        ) => grpc.ClientReadableStream<Record<string, unknown>>;
      }
    ).getJobStatus({ jobId });

    try {
      for await (const msg of call) {
        yield {
          jobId,
          step: msg.step as number,
          loss: msg.loss as number,
          epoch: msg.epoch as number,
          gpuMemoryUsedMb: 0,
          timestamp: Date.now(),
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

    const call = (
      this.client as unknown as {
        streamInference: (
          req: Record<string, unknown>
        ) => grpc.ClientReadableStream<Record<string, unknown>>;
      }
    ).streamInference({ model, prompt, maxTokens });

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
   * Run synchronous inference via gRPC.
   */
  async runInference(model: string, prompt: string, maxTokens: number): Promise<{ text: string }> {
    if (!this.client) throw new Error('gRPC client not connected');

    return new Promise((resolve, reject) => {
      (
        this.client as unknown as {
          runInference: (
            req: Record<string, unknown>,
            cb: (err: grpc.ServiceError | null, res?: Record<string, unknown>) => void
          ) => void;
        }
      ).runInference({ model, prompt, maxTokens }, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({ text: res!.text as string });
      });
    });
  }

  /**
   * Submit a training job via gRPC.
   */
  async submitTrainingJob(req: {
    baseModel: string;
    datasetPath: string;
    method: string;
    configJson?: string;
  }): Promise<{ jobId: string }> {
    if (!this.client) throw new Error('gRPC client not connected');

    return new Promise((resolve, reject) => {
      (
        this.client as unknown as {
          submitTrainingJob: (
            req: Record<string, unknown>,
            cb: (err: grpc.ServiceError | null, res?: Record<string, unknown>) => void
          ) => void;
        }
      ).submitTrainingJob(
        {
          baseModel: req.baseModel,
          datasetPath: req.datasetPath,
          method: req.method,
          configJson: req.configJson ?? '',
        },
        (err, res) => {
          if (err) {
            reject(err);
            return;
          }
          resolve({ jobId: res!.jobId as string });
        }
      );
    });
  }

  /**
   * Pull a model via gRPC streaming.
   */
  async *pullModel(
    modelName: string,
    quant: string
  ): AsyncGenerator<{ downloadedBytes: number; totalBytes: number; state: string }> {
    if (!this.client) throw new Error('gRPC client not connected');

    const call = (
      this.client as unknown as {
        pullModel: (
          req: Record<string, unknown>
        ) => grpc.ClientReadableStream<Record<string, unknown>>;
      }
    ).pullModel({ modelName, quant });

    try {
      for await (const msg of call) {
        yield {
          downloadedBytes: msg.downloadedBytes as number,
          totalBytes: msg.totalBytes as number,
          state: msg.state as string,
        };
      }
    } finally {
      call.cancel();
    }
  }
}
