import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ForgePanel } from './ForgePanel';
import * as client from '../api/client';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    fetchForgeConnections: vi.fn(),
    addForgeConnection: vi.fn(),
    removeForgeConnection: vi.fn(),
    fetchForgeRepos: vi.fn(),
    fetchForgePulls: vi.fn(),
    fetchForgePipelines: vi.fn(),
  };
});

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('ForgePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows no connections message when empty', async () => {
    vi.mocked(client.fetchForgeConnections).mockResolvedValue([]);
    render(<ForgePanel />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('No forge connections configured')).toBeInTheDocument();
    });
  });

  it('renders connection cards', async () => {
    vi.mocked(client.fetchForgeConnections).mockResolvedValue([
      { key: 'delta:localhost:8070', provider: 'delta', baseUrl: 'http://localhost:8070' },
      { key: 'github:github.com', provider: 'github', baseUrl: 'https://github.com' },
    ]);
    render(<ForgePanel />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Delta')).toBeInTheDocument();
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
  });

  it('shows add form when clicking + Add Forge', async () => {
    vi.mocked(client.fetchForgeConnections).mockResolvedValue([]);
    const user = userEvent.setup();
    render(<ForgePanel />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('+ Add Forge')).toBeInTheDocument();
    });

    await user.click(screen.getByText('+ Add Forge'));
    expect(screen.getByPlaceholderText(/Base URL/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Token/)).toBeInTheDocument();
  });

  it('loads repos when a connection is clicked', async () => {
    vi.mocked(client.fetchForgeConnections).mockResolvedValue([
      { key: 'delta:localhost:8070', provider: 'delta', baseUrl: 'http://localhost:8070' },
    ]);
    vi.mocked(client.fetchForgeRepos).mockResolvedValue([
      {
        id: 'r1',
        owner: 'user',
        name: 'repo',
        fullName: 'user/repo',
        description: 'Test repo',
        visibility: 'public',
        defaultBranch: 'main',
        url: 'http://localhost:8070/user/repo',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]);
    const user = userEvent.setup();
    render(<ForgePanel />, { wrapper });

    await waitFor(() => expect(screen.getByText('Delta')).toBeInTheDocument());
    await user.click(screen.getByText('Delta'));

    await waitFor(() => {
      expect(screen.getByText('user/repo')).toBeInTheDocument();
      expect(screen.getByText('public')).toBeInTheDocument();
    });
  });

  it('loads PRs when a repo is clicked', async () => {
    vi.mocked(client.fetchForgeConnections).mockResolvedValue([
      { key: 'delta:localhost:8070', provider: 'delta', baseUrl: 'http://localhost:8070' },
    ]);
    vi.mocked(client.fetchForgeRepos).mockResolvedValue([
      {
        id: 'r1',
        owner: 'user',
        name: 'repo',
        fullName: 'user/repo',
        description: null,
        visibility: 'private',
        defaultBranch: 'main',
        url: '',
        createdAt: '',
        updatedAt: '',
      },
    ]);
    vi.mocked(client.fetchForgePulls).mockResolvedValue([
      {
        id: 'p1',
        number: 42,
        title: 'Fix critical bug',
        body: null,
        state: 'open',
        sourceBranch: 'fix/bug',
        targetBranch: 'main',
        author: 'dev',
        url: '',
        createdAt: '',
      },
    ]);
    const user = userEvent.setup();
    render(<ForgePanel />, { wrapper });

    await waitFor(() => expect(screen.getByText('Delta')).toBeInTheDocument());
    await user.click(screen.getByText('Delta'));
    await waitFor(() => expect(screen.getByText('user/repo')).toBeInTheDocument());
    await user.click(screen.getByText('user/repo'));

    await waitFor(() => {
      expect(screen.getByText('#42 Fix critical bug')).toBeInTheDocument();
      expect(screen.getByText(/fix\/bug → main/)).toBeInTheDocument();
    });
  });

  it('shows pipeline tab when clicked', async () => {
    vi.mocked(client.fetchForgeConnections).mockResolvedValue([
      { key: 'delta:localhost:8070', provider: 'delta', baseUrl: 'http://localhost:8070' },
    ]);
    vi.mocked(client.fetchForgeRepos).mockResolvedValue([
      {
        id: 'r1',
        owner: 'user',
        name: 'repo',
        fullName: 'user/repo',
        description: null,
        visibility: 'public',
        defaultBranch: 'main',
        url: '',
        createdAt: '',
        updatedAt: '',
      },
    ]);
    vi.mocked(client.fetchForgePulls).mockResolvedValue([]);
    vi.mocked(client.fetchForgePipelines).mockResolvedValue([
      {
        id: 'pl1',
        name: 'CI',
        status: 'passed',
        ref: 'main',
        sha: 'abc123def456',
        url: null,
        createdAt: '',
      },
    ]);
    const user = userEvent.setup();
    render(<ForgePanel />, { wrapper });

    await waitFor(() => expect(screen.getByText('Delta')).toBeInTheDocument());
    await user.click(screen.getByText('Delta'));
    await waitFor(() => expect(screen.getByText('user/repo')).toBeInTheDocument());
    await user.click(screen.getByText('user/repo'));
    await waitFor(() => expect(screen.getByText('Pipelines')).toBeInTheDocument());
    await user.click(screen.getByText('Pipelines'));

    await waitFor(() => {
      expect(screen.getByText('CI')).toBeInTheDocument();
      expect(screen.getByText(/abc123d/)).toBeInTheDocument();
    });
  });

  it('calls addForgeConnection on form submit', async () => {
    vi.mocked(client.fetchForgeConnections).mockResolvedValue([]);
    vi.mocked(client.addForgeConnection).mockResolvedValue({
      key: 'github:github.com',
      provider: 'github',
      baseUrl: 'https://github.com',
    });
    const user = userEvent.setup();
    render(<ForgePanel />, { wrapper });

    await waitFor(() => expect(screen.getByText('+ Add Forge')).toBeInTheDocument());
    await user.click(screen.getByText('+ Add Forge'));
    await user.type(screen.getByPlaceholderText(/Base URL/), 'https://github.com');
    await user.click(screen.getByText('Add Connection'));

    await waitFor(() => {
      expect(client.addForgeConnection).toHaveBeenCalledWith({
        provider: 'github',
        baseUrl: 'https://github.com',
        token: undefined,
      });
    });
  });
});
