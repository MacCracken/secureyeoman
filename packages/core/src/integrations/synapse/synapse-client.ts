/**
 * Synapse REST Client
 *
 * Communicates with a Synapse LLM controller instance via its REST API (port 8420).
 * Supports both request/response and SSE streaming endpoints.
 */

import type { SecureLogger } from '../../logging/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import type {
  SynapseConfig,
  SynapseInstance,
  SynapseTrainingJobRequest,
  SynapseTrainingJobResponse,
  SynapseJobStatus,
  SynapseInferenceRequest,
  SynapseInferenceResponse,
  SynapsePullRequest,
  SynapsePullProgress,
} from './types.js';

interface FetchOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

export class SynapseClient {
  private readonly apiUrl: string;
  private readonly timeoutMs: number;
  private readonly logger: SecureLogger;

  constructor(config: SynapseConfig, logger: SecureLogger) {
    this.apiUrl = config.apiUrl.replace(/\/+$/, '');
    this.timeoutMs = config.connectionTimeoutMs;
    this.logger = logger.child({ component: 'synapse-client' });
  }

  async getStatus(): Promise<SynapseInstance> {
    const res = await this._fetch('/api/v1/status');
    return res as SynapseInstance;
  }

  async submitTrainingJob(req: SynapseTrainingJobRequest): Promise<SynapseTrainingJobResponse> {
    this.logger.info(
      { baseModel: req.baseModel, method: req.method },
      'submitting training job to Synapse'
    );
    const res = await this._fetch('/api/v1/training/jobs', {
      method: 'POST',
      body: req,
    });
    return res as SynapseTrainingJobResponse;
  }

  async getJobStatus(jobId: string): Promise<SynapseJobStatus> {
    const res = await this._fetch(`/api/v1/training/jobs/${encodeURIComponent(jobId)}`);
    return res as SynapseJobStatus;
  }

  async *streamJobLogs(jobId: string): AsyncGenerator<string> {
    const path = `/api/v1/training/jobs/${encodeURIComponent(jobId)}/logs`;
    for await (const event of this._streamSSE(path)) {
      yield event;
    }
  }

  async *pullModel(req: SynapsePullRequest): AsyncGenerator<SynapsePullProgress> {
    for await (const event of this._streamSSE('/api/v1/models/pull', {
      method: 'POST',
      body: req,
    })) {
      yield JSON.parse(event) as SynapsePullProgress;
    }
  }

  async runInference(req: SynapseInferenceRequest): Promise<SynapseInferenceResponse> {
    this.logger.debug(
      { model: req.model, maxTokens: req.maxTokens },
      'running inference on Synapse'
    );
    const res = await this._fetch('/api/v1/inference', {
      method: 'POST',
      body: req,
    });
    return res as SynapseInferenceResponse;
  }

  async *streamInference(
    req: SynapseInferenceRequest
  ): AsyncGenerator<{ text: string; done: boolean }> {
    for await (const event of this._streamSSE('/api/v1/inference/stream', {
      method: 'POST',
      body: req,
    })) {
      yield JSON.parse(event) as { text: string; done: boolean };
    }
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
        throw new Error(`Synapse ${method} ${path} returned ${response.status}: ${errorBody}`);
      }

      return await response.json();
    } catch (err) {
      this.logger.error(
        { endpoint: url, method, error: toErrorMessage(err) },
        'Synapse request failed'
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
        'Synapse SSE connection failed'
      );
      throw err;
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Synapse SSE ${method} ${path} returned ${response.status}: ${errorBody}`);
    }

    const body = response.body;
    if (!body) {
      throw new Error(`Synapse SSE ${method} ${path} returned no body`);
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
