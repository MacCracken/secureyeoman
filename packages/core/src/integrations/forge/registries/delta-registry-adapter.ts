/**
 * Delta Registry Adapter — ArtifactRegistryAdapter for Delta Code Forge.
 *
 * Delta does not have a container registry, so image endpoints return empty.
 * Build artifacts are fetched via the Delta artifacts API.
 */

import type {
  ArtifactRegistryAdapter,
  ContainerImage,
  ContainerTag,
  BuildArtifact,
  ForgeConfig,
} from '../types.js';

export class DeltaRegistryAdapter implements ArtifactRegistryAdapter {
  readonly provider = 'delta';
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;

  constructor(config: ForgeConfig) {
    this.baseUrl = config.baseUrl;
    this.token = config.token;
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  async listImages(_owner: string): Promise<ContainerImage[]> {
    // Delta does not have a container registry
    return [];
  }

  async getImageTags(_owner: string, _name: string): Promise<ContainerTag[]> {
    // Delta does not have a container registry
    return [];
  }

  async listBuildArtifacts(owner: string, repo: string, pipelineId: string): Promise<BuildArtifact[]> {
    const data = await this.get<DeltaArtifact[]>(
      `/api/v1/repos/${enc(owner)}/${enc(repo)}/pipelines/${enc(pipelineId)}/artifacts`
    );
    return data.map((a) => ({
      id: a.id,
      name: a.name,
      size: a.size,
      downloadUrl: a.download_url ?? undefined,
      pipelineId,
      createdAt: a.created_at,
      expiresAt: a.expires_at ?? undefined,
    }));
  }

  // ── HTTP Helpers ──

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Delta API ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }
}

// ── Delta API response types (minimal) ──

interface DeltaArtifact {
  id: string;
  name: string;
  size: number;
  download_url: string | null;
  created_at: string;
  expires_at: string | null;
}

function enc(s: string): string {
  return encodeURIComponent(s);
}
