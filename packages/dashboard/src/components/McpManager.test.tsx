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
        { id: 's2', name: 'web-server', transport: 'sse', url: 'https://example.com', enabled: false },
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
        { serverId: 's1', serverName: 'test-server', name: 'read_file', description: 'Read a file' },
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
});
