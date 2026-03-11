/**
 * Artifactory Client — HTTP client for JFrog Artifactory REST API.
 *
 * Supports bearer token or basic auth, repository browsing, AQL search,
 * Docker image listing, build info, and build promotion.
 */

// ── Config & Types ──────────────────────────────────────────

export interface ArtifactoryConfig {
  baseUrl: string; // e.g., https://mycompany.jfrog.io/artifactory
  token?: string; // API key or access token
  username?: string; // for basic auth
  password?: string; // for basic auth
  timeoutMs?: number;
}

export interface ArtifactoryRepo {
  key: string;
  type: 'local' | 'remote' | 'virtual' | 'federated';
  packageType: string; // docker, npm, maven, pypi, etc.
  description?: string;
  url: string;
}

export interface ArtifactoryItem {
  path: string;
  name: string;
  size: number;
  created: string;
  modified: string;
  sha256?: string;
  mimeType?: string;
  downloadUri?: string;
}

export interface ArtifactoryBuildInfo {
  name: string;
  number: string;
  started: string;
  status?: string;
  modules?: Array<{ id: string; artifacts: Array<{ name: string; sha256: string }> }>;
}

export interface ArtifactoryDockerImage {
  name: string;
  tags: string[];
  lastModified?: string;
}

// ── Client ──────────────────────────────────────────────────

export class ArtifactoryClient {
  readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly username: string | undefined;
  private readonly password: string | undefined;
  private readonly timeoutMs: number;

  constructor(config: ArtifactoryConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.token = config.token;
    this.username = config.username;
    this.password = config.password;
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  // ── Repositories ────────────────────────────────────────

  /** List repositories, optionally filtered by type and/or packageType. */
  async listRepos(type?: string, packageType?: string): Promise<ArtifactoryRepo[]> {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (packageType) params.set('packageType', packageType);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const data = await this.get<RawRepo[]>(`/api/repositories${qs}`);
    return data.map(toRepo);
  }

  /** Get a single repository by key. */
  async getRepo(key: string): Promise<ArtifactoryRepo> {
    const data = await this.get<RawRepo>(`/api/repositories/${enc(key)}`);
    return toRepo(data);
  }

  // ── Artifacts — Storage API ─────────────────────────────

  /** List folder contents in a repository. */
  async listFolder(repo: string, path?: string): Promise<ArtifactoryItem[]> {
    const p = path ? `/${path.replace(/^\/+/, '')}` : '';
    const data = await this.get<{ children?: RawChild[] }>(`/api/storage/${enc(repo)}${p}`);
    return (data.children ?? [])
      .filter((c) => !c.folder)
      .map((c) => ({
        path: p ? p.replace(/^\//, '') : '',
        name: c.uri.replace(/^\//, ''),
        size: c.size ?? 0,
        created: c.lastModified ?? '',
        modified: c.lastModified ?? '',
        sha256: c.sha256,
      }));
  }

  /** Get detailed info for a single item. */
  async getItemInfo(repo: string, path: string): Promise<ArtifactoryItem> {
    const data = await this.get<RawItemInfo>(
      `/api/storage/${enc(repo)}/${path.replace(/^\/+/, '')}`
    );
    return {
      path: data.path ?? '',
      name: data.path?.split('/').pop() ?? '',
      size: data.size ?? 0,
      created: data.created ?? '',
      modified: data.lastModified ?? '',
      sha256: data.checksums?.sha256,
      mimeType: data.mimeType,
      downloadUri: data.downloadUri,
    };
  }

  // ── Search ──────────────────────────────────────────────

  /** Execute an AQL query. */
  async searchAql(query: string): Promise<ArtifactoryItem[]> {
    const res = await this._fetch('/api/search/aql', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: `items.find(${query})`,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Artifactory AQL ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { results?: RawAqlResult[] };
    return (data.results ?? []).map(toItemFromAql);
  }

  /** Quick search by artifact name. */
  async searchByName(name: string, repos?: string[]): Promise<ArtifactoryItem[]> {
    const params = new URLSearchParams({ name });
    if (repos?.length) params.set('repos', repos.join(','));
    const data = await this.get<{ results?: RawSearchResult[] }>(
      `/api/search/artifact?${params.toString()}`
    );
    return (data.results ?? []).map((r) => ({
      path: r.path ?? '',
      name: r.path?.split('/').pop() ?? name,
      size: r.size ?? 0,
      created: r.created ?? '',
      modified: r.lastModified ?? '',
      sha256: r.sha256,
      downloadUri: r.downloadUri ?? r.uri,
    }));
  }

  // ── Docker ──────────────────────────────────────────────

  /** List Docker images in a repository. */
  async listDockerImages(repo: string): Promise<ArtifactoryDockerImage[]> {
    const catalog = await this.get<{ repositories?: string[] }>(
      `/api/docker/${enc(repo)}/v2/_catalog`
    );
    const images: ArtifactoryDockerImage[] = [];
    for (const imageName of catalog.repositories ?? []) {
      const tagData = await this.get<{ tags?: string[] }>(
        `/api/docker/${enc(repo)}/v2/${imageName}/tags/list`
      );
      images.push({ name: imageName, tags: tagData.tags ?? [] });
    }
    return images;
  }

  /** List tags for a specific Docker image. */
  async getDockerTags(repo: string, image: string): Promise<string[]> {
    const data = await this.get<{ tags?: string[] }>(
      `/api/docker/${enc(repo)}/v2/${image}/tags/list`
    );
    return data.tags ?? [];
  }

  // ── Build Info ──────────────────────────────────────────

  /** List all builds. */
  async listBuilds(): Promise<Array<{ name: string; lastStarted: string }>> {
    const data = await this.get<{ builds?: RawBuildSummary[] }>('/api/build');
    return (data.builds ?? []).map((b) => ({
      name: b.uri?.replace(/^\//, '') ?? '',
      lastStarted: b.lastStarted ?? '',
    }));
  }

  /** Get build info. If number is omitted, returns latest. */
  async getBuild(name: string, number?: string): Promise<ArtifactoryBuildInfo> {
    const num = number ?? 'LATEST';
    const data = await this.get<{ buildInfo?: RawBuildInfo }>(
      `/api/build/${enc(name)}/${enc(num)}`
    );
    const bi = data.buildInfo;
    return {
      name: bi?.name ?? name,
      number: bi?.number ?? num,
      started: bi?.started ?? '',
      status: bi?.status,
      modules: bi?.modules?.map((m) => ({
        id: m.id ?? '',
        artifacts: (m.artifacts ?? []).map((a) => ({ name: a.name ?? '', sha256: a.sha256 ?? '' })),
      })),
    };
  }

  /** Promote a build to a target repository. */
  async promoteBuild(
    name: string,
    number: string,
    targetRepo: string,
    status?: string
  ): Promise<void> {
    const res = await this._fetch(`/api/build/promote/${enc(name)}/${enc(number)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: status ?? 'promoted',
        targetRepo,
        copy: false,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Artifactory promote ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  // ── Health ──────────────────────────────────────────────

  /** Check Artifactory health — GET /api/system/ping returns "OK". */
  async health(): Promise<boolean> {
    try {
      const res = await this._fetch('/api/system/ping');
      if (!res.ok) return false;
      const text = await res.text();
      return text.trim() === 'OK';
    } catch {
      return false;
    }
  }

  // ── HTTP Helpers ────────────────────────────────────────

  async _fetch(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    } else if (this.username && this.password) {
      const creds = Buffer.from(`${this.username}:${this.password}`).toString('base64');
      headers.Authorization = `Basic ${creds}`;
    }

    return fetch(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this._fetch(path);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Artifactory API ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }
}

// ── Raw API response shapes (minimal) ───────────────────────

interface RawRepo {
  key: string;
  type?: string;
  rclass?: string;
  packageType?: string;
  description?: string;
  url?: string;
}

interface RawChild {
  uri: string;
  folder: boolean;
  size?: number;
  lastModified?: string;
  sha256?: string;
}

interface RawItemInfo {
  path?: string;
  size?: number;
  created?: string;
  lastModified?: string;
  mimeType?: string;
  downloadUri?: string;
  checksums?: { sha256?: string; md5?: string };
}

interface RawAqlResult {
  repo?: string;
  path?: string;
  name?: string;
  size?: number;
  created?: string;
  modified?: string;
  actual_sha256?: string;
}

interface RawSearchResult {
  path?: string;
  uri?: string;
  downloadUri?: string;
  size?: number;
  created?: string;
  lastModified?: string;
  sha256?: string;
}

interface RawBuildSummary {
  uri?: string;
  lastStarted?: string;
}

interface RawBuildInfo {
  name?: string;
  number?: string;
  started?: string;
  status?: string;
  modules?: Array<{
    id?: string;
    artifacts?: Array<{ name?: string; sha256?: string }>;
  }>;
}

// ── Mappers ─────────────────────────────────────────────────

function toRepo(r: RawRepo): ArtifactoryRepo {
  return {
    key: r.key,
    type: (r.rclass ?? r.type ?? 'local') as ArtifactoryRepo['type'],
    packageType: r.packageType ?? 'generic',
    description: r.description,
    url: r.url ?? '',
  };
}

function toItemFromAql(r: RawAqlResult): ArtifactoryItem {
  return {
    path: r.path ?? '',
    name: r.name ?? '',
    size: r.size ?? 0,
    created: r.created ?? '',
    modified: r.modified ?? '',
    sha256: r.actual_sha256,
  };
}

function enc(s: string): string {
  return encodeURIComponent(s);
}
