import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitLabRegistryAdapter } from './gitlab-registry-adapter.js';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GitLabRegistryAdapter', () => {
  let adapter: GitLabRegistryAdapter;

  beforeEach(() => {
    adapter = new GitLabRegistryAdapter({
      provider: 'gitlab',
      baseUrl: 'https://gitlab.com',
      token: 'glpat-test',
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('has correct provider', () => {
    expect(adapter.provider).toBe('gitlab');
  });

  it('listImages returns normalized registry repositories', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        {
          id: 1,
          name: '',
          path: 'group/project',
          location: 'registry.gitlab.com/group/project',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 2,
          name: 'backend',
          path: 'group/project/backend',
          location: 'registry.gitlab.com/group/project/backend',
          created_at: '2026-01-02T00:00:00Z',
        },
      ])
    );

    const images = await adapter.listImages('group/project');
    expect(images).toHaveLength(2);
    expect(images[0].name).toBe('project'); // falls back to last path segment
    expect(images[0].fullName).toBe('registry.gitlab.com/group/project');
    expect(images[0].registry).toBe('gitlab');
    expect(images[1].name).toBe('backend');

    const call = vi.mocked(fetch).mock.calls[0];
    expect((call[1]?.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('glpat-test');
  });

  it('getImageTags returns normalized tags', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        {
          name: 'latest',
          digest: 'sha256:abc',
          total_size: 50_000_000,
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          name: 'v2.0',
          digest: null,
          total_size: null,
          created_at: null,
        },
      ])
    );

    const tags = await adapter.getImageTags('group/project', '1');
    expect(tags).toHaveLength(2);
    expect(tags[0].name).toBe('latest');
    expect(tags[0].digest).toBe('sha256:abc');
    expect(tags[0].size).toBe(50_000_000);
    expect(tags[1].digest).toBe('');
    expect(tags[1].size).toBeUndefined();
  });

  it('listBuildArtifacts collects artifacts from pipeline jobs', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        {
          id: 100,
          created_at: '2026-01-01T00:00:00Z',
          artifacts_file: { filename: 'build.zip', size: 2048 },
          artifacts_expire_at: '2026-02-01T00:00:00Z',
        },
        {
          id: 101,
          created_at: '2026-01-01T00:00:00Z',
          artifacts_file: null,
          artifacts_expire_at: null,
        },
      ])
    );

    const artifacts = await adapter.listBuildArtifacts('group/project', 'project', '55');
    expect(artifacts).toHaveLength(1); // job 101 has no artifacts
    expect(artifacts[0].id).toBe('100');
    expect(artifacts[0].name).toBe('build.zip');
    expect(artifacts[0].size).toBe(2048);
    expect(artifacts[0].pipelineId).toBe('55');
    expect(artifacts[0].expiresAt).toBe('2026-02-01T00:00:00Z');
    expect(artifacts[0].downloadUrl).toContain('/jobs/100/artifacts');
  });

  it('throws on non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Not Found', { status: 404 }));

    await expect(adapter.listImages('group/project')).rejects.toThrow('GitLab API 404');
  });

  it('uses custom base URL', async () => {
    const selfHosted = new GitLabRegistryAdapter({
      provider: 'gitlab',
      baseUrl: 'https://gl.corp.com',
    });

    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
    await selfHosted.listImages('team/app');

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain('https://gl.corp.com/api/v4/');
  });
});
