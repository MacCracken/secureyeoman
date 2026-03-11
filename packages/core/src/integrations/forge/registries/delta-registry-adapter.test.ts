import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeltaRegistryAdapter } from './delta-registry-adapter.js';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('DeltaRegistryAdapter', () => {
  let adapter: DeltaRegistryAdapter;

  beforeEach(() => {
    adapter = new DeltaRegistryAdapter({
      provider: 'delta',
      baseUrl: 'http://localhost:8070',
      token: 'delta-tok',
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('listImages returns empty (Delta has no container registry)', async () => {
    const images = await adapter.listImages('org');
    expect(images).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('getImageTags returns empty (Delta has no container registry)', async () => {
    const tags = await adapter.getImageTags('org', 'img');
    expect(tags).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('listBuildArtifacts returns normalized Delta artifacts', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        {
          id: 'art-1',
          name: 'dist.tar.gz',
          size: 8192,
          download_url: 'http://localhost:8070/artifacts/art-1/download',
          created_at: '2026-01-01T00:00:00Z',
          expires_at: null,
        },
      ]),
    );

    const artifacts = await adapter.listBuildArtifacts('org', 'repo', 'pipe-42');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].id).toBe('art-1');
    expect(artifacts[0].name).toBe('dist.tar.gz');
    expect(artifacts[0].size).toBe(8192);
    expect(artifacts[0].pipelineId).toBe('pipe-42');
    expect(artifacts[0].expiresAt).toBeUndefined();

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain('/api/v1/repos/org/repo/pipelines/pipe-42/artifacts');
    expect((call[1]?.headers as Record<string, string>).Authorization).toBe('Bearer delta-tok');
  });
});
