// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CommunityTab } from './CommunityTab';

vi.mock('../../api/client', () => ({
  fetchMarketplaceSkills: vi.fn(),
  syncCommunitySkills: vi.fn(),
  fetchCommunityStatus: vi.fn(),
  installMarketplaceSkill: vi.fn(),
  uninstallMarketplaceSkill: vi.fn(),
  fetchPersonalities: vi.fn(),
  fetchWorkflows: vi.fn(),
  fetchSwarmTemplates: vi.fn(),
  getAccessToken: vi.fn().mockReturnValue(null),
}));

import * as api from '../../api/client';

const mockFetchMarketplace = vi.mocked(api.fetchMarketplaceSkills);
const mockFetchCommunityStatus = vi.mocked(api.fetchCommunityStatus);
const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent(props = {}) {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CommunityTab {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('CommunityTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (api.getAccessToken as any).mockReturnValue(null);
    mockFetchMarketplace.mockResolvedValue({ skills: [], total: 0 } as any);
    mockFetchCommunityStatus.mockResolvedValue({
      communityRepoPath: '/path/to/community',
      lastSyncedAt: null,
    } as any);
    mockFetchPersonalities.mockResolvedValue({
      personalities: [{ id: 'p1', name: 'Default', isDefault: true, isActive: true }],
    } as any);
  });

  it('renders search input for community skills', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search community skills/)).toBeInTheDocument();
    });
  });

  it('renders Sync button', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Sync')).toBeInTheDocument();
    });
  });

  it('shows repo path', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('/path/to/community')).toBeInTheDocument();
    });
  });

  it('shows empty state when no community skills', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('No community skills found')).toBeInTheDocument();
    });
  });

  it('shows personality warning when no personality selected', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [{ id: 'p1', name: 'Default', isDefault: true, isActive: false }],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(
        screen.getByText(/community skills must be installed per-personality/)
      ).toBeInTheDocument();
    });
  });

  it('renders community skills when present', async () => {
    mockFetchMarketplace.mockResolvedValue({
      skills: [
        {
          id: 'cs1',
          name: 'Git Helper',
          description: 'Helps with git',
          version: '1.0.0',
          author: 'community',
          category: 'development',
          tags: [],
          downloadCount: 10,
          source: 'community',
          installed: false,
          installedGlobally: false,
          instructions: '',
          triggerPatterns: [],
          tools: [],
          mcpToolsAllowed: [],
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Community Skills')).toBeInTheDocument();
    });
  });

  it('renders content type selector when workflows enabled', async () => {
    renderComponent({ workflowsEnabled: true });
    await waitFor(() => {
      expect(screen.getAllByText('Skills').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Workflows')).toBeInTheDocument();
    });
  });

  it('shows "No path configured" when communityRepoPath is null', async () => {
    mockFetchCommunityStatus.mockResolvedValue({
      communityRepoPath: null,
      lastSyncedAt: null,
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('No path configured')).toBeInTheDocument();
    });
  });

  it('calls syncCommunitySkills when Sync button clicked', async () => {
    const user = userEvent.setup();
    const mockSync = vi.mocked(api.syncCommunitySkills);
    mockSync.mockResolvedValue({
      added: 2,
      updated: 1,
      skipped: 0,
      removed: 0,
      errors: [],
    } as any);

    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Sync')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Sync'));
    await waitFor(() => {
      expect(mockSync).toHaveBeenCalled();
    });
  });

  it('shows sync results after successful sync', async () => {
    const user = userEvent.setup();
    const mockSync = vi.mocked(api.syncCommunitySkills);
    mockSync.mockResolvedValue({
      added: 3,
      updated: 1,
      skipped: 0,
      removed: 0,
      errors: [],
    } as any);

    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Sync')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Sync'));
    await waitFor(() => {
      expect(screen.getByText(/3 added/)).toBeInTheDocument();
    });
  });

  it('renders skill cards with install button', async () => {
    mockFetchMarketplace.mockResolvedValue({
      skills: [
        {
          id: 'cs1',
          name: 'Git Helper',
          description: 'Helps with git',
          version: '1.0.0',
          author: 'community',
          category: 'development',
          tags: ['git'],
          downloadCount: 10,
          source: 'community',
          installed: false,
          installedGlobally: false,
          instructions: '',
          triggerPatterns: [],
          tools: [],
          mcpToolsAllowed: [],
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    } as any);

    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Git Helper')).toBeInTheDocument();
    });
  });

  it('renders content type selector with swarms when enabled', async () => {
    renderComponent({ subAgentsEnabled: true });
    await waitFor(() => {
      expect(screen.getByText('Swarm Templates')).toBeInTheDocument();
    });
  });

  it('shows lastSyncedAt when available', async () => {
    mockFetchCommunityStatus.mockResolvedValue({
      communityRepoPath: '/path/to/community',
      lastSyncedAt: new Date('2026-01-15T10:00:00Z').toISOString(),
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/Last synced/)).toBeInTheDocument();
    });
  });

  it('handles search input change', async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search community skills/)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search community skills/);
    await user.type(searchInput, 'git');

    await waitFor(() => {
      expect(mockFetchMarketplace).toHaveBeenCalledWith(
        'git',
        'community',
        expect.anything(),
        undefined,
        expect.anything(),
        expect.anything(),
        undefined,
      );
    });
  });

  it('shows loading state', () => {
    mockFetchMarketplace.mockReturnValue(new Promise(() => {}));
    renderComponent();
    // Should not crash while loading
    expect(screen.getByPlaceholderText(/Search community skills/)).toBeInTheDocument();
  });
});
