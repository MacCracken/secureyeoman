/**
 * Bitbucket Forge Adapter — CodeForgeAdapter backed by Bitbucket REST API.
 *
 * Supports both Bitbucket Cloud (v2.0) and Bitbucket Server (REST API 1.0).
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

const BITBUCKET_CLOUD_HOST = 'https://bitbucket.org';
const BITBUCKET_CLOUD_API = 'https://api.bitbucket.org/2.0';

export class BitbucketForgeAdapter implements CodeForgeAdapter {
  readonly provider = 'bitbucket' as const;
  readonly baseUrl: string;
  private readonly apiUrl: string;
  private readonly isCloud: boolean;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;

  constructor(config: ForgeConfig) {
    this.baseUrl = config.baseUrl || BITBUCKET_CLOUD_HOST;
    this.isCloud = this.baseUrl === BITBUCKET_CLOUD_HOST;
    this.apiUrl = this.isCloud ? BITBUCKET_CLOUD_API : `${this.baseUrl}/rest/api/1.0`;
    this.token = config.token;
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  async listRepos(): Promise<ForgeRepo[]> {
    // Cloud: needs a workspace; we infer from authenticated user's membership.
    // Fetch the user first, then list their repos.
    if (this.isCloud) {
      const user = await this.get<BBCloudUser>('/user');
      const data = await this.getPaginated<BBCloudRepo>(`/repositories/${enc(user.username)}`);
      return data.map(toForgeRepoCloud);
    }
    // Server: list repos for authenticated user
    const data = await this.get<{ values: BBServerRepo[] }>('/repos?limit=100');
    return data.values.map(toForgeRepoServer);
  }

  async getRepo(owner: string, name: string): Promise<ForgeRepo> {
    if (this.isCloud) {
      const data = await this.get<BBCloudRepo>(`/repositories/${enc(owner)}/${enc(name)}`);
      return toForgeRepoCloud(data);
    }
    const data = await this.get<BBServerRepo>(`/projects/${enc(owner)}/repos/${enc(name)}`);
    return toForgeRepoServer(data);
  }

  async listPulls(owner: string, name: string, state?: 'open' | 'closed' | 'all'): Promise<ForgePullRequest[]> {
    if (this.isCloud) {
      const bbState = mapPRStateToCloud(state);
      const qs = bbState ? `?state=${bbState}` : '';
      const data = await this.getPaginated<BBCloudPR>(
        `/repositories/${enc(owner)}/${enc(name)}/pullrequests${qs}`
      );
      return data.map(toForgePullCloud);
    }
    const serverState = state === 'all' ? 'ALL' : state === 'closed' ? 'MERGED' : 'OPEN';
    const data = await this.get<{ values: BBServerPR[] }>(
      `/projects/${enc(owner)}/repos/${enc(name)}/pull-requests?state=${serverState}&limit=100`
    );
    return data.values.map(toForgePullServer);
  }

  async getPull(owner: string, name: string, number: number): Promise<ForgePullRequest> {
    if (this.isCloud) {
      const data = await this.get<BBCloudPR>(
        `/repositories/${enc(owner)}/${enc(name)}/pullrequests/${number}`
      );
      return toForgePullCloud(data);
    }
    const data = await this.get<BBServerPR>(
      `/projects/${enc(owner)}/repos/${enc(name)}/pull-requests/${number}`
    );
    return toForgePullServer(data);
  }

  async listPipelines(owner: string, name: string): Promise<ForgePipeline[]> {
    if (this.isCloud) {
      const data = await this.getPaginated<BBCloudPipeline>(
        `/repositories/${enc(owner)}/${enc(name)}/pipelines/?sort=-created_on&pagelen=30`
      );
      return data.map((p) => toForgePipelineCloud(p, owner, name, this.baseUrl));
    }
    // Bitbucket Server doesn't have native pipelines — return empty
    return [];
  }

  async triggerPipeline(owner: string, name: string, ref: string): Promise<ForgePipeline> {
    if (!this.isCloud) throw new Error('Bitbucket Server does not support pipelines');

    const data = await this.post<BBCloudPipeline>(
      `/repositories/${enc(owner)}/${enc(name)}/pipelines/`,
      {
        target: {
          type: 'pipeline_ref_target',
          ref_type: 'branch',
          ref_name: ref,
        },
      }
    );
    return toForgePipelineCloud(data, owner, name, this.baseUrl);
  }

  async cancelPipeline(owner: string, name: string, pipelineId: string): Promise<void> {
    if (!this.isCloud) throw new Error('Bitbucket Server does not support pipelines');

    await this.post(
      `/repositories/${enc(owner)}/${enc(name)}/pipelines/${enc(pipelineId)}/stopPipeline`,
      {}
    );
  }

  async listBranches(owner: string, name: string): Promise<ForgeBranch[]> {
    if (this.isCloud) {
      const data = await this.getPaginated<BBCloudBranch>(
        `/repositories/${enc(owner)}/${enc(name)}/refs/branches`
      );
      return data.map(toForgeBranchCloud);
    }
    const data = await this.get<{ values: BBServerBranch[] }>(
      `/projects/${enc(owner)}/repos/${enc(name)}/branches?limit=100`
    );
    return data.values.map(toForgeBranchServer);
  }

  async listReleases(owner: string, name: string): Promise<ForgeRelease[]> {
    // Bitbucket doesn't have releases — use Downloads API on Cloud
    if (this.isCloud) {
      const data = await this.getPaginated<BBCloudDownload>(
        `/repositories/${enc(owner)}/${enc(name)}/downloads`
      );
      return data.map(toForgeReleaseFromDownload);
    }
    // Server: no downloads API equivalent
    return [];
  }

  async health(): Promise<boolean> {
    try {
      const endpoint = this.isCloud ? '/user' : '/application-properties';
      const res = await fetch(`${this.apiUrl}${endpoint}`, {
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
      throw new Error(`Bitbucket API ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }

  private async post<T = void>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => '');
      throw new Error(`Bitbucket API ${res.status}: ${text.slice(0, 200)}`);
    }
    // Some POST endpoints return a body (e.g. trigger pipeline)
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json') && res.status !== 204) {
      return res.json() as Promise<T>;
    }
    return undefined as T;
  }

  /** Follow `next` links to collect all pages of a Bitbucket Cloud paginated response. */
  private async getPaginated<T>(path: string): Promise<T[]> {
    const results: T[] = [];
    let url: string | null = `${this.apiUrl}${path}`;

    while (url) {
      const res = await fetch(url, {
        headers: this.headers(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Bitbucket API ${res.status}: ${text.slice(0, 200)}`);
      }
      const page = (await res.json()) as BBCloudPage<T>;
      results.push(...(page.values ?? []));
      url = page.next ?? null;
    }
    return results;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }
}

// ── Bitbucket Cloud API response types (minimal) ──

interface BBCloudPage<T> {
  values: T[];
  next?: string;
  page?: number;
  size?: number;
}

interface BBCloudUser {
  username: string;
  display_name: string;
  uuid: string;
}

interface BBCloudRepo {
  uuid: string;
  owner: { username: string };
  slug: string;
  full_name: string;
  name: string;
  description: string;
  is_private: boolean;
  mainbranch: { name: string } | null;
  links: { html: { href: string } };
  created_on: string;
  updated_on: string;
}

interface BBCloudPR {
  id: number;
  title: string;
  description: string;
  state: string; // OPEN | MERGED | DECLINED | SUPERSEDED
  source: { branch: { name: string } };
  destination: { branch: { name: string } };
  author: { username: string; display_name: string };
  links: { html: { href: string } };
  created_on: string;
  updated_on: string;
}

interface BBCloudPipeline {
  uuid: string;
  build_number: number;
  state: {
    name: string; // PENDING | BUILDING | COMPLETED | STOPPED
    result?: { name: string }; // SUCCESSFUL | FAILED | ERROR | STOPPED
  };
  target: {
    ref_name: string;
    commit: { hash: string };
  };
  created_on: string;
  started_on: string | null;
  completed_on: string | null;
}

interface BBCloudBranch {
  name: string;
  target: { hash: string };
}

interface BBCloudDownload {
  name: string;
  size: number;
  downloads: number;
  links: { self: { href: string } };
  created_on: string;
}

// ── Bitbucket Server API response types (minimal) ──

interface BBServerRepo {
  id: number;
  slug: string;
  name: string;
  project: { key: string };
  description: string | null;
  public: boolean;
  links: { clone?: { href: string; name: string }[]; self?: { href: string }[] };
  state?: string;
}

interface BBServerPR {
  id: number;
  title: string;
  description: string | null;
  state: string; // OPEN | MERGED | DECLINED
  fromRef: { displayId: string };
  toRef: { displayId: string };
  author: { user: { slug: string } };
  links: { self?: { href: string }[] };
  createdDate: number;
  updatedDate: number;
}

interface BBServerBranch {
  displayId: string;
  latestCommit: string;
  isDefault?: boolean;
}

// ── Mappers — Cloud ──

function toForgeRepoCloud(r: BBCloudRepo): ForgeRepo {
  return {
    id: r.uuid,
    owner: r.owner.username,
    name: r.slug,
    fullName: r.full_name,
    description: r.description || null,
    visibility: r.is_private ? 'private' : 'public',
    defaultBranch: r.mainbranch?.name ?? 'main',
    url: r.links.html.href,
    createdAt: r.created_on,
    updatedAt: r.updated_on,
  };
}

function toForgePullCloud(p: BBCloudPR): ForgePullRequest {
  let state: 'open' | 'closed' | 'merged' = 'open';
  if (p.state === 'MERGED') state = 'merged';
  else if (p.state === 'DECLINED' || p.state === 'SUPERSEDED') state = 'closed';
  return {
    id: String(p.id),
    number: p.id,
    title: p.title,
    body: p.description || null,
    state,
    sourceBranch: p.source.branch.name,
    targetBranch: p.destination.branch.name,
    author: p.author.username ?? p.author.display_name,
    url: p.links.html.href,
    createdAt: p.created_on,
    updatedAt: p.updated_on,
  };
}

function toForgePipelineCloud(
  p: BBCloudPipeline,
  owner: string,
  repo: string,
  baseUrl: string
): ForgePipeline {
  const status = mapPipelineStatus(p.state.name, p.state.result?.name);
  return {
    id: p.uuid,
    name: `Pipeline #${p.build_number}`,
    status,
    ref: p.target.ref_name,
    sha: p.target.commit.hash,
    url: `${baseUrl}/${owner}/${repo}/pipelines/results/${p.build_number}`,
    createdAt: p.created_on,
    startedAt: p.started_on ?? null,
    finishedAt: p.completed_on ?? null,
  };
}

function mapPipelineStatus(
  stateName: string,
  resultName?: string
): ForgePipeline['status'] {
  if (stateName === 'PENDING') return 'queued';
  if (stateName === 'BUILDING') return 'running';
  if (stateName === 'STOPPED') return 'cancelled';
  if (stateName === 'COMPLETED') {
    if (resultName === 'SUCCESSFUL') return 'passed';
    if (resultName === 'FAILED' || resultName === 'ERROR') return 'failed';
    if (resultName === 'STOPPED') return 'cancelled';
  }
  return 'unknown';
}

function toForgeBranchCloud(b: BBCloudBranch): ForgeBranch {
  return {
    name: b.name,
    sha: b.target.hash,
    protected: false, // Bitbucket Cloud doesn't expose branch restrictions in this endpoint
  };
}

function toForgeReleaseFromDownload(d: BBCloudDownload): ForgeRelease {
  return {
    id: d.name,
    tag: '',
    name: d.name,
    body: null,
    draft: false,
    prerelease: false,
    createdAt: d.created_on,
    assets: [
      {
        id: d.name,
        name: d.name,
        sizeBytes: d.size,
        downloadUrl: d.links.self.href,
        createdAt: d.created_on,
      } satisfies ForgeArtifact,
    ],
  };
}

// ── Mappers — Server ──

function toForgeRepoServer(r: BBServerRepo): ForgeRepo {
  const selfUrl = r.links.self?.[0]?.href ?? '';
  return {
    id: String(r.id),
    owner: r.project.key,
    name: r.slug,
    fullName: `${r.project.key}/${r.slug}`,
    description: r.description ?? null,
    visibility: r.public ? 'public' : 'private',
    defaultBranch: 'main', // Server doesn't include default branch in repo list
    url: selfUrl,
    createdAt: '', // Server doesn't expose creation timestamp in repo endpoint
    updatedAt: '',
  };
}

function toForgePullServer(p: BBServerPR): ForgePullRequest {
  let state: 'open' | 'closed' | 'merged' = 'open';
  if (p.state === 'MERGED') state = 'merged';
  else if (p.state === 'DECLINED') state = 'closed';
  return {
    id: String(p.id),
    number: p.id,
    title: p.title,
    body: p.description ?? null,
    state,
    sourceBranch: p.fromRef.displayId,
    targetBranch: p.toRef.displayId,
    author: p.author.user.slug,
    url: p.links.self?.[0]?.href ?? '',
    createdAt: new Date(p.createdDate).toISOString(),
    updatedAt: new Date(p.updatedDate).toISOString(),
  };
}

function toForgeBranchServer(b: BBServerBranch): ForgeBranch {
  return {
    name: b.displayId,
    sha: b.latestCommit,
    protected: false,
  };
}

// ── PR state mapping ──

function mapPRStateToCloud(state?: 'open' | 'closed' | 'all'): string {
  if (!state || state === 'all') return '';
  if (state === 'open') return 'OPEN';
  // 'closed' maps to both MERGED and DECLINED — use DECLINED for filtering
  return 'MERGED';
}

function enc(s: string): string {
  return encodeURIComponent(s);
}
