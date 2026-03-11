/**
 * Gitea Forge Adapter — CodeForgeAdapter backed by Gitea REST API v1.
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

export class GiteaForgeAdapter implements CodeForgeAdapter {
  readonly provider = 'gitea' as const;
  readonly baseUrl: string;
  private readonly apiUrl: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;

  constructor(config: ForgeConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiUrl = `${this.baseUrl}/api/v1`;
    this.token = config.token;
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  async listRepos(): Promise<ForgeRepo[]> {
    const data = await this.get<GiteaRepo[]>('/repos/search?limit=50&sort=updated');
    // Gitea wraps search results in { ok, data } or returns array depending on version
    const repos = Array.isArray(data)
      ? data
      : ((data as unknown as { data: GiteaRepo[] }).data ?? []);
    return repos.map(toForgeRepo);
  }

  async getRepo(owner: string, name: string): Promise<ForgeRepo> {
    const data = await this.get<GiteaRepo>(`/repos/${enc(owner)}/${enc(name)}`);
    return toForgeRepo(data);
  }

  async listPulls(
    owner: string,
    name: string,
    state?: 'open' | 'closed' | 'all'
  ): Promise<ForgePullRequest[]> {
    // Gitea doesn't have a separate "merged" state param — merged PRs are returned
    // under state=closed with the `merged` boolean set to true.
    let qs = '?limit=50';
    if (state && state !== 'all') {
      qs += `&state=${state}`;
    }
    const data = await this.get<GiteaPull[]>(`/repos/${enc(owner)}/${enc(name)}/pulls${qs}`);
    return data.map(toForgePull);
  }

  async getPull(owner: string, name: string, number: number): Promise<ForgePullRequest> {
    const data = await this.get<GiteaPull>(`/repos/${enc(owner)}/${enc(name)}/pulls/${number}`);
    return toForgePull(data);
  }

  async listPipelines(owner: string, name: string): Promise<ForgePipeline[]> {
    // Gitea Actions (mirrors GitHub Actions API structure)
    const data = await this.get<{ workflow_runs: GiteaActionRun[] }>(
      `/repos/${enc(owner)}/${enc(name)}/actions/runs?limit=30`
    );
    return (data.workflow_runs ?? []).map(toForgePipeline);
  }

  async triggerPipeline(owner: string, name: string, ref: string): Promise<ForgePipeline> {
    // Dispatch a workflow via Gitea Actions
    await this.post(`/repos/${enc(owner)}/${enc(name)}/actions/runs`, { ref });

    return {
      id: 'pending',
      name: 'dispatch',
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
    await this.del(`/repos/${enc(owner)}/${enc(name)}/actions/runs/${enc(pipelineId)}`);
  }

  async listBranches(owner: string, name: string): Promise<ForgeBranch[]> {
    const data = await this.get<GiteaBranch[]>(
      `/repos/${enc(owner)}/${enc(name)}/branches?limit=50`
    );
    return data.map((b) => ({
      name: b.name,
      sha: b.commit.id,
      protected: b.protected ?? false,
    }));
  }

  async listReleases(owner: string, name: string): Promise<ForgeRelease[]> {
    const data = await this.get<GiteaRelease[]>(
      `/repos/${enc(owner)}/${enc(name)}/releases?limit=30`
    );
    return data.map(toForgeRelease);
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiUrl}/user`, {
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
      throw new Error(`Gitea API ${res.status}: ${text.slice(0, 200)}`);
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
      throw new Error(`Gitea API ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  private async del(path: string): Promise<void> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: 'DELETE',
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gitea API ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/json',
    };
    if (this.token) h.Authorization = `token ${this.token}`;
    return h;
  }
}

// ── Gitea API response types (minimal) ──

interface GiteaRepo {
  id: number;
  owner: { login: string };
  name: string;
  full_name: string;
  description: string;
  visibility: string;
  default_branch: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  private: boolean;
  internal: boolean;
}

interface GiteaPull {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  merged: boolean;
  head: { ref: string };
  base: { ref: string };
  user: { login: string };
  html_url: string;
  created_at: string;
  updated_at: string;
}

interface GiteaActionRun {
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

interface GiteaBranch {
  name: string;
  commit: { id: string };
  protected?: boolean;
}

interface GiteaRelease {
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

function toForgeRepo(r: GiteaRepo): ForgeRepo {
  let visibility: 'public' | 'internal' | 'private' = 'public';
  if (r.private) visibility = 'private';
  else if (r.internal) visibility = 'internal';
  return {
    id: String(r.id),
    owner: r.owner.login,
    name: r.name,
    fullName: r.full_name,
    description: r.description || null,
    visibility,
    defaultBranch: r.default_branch,
    url: r.html_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toForgePull(p: GiteaPull): ForgePullRequest {
  // Gitea uses a `merged` boolean rather than a separate state
  let state: 'open' | 'closed' | 'merged' = 'open';
  if (p.merged) state = 'merged';
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

function toForgePipeline(r: GiteaActionRun): ForgePipeline {
  let status: ForgePipeline['status'] = 'unknown';
  if (r.status === 'queued' || r.status === 'waiting') status = 'queued';
  else if (r.status === 'in_progress' || r.status === 'running') status = 'running';
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

function toForgeRelease(r: GiteaRelease): ForgeRelease {
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
