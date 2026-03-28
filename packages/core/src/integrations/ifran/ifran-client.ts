/**
 * Ifran REST Client
 *
 * Communicates with a Ifran LLM controller instance via its REST API (port 8420).
 * Supports both request/response and SSE streaming endpoints.
 *
 * IMPORTANT: Ifran uses snake_case for all JSON field names. This client
 * transforms between SY's camelCase types and Ifran's wire format at the
 * boundary so all internal SY code uses camelCase consistently.
 */

import type { SecureLogger } from '../../logging/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import type {
  IfranConfig,
  IfranInstance,
  IfranTrainingJobRequest,
  IfranTrainingJobResponse,
  IfranJobStatus,
  IfranInferenceRequest,
  IfranInferenceResponse,
  IfranPullRequest,
  IfranPullProgress,
  IfranStatusResponse,
  IfranJobResponse,
} from './types.js';

interface FetchOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

// ── Wire format transformers ────────────────────────────────────────────────

/** Convert Ifran /system/status response → IfranInstance. */
function statusToInstance(raw: IfranStatusResponse, endpoint: string): IfranInstance {
  const gpus = raw.hardware?.gpus ?? [];
  const totalGpuMemoryMb = gpus.reduce((sum, g) => sum + (g.memory_total_mb ?? 0), 0);
  const gpuMemoryFreeMb = gpus.reduce((sum, g) => sum + (g.memory_free_mb ?? 0), 0);

  return {
    id: endpoint,
    endpoint,
    version: raw.version ?? '',
    capabilities: {
      gpuCount: gpus.length,
      totalGpuMemoryMb,
      supportedMethods: raw.registered_backends ?? [],
      loadedModels: [], // model names not in status; use listModels separately
    },
    status: 'connected',
    lastHeartbeat: Date.now(),
    // Expose free memory for heartbeat approximation
    _gpuMemoryFreeMb: gpuMemoryFreeMb,
  } as IfranInstance & { _gpuMemoryFreeMb: number };
}

/** Convert Ifran JobResponse (snake_case) → IfranJobStatus (camelCase). */
function jobResponseToStatus(raw: IfranJobResponse): IfranJobStatus {
  return {
    status: raw.status.toLowerCase() as IfranJobStatus['status'],
    step: raw.current_step ?? 0,
    totalSteps: raw.total_steps ?? 0,
    loss: raw.current_loss ?? null,
    epoch: raw.current_epoch ?? 0,
    progressPercent: raw.progress_percent ?? 0,
    error: raw.error ?? null,
    createdAt: raw.created_at ?? null,
    startedAt: raw.started_at ?? null,
    completedAt: raw.completed_at ?? null,
  };
}

/** Convert SY training request → Ifran snake_case wire format. */
function trainingRequestToWire(req: IfranTrainingJobRequest): Record<string, unknown> {
  // Parse configJson for hyperparams and extra options
  const hyperparams: Record<string, unknown> = {
    learning_rate: 2e-4,
    epochs: 3,
    batch_size: 4,
    gradient_accumulation_steps: 1,
    warmup_steps: 100,
    weight_decay: 0.01,
    max_seq_length: 512,
  };
  let outputName: string | undefined;
  let lora: Record<string, unknown> | undefined;
  let maxSteps: number | undefined;
  let timeBudgetSecs: number | undefined;
  let datasetFormat = 'jsonl';
  let datasetSplit: string | undefined;
  let maxSamples: number | undefined;

  if (req.configJson) {
    try {
      const parsed = JSON.parse(req.configJson) as Record<string, unknown>;
      if (parsed.learning_rate != null || parsed.learningRate != null)
        hyperparams.learning_rate = parsed.learning_rate ?? parsed.learningRate;
      if (parsed.epochs != null) hyperparams.epochs = parsed.epochs;
      if (parsed.batch_size != null || parsed.batchSize != null)
        hyperparams.batch_size = parsed.batch_size ?? parsed.batchSize;
      if (parsed.gradient_accumulation_steps != null || parsed.gradientAccumulationSteps != null)
        hyperparams.gradient_accumulation_steps =
          parsed.gradient_accumulation_steps ?? parsed.gradientAccumulationSteps;
      if (parsed.warmup_steps != null || parsed.warmupSteps != null)
        hyperparams.warmup_steps = parsed.warmup_steps ?? parsed.warmupSteps;
      if (parsed.weight_decay != null || parsed.weightDecay != null)
        hyperparams.weight_decay = parsed.weight_decay ?? parsed.weightDecay;
      if (parsed.max_seq_length != null || parsed.maxSeqLength != null)
        hyperparams.max_seq_length = parsed.max_seq_length ?? parsed.maxSeqLength;
      if (parsed.output_name != null || parsed.outputName != null)
        outputName = (parsed.output_name ?? parsed.outputName) as string;
      if (parsed.lora != null) lora = parsed.lora as Record<string, unknown>;
      if (parsed.max_steps != null || parsed.maxSteps != null)
        maxSteps = (parsed.max_steps ?? parsed.maxSteps) as number;
      if (parsed.time_budget_secs != null || parsed.timeBudgetSecs != null)
        timeBudgetSecs = (parsed.time_budget_secs ?? parsed.timeBudgetSecs) as number;
      if (parsed.dataset_format != null || parsed.datasetFormat != null)
        datasetFormat = (parsed.dataset_format ?? parsed.datasetFormat) as string;
      if (parsed.dataset_split != null || parsed.datasetSplit != null)
        datasetSplit = (parsed.dataset_split ?? parsed.datasetSplit) as string;
      if (parsed.max_samples != null || parsed.maxSamples != null)
        maxSamples = (parsed.max_samples ?? parsed.maxSamples) as number;
    } catch {
      // configJson is not valid JSON — use defaults
    }
  }

  // Map SY method names to Ifran TrainingMethod enum values
  const methodMap: Record<string, string> = {
    full: 'full_fine_tune',
    lora: 'lora',
    qlora: 'qlora',
    dpo: 'dpo',
    rlhf: 'rlhf',
    distillation: 'distillation',
    sft: 'lora', // SFT maps to LoRA by default
  };

  const wire: Record<string, unknown> = {
    base_model: req.baseModel,
    dataset: {
      path: req.datasetPath,
      format: datasetFormat,
      ...(datasetSplit ? { split: datasetSplit } : {}),
      ...(maxSamples != null ? { max_samples: maxSamples } : {}),
    },
    method: methodMap[req.method] ?? req.method,
    hyperparams,
  };
  if (outputName) wire.output_name = outputName;
  if (lora) wire.lora = lora;
  if (maxSteps != null) wire.max_steps = maxSteps;
  if (timeBudgetSecs != null) wire.time_budget_secs = timeBudgetSecs;

  return wire;
}

/** Convert SY inference request → Ifran snake_case wire format. */
function inferenceRequestToWire(req: IfranInferenceRequest): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    model: req.model,
    prompt: req.prompt,
    max_tokens: req.maxTokens,
  };
  if (req.temperature != null) wire.temperature = req.temperature;
  if (req.topP != null) wire.top_p = req.topP;
  if (req.topK != null) wire.top_k = req.topK;
  if (req.systemPrompt != null) wire.system_prompt = req.systemPrompt;
  return wire;
}

/** Convert Ifran inference response → IfranInferenceResponse. */
function inferenceResponseFromWire(raw: Record<string, unknown>): IfranInferenceResponse {
  const usage = raw.usage as Record<string, number> | undefined;
  return {
    text: raw.text as string,
    usage: usage
      ? {
          promptTokens: usage.prompt_tokens ?? 0,
          completionTokens: usage.completion_tokens ?? 0,
          totalTokens: usage.total_tokens ?? 0,
        }
      : undefined,
    finishReason: (raw.finish_reason as string) ?? undefined,
  };
}

/** Convert SY pull request → Ifran snake_case wire format. */
function pullRequestToWire(req: IfranPullRequest): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    model_name: req.modelName,
    source_url: req.sourceUrl,
  };
  if (req.expectedSha256) wire.expected_sha256 = req.expectedSha256;
  return wire;
}

/** Convert Ifran pull progress event → IfranPullProgress. */
function pullProgressFromWire(raw: Record<string, unknown>): IfranPullProgress {
  return {
    downloadedBytes: (raw.downloaded_bytes as number) ?? 0,
    totalBytes: (raw.total_bytes as number) ?? 0,
    state: (raw.state as IfranPullProgress['state']) ?? 'downloading',
  };
}

// ── Client ──────────────────────────────────────────────────────────────────

export class IfranClient {
  private readonly apiUrl: string;
  private readonly timeoutMs: number;
  private readonly logger: SecureLogger;

  constructor(config: IfranConfig, logger: SecureLogger) {
    this.apiUrl = config.apiUrl.replace(/\/+$/, '');
    this.timeoutMs = config.connectionTimeoutMs;
    this.logger = logger.child({ component: 'ifran-client' });
  }

  async getStatus(): Promise<IfranInstance> {
    const raw = (await this._fetch('/system/status')) as IfranStatusResponse;
    return statusToInstance(raw, this.apiUrl);
  }

  async submitTrainingJob(req: IfranTrainingJobRequest): Promise<IfranTrainingJobResponse> {
    this.logger.info(
      { baseModel: req.baseModel, method: req.method },
      'submitting training job to Ifran'
    );
    const wireBody = trainingRequestToWire(req);
    const res = (await this._fetch('/training/jobs', {
      method: 'POST',
      body: wireBody,
    })) as IfranJobResponse;
    return { jobId: res.id };
  }

  async getJobStatus(jobId: string): Promise<IfranJobStatus> {
    const raw = (await this._fetch(
      `/training/jobs/${encodeURIComponent(jobId)}`
    )) as IfranJobResponse;
    return jobResponseToStatus(raw);
  }

  async *streamJobProgress(jobId: string): AsyncGenerator<string> {
    const path = `/training/jobs/${encodeURIComponent(jobId)}/stream`;
    for await (const event of this._streamSSE(path)) {
      yield event;
    }
  }

  async getJobCheckpoints(jobId: string): Promise<unknown> {
    return this._fetch(`/training/jobs/${encodeURIComponent(jobId)}/checkpoints`);
  }

  async getJobMetrics(jobId: string): Promise<unknown> {
    return this._fetch(`/training/jobs/${encodeURIComponent(jobId)}/metrics`);
  }

  async *pullModel(req: IfranPullRequest): AsyncGenerator<IfranPullProgress> {
    const wireBody = pullRequestToWire(req);
    for await (const event of this._streamSSE('/marketplace/pull', {
      method: 'POST',
      body: wireBody,
    })) {
      try {
        yield pullProgressFromWire(JSON.parse(event) as Record<string, unknown>);
      } catch {
        this.logger.warn({ raw: event }, 'failed to parse pull progress SSE event');
      }
    }
  }

  async runInference(req: IfranInferenceRequest): Promise<IfranInferenceResponse> {
    this.logger.debug({ model: req.model, maxTokens: req.maxTokens }, 'running inference on Ifran');
    const wireBody = inferenceRequestToWire(req);
    const raw = (await this._fetch('/inference', {
      method: 'POST',
      body: wireBody,
    })) as Record<string, unknown>;
    return inferenceResponseFromWire(raw);
  }

  async *streamInference(
    req: IfranInferenceRequest
  ): AsyncGenerator<{ text: string; done: boolean }> {
    const wireBody = inferenceRequestToWire(req);
    for await (const event of this._streamSSE('/inference/stream', {
      method: 'POST',
      body: wireBody,
    })) {
      try {
        yield JSON.parse(event) as { text: string; done: boolean };
      } catch {
        this.logger.warn({ raw: event }, 'failed to parse inference stream SSE event');
      }
    }
  }

  async listModels(): Promise<unknown[]> {
    const res = await this._fetch('/models');
    // Ifran returns { data: [...], limit, offset, total } for paginated endpoints
    if (res && typeof res === 'object' && 'data' in (res as Record<string, unknown>)) {
      return (res as Record<string, unknown>).data as unknown[];
    }
    return res as unknown[];
  }

  async getModel(modelId: string): Promise<unknown> {
    return this._fetch(`/models/${encodeURIComponent(modelId)}`);
  }

  async deleteModel(modelId: string): Promise<unknown> {
    return this._fetch(`/models/${encodeURIComponent(modelId)}`, { method: 'DELETE' });
  }

  async cancelJob(jobId: string): Promise<unknown> {
    this.logger.info({ jobId }, 'cancelling training job on Ifran');
    const res = await this._fetch(`/training/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
    });
    return res;
  }

  async listJobs(params?: { status?: string; limit?: string; offset?: string }): Promise<unknown> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', params.limit);
    if (params?.offset) qs.set('offset', params.offset);
    const query = qs.toString();
    const path = `/training/jobs${query ? `?${query}` : ''}`;
    return this._fetch(path);
  }

  async getGpuTelemetry(): Promise<unknown> {
    return this._fetch('/system/gpu/telemetry');
  }

  // ── Evaluation ─────────────────────────────────────────────────────────

  async createEvalRun(params: {
    modelId: string;
    benchmarks: string[];
    datasetPath?: string;
  }): Promise<unknown> {
    return this._fetch('/eval/runs', {
      method: 'POST',
      body: {
        model_id: params.modelId,
        benchmarks: params.benchmarks,
        dataset_path: params.datasetPath,
      },
    });
  }

  async listEvalRuns(): Promise<unknown[]> {
    return this._fetch('/eval/runs') as Promise<unknown[]>;
  }

  async getEvalRun(runId: string): Promise<unknown> {
    return this._fetch(`/eval/runs/${encodeURIComponent(runId)}`);
  }

  // ── Experiments (Hyperparameter Sweeps) ────────────────────────────────

  async createExperiment(params: {
    method: 'grid' | 'random' | 'bayesian';
    baseModel: string;
    datasetPath: string;
    searchSpace: Record<string, unknown>;
    maxTrials?: number;
  }): Promise<unknown> {
    return this._fetch('/experiment', {
      method: 'POST',
      body: {
        method: params.method,
        base_model: params.baseModel,
        dataset_path: params.datasetPath,
        search_space: params.searchSpace,
        max_trials: params.maxTrials,
      },
    });
  }

  async getExperiment(experimentId: string): Promise<unknown> {
    return this._fetch(`/experiment/${encodeURIComponent(experimentId)}`);
  }

  // ── Fleet ──────────────────────────────────────────────────────────────

  async listFleetNodes(): Promise<unknown[]> {
    return this._fetch('/fleet/nodes') as Promise<unknown[]>;
  }

  async getFleetNode(nodeId: string): Promise<unknown> {
    return this._fetch(`/fleet/nodes/${encodeURIComponent(nodeId)}`);
  }

  // ── Marketplace ────────────────────────────────────────────────────────

  async listMarketplaceModels(): Promise<unknown[]> {
    return this._fetch('/marketplace/models') as Promise<unknown[]>;
  }

  async pullMarketplaceModel(modelId: string): Promise<unknown> {
    return this._fetch(`/marketplace/models/${encodeURIComponent(modelId)}/pull`, {
      method: 'POST',
    });
  }

  // ── RLHF Annotation ───────────────────────────────────────────────────

  async createRlhfSession(params: { modelId: string; name?: string }): Promise<unknown> {
    return this._fetch('/rlhf/sessions', {
      method: 'POST',
      body: { model_id: params.modelId, name: params.name },
    });
  }

  async getRlhfSession(sessionId: string): Promise<unknown> {
    return this._fetch(`/rlhf/sessions/${encodeURIComponent(sessionId)}`);
  }

  async submitRlhfAnnotation(
    sessionId: string,
    params: { pairId: string; preferred: 'a' | 'b' }
  ): Promise<unknown> {
    return this._fetch(`/rlhf/sessions/${encodeURIComponent(sessionId)}/annotate`, {
      method: 'POST',
      body: { pair_id: params.pairId, preferred: params.preferred },
    });
  }

  async exportRlhfForDpo(sessionId: string): Promise<unknown> {
    return this._fetch(`/rlhf/sessions/${encodeURIComponent(sessionId)}/export-dpo`, {
      method: 'POST',
    });
  }

  // ── Lineage ────────────────────────────────────────────────────────────

  async getModelLineage(modelId: string, maxDepth?: number): Promise<unknown> {
    const qs = maxDepth ? `?max_depth=${maxDepth}` : '';
    return this._fetch(`/lineage/${encodeURIComponent(modelId)}/ancestry${qs}`);
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/health`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _fetch(path: string, opts: FetchOptions = {}): Promise<unknown> {
    const url = `${this.apiUrl}${path}`;
    const method = opts.method ?? 'GET';

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal ?? AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Ifran ${method} ${path} returned ${response.status}: ${errorBody}`);
      }

      return await response.json();
    } catch (err) {
      this.logger.error(
        { endpoint: url, method, error: toErrorMessage(err) },
        'Ifran request failed'
      );
      throw err;
    }
  }

  private async *_streamSSE(path: string, opts: FetchOptions = {}): AsyncGenerator<string> {
    const url = `${this.apiUrl}${path}`;
    const method = opts.method ?? 'GET';

    const controller = new AbortController();
    let response: Response;

    try {
      response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      this.logger.error(
        { endpoint: url, error: toErrorMessage(err) },
        'Ifran SSE connection failed'
      );
      throw err;
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Ifran SSE ${method} ${path} returned ${response.status}: ${errorBody}`);
    }

    const body = response.body;
    if (!body) {
      throw new Error(`Ifran SSE ${method} ${path} returned no body`);
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') return;
            yield data;
          }
        }
      }

      // Process any remaining data in the buffer
      if (buffer.trim().startsWith('data: ')) {
        const data = buffer.trim().slice(6);
        if (data !== '[DONE]') {
          yield data;
        }
      }
    } finally {
      reader.releaseLock();
      controller.abort();
    }
  }
}
