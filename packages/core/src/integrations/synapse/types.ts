/**
 * Synapse Integration Types
 *
 * TypeScript interfaces matching the Synapse bridge.proto and protocol.rs definitions.
 * Synapse is a Rust-based LLM controller communicating via REST (port 8420)
 * and gRPC (port 8421).
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
  readonly status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  readonly step: number;
  readonly loss: number;
  readonly epoch: number;
}

export interface SynapseInferenceRequest {
  readonly model: string;
  readonly prompt: string;
  readonly maxTokens: number;
}

export interface SynapseInferenceResponse {
  readonly text: string;
}

export interface SynapsePullRequest {
  readonly modelName: string;
  readonly quant?: string;
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
