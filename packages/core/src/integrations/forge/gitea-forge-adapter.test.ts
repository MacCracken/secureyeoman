import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GiteaForgeAdapter } from './gitea-forge-adapter.js';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GiteaForgeAdapter', () => {
  let adapter: GiteaForgeAdapter;

  beforeEach(() => {
    adapter = new GiteaForgeAdapter({
      provider: 'gitea',
      baseUrl: 'https://gitea.example.com',
      token: 'gt_test123',
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('has correct provider and uses token auth prefix', async () => {
    expect(adapter.provider).toBe('gitea');

    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
    await adapter.listRepos();

    const call = vi.mocked(fetch).mock.calls[0];
    expect((call[1]?.headers as Record<string, string>)['Authorization']).toBe('token gt_test123');
  });

  it('listRepos normalizes Gitea response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        {
          id: 10,
          owner: { login: 'org' },
          name: 'project',
          full_name: 'org/project',
          description: 'A Gitea repo',
          visibility: 'public',
          default_branch: 'main',
          html_url: 'https://gitea.example.com/org/project',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
          private: false,
          internal: false,
        },
      ])
    );

    const repos = await adapter.listRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0].id).toBe('10');
    expect(repos[0].owner).toBe('org');
    expect(repos[0].fullName).toBe('org/project');
    expect(repos[0].visibility).toBe('public');

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain('/api/v1/repos/search');
  });

  it('getRepo returns single normalized repo', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        id: 10,
        owner: { login: 'org' },
        name: 'project',
        full_name: 'org/project',
        description: '',
        visibility: 'private',
        default_branch: 'develop',
        html_url: 'https://gitea.example.com/org/project',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
        private: true,
        internal: false,
      })
    );

    const repo = await adapter.getRepo('org', 'project');
    expect(repo.visibility).toBe('private');
    expect(repo.defaultBranch).toBe('develop');

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain('/api/v1/repos/org/project');
  });

  it('listPulls detects merged state via boolean', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        {
          id: 50,
          number: 3,
          title: 'Merged PR',
          body: 'Was merged',
          state: 'closed',
          merged: true,
          head: { ref: 'feature-x' },
          base: { ref: 'main' },
          user: { login: 'dev' },
          html_url: 'https://gitea.example.com/org/project/pulls/3',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        },
        {
          id: 51,
          number: 4,
          title: 'Open PR',
          body: null,
          state: 'open',
          merged: false,
          head: { ref: 'feature-y' },
          base: { ref: 'main' },
          user: { login: 'dev2' },
          html_url: 'https://gitea.example.com/org/project/pulls/4',
          created_at: '2026-01-03T00:00:00Z',
          updated_at: '2026-01-04T00:00:00Z',
        },
      ])
    );

    const pulls = await adapter.listPulls('org', 'project');
    expect(pulls).toHaveLength(2);
    expect(pulls[0].state).toBe('merged');
    expect(pulls[0].sourceBranch).toBe('feature-x');
    expect(pulls[1].state).toBe('open');
  });

  it('listPipelines normalizes Gitea Actions runs', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        workflow_runs: [
          {
            id: 100,
            name: 'Build',
            status: 'completed',
            conclusion: 'success',
            head_branch: 'main',
            head_sha: 'deadbeef',
            html_url: 'https://gitea.example.com/org/project/actions/runs/100',
            created_at: '2026-01-01T00:00:00Z',
            run_started_at: '2026-01-01T00:01:00Z',
            updated_at: '2026-01-01T00:05:00Z',
          },
          {
            id: 101,
            name: 'Test',
            status: 'running',
            conclusion: null,
            head_branch: 'dev',
            head_sha: 'cafebabe',
            html_url: 'https://gitea.example.com/org/project/actions/runs/101',
            created_at: '2026-01-01T00:02:00Z',
            run_started_at: '2026-01-01T00:03:00Z',
            updated_at: '2026-01-01T00:04:00Z',
          },
        ],
      })
    );

    const pipelines = await adapter.listPipelines('org', 'project');
    expect(pipelines).toHaveLength(2);
    expect(pipelines[0].status).toBe('passed');
    expect(pipelines[0].name).toBe('Build');
    expect(pipelines[0].finishedAt).toBe('2026-01-01T00:05:00Z');
    expect(pipelines[1].status).toBe('running');
    expect(pipelines[1].finishedAt).toBeNull();
  });

  it('listBranches returns normalized branches with commit id', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        { name: 'main', commit: { id: 'abc123' }, protected: true },
        { name: 'dev', commit: { id: 'def456' } },
      ])
    );

    const branches = await adapter.listBranches('org', 'project');
    expect(branches).toHaveLength(2);
    expect(branches[0].name).toBe('main');
    expect(branches[0].sha).toBe('abc123');
    expect(branches[0].protected).toBe(true);
    expect(branches[1].protected).toBe(false);
  });

  it('listReleases normalizes Gitea releases with assets', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        {
          id: 200,
          tag_name: 'v2.0.0',
          name: 'Release 2.0',
          body: 'Major release',
          draft: false,
          prerelease: true,
          created_at: '2026-02-01T00:00:00Z',
          assets: [
            {
              id: 300,
              name: 'binary-linux-amd64',
              size: 52_428_800,
              browser_download_url: 'https://gitea.example.com/org/project/releases/download/v2.0.0/binary-linux-amd64',
              created_at: '2026-02-01T00:00:00Z',
            },
          ],
        },
      ])
    );

    const releases = await adapter.listReleases('org', 'project');
    expect(releases).toHaveLength(1);
    expect(releases[0].tag).toBe('v2.0.0');
    expect(releases[0].prerelease).toBe(true);
    expect(releases[0].assets).toHaveLength(1);
    expect(releases[0].assets[0].name).toBe('binary-linux-amd64');
    expect(releases[0].assets[0].sizeBytes).toBe(52_428_800);
  });

  it('triggerPipeline posts to actions/runs and returns placeholder', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    const pipeline = await adapter.triggerPipeline('org', 'project', 'main');
    expect(pipeline.id).toBe('pending');
    expect(pipeline.status).toBe('queued');
    expect(pipeline.ref).toBe('main');

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain('/api/v1/repos/org/project/actions/runs');
    expect(call[1]?.method).toBe('POST');
  });

  it('cancelPipeline sends DELETE to the run endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    await adapter.cancelPipeline('org', 'project', '42');

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain('/api/v1/repos/org/project/actions/runs/42');
    expect(call[1]?.method).toBe('DELETE');
  });

  it('health checks /user endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    expect(await adapter.health()).toBe(true);
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/api/v1/user');
  });

  it('health returns false on error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await adapter.health()).toBe(false);
  });
});
