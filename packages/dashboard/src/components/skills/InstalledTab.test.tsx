// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InstalledTab } from './InstalledTab';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../../api/client', () => ({
  fetchSkills: vi.fn(),
  fetchPersonalities: vi.fn(),
  fetchWorkflows: vi.fn(),
  fetchSwarmTemplates: vi.fn(),
  fetchMarketplaceSkills: vi.fn(),
  uninstallMarketplaceSkill: vi.fn(),
  enableSkill: vi.fn(),
  disableSkill: vi.fn(),
  deleteSkill: vi.fn(),
}));

import * as api from '../../api/client';

const mockSkills = [
  {
    id: 's1',
    name: 'Code Review',
    description: 'Review code changes',
    source: 'ai_learned',
    personalityId: 'p1',
    personalityName: 'Dev Agent',
  },
  {
    id: 's2',
    name: 'Security Scan',
    description: 'Scan for vulnerabilities',
    source: 'marketplace',
    personalityId: null,
  },
  {
    id: 's3',
    name: 'My Skill',
    description: 'A user skill',
    source: 'user',
    personalityId: 'p1',
  },
];

const mockPersonalities = [
  { id: 'p1', name: 'Dev Agent', isActive: true },
  { id: 'p2', name: 'Security Bot', isActive: false },
];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('InstalledTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchSkills).mockResolvedValue({ skills: mockSkills } as never);
    vi.mocked(api.fetchPersonalities).mockResolvedValue({
      personalities: mockPersonalities,
    } as never);
    vi.mocked(api.fetchWorkflows).mockResolvedValue({ definitions: [] } as never);
    vi.mocked(api.fetchSwarmTemplates).mockResolvedValue({ templates: [] } as never);
    vi.mocked(api.fetchMarketplaceSkills).mockResolvedValue({ skills: [], total: 0 } as never);
  });

  it('should render skills grouped by source', async () => {
    renderWithProviders(<InstalledTab />);

    await waitFor(() => {
      expect(screen.getByText('Code Review')).toBeInTheDocument();
    });

    expect(screen.getByText('Security Scan')).toBeInTheDocument();
    expect(screen.getByText('My Skill')).toBeInTheDocument();
  });

  it('should show source section labels', async () => {
    renderWithProviders(<InstalledTab />);

    await waitFor(() => {
      // Source labels appear on skill cards
      expect(screen.getAllByText(/AI Learned|AI Proposed|Marketplace|User/).length).toBeGreaterThan(
        0
      );
    });
  });

  it('should show skill count', async () => {
    renderWithProviders(<InstalledTab />);

    await waitFor(() => {
      expect(screen.getByText(/3 of 3 skills/)).toBeInTheDocument();
    });
  });

  it('should show empty state when no skills', async () => {
    vi.mocked(api.fetchSkills).mockResolvedValue({ skills: [] } as never);

    renderWithProviders(<InstalledTab />);

    await waitFor(() => {
      expect(screen.getByText(/No skills installed yet/)).toBeInTheDocument();
    });
  });

  it('should filter skills by personality', async () => {
    renderWithProviders(<InstalledTab />);

    await waitFor(() => {
      expect(screen.getByText('Code Review')).toBeInTheDocument();
    });

    // Select a personality filter
    const select = screen.getByDisplayValue('All Personalities');
    fireEvent.change(select, { target: { value: 'p1' } });

    await waitFor(() => {
      expect(screen.getByText(/2 of 3 skills/)).toBeInTheDocument();
    });
  });

  it('should show personality options in filter dropdown', async () => {
    renderWithProviders(<InstalledTab />);

    await waitFor(() => {
      expect(screen.getByText('Dev Agent (Active)')).toBeInTheDocument();
    });
    expect(screen.getByText('Security Bot')).toBeInTheDocument();
  });

  it('should show no results message when filter matches nothing', async () => {
    vi.mocked(api.fetchSkills).mockResolvedValue({
      skills: [{ ...mockSkills[0], personalityId: 'p1' }],
    } as never);

    renderWithProviders(<InstalledTab />);

    await waitFor(() => {
      expect(screen.getByText('Code Review')).toBeInTheDocument();
    });

    const select = screen.getByDisplayValue('All Personalities');
    fireEvent.change(select, { target: { value: 'p2' } });

    await waitFor(() => {
      expect(screen.getByText(/No skills for the selected filter/)).toBeInTheDocument();
    });
  });

  it('should show content type selector when workflows enabled', async () => {
    renderWithProviders(<InstalledTab workflowsEnabled />);

    await waitFor(() => {
      expect(screen.getByText('Code Review')).toBeInTheDocument();
    });

    // Should have content type buttons
    expect(screen.getByRole('button', { name: 'Skills' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Workflows' })).toBeInTheDocument();
  });

  it('should switch to workflows view', async () => {
    vi.mocked(api.fetchWorkflows).mockResolvedValue({
      definitions: [
        {
          id: 'w1',
          name: 'Deploy Flow',
          description: 'Auto deploy',
          steps: [{ id: 's1' }],
          createdBy: 'user',
        },
      ],
    } as never);

    renderWithProviders(<InstalledTab workflowsEnabled />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Skills' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Workflows' }));

    await waitFor(() => {
      expect(screen.getByText('Deploy Flow')).toBeInTheDocument();
    });
  });

  it('should show empty workflows state', async () => {
    renderWithProviders(<InstalledTab workflowsEnabled />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Skills' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Workflows' }));

    await waitFor(() => {
      expect(screen.getByText(/No workflows installed yet/)).toBeInTheDocument();
    });
  });

  it('should switch to swarms view', async () => {
    renderWithProviders(<InstalledTab subAgentsEnabled />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Skills' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Swarm Templates' }));

    await waitFor(() => {
      expect(screen.getByText(/No swarm templates installed yet/)).toBeInTheDocument();
    });
  });

  it('should show swarm templates when available', async () => {
    vi.mocked(api.fetchSwarmTemplates).mockResolvedValue({
      templates: [
        {
          id: 't1',
          name: 'Research Swarm',
          description: 'Research team',
          strategy: 'parallel',
          isBuiltin: false,
          roles: [{ role: 'researcher' }, { role: 'writer' }],
        },
      ],
    } as never);

    renderWithProviders(<InstalledTab subAgentsEnabled />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Skills' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Swarm Templates' }));

    await waitFor(() => {
      expect(screen.getByText('Research Swarm')).toBeInTheDocument();
    });
  });

  it('should show personality labels on skill cards', async () => {
    renderWithProviders(<InstalledTab />);

    await waitFor(() => {
      expect(screen.getAllByText('Dev Agent').length).toBeGreaterThan(0);
    });
  });

  it('should call onNavigateTab from empty state cards', async () => {
    vi.mocked(api.fetchSkills).mockResolvedValue({ skills: [] } as never);
    const onNavigateTab = vi.fn();

    renderWithProviders(<InstalledTab onNavigateTab={onNavigateTab} />);

    await waitFor(() => {
      expect(screen.getByText(/No skills installed yet/)).toBeInTheDocument();
    });

    // Click the Marketplace card in empty state
    const marketplaceCards = screen.getAllByText('Marketplace');
    fireEvent.click(marketplaceCards[0].closest('.card')!);

    expect(onNavigateTab).toHaveBeenCalledWith('marketplace');
  });
});
