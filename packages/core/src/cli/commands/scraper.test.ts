import { describe, it, expect, vi, afterEach } from 'vitest';
import { scraperCommand } from './scraper.js';

function createStreams() {
  let stdoutBuf = '';
  let stderrBuf = '';
  const stdout = {
    write: (s: string) => {
      stdoutBuf += s;
      return true;
    },
  } as NodeJS.WritableStream;
  const stderr = {
    write: (s: string) => {
      stderrBuf += s;
      return true;
    },
  } as NodeJS.WritableStream;
  return { stdout, stderr, getStdout: () => stdoutBuf, getStderr: () => stderrBuf };
}

describe('scraper command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should print help with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await scraperCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('config');
    expect(getStdout()).toContain('tools');
  });

  it('should show config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          exposeWeb: true,
          webSearchProvider: 'exa',
          webScrapeProvider: 'brightdata',
        }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await scraperCommand.run({ argv: ['config'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('exposeWeb');
  });

  it('should list tools', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          tools: [
            { name: 'web_search', description: 'Search the web', inputSchema: {} },
            { name: 'web_scrape', description: 'Scrape a URL', inputSchema: {} },
          ],
        }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await scraperCommand.run({ argv: ['tools'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('web_search');
  });

  it('should list servers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => [
          { id: 'mcp-1', name: 'filesystem', status: 'connected', enabled: true },
          { id: 'mcp-2', name: 'brave-search', status: 'disconnected', enabled: false },
        ],
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await scraperCommand.run({ argv: ['servers'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('filesystem');
  });

  it('should return 1 on error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      })
    );

    const { stdout, stderr } = createStreams();
    const code = await scraperCommand.run({ argv: ['config'], stdout, stderr });
    expect(code).toBe(1);
  });

  it('should output JSON with --json for config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ exposeWeb: true }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await scraperCommand.run({ argv: ['config', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as { exposeWeb: boolean };
    expect(parsed.exposeWeb).toBe(true);
  });

  it('should output JSON with --json for tools', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          tools: [{ name: 'web_search', description: 'Search', inputSchema: {} }],
        }),
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await scraperCommand.run({ argv: ['tools', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as { tools: Array<{ name: string }> };
    expect(parsed.tools[0]?.name).toBe('web_search');
  });

  it('should output JSON with --json for servers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => [{ id: 'mcp-1', name: 'filesystem', status: 'connected', enabled: true }],
      })
    );

    const { stdout, stderr, getStdout } = createStreams();
    const code = await scraperCommand.run({ argv: ['servers', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout()) as Array<{ id: string }>;
    expect(parsed[0]?.id).toBe('mcp-1');
  });

  it('should include --json in help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    await scraperCommand.run({ argv: ['--help'], stdout, stderr });
    expect(getStdout()).toContain('--json');
  });
});
