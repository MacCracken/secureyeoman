// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { McpManager } from './McpManager';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchMcpServers: vi.fn(),
    addMcpServer: vi.fn(),
    deleteMcpServer: vi.fn(),
    patchMcpServer: vi.fn(),
    fetchMcpTools: vi.fn(),
  };
});

import * as api from '../api/client';

const mockFetchMcpServers = vi.mocked(api.fetchMcpServers);
const mockFetchMcpTools = vi.mocked(api.fetchMcpTools);
const mockAddMcpServer = vi.mocked(api.addMcpServer);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <McpManager />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('McpManager', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchMcpServers.mockResolvedValue({ servers: [], total: 0 } as any);
    mockFetchMcpTools.mockResolvedValue({ tools: [] } as any);
  });

  it('renders header "MCP Servers"', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('MCP Servers')).toBeInTheDocument();
    });
  });

  it('shows empty state when no servers configured', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/No MCP servers configured/)).toBeInTheDocument();
    });
  });

  it('renders configured servers', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        { id: 's1', name: 'filesystem-server', transport: 'stdio', command: 'npx', enabled: true },
        {
          id: 's2',
          name: 'web-server',
          transport: 'sse',
          url: 'https://example.com',
          enabled: false,
        },
      ],
      total: 2,
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('filesystem-server')).toBeInTheDocument();
      expect(screen.getByText('web-server')).toBeInTheDocument();
    });
  });

  it('shows add server form when button clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Add Server')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Add Server'));
    expect(screen.getByText('Add MCP Server')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. filesystem-server')).toBeInTheDocument();
  });

  it('shows transport options in the form', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByText('Add Server'));
    const transportSelect = screen.getByDisplayValue('stdio');
    expect(transportSelect).toBeInTheDocument();
  });

  it('renders tool count in server cards', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [{ id: 's1', name: 'test-server', transport: 'stdio', enabled: true }],
      total: 1,
    } as any);
    mockFetchMcpTools.mockResolvedValue({
      tools: [
        { serverId: 's1', serverName: 'test-server', name: 'tool1', description: 'A tool' },
        { serverId: 's1', serverName: 'test-server', name: 'tool2', description: 'Another tool' },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getAllByText('2 tools').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows discovered tools section when tools exist', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [{ id: 's1', name: 'test-server', transport: 'stdio', enabled: true }],
      total: 1,
    } as any);
    mockFetchMcpTools.mockResolvedValue({
      tools: [
        {
          serverId: 's1',
          serverName: 'test-server',
          name: 'read_file',
          description: 'Read a file',
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Discovered Tools')).toBeInTheDocument();
    });
  });

  it('shows enabled/disabled status', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        { id: 's1', name: 'active-server', transport: 'stdio', enabled: true },
        { id: 's2', name: 'inactive-server', transport: 'sse', enabled: false },
      ],
      total: 2,
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeInTheDocument();
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  it('shows enabled/total count', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        { id: 's1', name: 'active', transport: 'stdio', enabled: true },
        { id: 's2', name: 'inactive', transport: 'sse', enabled: false },
      ],
      total: 2,
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('1 enabled / 2 configured')).toBeInTheDocument();
    });
  });

  it('shows cancel button in add form', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByText('Add Server'));
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('shows env variable controls in form', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByText('Add Server'));
    expect(screen.getByText('+ Add Variable')).toBeInTheDocument();
  });

  it('shows server transport type badge', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        { id: 's1', name: 'stdio-server', transport: 'stdio', command: 'npx @tool/mcp', enabled: true },
      ],
      total: 1,
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('stdio')).toBeInTheDocument();
    });
  });

  it('shows server command for stdio transport', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        { id: 's1', name: 'stdio-server', transport: 'stdio', command: 'npx @tool/mcp', enabled: true },
      ],
      total: 1,
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('npx @tool/mcp')).toBeInTheDocument();
    });
  });

  it('shows server URL for sse transport', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        { id: 's1', name: 'sse-server', transport: 'sse', url: 'https://mcp.example.com', enabled: true },
      ],
      total: 1,
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('sse')).toBeInTheDocument();
      expect(screen.getByText('https://mcp.example.com')).toBeInTheDocument();
    });
  });

  it('shows Remove button on server cards', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [{ id: 's1', name: 'test-server', transport: 'stdio', enabled: true }],
      total: 1,
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Remove')).toBeInTheDocument();
    });
  });

  it('shows toggle button with correct state', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        { id: 's1', name: 'active', transport: 'stdio', enabled: true },
      ],
      total: 1,
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTitle('Click to disable')).toBeInTheDocument();
    });
  });

  it('shows disabled toggle state', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        { id: 's1', name: 'inactive', transport: 'sse', enabled: false },
      ],
      total: 1,
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTitle('Click to enable')).toBeInTheDocument();
    });
  });

  it('expands discovered tools section', async () => {
    const user = userEvent.setup();
    mockFetchMcpServers.mockResolvedValue({
      servers: [{ id: 's1', name: 'test-server', transport: 'stdio', enabled: true }],
      total: 1,
    } as any);
    mockFetchMcpTools.mockResolvedValue({
      tools: [
        { serverId: 's1', serverName: 'test-server', name: 'read_file', description: 'Reads a file from disk' },
        { serverId: 's1', serverName: 'test-server', name: 'write_file', description: 'Writes a file' },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Discovered Tools')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Discovered Tools'));
    await waitFor(() => {
      expect(screen.getByText('read_file')).toBeInTheDocument();
      expect(screen.getByText('write_file')).toBeInTheDocument();
      expect(screen.getByText('Reads a file from disk')).toBeInTheDocument();
    });
  });

  it('shows Configured Servers header when servers exist', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [{ id: 's1', name: 'test', transport: 'stdio', enabled: true }],
      total: 1,
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Configured Servers')).toBeInTheDocument();
    });
  });

  it('shows server description when present', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        {
          id: 's1',
          name: 'db-server',
          transport: 'stdio',
          enabled: true,
          description: 'Database management tools',
        },
      ],
      total: 1,
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Database management tools')).toBeInTheDocument();
    });
  });

  it('shows tools grouped by server name in expanded view', async () => {
    const user = userEvent.setup();
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        { id: 's1', name: 'server-alpha', transport: 'stdio', enabled: true },
        { id: 's2', name: 'server-beta', transport: 'sse', enabled: true },
      ],
      total: 2,
    } as any);
    mockFetchMcpTools.mockResolvedValue({
      tools: [
        { serverId: 's1', serverName: 'server-alpha', name: 'alpha_tool', description: 'Alpha tool' },
        { serverId: 's2', serverName: 'server-beta', name: 'beta_tool', description: 'Beta tool' },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Discovered Tools')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Discovered Tools'));
    await waitFor(() => {
      expect(screen.getByText('alpha_tool')).toBeInTheDocument();
      expect(screen.getByText('beta_tool')).toBeInTheDocument();
      expect(screen.getByText('Alpha tool')).toBeInTheDocument();
      expect(screen.getByText('Beta tool')).toBeInTheDocument();
    });
  });
});
