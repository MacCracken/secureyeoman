import { describe, it, expect, vi, afterEach } from 'vitest';
import { bootstrapAgnos } from './agnos-bootstrap.js';
import type { AgnosClient } from './agnos-client.js';

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

function makeClient(overrides?: Partial<AgnosClient>): AgnosClient {
  return {
    discover: vi.fn().mockResolvedValue({
      name: 'AGNOS',
      version: '1.0.0',
      capabilities: ['agents', 'llm-gateway', 'sandbox'],
      endpoints: { agents: '/v1/agents', events: '/v1/events' },
    }),
    listSandboxProfiles: vi.fn().mockResolvedValue([
      { id: 'default', name: 'Default Sandbox', seccomp: true, landlock: true },
      { id: 'permissive', name: 'Permissive', seccomp: false, landlock: false },
    ]),
    registerMcpTools: vi.fn().mockResolvedValue({ registered: 5 }),
    ...overrides,
  } as unknown as AgnosClient;
}

describe('bootstrapAgnos', () => {
  const origEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('discovers AGNOS capabilities', async () => {
    const result = await bootstrapAgnos(makeClient(), logger);
    expect(result.discovered).toBe(true);
    expect(result.capabilities).toContain('agents');
    expect(result.endpoints.agents).toBe('/v1/agents');
  });

  it('loads sandbox profiles', async () => {
    const result = await bootstrapAgnos(makeClient(), logger);
    expect(result.sandboxProfiles).toHaveLength(2);
    expect(result.sandboxProfiles[0].id).toBe('default');
  });

  it('registers MCP tools', async () => {
    const tools = [
      { name: 'web_search', description: 'Search the web' },
      { name: 'knowledge_query', description: 'Query knowledge base' },
    ];
    const result = await bootstrapAgnos(makeClient(), logger, tools);
    expect(result.mcpToolsRegistered).toBe(5);
  });

  it('returns partial results when AGNOS is unreachable', async () => {
    const client = makeClient({
      discover: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });
    const result = await bootstrapAgnos(client, logger);
    expect(result.discovered).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
    expect(result.sandboxProfiles).toHaveLength(0);
  });

  it('auto-sets MCP_EXPOSE_AGNOS_TOOLS env var', async () => {
    delete process.env.MCP_EXPOSE_AGNOS_TOOLS;
    await bootstrapAgnos(makeClient(), logger);
    expect(process.env.MCP_EXPOSE_AGNOS_TOOLS).toBe('true');
  });

  it('does not override existing MCP_EXPOSE_AGNOS_TOOLS', async () => {
    process.env.MCP_EXPOSE_AGNOS_TOOLS = 'false';
    await bootstrapAgnos(makeClient(), logger);
    expect(process.env.MCP_EXPOSE_AGNOS_TOOLS).toBe('false');
  });

  it('handles sandbox profile failure gracefully', async () => {
    const client = makeClient({
      listSandboxProfiles: vi.fn().mockRejectedValue(new Error('not found')),
    });
    const result = await bootstrapAgnos(client, logger);
    expect(result.discovered).toBe(true);
    expect(result.sandboxProfiles).toHaveLength(0);
  });

  it('handles MCP tool registration failure gracefully', async () => {
    const client = makeClient({
      registerMcpTools: vi.fn().mockRejectedValue(new Error('rejected')),
    });
    const result = await bootstrapAgnos(client, logger, [{ name: 'test', description: 'test' }]);
    expect(result.discovered).toBe(true);
    expect(result.mcpToolsRegistered).toBe(0);
  });

  it('skips MCP registration when no tools provided', async () => {
    const client = makeClient();
    await bootstrapAgnos(client, logger);
    expect(client.registerMcpTools).not.toHaveBeenCalled();
  });
});
