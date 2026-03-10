/**
 * Delta Client — HTTP client for the Delta code forge REST API.
 *
 * Delta is a self-hosted git hosting platform (repos, PRs, CI/CD, artifacts)
 * built for the AGNOS ecosystem. Default port: 8070.
 */

import type { SecureLogger } from '../../logging/logger.js';

export interface DeltaClientConfig {
  baseUrl: string; // e.g. http://127.0.0.1:8070
  apiToken?: string; // delta_* format API token
  timeoutMs?: number; // default 10000
}

// ── Response Types ──

export interface DeltaRepo {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  visibility: 'public' | 'internal' | 'private';
  default_branch: string;
  created_at: string;
  updated_at: string;
}

export interface DeltaPullRequest {
  id: string;
  repo_id: string;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed' | 'merged';
  source_branch: string;
  target_branch: string;
  author_id: string;
  merge_strategy: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeltaPipeline {
  id: string;
  repo_id: string;
  workflow_name: string;
  trigger_type: string;
  commit_sha: string;
  status: 'queued' | 'running' | 'passed' | 'failed' | 'cancelled';
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface DeltaJob {
  id: string;
  pipeline_id: string;
  job_name: string;
  status: string;
  exit_code: number | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface DeltaStepLog {
  step_name: string;
  output: string;
  status: string;
}

export interface DeltaHealthResponse {
  status: string;
  version: string;
}

// ── Client ──

export class DeltaClient {
  private readonly baseUrl: string;
  private readonly apiToken?: string;
  private readonly timeoutMs: number;
  private readonly logger?: SecureLogger;

  constructor(config: DeltaClientConfig, logger?: SecureLogger) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiToken = config.apiToken;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.logger = logger?.child({ component: 'delta-client' });
  }

  // ── Repos ──

  async listRepos(): Promise<DeltaRepo[]> {
    return this.get<DeltaRepo[]>('/api/v1/repos');
  }

  async getRepo(owner: string, name: string): Promise<DeltaRepo> {
    return this.get<DeltaRepo>(`/api/v1/repos/${enc(owner)}/${enc(name)}`);
  }

  // ── Pull Requests ──

  async listPulls(owner: string, name: string, state?: string): Promise<DeltaPullRequest[]> {
    const qs = state ? `?state=${enc(state)}` : '';
    return this.get<DeltaPullRequest[]>(`/api/v1/repos/${enc(owner)}/${enc(name)}/pulls${qs}`);
  }

  async getPull(owner: string, name: string, number: number): Promise<DeltaPullRequest> {
    return this.get<DeltaPullRequest>(`/api/v1/repos/${enc(owner)}/${enc(name)}/pulls/${number}`);
  }

  async mergePull(owner: string, name: string, number: number, strategy?: string): Promise<void> {
    const body = strategy ? { merge_strategy: strategy } : {};
    await this.post(`/api/v1/repos/${enc(owner)}/${enc(name)}/pulls/${number}/merge`, body);
  }

  // ── Pipelines ──

  async listPipelines(owner: string, name: string, status?: string): Promise<DeltaPipeline[]> {
    const qs = status ? `?status=${enc(status)}` : '';
    return this.get<DeltaPipeline[]>(`/api/v1/repos/${enc(owner)}/${enc(name)}/pipelines${qs}`);
  }

  async triggerPipeline(owner: string, name: string, ref?: string): Promise<DeltaPipeline> {
    return this.post<DeltaPipeline>(`/api/v1/repos/${enc(owner)}/${enc(name)}/pipelines`, { ref });
  }

  async cancelPipeline(owner: string, name: string, pipelineId: string): Promise<void> {
    await this.post(
      `/api/v1/repos/${enc(owner)}/${enc(name)}/pipelines/${enc(pipelineId)}/cancel`,
      {}
    );
  }

  async getJobLogs(
    owner: string,
    name: string,
    pipelineId: string,
    jobId: string
  ): Promise<DeltaStepLog[]> {
    return this.get<DeltaStepLog[]>(
      `/api/v1/repos/${enc(owner)}/${enc(name)}/pipelines/${enc(pipelineId)}/jobs/${enc(jobId)}/logs`
    );
  }

  // ── Status Checks ──

  async createStatus(
    owner: string,
    name: string,
    sha: string,
    status: {
      context: string;
      state: 'pending' | 'success' | 'failure' | 'error';
      description?: string;
      target_url?: string;
    }
  ): Promise<void> {
    await this.post(
      `/api/v1/repos/${enc(owner)}/${enc(name)}/commits/${enc(sha)}/statuses`,
      status
    );
  }

  // ── Health ──

  async health(): Promise<DeltaHealthResponse> {
    return this.get<DeltaHealthResponse>('/health');
  }

  // ── HTTP Helpers ──

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Delta API ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  private async post<T = void>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Delta API ${res.status}: ${text}`);
    }
    const contentType = res.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return res.json() as Promise<T>;
    }
    return undefined as T;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (this.apiToken) h.Authorization = `Bearer ${this.apiToken}`;
    return h;
  }
}

function enc(s: string): string {
  return encodeURIComponent(s);
}
