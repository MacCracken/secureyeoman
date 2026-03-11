import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeltaForgeAdapter } from './delta-forge-adapter.js';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('DeltaForgeAdapter', () => {
  let adapter: DeltaForgeAdapter;

  beforeEach(() => {
    adapter = new DeltaForgeAdapter({
      provider: 'delta',
      baseUrl: 'http://localhost:8070',
      token: 'delta_test',
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('has correct provider and baseUrl', () => {
    expect(adapter.provider).toBe('delta');
    expect(adapter.baseUrl).toBe('http://localhost:8070');
  });

  it('listRepos normalizes Delta response', async () => {
    const deltaRepos = [
      {
        id: 'r1',
        owner_id: 'user',
        name: 'repo',
        description: 'Test',
        visibility: 'public',
        default_branch: 'main',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      },
    ];
    vi.mocked(fetch).mockResolvedValue(jsonResponse(deltaRepos));

    const repos = await adapter.listRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0].fullName).toBe('user/repo');
    expect(repos[0].owner).toBe('user');
    expect(repos[0].visibility).toBe('public');
  });

  it('listPulls normalizes Delta response', async () => {
    const deltaPulls = [
      {
        id: 'p1',
        repo_id: 'r1',
        number: 1,
        title: 'Fix bug',
        body: null,
        state: 'open',
        source_branch: 'fix',
        target_branch: 'main',
        author_id: 'user1',
        merge_strategy: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      },
    ];
    vi.mocked(fetch).mockResolvedValue(jsonResponse(deltaPulls));

    const pulls = await adapter.listPulls('user', 'repo');
    expect(pulls).toHaveLength(1);
    expect(pulls[0].sourceBranch).toBe('fix');
    expect(pulls[0].author).toBe('user1');
  });

  it('listPipelines normalizes Delta response', async () => {
    const deltaPipelines = [
      {
        id: 'pl1',
        repo_id: 'r1',
        workflow_name: 'ci',
        trigger_type: 'push',
        commit_sha: 'abc123',
        status: 'running',
        created_at: '2026-01-01T00:00:00Z',
        started_at: '2026-01-01T00:01:00Z',
        finished_at: null,
      },
    ];
    vi.mocked(fetch).mockResolvedValue(jsonResponse(deltaPipelines));

    const pipelines = await adapter.listPipelines('user', 'repo');
    expect(pipelines).toHaveLength(1);
    expect(pipelines[0].name).toBe('ci');
    expect(pipelines[0].status).toBe('running');
    expect(pipelines[0].sha).toBe('abc123');
  });

  it('health returns true on ok', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ status: 'ok', version: '1.0' }));
    expect(await adapter.health()).toBe(true);
  });

  it('health returns false on error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await adapter.health()).toBe(false);
  });

  it('listBranches returns empty (not yet supported)', async () => {
    expect(await adapter.listBranches('u', 'r')).toEqual([]);
  });

  it('listReleases returns empty (not yet supported)', async () => {
    expect(await adapter.listReleases('u', 'r')).toEqual([]);
  });
});
