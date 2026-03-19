/**
 * Synapse Integration Types
 *
 * TypeScript interfaces matching the Synapse bridge.proto and REST API definitions.
 * Synapse is a Rust-based LLM controller communicating via REST (port 8420)
 * and gRPC (port 8421).
 *
 * NOTE: Synapse's REST API uses snake_case. Transformation between SY's
 * camelCase and Synapse's wire format happens in synapse-client.ts.
 */

export type SynapseInstanceStatus = 'connected' | 'disconnected' | 'degraded';

export interface SynapseCapabilities {
  readonly gpuCount: number;
  readonly totalGpuMemoryMb: number;
  readonly supportedMethods: string[];
  readonly loadedModels: string[];
}

export interface SynapseInstance {
  readonly id: string;
  readonly endpoint: string;
  readonly version: string;
  readonly capabilities: SynapseCapabilities;
  status: SynapseInstanceStatus;
  lastHeartbeat: number;
}

export interface SynapseHeartbeat {
  readonly instanceId: string;
  readonly timestamp: number;
  readonly loadedModels: string[];
  readonly gpuMemoryFreeMb: number;
  readonly activeTrainingJobs: number;
}

export interface SynapseTrainingJobRequest {
  readonly baseModel: string;
  readonly datasetPath: string;
  readonly method: string;
  readonly configJson?: string;
}

export interface SynapseTrainingJobResponse {
  readonly jobId: string;
}

export interface SynapseJobStatus {
  readonly status:
    | 'queued'
    | 'preparing'
    | 'running'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'cancelled';
  readonly step: number;
  readonly totalSteps: number;
  readonly loss: number | null;
  readonly epoch: number;
  readonly progressPercent: number;
  readonly error: string | null;
  readonly createdAt: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}

export interface SynapseInferenceRequest {
  readonly model: string;
  readonly prompt: string;
  readonly maxTokens: number;
  readonly temperature?: number;
  readonly topP?: number;
  readonly topK?: number;
  readonly systemPrompt?: string;
}

export interface SynapseInferenceResponse {
  readonly text: string;
  readonly usage?: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  };
  readonly finishReason?: string;
}

export interface SynapsePullRequest {
  readonly modelName: string;
  readonly sourceUrl: string;
  readonly expectedSha256?: string;
}

export interface SynapsePullProgress {
  readonly downloadedBytes: number;
  readonly totalBytes: number;
  readonly state: 'downloading' | 'verifying' | 'complete' | 'failed';
}

export interface SynapseModelRegistration {
  readonly modelName: string;
  readonly modelPath: string;
  readonly baseModel: string;
  readonly trainingMethod: string;
}

export interface SynapseConfig {
  readonly apiUrl: string;
  readonly grpcUrl: string;
  readonly enabled: boolean;
  readonly heartbeatIntervalMs: number;
  readonly connectionTimeoutMs: number;
}

// ── Synapse raw wire types (snake_case as returned by Synapse REST API) ─────

/** Raw response from GET /system/status on Synapse. */
export interface SynapseStatusResponse {
  readonly version: string;
  readonly loaded_models: number;
  readonly registered_backends: string[];
  readonly hardware?: {
    readonly cpu?: {
      readonly model: string;
      readonly cores: number;
      readonly threads: number;
      readonly memory_total_mb: number;
      readonly memory_available_mb: number;
    };
    readonly gpus: {
      readonly index: number;
      readonly name: string;
      readonly memory_total_mb: number;
      readonly memory_free_mb: number;
    }[];
  };
  readonly bridge: {
    readonly enabled: boolean;
    readonly client_state: string;
    readonly server_state: string;
  };
}

/** Raw response from GET /training/jobs/:id on Synapse. */
export interface SynapseJobResponse {
  readonly id: string;
  readonly status: string;
  readonly current_step: number;
  readonly total_steps: number;
  readonly current_epoch: number;
  readonly current_loss: number | null;
  readonly progress_percent: number;
  readonly error: string | null;
  readonly created_at: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
}

// ── Inbound job delegation (Synapse → SY) ───────────────────────────────────

export type InboundJobType = 'evaluation' | 'data_curation' | 'model_export' | 'custom';
export type InboundJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'rejected';

export interface SynapseInboundJobRequest {
  readonly synapseSourceJobId?: string;
  readonly jobType: InboundJobType;
  readonly description?: string;
  readonly payload: Record<string, unknown>;
}

export interface SynapseInboundJobResponse {
  readonly id: string;
  readonly status: InboundJobStatus;
}

// ── Capability announcement ─────────────────────────────────────────────────

export interface SynapseCapabilityAnnouncement {
  readonly instanceId: string;
  readonly capabilities: SynapseCapabilities;
  readonly announcedAt: number;
}

// ── gRPC bridge types ───────────────────────────────────────────────────────

export interface SynapseStreamMetrics {
  readonly jobId: string;
  readonly step: number;
  readonly loss: number;
  readonly epoch: number;
  readonly gpuMemoryUsedMb: number;
  readonly timestamp: number;
}

export interface SynapseBridgeConfig {
  readonly grpcPort: number;
  readonly tlsCert?: string;
  readonly tlsKey?: string;
}
