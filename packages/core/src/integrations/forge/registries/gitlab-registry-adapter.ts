/**
 * GitLab Registry Adapter — ArtifactRegistryAdapter for GitLab Container Registry.
 *
 * Uses the GitLab REST API v4 to list container registry repositories, tags,
 * and job artifacts.
 */

import type {
  ArtifactRegistryAdapter,
  ContainerImage,
  ContainerTag,
  BuildArtifact,
  ForgeConfig,
} from '../types.js';

export class GitLabRegistryAdapter implements ArtifactRegistryAdapter {
  readonly provider = 'gitlab';
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;

  constructor(config: ForgeConfig) {
    this.baseUrl = config.baseUrl || 'https://gitlab.com';
    this.token = config.token;
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  async listImages(owner: string): Promise<ContainerImage[]> {
    // GitLab requires a project ID — owner here is "group/project"
    const pid = encodeURIComponent(owner);
    const repos = await this.get<GLRegistryRepo[]>(
      `/projects/${pid}/registry/repositories?per_page=100`
    );
    return repos.map((r) => ({
      name: r.name || r.path.split('/').pop() || r.path,
      fullName: r.location,
      tags: [],
      registry: 'gitlab',
      updatedAt: r.created_at,
    }));
  }

  async getImageTags(owner: string, name: string): Promise<ContainerTag[]> {
    const pid = encodeURIComponent(owner);
    // name is the repository ID within the project registry
    const repoId = encodeURIComponent(name);
    const tags = await this.get<GLRegistryTag[]>(
      `/projects/${pid}/registry/repositories/${repoId}/tags?per_page=100`
    );
    return tags.map((t) => ({
      name: t.name,
      digest: t.digest ?? '',
      size: t.total_size ?? undefined,
      pushedAt: t.created_at ?? undefined,
      architecture: undefined,
    }));
  }

  async listBuildArtifacts(owner: string, _repo: string, pipelineId: string): Promise<BuildArtifact[]> {
    const pid = encodeURIComponent(owner);
    // List jobs for the pipeline, then collect artifacts
    const jobs = await this.get<GLJob[]>(
      `/projects/${pid}/pipelines/${encodeURIComponent(pipelineId)}/jobs?per_page=100`
    );
    const artifacts: BuildArtifact[] = [];
    for (const job of jobs) {
      if (job.artifacts_file) {
        artifacts.push({
          id: String(job.id),
          name: job.artifacts_file.filename,
          size: job.artifacts_file.size,
          downloadUrl: `${this.baseUrl}/api/v4/projects/${pid}/jobs/${job.id}/artifacts`,
          pipelineId,
          createdAt: job.created_at,
          expiresAt: job.artifacts_expire_at ?? undefined,
        });
      }
    }
    return artifacts;
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

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (this.token) h['PRIVATE-TOKEN'] = this.token;
    return h;
  }
}

// ── GitLab API response types (minimal) ──

interface GLRegistryRepo {
  id: number;
  name: string;
  path: string;
  location: string;
  created_at: string;
}

interface GLRegistryTag {
  name: string;
  digest: string | null;
  total_size: number | null;
  created_at: string | null;
}

interface GLJob {
  id: number;
  created_at: string;
  artifacts_file: {
    filename: string;
    size: number;
  } | null;
  artifacts_expire_at: string | null;
}
