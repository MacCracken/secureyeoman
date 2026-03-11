/**
 * Delta Forge Adapter — wraps the existing DeltaClient behind CodeForgeAdapter.
 */

import { DeltaClient } from '../delta/delta-client.js';
import type {
  CodeForgeAdapter,
  ForgeConfig,
  ForgeRepo,
  ForgePullRequest,
  ForgePipeline,
  ForgeBranch,
  ForgeRelease,
} from './types.js';

export class DeltaForgeAdapter implements CodeForgeAdapter {
  readonly provider = 'delta' as const;
  readonly baseUrl: string;
  private readonly client: DeltaClient;

  constructor(config: ForgeConfig) {
    this.baseUrl = config.baseUrl;
    this.client = new DeltaClient({
      baseUrl: config.baseUrl,
      apiToken: config.token,
      timeoutMs: config.timeoutMs,
    });
  }

  async listRepos(): Promise<ForgeRepo[]> {
    const repos = await this.client.listRepos();
    return repos.map((r) => ({
      id: r.id,
      owner: r.owner_id,
      name: r.name,
      fullName: `${r.owner_id}/${r.name}`,
      description: r.description,
      visibility: r.visibility,
      defaultBranch: r.default_branch,
      url: `${this.baseUrl}/${r.owner_id}/${r.name}`,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async getRepo(owner: string, name: string): Promise<ForgeRepo> {
    const r = await this.client.getRepo(owner, name);
    return {
      id: r.id,
      owner: r.owner_id,
      name: r.name,
      fullName: `${r.owner_id}/${r.name}`,
      description: r.description,
      visibility: r.visibility,
      defaultBranch: r.default_branch,
      url: `${this.baseUrl}/${r.owner_id}/${r.name}`,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async listPulls(owner: string, name: string, state?: 'open' | 'closed' | 'all'): Promise<ForgePullRequest[]> {
    const pulls = await this.client.listPulls(owner, name, state);
    return pulls.map((p) => ({
      id: p.id,
      number: p.number,
      title: p.title,
      body: p.body,
      state: p.state,
      sourceBranch: p.source_branch,
      targetBranch: p.target_branch,
      author: p.author_id,
      url: `${this.baseUrl}/${owner}/${name}/pulls/${p.number}`,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));
  }

  async getPull(owner: string, name: string, number: number): Promise<ForgePullRequest> {
    const p = await this.client.getPull(owner, name, number);
    return {
      id: p.id,
      number: p.number,
      title: p.title,
      body: p.body,
      state: p.state,
      sourceBranch: p.source_branch,
      targetBranch: p.target_branch,
      author: p.author_id,
      url: `${this.baseUrl}/${owner}/${name}/pulls/${p.number}`,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    };
  }

  async listPipelines(owner: string, name: string): Promise<ForgePipeline[]> {
    const pipelines = await this.client.listPipelines(owner, name);
    return pipelines.map((p) => ({
      id: p.id,
      name: p.workflow_name,
      status: p.status,
      ref: p.trigger_type,
      sha: p.commit_sha,
      url: null,
      createdAt: p.created_at,
      startedAt: p.started_at,
      finishedAt: p.finished_at,
    }));
  }

  async triggerPipeline(owner: string, name: string, ref: string): Promise<ForgePipeline> {
    const p = await this.client.triggerPipeline(owner, name, ref);
    return {
      id: p.id,
      name: p.workflow_name,
      status: p.status,
      ref: p.trigger_type,
      sha: p.commit_sha,
      url: null,
      createdAt: p.created_at,
      startedAt: p.started_at,
      finishedAt: p.finished_at,
    };
  }

  async cancelPipeline(owner: string, name: string, pipelineId: string): Promise<void> {
    await this.client.cancelPipeline(owner, name, pipelineId);
  }

  async listBranches(_owner: string, _name: string): Promise<ForgeBranch[]> {
    // Delta doesn't expose a branch list endpoint yet — return empty
    return [];
  }

  async listReleases(_owner: string, _name: string): Promise<ForgeRelease[]> {
    // Delta releases endpoint returns minimal data — return empty for now
    return [];
  }

  async health(): Promise<boolean> {
    try {
      const h = await this.client.health();
      return h.status === 'ok';
    } catch {
      return false;
    }
  }
}
