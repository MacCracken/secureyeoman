import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GhcrAdapter } from './ghcr-adapter.js';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GhcrAdapter', () => {
  let adapter: GhcrAdapter;

  beforeEach(() => {
    adapter = new GhcrAdapter({
      provider: 'github',
      baseUrl: 'https://github.com',
      token: 'ghp_test123',
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('has correct provider', () => {
    expect(adapter.provider).toBe('ghcr');
  });

  it('listImages returns normalized container images', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        {
          id: 1,
          name: 'my-app',
          visibility: 'public',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 2,
          name: 'private-svc',
          visibility: 'private',
          updated_at: '2026-01-02T00:00:00Z',
        },
      ])
    );

    const images = await adapter.listImages('acme');
    expect(images).toHaveLength(2);
    expect(images[0].name).toBe('my-app');
    expect(images[0].fullName).toBe('ghcr.io/acme/my-app');
    expect(images[0].registry).toBe('ghcr');
    expect(images[0].visibility).toBe('public');
    expect(images[1].visibility).toBe('private');

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain('/users/acme/packages?package_type=container');
    expect((call[1]?.headers as Record<string, string>).Authorization).toBe('Bearer ghp_test123');
  });

  it('getImageTags returns normalized tags', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        {
          id: 10,
          name: 'sha256:abc123',
          updated_at: '2026-01-01T00:00:00Z',
          metadata: { container: { tags: ['v1.0.0'] } },
        },
        {
          id: 11,
          name: 'sha256:def456',
          updated_at: '2026-01-02T00:00:00Z',
          metadata: { container: { tags: [] } },
        },
      ])
    );

    const tags = await adapter.getImageTags('acme', 'my-app');
    expect(tags).toHaveLength(2);
    expect(tags[0].name).toBe('v1.0.0');
    expect(tags[0].digest).toBe('sha256:abc123');
    expect(tags[1].name).toBe('sha256:def456'); // falls back to digest name
  });

  it('listBuildArtifacts returns normalized action artifacts', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        artifacts: [
          {
            id: 100,
            name: 'build-output',
            size_in_bytes: 4096,
            archive_download_url: 'https://api.github.com/repos/acme/app/actions/artifacts/100/zip',
            created_at: '2026-01-01T00:00:00Z',
            expires_at: '2026-02-01T00:00:00Z',
          },
        ],
      })
    );

    const artifacts = await adapter.listBuildArtifacts('acme', 'app', '999');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].id).toBe('100');
    expect(artifacts[0].name).toBe('build-output');
    expect(artifacts[0].size).toBe(4096);
    expect(artifacts[0].pipelineId).toBe('999');
    expect(artifacts[0].expiresAt).toBe('2026-02-01T00:00:00Z');
  });

  it('throws on non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Forbidden', { status: 403 }));

    await expect(adapter.listImages('acme')).rejects.toThrow('GitHub API 403');
  });

  it('uses GitHub Enterprise API URL when baseUrl is not github.com', async () => {
    const gheAdapter = new GhcrAdapter({
      provider: 'github',
      baseUrl: 'https://git.corp.com',
      token: 'tok',
    });

    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
    await gheAdapter.listImages('org');

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain('https://git.corp.com/api/v3/users/org/packages');
  });
});
