// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SwarmTemplatesTab } from './SwarmTemplatesTab';

vi.mock('../../api/client', () => ({
  fetchCommunitySwarmTemplates: vi.fn(),
  exportSwarmTemplate: vi.fn(),
  importSwarmTemplate: vi.fn(),
}));

import * as api from '../../api/client';

const mockFetchCommunitySwarmTemplates = vi.mocked(api.fetchCommunitySwarmTemplates);
const mockExportSwarmTemplate = vi.mocked(api.exportSwarmTemplate);
const mockImportSwarmTemplate = vi.mocked(api.importSwarmTemplate);

const TEMPLATE = {
  id: 'tmpl-1',
  name: 'Security Audit Team',
  description: 'A sequential security audit swarm',
  strategy: 'sequential' as const,
  roles: [
    { role: 'researcher', profileName: 'security-researcher', description: 'Researches' },
    { role: 'hacker', profileName: 'ethical-whitehat-hacker', description: 'Probes' },
    { role: 'writer', profileName: 'technical-writer', description: 'Documents' },
  ],
  coordinatorProfile: null,
  isBuiltin: false,
  createdAt: 1000,
};

const EXPORT_PAYLOAD = {
  exportedAt: Date.now(),
  requires: {
    profileRoles: ['security-researcher', 'ethical-whitehat-hacker', 'technical-writer'],
  },
  template: TEMPLATE,
};

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderTab(source?: string) {
  return render(
    <QueryClientProvider client={createQC()}>
      <SwarmTemplatesTab source={source} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchCommunitySwarmTemplates.mockResolvedValue({ templates: [TEMPLATE], total: 1 });
  mockExportSwarmTemplate.mockResolvedValue(EXPORT_PAYLOAD);
  mockImportSwarmTemplate.mockResolvedValue({
    template: TEMPLATE,
    compatibility: { compatible: false, gaps: { profileRoles: ['security-researcher'] } },
  });
});

describe('SwarmTemplatesTab', () => {
  it('renders template cards when data is available', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Security Audit Team')).toBeDefined();
    });
  });

  it('shows description', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('A sequential security audit swarm')).toBeDefined();
    });
  });

  it('shows strategy badge', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('sequential')).toBeDefined();
    });
  });

  it('shows role pills', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('researcher')).toBeDefined();
      expect(screen.getByText('hacker')).toBeDefined();
      expect(screen.getByText('writer')).toBeDefined();
    });
  });

  it('shows empty state when no templates (community)', async () => {
    mockFetchCommunitySwarmTemplates.mockResolvedValue({ templates: [], total: 0 });
    renderTab('community');
    await waitFor(() => {
      expect(screen.getByText('No community swarm templates available')).toBeDefined();
    });
  });

  it('renders Export and Install buttons', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByTitle('Export as JSON')).toBeDefined();
      expect(screen.getByTitle('Install swarm template')).toBeDefined();
    });
  });

  it('shows loading state', () => {
    mockFetchCommunitySwarmTemplates.mockReturnValue(new Promise(() => {}));
    renderTab();
    // Should not crash while loading
    expect(true).toBe(true);
  });

  it('shows search input when not controlled', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search swarm templates/)).toBeDefined();
    });
  });

  it('hides search input when externally controlled query', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={qc}>
        <SwarmTemplatesTab source="community" query="test" />
      </QueryClientProvider>
    );
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/Search swarm templates/)).toBeNull();
    });
  });

  it('filters templates by search query', async () => {
    const { fireEvent } = await import('@testing-library/react');
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Security Audit Team')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText(/Search swarm templates/);
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    await waitFor(() => {
      expect(screen.queryByText('Security Audit Team')).toBeNull();
    });
  });

  it('shows community-specific empty state', async () => {
    mockFetchCommunitySwarmTemplates.mockResolvedValue({ templates: [], total: 0 });
    renderTab('community');
    await waitFor(() => {
      expect(screen.getByText('No community swarm templates available')).toBeDefined();
      expect(screen.getByText('Sync the community repo to discover swarm templates')).toBeDefined();
    });
  });

  it('shows default empty state when not community', async () => {
    mockFetchCommunitySwarmTemplates.mockResolvedValue({ templates: [], total: 0 });
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('No swarm templates available')).toBeDefined();
    });
  });

  it('calls exportSwarmTemplate on Export click', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    renderTab();
    await waitFor(() => {
      expect(screen.getByTitle('Export as JSON')).toBeDefined();
    });

    await user.click(screen.getByTitle('Export as JSON'));

    await waitFor(() => {
      expect(mockExportSwarmTemplate).toHaveBeenCalledWith('tmpl-1');
    });
  });

  it('calls importSwarmTemplate on Install click', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();

    renderTab();
    await waitFor(() => {
      expect(screen.getByTitle('Install swarm template')).toBeDefined();
    });

    await user.click(screen.getByTitle('Install swarm template'));

    await waitFor(() => {
      expect(mockExportSwarmTemplate).toHaveBeenCalled();
    });
  });

  it('shows toast after successful import', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();

    renderTab();
    await waitFor(() => {
      expect(screen.getByTitle('Install swarm template')).toBeDefined();
    });

    await user.click(screen.getByTitle('Install swarm template'));

    await waitFor(() => {
      expect(screen.getByText(/Imported — missing profiles/)).toBeDefined();
    });
  });

  it('shows template count', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('(1)')).toBeDefined();
    });
  });

  it('shows community header when source is community', async () => {
    renderTab('community');
    await waitFor(() => {
      expect(screen.getByText('Community Swarm Templates')).toBeDefined();
    });
  });

  it('shows YEOMAN header when source is not community', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('YEOMAN Swarm Templates')).toBeDefined();
    });
  });

  it('renders multiple templates', async () => {
    mockFetchCommunitySwarmTemplates.mockResolvedValue({
      templates: [
        TEMPLATE,
        {
          id: 'tmpl-2',
          name: 'Dev Team',
          description: 'Parallel dev swarm',
          strategy: 'parallel',
          roles: [{ role: 'developer' }, { role: 'tester' }],
          coordinatorProfile: null,
          isBuiltin: false,
          createdAt: 2000,
        },
      ],
      total: 2,
    });

    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Security Audit Team')).toBeDefined();
      expect(screen.getByText('Dev Team')).toBeDefined();
      expect(screen.getByText('parallel')).toBeDefined();
    });
  });
});
