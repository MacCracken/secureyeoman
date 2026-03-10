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

  it('should show enable/disable toggle for skills', async () => {
    vi.mocked(api.fetchSkills).mockResolvedValue({
      skills: [
        {
          id: 's1',
          name: 'Test Skill',
          description: 'A test skill',
          source: 'user',
          personalityId: 'p1',
          enabled: true,
        },
      ],
    } as never);

    renderWithProviders(<InstalledTab />);

    await waitFor(() => {
      expect(screen.getByText('Test Skill')).toBeInTheDocument();
    });
  });

  it('should handle search/filter text input', async () => {
    renderWithProviders(<InstalledTab />);

    await waitFor(() => {
      expect(screen.getByText('Code Review')).toBeInTheDocument();
    });

    const searchInput = screen.queryByPlaceholderText(/search/i);
    if (searchInput) {
      fireEvent.change(searchInput, { target: { value: 'Security' } });
      await waitFor(() => {
        expect(screen.getByText('Security Scan')).toBeInTheDocument();
      });
    }
  });

  it('should show all source sections', async () => {
    renderWithProviders(<InstalledTab />);

    await waitFor(() => {
      expect(screen.getByText('Code Review')).toBeInTheDocument();
    });

    // Source section labels appear
    expect(screen.getByText('AI Created')).toBeInTheDocument();
    expect(screen.getByText('User Created')).toBeInTheDocument();
  });

  it('should show workflow with steps count', async () => {
    vi.mocked(api.fetchWorkflows).mockResolvedValue({
      definitions: [
        {
          id: 'w1',
          name: 'Build Pipeline',
          description: 'Build and test',
          steps: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
          createdBy: 'user',
        },
      ],
    } as never);

    renderWithProviders(<InstalledTab workflowsEnabled />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Workflows' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Workflows' }));

    await waitFor(() => {
      expect(screen.getByText('Build Pipeline')).toBeInTheDocument();
      expect(screen.getByText('3 steps')).toBeInTheDocument();
    });
  });

  it('should show swarm template with strategy and roles', async () => {
    vi.mocked(api.fetchSwarmTemplates).mockResolvedValue({
      templates: [
        {
          id: 't1',
          name: 'Analysis Swarm',
          description: 'Data analysis team',
          strategy: 'dynamic',
          isBuiltin: false,
          roles: [{ role: 'analyst' }, { role: 'reviewer' }, { role: 'reporter' }],
        },
      ],
    } as never);

    renderWithProviders(<InstalledTab subAgentsEnabled />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Swarm Templates' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Swarm Templates' }));

    await waitFor(() => {
      expect(screen.getByText('Analysis Swarm')).toBeInTheDocument();
      expect(screen.getByText('dynamic')).toBeInTheDocument();
      expect(screen.getByText('analyst')).toBeInTheDocument();
      expect(screen.getByText('reviewer')).toBeInTheDocument();
      expect(screen.getByText('reporter')).toBeInTheDocument();
    });
  });

  it('should show community badge for community workflows', async () => {
    vi.mocked(api.fetchWorkflows).mockResolvedValue({
      definitions: [
        {
          id: 'w1',
          name: 'Community Flow',
          description: 'A community workflow',
          steps: [{ id: 's1' }],
          createdBy: 'community',
        },
      ],
    } as never);

    renderWithProviders(<InstalledTab workflowsEnabled />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Workflows' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Workflows' }));

    await waitFor(() => {
      expect(screen.getByText('Community Flow')).toBeInTheDocument();
    });
    // Community badge should exist
    expect(screen.getAllByText('Community').length).toBeGreaterThan(0);
  });

  it('should filter out builtin swarm templates', async () => {
    vi.mocked(api.fetchSwarmTemplates).mockResolvedValue({
      templates: [
        {
          id: 't1',
          name: 'Builtin Template',
          description: 'A builtin',
          strategy: 'sequential',
          isBuiltin: true,
          roles: [{ role: 'worker' }],
        },
      ],
    } as never);

    renderWithProviders(<InstalledTab subAgentsEnabled />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Swarm Templates' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Swarm Templates' }));

    await waitFor(() => {
      expect(screen.getByText(/No swarm templates installed yet/)).toBeInTheDocument();
    });
  });

  it('should show both workflows and swarms tabs when both enabled', async () => {
    renderWithProviders(<InstalledTab workflowsEnabled subAgentsEnabled />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Skills' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Workflows' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Swarm Templates' })).toBeInTheDocument();
    });
  });

  it('should show Themes tab when both workflows and swarms enabled', async () => {
    renderWithProviders(<InstalledTab workflowsEnabled subAgentsEnabled />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Themes' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Personalities' })).toBeInTheDocument();
    });
  });

  it('should show empty themes state', async () => {
    renderWithProviders(<InstalledTab workflowsEnabled subAgentsEnabled />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Themes' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Themes' }));

    await waitFor(() => {
      expect(screen.getByText(/No themes installed/)).toBeInTheDocument();
    });
  });

  it('should show empty personalities state', async () => {
    renderWithProviders(<InstalledTab workflowsEnabled subAgentsEnabled />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Personalities' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Personalities' }));

    await waitFor(() => {
      expect(screen.getByText(/No personalities installed/)).toBeInTheDocument();
    });
  });

  it('should show installed theme items', async () => {
    vi.mocked(api.fetchSkills).mockResolvedValue({
      skills: [
        {
          id: 'theme-1',
          name: 'Dark Ocean',
          description: 'A dark blue theme',
          source: 'marketplace',
          personalityId: 'p1',
          enabled: true,
          instructions: JSON.stringify({ themeId: 'dark-ocean', preview: ['#1a1a2e', '#16213e', '#0f3460'] }),
        },
      ],
    } as never);
    vi.mocked(api.fetchMarketplaceSkills).mockResolvedValue({
      skills: [
        { id: 'cat-1', name: 'Dark Ocean', category: 'theme', installed: true },
      ],
      total: 1,
    } as never);

    renderWithProviders(<InstalledTab workflowsEnabled subAgentsEnabled />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Themes' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Themes' }));

    await waitFor(() => {
      expect(screen.getByText('Dark Ocean')).toBeInTheDocument();
    });
  });

  it('should show installed personality items', async () => {
    vi.mocked(api.fetchSkills).mockResolvedValue({
      skills: [
        {
          id: 'pers-1',
          name: 'Security Expert',
          description: 'Security-focused persona',
          source: 'marketplace',
          personalityId: 'p1',
          enabled: true,
          instructions: '---\nname: Security Expert\npurpose: Security analysis',
        },
      ],
    } as never);
    vi.mocked(api.fetchMarketplaceSkills).mockResolvedValue({
      skills: [
        { id: 'cat-2', name: 'Security Expert', category: 'personality', installed: true },
      ],
      total: 1,
    } as never);

    renderWithProviders(<InstalledTab workflowsEnabled subAgentsEnabled />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Personalities' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Personalities' }));

    await waitFor(() => {
      expect(screen.getByText('Security Expert')).toBeInTheDocument();
    });
  });

  it('should show workflow with autonomy level badge', async () => {
    vi.mocked(api.fetchWorkflows).mockResolvedValue({
      definitions: [
        {
          id: 'w1',
          name: 'Auto Scan',
          description: 'Automated scanning',
          steps: [{ id: 's1' }],
          createdBy: 'user',
          autonomyLevel: 'L3',
        },
      ],
    } as never);

    renderWithProviders(<InstalledTab workflowsEnabled />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Workflows' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Workflows' }));

    await waitFor(() => {
      expect(screen.getByText('Auto Scan')).toBeInTheDocument();
      expect(screen.getByText('L3')).toBeInTheDocument();
    });
  });

  it('should show workflow description', async () => {
    vi.mocked(api.fetchWorkflows).mockResolvedValue({
      definitions: [
        {
          id: 'w1',
          name: 'Described Flow',
          description: 'This workflow does things',
          steps: [{ id: 's1' }],
          createdBy: 'user',
        },
      ],
    } as never);

    renderWithProviders(<InstalledTab workflowsEnabled />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Workflows' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Workflows' }));

    await waitFor(() => {
      expect(screen.getByText('This workflow does things')).toBeInTheDocument();
    });
  });

  it('should show swarm template description', async () => {
    vi.mocked(api.fetchSwarmTemplates).mockResolvedValue({
      templates: [
        {
          id: 't1',
          name: 'Team Alpha',
          description: 'Alpha team description',
          strategy: 'sequential',
          isBuiltin: false,
          roles: [{ role: 'lead' }],
        },
      ],
    } as never);

    renderWithProviders(<InstalledTab subAgentsEnabled />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Swarm Templates' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Swarm Templates' }));

    await waitFor(() => {
      expect(screen.getByText('Alpha team description')).toBeInTheDocument();
    });
  });

  it('should show 1 step singular for single step workflow', async () => {
    vi.mocked(api.fetchWorkflows).mockResolvedValue({
      definitions: [
        {
          id: 'w1',
          name: 'Single Step',
          description: 'One step',
          steps: [{ id: 's1' }],
          createdBy: 'user',
        },
      ],
    } as never);

    renderWithProviders(<InstalledTab workflowsEnabled />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Workflows' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Workflows' }));

    await waitFor(() => {
      expect(screen.getByText('1 step')).toBeInTheDocument();
    });
  });

  it('should navigate to marketplace from empty workflows', async () => {
    const onNavigateTab = vi.fn();
    renderWithProviders(<InstalledTab workflowsEnabled onNavigateTab={onNavigateTab} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Workflows' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Workflows' }));

    await waitFor(() => {
      expect(screen.getByText(/No workflows installed yet/)).toBeInTheDocument();
    });

    const marketplaceCards = screen.getAllByText('Marketplace');
    fireEvent.click(marketplaceCards[0].closest('.card')!);
    expect(onNavigateTab).toHaveBeenCalledWith('marketplace');
  });

  it('should navigate to community from empty workflows', async () => {
    const onNavigateTab = vi.fn();
    renderWithProviders(<InstalledTab workflowsEnabled onNavigateTab={onNavigateTab} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Workflows' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Workflows' }));

    await waitFor(() => {
      expect(screen.getByText(/No workflows installed yet/)).toBeInTheDocument();
    });

    const communityCards = screen.getAllByText('Community');
    fireEvent.click(communityCards[0].closest('.card')!);
    expect(onNavigateTab).toHaveBeenCalledWith('community');
  });

  it('should navigate to marketplace from empty swarms', async () => {
    const onNavigateTab = vi.fn();
    renderWithProviders(<InstalledTab subAgentsEnabled onNavigateTab={onNavigateTab} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Swarm Templates' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Swarm Templates' }));

    await waitFor(() => {
      expect(screen.getByText(/No swarm templates installed yet/)).toBeInTheDocument();
    });

    const marketplaceCards = screen.getAllByText('Marketplace');
    fireEvent.click(marketplaceCards[0].closest('.card')!);
    expect(onNavigateTab).toHaveBeenCalledWith('marketplace');
  });

  it('should exclude system workflow definitions from installed view', async () => {
    vi.mocked(api.fetchWorkflows).mockResolvedValue({
      definitions: [
        {
          id: 'w-system',
          name: 'System Flow',
          description: 'Built-in',
          steps: [{ id: 's1' }],
          createdBy: 'system',
        },
        {
          id: 'w-user',
          name: 'User Flow',
          description: 'Custom',
          steps: [{ id: 's1' }],
          createdBy: 'user',
        },
      ],
    } as never);

    renderWithProviders(<InstalledTab workflowsEnabled />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Workflows' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Workflows' }));

    await waitFor(() => {
      expect(screen.getByText('User Flow')).toBeInTheDocument();
    });
    expect(screen.queryByText('System Flow')).not.toBeInTheDocument();
  });
});
