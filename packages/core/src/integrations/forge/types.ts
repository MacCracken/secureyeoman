/**
 * Code Forge Adapter — unified interface for repository hosting platforms.
 *
 * Abstracts Delta, GitHub, GitLab (and future Bitbucket/Gitea) behind a
 * common interface so the dashboard can render any forge identically.
 */

// ── Forge Identity ────────────────────────────────────────────

export type ForgeProvider = 'delta' | 'github' | 'gitlab' | 'bitbucket' | 'gitea';

export interface ForgeConfig {
  provider: ForgeProvider;
  baseUrl: string;
  token?: string;
  timeoutMs?: number;
}

// ── Normalized Types ──────────────────────────────────────────

export interface ForgeRepo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  visibility: 'public' | 'internal' | 'private';
  defaultBranch: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface ForgePullRequest {
  id: string;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed' | 'merged';
  sourceBranch: string;
  targetBranch: string;
  author: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface ForgePipeline {
  id: string;
  name: string;
  status: 'queued' | 'running' | 'passed' | 'failed' | 'cancelled' | 'unknown';
  ref: string;
  sha: string;
  url: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ForgeBranch {
  name: string;
  sha: string;
  protected: boolean;
}

export interface ForgeArtifact {
  id: string;
  name: string;
  sizeBytes: number | null;
  downloadUrl: string | null;
  createdAt: string;
}

export interface ForgeRelease {
  id: string;
  tag: string;
  name: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  createdAt: string;
  assets: ForgeArtifact[];
}

// ── Adapter Interface ─────────────────────────────────────────

export interface CodeForgeAdapter {
  readonly provider: ForgeProvider;
  readonly baseUrl: string;

  // Repos
  listRepos(): Promise<ForgeRepo[]>;
  getRepo(owner: string, name: string): Promise<ForgeRepo>;

  // Pull Requests / Merge Requests
  listPulls(owner: string, name: string, state?: 'open' | 'closed' | 'all'): Promise<ForgePullRequest[]>;
  getPull(owner: string, name: string, number: number): Promise<ForgePullRequest>;

  // Pipelines / CI
  listPipelines(owner: string, name: string): Promise<ForgePipeline[]>;
  triggerPipeline(owner: string, name: string, ref: string): Promise<ForgePipeline>;
  cancelPipeline(owner: string, name: string, pipelineId: string): Promise<void>;

  // Branches
  listBranches(owner: string, name: string): Promise<ForgeBranch[]>;

  // Releases & Artifacts
  listReleases(owner: string, name: string): Promise<ForgeRelease[]>;

  // Health
  health(): Promise<boolean>;
}
