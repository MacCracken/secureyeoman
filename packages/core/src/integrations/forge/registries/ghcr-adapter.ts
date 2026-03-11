/**
 * GHCR Adapter — ArtifactRegistryAdapter for GitHub Container Registry.
 *
 * Uses the GitHub Packages API to list container images and tags,
 * and the Actions API for build artifacts.
 */

import type {
  ArtifactRegistryAdapter,
  ContainerImage,
  ContainerTag,
  BuildArtifact,
  ForgeConfig,
} from '../types.js';

const GITHUB_API = 'https://api.github.com';

export class GhcrAdapter implements ArtifactRegistryAdapter {
  readonly provider = 'ghcr';
  private readonly apiUrl: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;

  constructor(config: ForgeConfig) {
    const baseUrl = config.baseUrl || 'https://github.com';
    this.apiUrl = baseUrl === 'https://github.com' ? GITHUB_API : `${baseUrl}/api/v3`;
    this.token = config.token;
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  async listImages(owner: string): Promise<ContainerImage[]> {
    const packages = await this.get<GHPackage[]>(
      `/users/${enc(owner)}/packages?package_type=container&per_page=100`
    );
    return packages.map((pkg) => ({
      name: pkg.name,
      fullName: `ghcr.io/${owner}/${pkg.name}`,
      tags: [],
      registry: 'ghcr',
      visibility: pkg.visibility === 'public' ? 'public' : 'private',
      updatedAt: pkg.updated_at,
    }));
  }

  async getImageTags(owner: string, name: string): Promise<ContainerTag[]> {
    const versions = await this.get<GHPackageVersion[]>(
      `/users/${enc(owner)}/packages/container/${enc(name)}/versions?per_page=100`
    );
    return versions.map((v) => ({
      name: v.metadata?.container?.tags?.[0] ?? v.name,
      digest: v.name,
      size: undefined,
      pushedAt: v.updated_at,
      architecture: undefined,
    }));
  }

  async listBuildArtifacts(
    owner: string,
    repo: string,
    pipelineId: string
  ): Promise<BuildArtifact[]> {
    const data = await this.get<{ artifacts: GHActionArtifact[] }>(
      `/repos/${enc(owner)}/${enc(repo)}/actions/runs/${enc(pipelineId)}/artifacts`
    );
    return (data.artifacts ?? []).map((a) => ({
      id: String(a.id),
      name: a.name,
      size: a.size_in_bytes,
      downloadUrl: a.archive_download_url,
      pipelineId,
      createdAt: a.created_at,
      expiresAt: a.expires_at ?? undefined,
    }));
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

interface GHPackage {
  id: number;
  name: string;
  visibility: string;
  updated_at: string;
}

interface GHPackageVersion {
  id: number;
  name: string; // digest
  updated_at: string;
  metadata?: {
    container?: {
      tags?: string[];
    };
  };
}

interface GHActionArtifact {
  id: number;
  name: string;
  size_in_bytes: number;
  archive_download_url: string;
  created_at: string;
  expires_at: string | null;
}

function enc(s: string): string {
  return encodeURIComponent(s);
}
