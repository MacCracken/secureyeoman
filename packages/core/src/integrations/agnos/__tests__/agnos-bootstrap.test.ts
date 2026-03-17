import { describe, it, expect, vi } from 'vitest';
import { bootstrapAgnos, type McpToolDefinition } from '../agnos-bootstrap.js';
import type { AgnosClient } from '../agnos-client.js';
import type { SecureLogger } from '../../../logging/logger.js';

function mockLogger(): SecureLogger {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as SecureLogger;
}

function mockClient(overrides: Partial<AgnosClient> = {}): AgnosClient {
  return {
    discover: vi.fn().mockResolvedValue({
      service: 'AGNOS',
      version: '2026.3.15',
      capabilities: ['agents', 'audit', 'mcp'],
      endpoints: { agents: '/v1/agents', health: '/v1/health' },
    }),
    listSandboxProfiles: vi.fn().mockResolvedValue([
      { id: 'default', name: 'default', seccomp: true, landlock: true },
    ]),
    registerMcpTools: vi.fn().mockResolvedValue({ registered: 5 }),
    registerMcpToolsByProfile: vi.fn().mockResolvedValue({ registered: 5 }),
    ...overrides,
  } as unknown as AgnosClient;
}

describe('bootstrapAgnos', () => {
  it('discovers AGNOS and returns capabilities', async () => {
    const client = mockClient();
    const logger = mockLogger();

    const result = await bootstrapAgnos(client, logger);

    expect(result.discovered).toBe(true);
    expect(result.capabilities).toContain('agents');
    expect(result.endpoints).toHaveProperty('health');
  });

  it('loads sandbox profiles', async () => {
    const client = mockClient();
    const logger = mockLogger();

    const result = await bootstrapAgnos(client, logger);

    expect(result.sandboxProfiles.length).toBe(1);
    expect(result.sandboxProfiles[0].name).toBe('default');
  });

  it('registers MCP tools with profile', async () => {
    const tools: McpToolDefinition[] = [
      { name: 'edge_list', description: 'List edge nodes' },
      { name: 'docker_ps', description: 'List containers' },
    ];
    const client = mockClient();
    const logger = mockLogger();

    const result = await bootstrapAgnos(client, logger, tools, 'sensor');

    expect(result.mcpToolsRegistered).toBe(5);
    expect(result.bridgeProfile).toBe('sensor');
    expect(client.registerMcpToolsByProfile).toHaveBeenCalledWith(tools, 'sensor');
  });

  it('falls back to unfiltered registration on profile error', async () => {
    const tools: McpToolDefinition[] = [
      { name: 'edge_list', description: 'List edge nodes' },
    ];
    const client = mockClient({
      registerMcpToolsByProfile: vi.fn().mockRejectedValue(new Error('405')),
    });
    const logger = mockLogger();

    const result = await bootstrapAgnos(client, logger, tools, 'sensor');

    expect(result.mcpToolsRegistered).toBe(5);
    expect(client.registerMcpTools).toHaveBeenCalled();
  });

  it('handles AGNOS unreachable gracefully', async () => {
    const client = mockClient({
      discover: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });
    const logger = mockLogger();

    const result = await bootstrapAgnos(client, logger);

    expect(result.discovered).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('defaults bridgeProfile to full when not specified', async () => {
    const client = mockClient();
    const logger = mockLogger();

    const result = await bootstrapAgnos(client, logger);

    expect(result.bridgeProfile).toBe('full');
  });
});
