import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted Mocks ────────────────────────────────────────────

const { mockRunMcpServer } = vi.hoisted(() => ({
  mockRunMcpServer: vi.fn().mockResolvedValue(0),
}));

vi.mock('@secureyeoman/mcp/cli', () => ({
  runMcpServer: mockRunMcpServer,
}));

// ─── Tests ────────────────────────────────────────────────────

import { mcpServerCommand } from './mcp-server.js';

function makeCtx(argv: string[] = []) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    argv,
    stdout: { write: (s: string) => out.push(s) },
    stderr: { write: (s: string) => err.push(s) },
    out,
    err,
  };
}

describe('mcpServerCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunMcpServer.mockResolvedValue(0);
  });

  it('has correct name and description', () => {
    expect(mcpServerCommand.name).toBe('mcp-server');
    expect(mcpServerCommand.description).toContain('MCP');
  });

  it('has correct usage string', () => {
    expect(mcpServerCommand.usage).toContain('mcp-server');
  });

  describe('when @secureyeoman/mcp is available', () => {
    it('calls runMcpServer with ctx.argv', async () => {
      const ctx = makeCtx(['--transport', 'stdio']);
      await mcpServerCommand.run(ctx as any);
      expect(mockRunMcpServer).toHaveBeenCalledWith(['--transport', 'stdio']);
    });

    it('returns 0 on success', async () => {
      const ctx = makeCtx([]);
      const code = await mcpServerCommand.run(ctx as any);
      expect(code).toBe(0);
    });

    it('returns non-zero exit code from runMcpServer', async () => {
      mockRunMcpServer.mockResolvedValue(2);
      const ctx = makeCtx([]);
      const code = await mcpServerCommand.run(ctx as any);
      expect(code).toBe(2);
    });

    it('forwards port flag to runMcpServer', async () => {
      const ctx = makeCtx(['--port', '8080']);
      await mcpServerCommand.run(ctx as any);
      expect(mockRunMcpServer).toHaveBeenCalledWith(['--port', '8080']);
    });
  });
});
