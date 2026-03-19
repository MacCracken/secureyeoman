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
    const ok = () =>
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    vi.mocked(fetch).mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok());

    await client.heartbeat(['a1', 'a2']);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('http://127.0.0.1:8090/v1/agents/a1/heartbeat');
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe('http://127.0.0.1:8090/v1/agents/a2/heartbeat');
  });

  it('heartbeat handles per-agent failures gracefully', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
      )
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

  // ── Token Budget (gateway) ──────────────────────────────────

  it('tokenCheck sends POST to gateway /v1/tokens/check', async () => {
    const gwClient = new AgnosClient(
      { runtimeUrl: 'http://127.0.0.1:8090', gatewayUrl: 'http://127.0.0.1:8088' },
      logger
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ allowed: true, remaining: 500 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const result = await gwClient.tokenCheck('myproject', 100, 'default');
    expect(result.allowed).toBe(true);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('http://127.0.0.1:8088/v1/tokens/check');
  });

  it('tokenReserve sends POST to gateway /v1/tokens/reserve', async () => {
    const gwClient = new AgnosClient(
      { runtimeUrl: 'http://127.0.0.1:8090', gatewayUrl: 'http://127.0.0.1:8088' },
      logger
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ reserved: true, reservation_id: 'r1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const result = await gwClient.tokenReserve('myproject', 100, 'default');
    expect(result.reserved).toBe(true);
  });

  it('tokenPools returns array from gateway', async () => {
    const gwClient = new AgnosClient(
      { runtimeUrl: 'http://127.0.0.1:8090', gatewayUrl: 'http://127.0.0.1:8088' },
      logger
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ pools: [{ name: 'default', total: 1000, used: 200, remaining: 800 }] }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    );

    const pools = await gwClient.tokenPools();
    expect(pools).toHaveLength(1);
    expect(pools[0].name).toBe('default');
  });

  // ── RAG ────────────────────────────────────────────────────

  it('ragIngest sends POST to /v1/rag/ingest', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ingested: true, chunks: 3 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const result = await client.ragIngest('some text', { source: 'test' });
    expect(result.ingested).toBe(true);
    expect(result.chunks).toBe(3);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('http://127.0.0.1:8090/v1/rag/ingest');
  });

  it('ragQuery sends POST to /v1/rag/query', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ chunks: [{ text: 'hello', score: 0.9 }], total: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const result = await client.ragQuery('test query', 5);
    expect(result.chunks).toHaveLength(1);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.query).toBe('test query');
    expect(body.top_k).toBe(5);
  });

  // ── Phylax Scanning ────────────────────────────────────────

  it('scanBytes sends POST to /v1/scan/bytes', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ findings: [], scanned: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const result = await client.scanBytes('dGVzdA==', 'test-file');
    expect(result.scanned).toBe(true);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.data).toBe('dGVzdA==');
    expect(body.target_name).toBe('test-file');
  });

  // ── Remote Execution ───────────────────────────────────────

  it('execOnAgent sends POST to /v1/agents/:id/exec', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ exit_code: 0, stdout: 'ok', stderr: '' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const result = await client.execOnAgent('agent1', 'echo hello', 10);
    expect(result.exit_code).toBe(0);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('http://127.0.0.1:8090/v1/agents/agent1/exec');
  });

  it('writeFile sends PUT to /v1/agents/:id/files/*path', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    );

    await client.writeFile('agent1', '/tmp/test.txt', 'content');
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      'http://127.0.0.1:8090/v1/agents/agent1/files/tmp/test.txt'
    );
    expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe('PUT');
  });

  it('readFile sends GET to /v1/agents/:id/files/*path', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ content: 'hello' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const result = await client.readFile('agent1', '/tmp/test.txt');
    expect(result.content).toBe('hello');
  });

  // ── Audit ──────────────────────────────────────────────────

  it('forwardAuditRun sends POST to /v1/audit/runs', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const result = await client.forwardAuditRun({
      run_id: 'r1',
      success: true,
      tasks: [{ name: 'deploy', status: 'success' }],
    });
    expect(result.accepted).toBe(true);
  });

  it('verifyAuditChain sends GET to /v1/audit/chain/verify', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ valid: true, chain_length: 42 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const result = await client.verifyAuditChain();
    expect(result.valid).toBe(true);
    expect(result.chain_length).toBe(42);
  });

  // ── Attestation ────────────────────────────────────────────

  it('getAttestation sends GET to /v1/attestation', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          pcr_values: { '8': 'a', '9': 'b', '10': 'c' },
          signature: 'sig',
          algorithm: 'SHA256',
          timestamp: '2026-01-01T00:00:00Z',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const result = await client.getAttestation();
    expect(result.pcr_values['8']).toBe('a');
    expect(result.signature).toBe('sig');
  });

  // ── MCP Remote Tools ───────────────────────────────────────

  it('listRemoteTools returns tools array', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ tools: [{ name: 'tool1', description: 'desc1' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const tools = await client.listRemoteTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('tool1');
  });

  it('callRemoteTool sends POST to /v1/mcp/tools/call', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ result: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const result = await client.callRemoteTool('tool1', { arg: 'val' });
    expect((result as any).result).toBe('ok');
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.name).toBe('tool1');
    expect(body.arguments).toEqual({ arg: 'val' });
  });

  // ── Gateway API key ────────────────────────────────────────

  it('uses gatewayApiKey for gateway requests', async () => {
    const gwClient = new AgnosClient(
      {
        runtimeUrl: 'http://127.0.0.1:8090',
        gatewayUrl: 'http://127.0.0.1:8088',
        gatewayApiKey: 'gw-secret',
      },
      logger
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ allowed: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    await gwClient.tokenCheck('p', 10, 'default');
    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('gw-secret');
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
