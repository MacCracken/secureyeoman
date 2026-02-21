import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpStorage } from './storage.js';

// ─── Mock pg-pool ─────────────────────────────────────────────

let mockQuery: ReturnType<typeof vi.fn>;
let mockClientQuery: ReturnType<typeof vi.fn>;
let mockRelease: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({
    query: (...args: any[]) => mockQuery(...args),
    connect: () =>
      Promise.resolve({
        query: (...args: any[]) => mockClientQuery(...args),
        release: () => mockRelease(),
      }),
  }),
}));

// ─── Test Data ────────────────────────────────────────────────

const serverRow = {
  id: 'srv-1',
  name: 'my-server',
  description: 'A test server',
  transport: 'stdio',
  command: '/usr/bin/node',
  args: ['server.js'],
  url: null,
  env: { TOKEN: 'abc' },
  enabled: true,
  created_at: 1000,
  updated_at: 2000,
};

const healthRow = {
  server_id: 'srv-1',
  status: 'healthy',
  latency_ms: 45,
  consecutive_failures: 0,
  last_checked_at: 3000,
  last_success_at: 3000,
  last_error: null,
};

// ─── Tests ────────────────────────────────────────────────────

describe('McpStorage', () => {
  let storage: McpStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    mockClientQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    mockRelease = vi.fn();
    storage = new McpStorage();
  });

  describe('addServer', () => {
    it('inserts and returns constructed server object', async () => {
      const result = await storage.addServer({
        name: 'my-server',
        command: '/usr/bin/node',
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('my-server');
      expect(result.command).toBe('/usr/bin/node');
      expect(result.description).toBe('');
      expect(result.transport).toBe('stdio');
      expect(result.args).toEqual([]);
      expect(result.env).toEqual({});
      expect(result.enabled).toBe(true);
    });

    it('uses provided optional fields', async () => {
      const result = await storage.addServer({
        name: 'web-server',
        transport: 'sse',
        url: 'http://localhost:3000',
        description: 'Web server',
        args: ['--port', '3000'],
        env: { PORT: '3000' },
        enabled: false,
      });

      expect(result.transport).toBe('sse');
      expect(result.url).toBe('http://localhost:3000');
      expect(result.description).toBe('Web server');
      expect(result.args).toEqual(['--port', '3000']);
      expect(result.enabled).toBe(false);
    });

    it('passes correct params to INSERT', async () => {
      await storage.addServer({ name: 'test', command: 'cmd' });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('test');
      expect(params[4]).toBe('cmd');
      expect(params[8]).toBe(true); // enabled default
    });
  });

  describe('getServer', () => {
    it('returns server when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [serverRow], rowCount: 1 });
      const result = await storage.getServer('srv-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('srv-1');
      expect(result!.name).toBe('my-server');
      expect(result!.createdAt).toBe(1000);
      expect(result!.updatedAt).toBe(2000);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getServer('nonexistent');
      expect(result).toBeNull();
    });

    it('maps optional url and command fields', async () => {
      const row = { ...serverRow, url: 'http://example.com', command: undefined };
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });
      const result = await storage.getServer('srv-1');
      expect(result!.url).toBe('http://example.com');
    });
  });

  describe('findServerByName', () => {
    it('returns server when found by name', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [serverRow], rowCount: 1 });
      const result = await storage.findServerByName('my-server');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('my-server');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.findServerByName('unknown');
      expect(result).toBeNull();
    });

    it('queries by name', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.findServerByName('my-server');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('my-server');
    });
  });

  describe('listServers', () => {
    it('returns servers and total', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [serverRow], rowCount: 1 });

      const result = await storage.listServers();
      expect(result.total).toBe(2);
      expect(result.servers).toHaveLength(1);
      expect(result.servers[0].id).toBe('srv-1');
    });

    it('uses default limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.listServers();
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[0]).toBe(50);
      expect(params[1]).toBe(0);
    });

    it('uses custom limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.listServers({ limit: 10, offset: 5 });
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[0]).toBe(10);
      expect(params[1]).toBe(5);
    });

    it('handles null count gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // no count row
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await storage.listServers();
      expect(result.total).toBe(0);
    });
  });

  describe('updateServer', () => {
    it('returns false when no fields to update', async () => {
      const result = await storage.updateServer('srv-1', {});
      expect(result).toBe(false);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns true when enabled updated', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.updateServer('srv-1', { enabled: false });
      expect(result).toBe(true);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('enabled =');
      expect(sql).toContain('updated_at =');
    });

    it('returns false when row not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.updateServer('nonexistent', { enabled: true });
      expect(result).toBe(false);
    });
  });

  describe('deleteServer', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.deleteServer('srv-1');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.deleteServer('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('saveTools', () => {
    it('deletes then inserts tools in a transaction', async () => {
      await storage.saveTools('srv-1', 'my-server', [
        { name: 'tool-a', description: 'Tool A', inputSchema: { type: 'object' } },
        { name: 'tool-b' },
      ]);

      // BEGIN, DELETE, INSERT×2, COMMIT
      expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('BEGIN'));
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM mcp.server_tools'),
        ['srv-1']
      );
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO mcp.server_tools'),
        expect.arrayContaining(['srv-1', 'tool-a'])
      );
      expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('COMMIT'));
      expect(mockRelease).toHaveBeenCalled();
    });

    it('handles empty tools list', async () => {
      await storage.saveTools('srv-1', 'my-server', []);

      expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM mcp.server_tools'), ['srv-1']);
      // Only BEGIN, DELETE, COMMIT - no inserts
      const calls = mockClientQuery.mock.calls.map((c) => c[0]);
      const insertCalls = calls.filter((sql: string) => sql.includes('INSERT INTO mcp.server_tools'));
      expect(insertCalls).toHaveLength(0);
    });
  });

  describe('loadTools', () => {
    it('returns empty array when server not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // getServer returns null
      const result = await storage.loadTools('nonexistent');
      expect(result).toEqual([]);
    });

    it('returns mapped tools when server exists', async () => {
      const toolRow = {
        name: 'do-thing',
        description: 'Does the thing',
        input_schema: { type: 'object', properties: {} },
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [serverRow], rowCount: 1 }) // getServer
        .mockResolvedValueOnce({ rows: [toolRow], rowCount: 1 }); // queryMany tools

      const result = await storage.loadTools('srv-1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('do-thing');
      expect(result[0].description).toBe('Does the thing');
      expect(result[0].serverId).toBe('srv-1');
      expect(result[0].serverName).toBe('my-server');
    });
  });

  describe('deleteTools', () => {
    it('executes DELETE for server tools', async () => {
      await storage.deleteTools('srv-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE FROM mcp.server_tools');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('srv-1');
    });
  });

  describe('getConfig', () => {
    it('returns defaults when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getConfig();
      expect(result.exposeGit).toBe(false);
      expect(result.exposeFilesystem).toBe(false);
      expect(result.exposeWebScraping).toBe(true);
      expect(result.webRateLimitPerMinute).toBe(10);
      expect(result.proxyStrategy).toBe('round-robin');
    });

    it('merges values from config rows', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { key: 'exposeGit', value: 'true' },
          { key: 'webRateLimitPerMinute', value: '30' },
        ],
        rowCount: 2,
      });
      const result = await storage.getConfig();
      expect(result.exposeGit).toBe(true);
      expect(result.webRateLimitPerMinute).toBe(30);
      // Defaults intact for unset keys
      expect(result.exposeFilesystem).toBe(false);
    });

    it('ignores unknown config keys', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ key: 'unknownKey', value: '"value"' }],
        rowCount: 1,
      });
      const result = await storage.getConfig();
      // Should not throw; defaults returned
      expect(result.exposeGit).toBe(false);
    });
  });

  describe('setConfig', () => {
    it('upserts config keys in a transaction then returns updated config', async () => {
      // setConfig uses withTransaction then calls getConfig
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // getConfig after transaction

      await storage.setConfig({ exposeGit: true, webRateLimitPerMinute: 20 });

      // Transaction: BEGIN, INSERT×2, COMMIT
      expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('BEGIN'));
      const insertCalls = mockClientQuery.mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO mcp.config')
      );
      expect(insertCalls).toHaveLength(2);
      expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('COMMIT'));
    });

    it('skips undefined values', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.setConfig({ exposeGit: undefined });

      const insertCalls = mockClientQuery.mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO mcp.config')
      );
      expect(insertCalls).toHaveLength(0);
    });
  });

  describe('saveHealth', () => {
    it('upserts health record', async () => {
      await storage.saveHealth({
        serverId: 'srv-1',
        status: 'healthy',
        latencyMs: 50,
        consecutiveFailures: 0,
        lastCheckedAt: 3000,
        lastSuccessAt: 3000,
        lastError: null,
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO mcp.server_health');
      expect(sql).toContain('ON CONFLICT');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('srv-1');
      expect(params[1]).toBe('healthy');
      expect(params[2]).toBe(50);
    });
  });

  describe('getHealth', () => {
    it('returns health when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [healthRow], rowCount: 1 });
      const result = await storage.getHealth('srv-1');
      expect(result).not.toBeNull();
      expect(result!.serverId).toBe('srv-1');
      expect(result!.status).toBe('healthy');
      expect(result!.latencyMs).toBe(45);
      expect(result!.consecutiveFailures).toBe(0);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getHealth('nonexistent');
      expect(result).toBeNull();
    });

    it('maps null lastError', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [healthRow], rowCount: 1 });
      const result = await storage.getHealth('srv-1');
      expect(result!.lastError).toBeNull();
    });
  });

  describe('getAllHealth', () => {
    it('returns all health records', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [healthRow], rowCount: 1 });
      const result = await storage.getAllHealth();
      expect(result).toHaveLength(1);
      expect(result[0].serverId).toBe('srv-1');
    });

    it('returns empty array when none', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getAllHealth();
      expect(result).toEqual([]);
    });
  });

  describe('saveCredential', () => {
    it('upserts credential', async () => {
      await storage.saveCredential('srv-1', 'API_KEY', 'encrypted-value');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO mcp.server_credentials');
      expect(sql).toContain('ON CONFLICT');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('srv-1');
      expect(params[1]).toBe('API_KEY');
      expect(params[2]).toBe('encrypted-value');
    });
  });

  describe('getCredential', () => {
    it('returns encrypted value when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ encrypted_value: 'secret' }], rowCount: 1 });
      const result = await storage.getCredential('srv-1', 'API_KEY');
      expect(result).toBe('secret');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getCredential('srv-1', 'missing');
      expect(result).toBeNull();
    });
  });

  describe('listCredentialKeys', () => {
    it('returns sorted keys', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ key: 'API_KEY' }, { key: 'SECRET' }],
        rowCount: 2,
      });
      const result = await storage.listCredentialKeys('srv-1');
      expect(result).toEqual(['API_KEY', 'SECRET']);
    });

    it('returns empty array when none', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.listCredentialKeys('srv-1');
      expect(result).toEqual([]);
    });
  });

  describe('deleteCredential', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.deleteCredential('srv-1', 'API_KEY');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.deleteCredential('srv-1', 'missing');
      expect(result).toBe(false);
    });

    it('passes both serverId and key', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.deleteCredential('srv-1', 'MY_KEY');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('srv-1');
      expect(params[1]).toBe('MY_KEY');
    });
  });
});
