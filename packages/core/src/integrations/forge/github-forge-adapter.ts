/**
 * GitHub Forge Adapter — CodeForgeAdapter backed by GitHub REST API.
 */

import type {
  CodeForgeAdapter,
  ForgeConfig,
  ForgeRepo,
  ForgePullRequest,
  ForgePipeline,
  ForgeBranch,
  ForgeRelease,
  ForgeArtifact,
} from './types.js';

const GITHUB_API = 'https://api.github.com';

export class GitHubForgeAdapter implements CodeForgeAdapter {
  readonly provider = 'github' as const;
  readonly baseUrl: string;
  private readonly apiUrl: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;

  constructor(config: ForgeConfig) {
    this.baseUrl = config.baseUrl || 'https://github.com';
    // For GitHub Enterprise, API is at baseUrl/api/v3; for github.com, use api.github.com
    this.apiUrl = this.baseUrl === 'https://github.com' ? GITHUB_API : `${this.baseUrl}/api/v3`;
    this.token = config.token;
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  async listRepos(): Promise<ForgeRepo[]> {
    const data = await this.get<GHRepo[]>('/user/repos?per_page=100&sort=updated');
    return data.map(toForgeRepo);
  }

  async getRepo(owner: string, name: string): Promise<ForgeRepo> {
    const data = await this.get<GHRepo>(`/repos/${enc(owner)}/${enc(name)}`);
    return toForgeRepo(data);
  }

  async listPulls(
    owner: string,
    name: string,
    state?: 'open' | 'closed' | 'all'
  ): Promise<ForgePullRequest[]> {
    const qs = state ? `?state=${state}&per_page=100` : '?per_page=100';
    const data = await this.get<GHPull[]>(`/repos/${enc(owner)}/${enc(name)}/pulls${qs}`);
    return data.map(toForgePull);
  }

  async getPull(owner: string, name: string, number: number): Promise<ForgePullRequest> {
    const data = await this.get<GHPull>(`/repos/${enc(owner)}/${enc(name)}/pulls/${number}`);
    return toForgePull(data);
  }

  async listPipelines(owner: string, name: string): Promise<ForgePipeline[]> {
    const data = await this.get<{ workflow_runs: GHWorkflowRun[] }>(
      `/repos/${enc(owner)}/${enc(name)}/actions/runs?per_page=30`
    );
    return (data.workflow_runs ?? []).map(toForgePipeline);
  }

  async triggerPipeline(owner: string, name: string, ref: string): Promise<ForgePipeline> {
    // GitHub Actions: dispatch a workflow. We need a workflow_id.
    // Use the first workflow found for the repo.
    const workflows = await this.get<{ workflows: { id: number; name: string }[] }>(
      `/repos/${enc(owner)}/${enc(name)}/actions/workflows`
    );
    const wf = workflows.workflows?.[0];
    if (!wf) throw new Error('No workflows found in this repository');

    await this.post(`/repos/${enc(owner)}/${enc(name)}/actions/workflows/${wf.id}/dispatches`, {
      ref,
    });

    // Return a placeholder — GitHub doesn't return the run from dispatch
    return {
      id: 'pending',
      name: wf.name,
      status: 'queued',
      ref,
      sha: '',
      url: `${this.baseUrl}/${owner}/${name}/actions`,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
    };
  }

  async cancelPipeline(owner: string, name: string, pipelineId: string): Promise<void> {
    await this.post(`/repos/${enc(owner)}/${enc(name)}/actions/runs/${enc(pipelineId)}/cancel`, {});
  }

  async listBranches(owner: string, name: string): Promise<ForgeBranch[]> {
    const data = await this.get<GHBranch[]>(
      `/repos/${enc(owner)}/${enc(name)}/branches?per_page=100`
    );
    return data.map((b) => ({
      name: b.name,
      sha: b.commit.sha,
      protected: b.protected ?? false,
    }));
  }

  async listReleases(owner: string, name: string): Promise<ForgeRelease[]> {
    const data = await this.get<GHRelease[]>(
      `/repos/${enc(owner)}/${enc(name)}/releases?per_page=30`
    );
    return data.map(toForgeRelease);
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiUrl}/rate_limit`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── HTTP Helpers ──

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitHub API ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }

  private async post(path: string, body: unknown): Promise<void> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitHub API ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }
}

// ── GitHub API response types (minimal) ──

interface GHRepo {
  id: number;
  owner: { login: string };
  name: string;
  full_name: string;
  description: string | null;
  visibility: string;
  default_branch: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  private: boolean;
}

interface GHPull {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  merged_at: string | null;
  head: { ref: string };
  base: { ref: string };
  user: { login: string };
  html_url: string;
  created_at: string;
  updated_at: string;
}

interface GHWorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  head_branch: string;
  head_sha: string;
  html_url: string;
  created_at: string;
  run_started_at: string | null;
  updated_at: string;
}

interface GHBranch {
  name: string;
  commit: { sha: string };
  protected?: boolean;
}

interface GHRelease {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  assets: {
    id: number;
    name: string;
    size: number;
    browser_download_url: string;
    created_at: string;
  }[];
}

// ── Mappers ──

function toForgeRepo(r: GHRepo): ForgeRepo {
  return {
    id: String(r.id),
    owner: r.owner.login,
    name: r.name,
    fullName: r.full_name,
    description: r.description,
    visibility: r.private ? 'private' : (r.visibility as 'public' | 'internal' | 'private'),
    defaultBranch: r.default_branch,
    url: r.html_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toForgePull(p: GHPull): ForgePullRequest {
  let state: 'open' | 'closed' | 'merged' = 'open';
  if (p.merged_at) state = 'merged';
  else if (p.state === 'closed') state = 'closed';
  return {
    id: String(p.id),
    number: p.number,
    title: p.title,
    body: p.body,
    state,
    sourceBranch: p.head.ref,
    targetBranch: p.base.ref,
    author: p.user.login,
    url: p.html_url,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

function toForgePipeline(r: GHWorkflowRun): ForgePipeline {
  let status: ForgePipeline['status'] = 'unknown';
  if (r.status === 'queued') status = 'queued';
  else if (r.status === 'in_progress') status = 'running';
  else if (r.conclusion === 'success') status = 'passed';
  else if (r.conclusion === 'failure') status = 'failed';
  else if (r.conclusion === 'cancelled') status = 'cancelled';
  return {
    id: String(r.id),
    name: r.name,
    status,
    ref: r.head_branch,
    sha: r.head_sha,
    url: r.html_url,
    createdAt: r.created_at,
    startedAt: r.run_started_at ?? null,
    finishedAt: r.conclusion ? r.updated_at : null,
  };
}

function toForgeRelease(r: GHRelease): ForgeRelease {
  return {
    id: String(r.id),
    tag: r.tag_name,
    name: r.name ?? r.tag_name,
    body: r.body,
    draft: r.draft,
    prerelease: r.prerelease,
    createdAt: r.created_at,
    assets: r.assets.map(
      (a): ForgeArtifact => ({
        id: String(a.id),
        name: a.name,
        sizeBytes: a.size,
        downloadUrl: a.browser_download_url,
        createdAt: a.created_at,
      })
    ),
  };
}

function enc(s: string): string {
  return encodeURIComponent(s);
}
