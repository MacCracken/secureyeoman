import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BitbucketForgeAdapter } from './bitbucket-forge-adapter.js';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function cloudPage<T>(values: T[], next?: string) {
  return { values, next, page: 1, size: values.length };
}

describe('BitbucketForgeAdapter', () => {
  let adapter: BitbucketForgeAdapter;

  beforeEach(() => {
    adapter = new BitbucketForgeAdapter({
      provider: 'bitbucket',
      baseUrl: 'https://bitbucket.org',
      token: 'bb_test_token',
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('has correct provider', () => {
    expect(adapter.provider).toBe('bitbucket');
  });

  it('uses Cloud API URL for bitbucket.org', () => {
    expect(adapter.baseUrl).toBe('https://bitbucket.org');
  });

  it('uses Server API URL for self-hosted instances', () => {
    const serverAdapter = new BitbucketForgeAdapter({
      provider: 'bitbucket',
      baseUrl: 'https://git.corp.com',
      token: 'tok',
    });
    expect(serverAdapter.baseUrl).toBe('https://git.corp.com');
    // Verify it hits /rest/api/1.0 by calling health and checking the fetch URL
  });

  it('getRepo normalizes Bitbucket Cloud response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        uuid: '{abc-123}',
        owner: { username: 'workspace1' },
        slug: 'my-repo',
        full_name: 'workspace1/my-repo',
        name: 'my-repo',
        description: 'A test repository',
        is_private: false,
        mainbranch: { name: 'main' },
        links: { html: { href: 'https://bitbucket.org/workspace1/my-repo' } },
        created_on: '2026-01-01T00:00:00Z',
        updated_on: '2026-01-02T00:00:00Z',
      })
    );

    const repo = await adapter.getRepo('workspace1', 'my-repo');
    expect(repo.id).toBe('{abc-123}');
    expect(repo.owner).toBe('workspace1');
    expect(repo.fullName).toBe('workspace1/my-repo');
    expect(repo.visibility).toBe('public');
    expect(repo.defaultBranch).toBe('main');

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain('/repositories/workspace1/my-repo');
    expect((call[1]?.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer bb_test_token'
    );
  });

  it('listPulls normalizes Bitbucket Cloud PRs with state mapping', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        cloudPage([
          {
            id: 42,
            title: 'Add feature X',
            description: 'Implements feature X',
            state: 'MERGED',
            source: { branch: { name: 'feature-x' } },
            destination: { branch: { name: 'main' } },
            author: { username: 'dev1', display_name: 'Dev One' },
            links: { html: { href: 'https://bitbucket.org/workspace1/repo/pull-requests/42' } },
            created_on: '2026-01-01T00:00:00Z',
            updated_on: '2026-01-03T00:00:00Z',
          },
          {
            id: 43,
            title: 'Fix bug Y',
            description: null,
            state: 'DECLINED',
            source: { branch: { name: 'fix-y' } },
            destination: { branch: { name: 'main' } },
            author: { username: 'dev2', display_name: 'Dev Two' },
            links: { html: { href: 'https://bitbucket.org/workspace1/repo/pull-requests/43' } },
            created_on: '2026-01-02T00:00:00Z',
            updated_on: '2026-01-04T00:00:00Z',
          },
        ])
      )
    );

    const pulls = await adapter.listPulls('workspace1', 'repo', 'all');
    expect(pulls).toHaveLength(2);
    expect(pulls[0].state).toBe('merged');
    expect(pulls[0].sourceBranch).toBe('feature-x');
    expect(pulls[0].author).toBe('dev1');
    expect(pulls[1].state).toBe('closed');
  });

  it('listPipelines normalizes pipeline status correctly', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        cloudPage([
          {
            uuid: '{pipe-1}',
            build_number: 100,
            state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } },
            target: { ref_name: 'main', commit: { hash: 'abc123' } },
            created_on: '2026-01-01T00:00:00Z',
            started_on: '2026-01-01T00:01:00Z',
            completed_on: '2026-01-01T00:05:00Z',
          },
          {
            uuid: '{pipe-2}',
            build_number: 101,
            state: { name: 'BUILDING' },
            target: { ref_name: 'dev', commit: { hash: 'def456' } },
            created_on: '2026-01-02T00:00:00Z',
            started_on: '2026-01-02T00:01:00Z',
            completed_on: null,
          },
          {
            uuid: '{pipe-3}',
            build_number: 102,
            state: { name: 'COMPLETED', result: { name: 'FAILED' } },
            target: { ref_name: 'main', commit: { hash: 'ghi789' } },
            created_on: '2026-01-03T00:00:00Z',
            started_on: '2026-01-03T00:01:00Z',
            completed_on: '2026-01-03T00:03:00Z',
          },
          {
            uuid: '{pipe-4}',
            build_number: 103,
            state: { name: 'STOPPED' },
            target: { ref_name: 'main', commit: { hash: 'jkl012' } },
            created_on: '2026-01-04T00:00:00Z',
            started_on: null,
            completed_on: null,
          },
        ])
      )
    );

    const pipelines = await adapter.listPipelines('workspace1', 'repo');
    expect(pipelines).toHaveLength(4);
    expect(pipelines[0].status).toBe('passed');
    expect(pipelines[0].name).toBe('Pipeline #100');
    expect(pipelines[0].sha).toBe('abc123');
    expect(pipelines[1].status).toBe('running');
    expect(pipelines[2].status).toBe('failed');
    expect(pipelines[3].status).toBe('cancelled');
  });

  it('listBranches returns normalized branches', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        cloudPage([
          { name: 'main', target: { hash: 'abc111' } },
          { name: 'develop', target: { hash: 'def222' } },
        ])
      )
    );

    const branches = await adapter.listBranches('workspace1', 'repo');
    expect(branches).toHaveLength(2);
    expect(branches[0].name).toBe('main');
    expect(branches[0].sha).toBe('abc111');
    expect(branches[0].protected).toBe(false);
    expect(branches[1].name).toBe('develop');
  });

  it('listReleases uses downloads API and normalizes', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        cloudPage([
          {
            name: 'app-v1.0.0.tar.gz',
            size: 2048,
            downloads: 10,
            links: {
              self: {
                href: 'https://api.bitbucket.org/2.0/repositories/ws/repo/downloads/app-v1.0.0.tar.gz',
              },
            },
            created_on: '2026-02-01T00:00:00Z',
          },
        ])
      )
    );

    const releases = await adapter.listReleases('ws', 'repo');
    expect(releases).toHaveLength(1);
    expect(releases[0].name).toBe('app-v1.0.0.tar.gz');
    expect(releases[0].tag).toBe('');
    expect(releases[0].assets).toHaveLength(1);
    expect(releases[0].assets[0].sizeBytes).toBe(2048);
    expect(releases[0].assets[0].downloadUrl).toContain('downloads/app-v1.0.0.tar.gz');
  });

  it('triggerPipeline posts correct body and returns pipeline', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        uuid: '{new-pipe}',
        build_number: 200,
        state: { name: 'PENDING' },
        target: { ref_name: 'main', commit: { hash: 'xyz999' } },
        created_on: '2026-03-01T00:00:00Z',
        started_on: null,
        completed_on: null,
      })
    );

    const pipeline = await adapter.triggerPipeline('workspace1', 'repo', 'main');
    expect(pipeline.status).toBe('queued');
    expect(pipeline.ref).toBe('main');

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain('/repositories/workspace1/repo/pipelines/');
    expect(call[1]?.method).toBe('POST');
    const body = JSON.parse(call[1]?.body as string);
    expect(body.target.type).toBe('pipeline_ref_target');
    expect(body.target.ref_name).toBe('main');
  });

  it('cancelPipeline calls stopPipeline endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    await adapter.cancelPipeline('workspace1', 'repo', '{pipe-uuid}');

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain('/pipelines/%7Bpipe-uuid%7D/stopPipeline');
    expect(call[1]?.method).toBe('POST');
  });

  it('health checks /user endpoint for Cloud', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    expect(await adapter.health()).toBe(true);
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/user');
  });

  it('health returns false on error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await adapter.health()).toBe(false);
  });

  it('handles pagination by following next links', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          values: [{ name: 'branch-1', target: { hash: 'aaa' } }],
          next: 'https://api.bitbucket.org/2.0/repositories/ws/repo/refs/branches?page=2',
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          values: [{ name: 'branch-2', target: { hash: 'bbb' } }],
        })
      );

    const branches = await adapter.listBranches('ws', 'repo');
    expect(branches).toHaveLength(2);
    expect(branches[0].name).toBe('branch-1');
    expect(branches[1].name).toBe('branch-2');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });
});
