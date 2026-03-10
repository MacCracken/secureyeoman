import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeltaClient } from './delta-client.js';

const noop = () => {};
const logger = {
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  child: () => logger,
} as any;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('DeltaClient', () => {
  let client: DeltaClient;

  beforeEach(() => {
    client = new DeltaClient(
      { baseUrl: 'http://127.0.0.1:8070', apiToken: 'delta_test123' },
      logger
    );
    vi.stubGlobal('fetch', vi.fn());
  });

  it('listRepos sends GET with auth header', async () => {
    const repos = [{ id: 'r1', name: 'my-repo', visibility: 'private' }];
    vi.mocked(fetch).mockResolvedValue(jsonResponse(repos));

    const result = await client.listRepos();
    expect(result).toEqual(repos);

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toBe('http://127.0.0.1:8070/api/v1/repos');
    expect(call[1]?.method).toBe('GET');
    const headers = call[1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer delta_test123');
  });

  it('getRepo URL encodes owner/name', async () => {
    const repo = { id: 'r1', name: 'my repo' };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(repo));

    await client.getRepo('org/team', 'my repo');

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toBe('http://127.0.0.1:8070/api/v1/repos/org%2Fteam/my%20repo');
  });

  it('triggerPipeline sends POST with ref body', async () => {
    const pipeline = { id: 'p1', status: 'queued' };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(pipeline));

    const result = await client.triggerPipeline('owner', 'repo', 'main');
    expect(result).toEqual(pipeline);

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toBe('http://127.0.0.1:8070/api/v1/repos/owner/repo/pipelines');
    const body = JSON.parse(call[1]?.body as string);
    expect(body.ref).toBe('main');
  });

  it('mergePull sends POST to correct URL', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    await client.mergePull('owner', 'repo', 42, 'squash');

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toBe('http://127.0.0.1:8070/api/v1/repos/owner/repo/pulls/42/merge');
    const body = JSON.parse(call[1]?.body as string);
    expect(body.merge_strategy).toBe('squash');
  });

  it('health returns parsed response', async () => {
    const healthData = { status: 'ok', version: '0.1.0' };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(healthData));

    const result = await client.health();
    expect(result).toEqual(healthData);

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toBe('http://127.0.0.1:8070/health');
  });

  it('error response throws with status code', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('not found', { status: 404 }));

    await expect(client.listRepos()).rejects.toThrow('Delta API 404');
  });

  it('no auth header when apiToken not provided', async () => {
    const noAuthClient = new DeltaClient({ baseUrl: 'http://127.0.0.1:8070' }, logger);
    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));

    await noAuthClient.listRepos();

    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
    expect(headers['Accept']).toBe('application/json');
  });

  it('createStatus sends correct payload', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    const status = {
      context: 'ci/secureyeoman',
      state: 'success' as const,
      description: 'All checks passed',
      target_url: 'https://example.com/build/1',
    };
    await client.createStatus('owner', 'repo', 'abc123', status);

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toBe('http://127.0.0.1:8070/api/v1/repos/owner/repo/commits/abc123/statuses');
    const body = JSON.parse(call[1]?.body as string);
    expect(body.context).toBe('ci/secureyeoman');
    expect(body.state).toBe('success');
    expect(body.target_url).toBe('https://example.com/build/1');
  });
});
