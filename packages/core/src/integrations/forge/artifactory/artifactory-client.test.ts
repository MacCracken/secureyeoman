import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArtifactoryClient, type ArtifactoryConfig } from './artifactory-client.js';

const BASE_URL = 'https://mycompany.jfrog.io/artifactory';

function makeClient(overrides?: Partial<ArtifactoryConfig>): ArtifactoryClient {
  return new ArtifactoryClient({ baseUrl: BASE_URL, token: 'test-token', ...overrides });
}

describe('ArtifactoryClient', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn<typeof globalThis, 'fetch'>>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockJson(data: unknown, status = 200) {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  }

  function mockText(text: string, status = 200) {
    fetchSpy.mockResolvedValueOnce(new Response(text, { status }));
  }

  it('listRepos returns normalized repositories', async () => {
    const client = makeClient();
    mockJson([
      { key: 'npm-local', rclass: 'local', packageType: 'npm', description: 'NPM', url: '' },
      { key: 'docker-remote', rclass: 'remote', packageType: 'docker', url: '' },
    ]);

    const repos = await client.listRepos();
    expect(repos).toHaveLength(2);
    expect(repos[0]).toEqual({
      key: 'npm-local',
      type: 'local',
      packageType: 'npm',
      description: 'NPM',
      url: '',
    });
    expect(repos[1].type).toBe('remote');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/repositories'),
      expect.anything()
    );
  });

  it('getRepo returns a single repository', async () => {
    const client = makeClient();
    mockJson({ key: 'maven-central', rclass: 'virtual', packageType: 'maven', url: '' });

    const repo = await client.getRepo('maven-central');
    expect(repo.key).toBe('maven-central');
    expect(repo.type).toBe('virtual');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/repositories/maven-central'),
      expect.anything()
    );
  });

  it('listFolder returns file items', async () => {
    const client = makeClient();
    mockJson({
      children: [
        { uri: '/file1.jar', folder: false, size: 1024, lastModified: '2026-01-01T00:00:00Z' },
        { uri: '/subdir', folder: true },
      ],
    });

    const items = await client.listFolder('libs-release', 'org/example');
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('file1.jar');
    expect(items[0].size).toBe(1024);
  });

  it('searchByName queries artifact search endpoint', async () => {
    const client = makeClient();
    mockJson({
      results: [{ path: 'org/example/lib-1.0.jar', size: 2048, created: '2026-01-01T00:00:00Z' }],
    });

    const items = await client.searchByName('lib', ['libs-release']);
    expect(items).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/search/artifact?name=lib&repos=libs-release'),
      expect.anything()
    );
  });

  it('listDockerImages fetches catalog and tags', async () => {
    const client = makeClient();
    mockJson({ repositories: ['app-api', 'app-web'] });
    mockJson({ tags: ['latest', 'v1.0'] });
    mockJson({ tags: ['latest'] });

    const images = await client.listDockerImages('docker-local');
    expect(images).toHaveLength(2);
    expect(images[0]).toEqual({ name: 'app-api', tags: ['latest', 'v1.0'] });
    expect(images[1]).toEqual({ name: 'app-web', tags: ['latest'] });
  });

  it('getDockerTags returns tag list', async () => {
    const client = makeClient();
    mockJson({ tags: ['latest', 'v2.0', 'v2.1'] });

    const tags = await client.getDockerTags('docker-local', 'my-app');
    expect(tags).toEqual(['latest', 'v2.0', 'v2.1']);
  });

  it('listBuilds returns build summaries', async () => {
    const client = makeClient();
    mockJson({
      builds: [
        { uri: '/my-app', lastStarted: '2026-01-01T00:00:00Z' },
        { uri: '/my-lib', lastStarted: '2026-01-02T00:00:00Z' },
      ],
    });

    const builds = await client.listBuilds();
    expect(builds).toHaveLength(2);
    expect(builds[0].name).toBe('my-app');
  });

  it('getBuild returns build info with modules', async () => {
    const client = makeClient();
    mockJson({
      buildInfo: {
        name: 'my-app',
        number: '42',
        started: '2026-01-01T00:00:00Z',
        status: 'released',
        modules: [{ id: 'mod1', artifacts: [{ name: 'app.jar', sha256: 'abc123' }] }],
      },
    });

    const build = await client.getBuild('my-app', '42');
    expect(build.name).toBe('my-app');
    expect(build.number).toBe('42');
    expect(build.modules).toHaveLength(1);
    expect(build.modules![0].artifacts[0].name).toBe('app.jar');
  });

  it('promoteBuild sends POST to promote endpoint', async () => {
    const client = makeClient();
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 200 }));

    await client.promoteBuild('my-app', '42', 'libs-release', 'released');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/build/promote/my-app/42'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('health returns true when ping says OK', async () => {
    const client = makeClient();
    mockText('OK');

    const healthy = await client.health();
    expect(healthy).toBe(true);
  });
});
