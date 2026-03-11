/**
 * GitLab Forge Adapter — CodeForgeAdapter backed by GitLab REST API v4.
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

export class GitLabForgeAdapter implements CodeForgeAdapter {
  readonly provider = 'gitlab' as const;
  readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;

  constructor(config: ForgeConfig) {
    this.baseUrl = config.baseUrl || 'https://gitlab.com';
    this.token = config.token;
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  async listRepos(): Promise<ForgeRepo[]> {
    const data = await this.get<GLProject[]>(
      '/projects?membership=true&per_page=100&order_by=updated_at'
    );
    return data.map((p) => toForgeRepo(p, this.baseUrl));
  }

  async getRepo(owner: string, name: string): Promise<ForgeRepo> {
    const pid = encodeURIComponent(`${owner}/${name}`);
    const data = await this.get<GLProject>(`/projects/${pid}`);
    return toForgeRepo(data, this.baseUrl);
  }

  async listPulls(
    owner: string,
    name: string,
    state?: 'open' | 'closed' | 'all'
  ): Promise<ForgePullRequest[]> {
    const pid = encodeURIComponent(`${owner}/${name}`);
    const glState = state === 'open' ? 'opened' : state === 'closed' ? 'closed' : 'all';
    const data = await this.get<GLMergeRequest[]>(
      `/projects/${pid}/merge_requests?state=${glState}&per_page=100`
    );
    return data.map(toForgePull);
  }

  async getPull(owner: string, name: string, number: number): Promise<ForgePullRequest> {
    const pid = encodeURIComponent(`${owner}/${name}`);
    const data = await this.get<GLMergeRequest>(`/projects/${pid}/merge_requests/${number}`);
    return toForgePull(data);
  }

  async listPipelines(owner: string, name: string): Promise<ForgePipeline[]> {
    const pid = encodeURIComponent(`${owner}/${name}`);
    const data = await this.get<GLPipeline[]>(`/projects/${pid}/pipelines?per_page=30`);
    return data.map((p) => toForgePipeline(p, this.baseUrl, owner, name));
  }

  async triggerPipeline(owner: string, name: string, ref: string): Promise<ForgePipeline> {
    const pid = encodeURIComponent(`${owner}/${name}`);
    const data = await this.post<GLPipeline>(`/projects/${pid}/pipeline`, { ref });
    return toForgePipeline(data, this.baseUrl, owner, name);
  }

  async cancelPipeline(owner: string, name: string, pipelineId: string): Promise<void> {
    const pid = encodeURIComponent(`${owner}/${name}`);
    await this.post(`/projects/${pid}/pipelines/${encodeURIComponent(pipelineId)}/cancel`, {});
  }

  async listBranches(owner: string, name: string): Promise<ForgeBranch[]> {
    const pid = encodeURIComponent(`${owner}/${name}`);
    const data = await this.get<GLBranch[]>(`/projects/${pid}/repository/branches?per_page=100`);
    return data.map((b) => ({
      name: b.name,
      sha: b.commit.id,
      protected: b.protected ?? false,
    }));
  }

  async listReleases(owner: string, name: string): Promise<ForgeRelease[]> {
    const pid = encodeURIComponent(`${owner}/${name}`);
    const data = await this.get<GLRelease[]>(`/projects/${pid}/releases?per_page=30`);
    return data.map(toForgeRelease);
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v4/version`, {
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
    const res = await fetch(`${this.baseUrl}/api/v4${path}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitLab API ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }

  private async post<T = void>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/v4${path}`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitLab API ${res.status}: ${text.slice(0, 200)}`);
    }
    const ct = res.headers.get('content-type');
    if (ct?.includes('application/json')) return res.json() as Promise<T>;
    return undefined as T;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (this.token) h['PRIVATE-TOKEN'] = this.token;
    return h;
  }
}

// ── GitLab API response types (minimal) ──

interface GLProject {
  id: number;
  path_with_namespace: string;
  name: string;
  description: string | null;
  visibility: 'public' | 'internal' | 'private';
  default_branch: string;
  web_url: string;
  created_at: string;
  last_activity_at: string;
  namespace: { path: string };
}

interface GLMergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string | null;
  state: string;
  source_branch: string;
  target_branch: string;
  author: { username: string };
  web_url: string;
  created_at: string;
  updated_at: string;
}

interface GLPipeline {
  id: number;
  status: string;
  ref: string;
  sha: string;
  web_url: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

interface GLBranch {
  name: string;
  commit: { id: string };
  protected?: boolean;
}

interface GLRelease {
  tag_name: string;
  name: string | null;
  description: string | null;
  released_at: string;
  assets: {
    links: {
      id: number;
      name: string;
      url: string;
    }[];
    sources: {
      format: string;
      url: string;
    }[];
  };
}

// ── Mappers ──

function toForgeRepo(p: GLProject, baseUrl: string): ForgeRepo {
  const parts = p.path_with_namespace.split('/');
  const owner = parts.slice(0, -1).join('/');
  const name = parts[parts.length - 1]!;
  return {
    id: String(p.id),
    owner,
    name,
    fullName: p.path_with_namespace,
    description: p.description,
    visibility: p.visibility,
    defaultBranch: p.default_branch,
    url: p.web_url || `${baseUrl}/${p.path_with_namespace}`,
    createdAt: p.created_at,
    updatedAt: p.last_activity_at,
  };
}

function toForgePull(mr: GLMergeRequest): ForgePullRequest {
  let state: 'open' | 'closed' | 'merged' = 'open';
  if (mr.state === 'merged') state = 'merged';
  else if (mr.state === 'closed') state = 'closed';
  return {
    id: String(mr.id),
    number: mr.iid,
    title: mr.title,
    body: mr.description,
    state,
    sourceBranch: mr.source_branch,
    targetBranch: mr.target_branch,
    author: mr.author.username,
    url: mr.web_url,
    createdAt: mr.created_at,
    updatedAt: mr.updated_at,
  };
}

function toForgePipeline(
  p: GLPipeline,
  baseUrl: string,
  owner: string,
  name: string
): ForgePipeline {
  let status: ForgePipeline['status'] = 'unknown';
  if (p.status === 'created' || p.status === 'waiting_for_resource' || p.status === 'pending')
    status = 'queued';
  else if (p.status === 'running') status = 'running';
  else if (p.status === 'success') status = 'passed';
  else if (p.status === 'failed') status = 'failed';
  else if (p.status === 'canceled') status = 'cancelled';
  return {
    id: String(p.id),
    name: `Pipeline #${p.id}`,
    status,
    ref: p.ref,
    sha: p.sha,
    url: p.web_url || `${baseUrl}/${owner}/${name}/-/pipelines/${p.id}`,
    createdAt: p.created_at,
    startedAt: p.started_at,
    finishedAt: p.finished_at,
  };
}

function toForgeRelease(r: GLRelease): ForgeRelease {
  const assets: ForgeArtifact[] = (r.assets.links ?? []).map((l) => ({
    id: String(l.id),
    name: l.name,
    sizeBytes: null,
    downloadUrl: l.url,
    createdAt: r.released_at,
  }));
  return {
    id: r.tag_name,
    tag: r.tag_name,
    name: r.name ?? r.tag_name,
    body: r.description,
    draft: false,
    prerelease: false,
    createdAt: r.released_at,
    assets,
  };
}
