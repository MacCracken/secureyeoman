import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitLabForgeAdapter } from './gitlab-forge-adapter.js';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GitLabForgeAdapter', () => {
  let adapter: GitLabForgeAdapter;

  beforeEach(() => {
    adapter = new GitLabForgeAdapter({
      provider: 'gitlab',
      baseUrl: 'https://gitlab.com',
      token: 'glpat_test123',
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('has correct provider', () => {
    expect(adapter.provider).toBe('gitlab');
  });

  it('listRepos normalizes GitLab projects', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        {
          id: 42,
          path_with_namespace: 'user/repo',
          name: 'repo',
          description: 'A project',
          visibility: 'internal',
          default_branch: 'main',
          web_url: 'https://gitlab.com/user/repo',
          created_at: '2026-01-01T00:00:00Z',
          last_activity_at: '2026-01-02T00:00:00Z',
          namespace: { path: 'user' },
        },
      ])
    );

    const repos = await adapter.listRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0].id).toBe('42');
    expect(repos[0].owner).toBe('user');
    expect(repos[0].fullName).toBe('user/repo');
    expect(repos[0].visibility).toBe('internal');

    const call = vi.mocked(fetch).mock.calls[0];
    expect((call[1]?.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('glpat_test123');
  });

  it('listPulls normalizes merge requests with state mapping', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        {
          id: 100,
          iid: 5,
          title: 'Feature MR',
          description: 'Add stuff',
          state: 'merged',
          source_branch: 'feature',
          target_branch: 'main',
          author: { username: 'dev' },
          web_url: 'https://gitlab.com/user/repo/-/merge_requests/5',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        },
      ])
    );

    const pulls = await adapter.listPulls('user', 'repo', 'all');
    expect(pulls[0].state).toBe('merged');
    expect(pulls[0].number).toBe(5);
    expect(pulls[0].sourceBranch).toBe('feature');
  });

  it('listPipelines normalizes GitLab pipeline status', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        {
          id: 1000,
          status: 'success',
          ref: 'main',
          sha: 'abc123',
          web_url: 'https://gitlab.com/user/repo/-/pipelines/1000',
          created_at: '2026-01-01T00:00:00Z',
          started_at: '2026-01-01T00:01:00Z',
          finished_at: '2026-01-01T00:05:00Z',
        },
        {
          id: 1001,
          status: 'canceled',
          ref: 'dev',
          sha: 'def456',
          web_url: '',
          created_at: '2026-01-01T00:00:00Z',
          started_at: null,
          finished_at: null,
        },
      ])
    );

    const pipelines = await adapter.listPipelines('user', 'repo');
    expect(pipelines).toHaveLength(2);
    expect(pipelines[0].status).toBe('passed');
    expect(pipelines[1].status).toBe('cancelled');
  });

  it('listBranches returns normalized branches', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        { name: 'main', commit: { id: 'sha1' }, protected: true },
        { name: 'dev', commit: { id: 'sha2' } },
      ])
    );

    const branches = await adapter.listBranches('user', 'repo');
    expect(branches).toHaveLength(2);
    expect(branches[0].sha).toBe('sha1');
    expect(branches[0].protected).toBe(true);
  });

  it('listReleases normalizes GitLab releases', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        {
          tag_name: 'v1.0.0',
          name: 'First Release',
          description: 'Notes',
          released_at: '2026-01-01T00:00:00Z',
          assets: {
            links: [{ id: 1, name: 'binary', url: 'https://gitlab.com/dl' }],
            sources: [{ format: 'tar.gz', url: 'https://gitlab.com/src' }],
          },
        },
      ])
    );

    const releases = await adapter.listReleases('user', 'repo');
    expect(releases).toHaveLength(1);
    expect(releases[0].tag).toBe('v1.0.0');
    expect(releases[0].assets).toHaveLength(1);
    expect(releases[0].assets[0].name).toBe('binary');
  });

  it('health checks version endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    expect(await adapter.health()).toBe(true);
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/api/v4/version');
  });

  it('maps open state for listPulls query', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
    await adapter.listPulls('user', 'repo', 'open');
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('state=opened');
  });
});
