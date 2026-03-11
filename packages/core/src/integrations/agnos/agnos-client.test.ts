import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgnosClient } from './agnos-client.js';

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

describe('AgnosClient', () => {
  let client: AgnosClient;

  beforeEach(() => {
    client = new AgnosClient({ runtimeUrl: 'http://127.0.0.1:8090' }, logger);
    vi.stubGlobal('fetch', vi.fn());
  });

  it('discover calls GET /v1/discover', async () => {
    const mockResponse = {
      name: 'AGNOS',
      version: '1.0',
      capabilities: ['agents'],
      endpoints: {},
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const result = await client.discover();
    expect(result.name).toBe('AGNOS');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'http://127.0.0.1:8090/v1/discover',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('registerAgentsBatch sends POST with agents', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ registered: 2 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const agents = [{ id: 'a1', name: 'Agent 1' }];
    const result = await client.registerAgentsBatch(agents);
    expect(result.registered).toBe(2);

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toBe('http://127.0.0.1:8090/v1/agents/register/batch');
    const body = JSON.parse(call[1]?.body as string);
    expect(body.agents).toEqual(agents);
    expect(body.source).toBe('secureyeoman');
  });

  it('heartbeat sends per-agent POST to /v1/agents/:id/heartbeat', async () => {
    const ok = () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    vi.mocked(fetch).mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok());

    await client.heartbeat(['a1', 'a2']);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('http://127.0.0.1:8090/v1/agents/a1/heartbeat');
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe('http://127.0.0.1:8090/v1/agents/a2/heartbeat');
  });

  it('heartbeat handles per-agent failures gracefully', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('error', { status: 500 }));

    // Should not throw — failures are logged at debug level
    await client.heartbeat(['a1', 'a2']);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it('publishEvent sends POST to /v1/events/publish', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    await client.publishEvent('swarm:completed', { swarmId: 's1' });

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toBe('http://127.0.0.1:8090/v1/events/publish');
    const body = JSON.parse(call[1]?.body as string);
    expect(body.topic).toBe('swarm:completed');
    expect(body.sender).toBe('secureyeoman');
    expect(body.payload).toEqual({ swarmId: 's1' });
  });

  it('health calls /v1/health', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    const result = await client.health();
    expect(result).toBe(true);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('http://127.0.0.1:8090/v1/health');
  });

  it('health returns false on error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await client.health();
    expect(result).toBe(false);
  });

  it('throws on non-OK responses', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('not found', { status: 404 }));
    await expect(client.discover()).rejects.toThrow('404');
  });

  it('includes API key header when configured', async () => {
    const authedClient = new AgnosClient(
      { runtimeUrl: 'http://127.0.0.1:8090', apiKey: 'secret-key' },
      logger
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    await authedClient.discover();
    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('secret-key');
  });

  it('vectorSearch sends POST with query', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ results: [{ id: 'v1', score: 0.95 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const results = await client.vectorSearch([0.1, 0.2], 5, 0.8);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('v1');
  });

  it('listSandboxProfiles normalizes AGNOS response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          profiles: [
            {
              preset: 'cli-tool',
              seccomp_mode: 'basic',
              landlock_rules_count: 2,
              max_memory_mb: 256,
              network_enabled: false,
              allow_process_spawn: true,
            },
            {
              preset: 'photis-nadi',
              seccomp_mode: 'desktop',
              landlock_rules_count: 3,
              max_memory_mb: 512,
              network_enabled: true,
              allow_process_spawn: false,
              allowed_hosts: ['*.supabase.co'],
              app_specific: true,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const profiles = await client.listSandboxProfiles();
    expect(profiles).toHaveLength(2);
    expect(profiles[0].id).toBe('cli-tool');
    expect(profiles[0].seccomp).toBe(true);
    expect(profiles[0].landlock).toBe(true);
    expect(profiles[0].networkEnabled).toBe(false);
    expect(profiles[0].allowProcessSpawn).toBe(true);
    expect(profiles[1].id).toBe('photis-nadi');
    expect(profiles[1].description).toBe('App-specific profile');
    expect(profiles[1].allowedHosts).toEqual(['*.supabase.co']);
  });
});
