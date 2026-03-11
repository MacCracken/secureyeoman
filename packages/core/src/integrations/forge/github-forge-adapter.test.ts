import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubForgeAdapter } from './github-forge-adapter.js';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GitHubForgeAdapter', () => {
  let adapter: GitHubForgeAdapter;

  beforeEach(() => {
    adapter = new GitHubForgeAdapter({
      provider: 'github',
      baseUrl: 'https://github.com',
      token: 'ghp_test123',
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('has correct provider', () => {
    expect(adapter.provider).toBe('github');
  });

  it('listRepos normalizes GitHub response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        {
          id: 123,
          owner: { login: 'user' },
          name: 'repo',
          full_name: 'user/repo',
          description: 'Test repo',
          visibility: 'public',
          default_branch: 'main',
          html_url: 'https://github.com/user/repo',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
          private: false,
        },
      ])
    );

    const repos = await adapter.listRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0].id).toBe('123');
    expect(repos[0].owner).toBe('user');
    expect(repos[0].fullName).toBe('user/repo');
    expect(repos[0].visibility).toBe('public');

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain('/user/repos');
    expect((call[1]?.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer ghp_test123'
    );
  });

  it('listPulls normalizes GitHub response with merged state', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        {
          id: 456,
          number: 1,
          title: 'Feature',
          body: 'description',
          state: 'closed',
          merged_at: '2026-01-02T00:00:00Z',
          head: { ref: 'feature' },
          base: { ref: 'main' },
          user: { login: 'dev' },
          html_url: 'https://github.com/user/repo/pull/1',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        },
      ])
    );

    const pulls = await adapter.listPulls('user', 'repo');
    expect(pulls[0].state).toBe('merged');
    expect(pulls[0].sourceBranch).toBe('feature');
  });

  it('listPipelines normalizes workflow runs', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        workflow_runs: [
          {
            id: 789,
            name: 'CI',
            status: 'completed',
            conclusion: 'success',
            head_branch: 'main',
            head_sha: 'abc123',
            html_url: 'https://github.com/user/repo/actions/runs/789',
            created_at: '2026-01-01T00:00:00Z',
            run_started_at: '2026-01-01T00:01:00Z',
            updated_at: '2026-01-01T00:02:00Z',
          },
        ],
      })
    );

    const pipelines = await adapter.listPipelines('user', 'repo');
    expect(pipelines).toHaveLength(1);
    expect(pipelines[0].status).toBe('passed');
    expect(pipelines[0].name).toBe('CI');
  });

  it('listBranches returns normalized branches', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        { name: 'main', commit: { sha: 'abc' }, protected: true },
        { name: 'dev', commit: { sha: 'def' } },
      ])
    );

    const branches = await adapter.listBranches('user', 'repo');
    expect(branches).toHaveLength(2);
    expect(branches[0].name).toBe('main');
    expect(branches[0].protected).toBe(true);
    expect(branches[1].protected).toBe(false);
  });

  it('listReleases normalizes GitHub releases with assets', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        {
          id: 100,
          tag_name: 'v1.0.0',
          name: 'Release 1.0',
          body: 'First release',
          draft: false,
          prerelease: false,
          created_at: '2026-01-01T00:00:00Z',
          assets: [
            {
              id: 200,
              name: 'app.tar.gz',
              size: 1024,
              browser_download_url:
                'https://github.com/user/repo/releases/download/v1.0.0/app.tar.gz',
              created_at: '2026-01-01T00:00:00Z',
            },
          ],
        },
      ])
    );

    const releases = await adapter.listReleases('user', 'repo');
    expect(releases).toHaveLength(1);
    expect(releases[0].tag).toBe('v1.0.0');
    expect(releases[0].assets).toHaveLength(1);
    expect(releases[0].assets[0].sizeBytes).toBe(1024);
  });

  it('health checks rate_limit endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    expect(await adapter.health()).toBe(true);
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/rate_limit');
  });

  it('health returns false on error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await adapter.health()).toBe(false);
  });

  it('uses GitHub Enterprise API URL when baseUrl is not github.com', () => {
    const gheAdapter = new GitHubForgeAdapter({
      provider: 'github',
      baseUrl: 'https://git.corp.com',
      token: 'tok',
    });
    expect(gheAdapter.baseUrl).toBe('https://git.corp.com');
  });
});
