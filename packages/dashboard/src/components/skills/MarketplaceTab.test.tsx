// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MarketplaceTab } from './MarketplaceTab';

vi.mock('../../api/client', () => ({
  fetchMarketplaceSkills: vi.fn(),
  installMarketplaceSkill: vi.fn(),
  uninstallMarketplaceSkill: vi.fn(),
  fetchPersonalities: vi.fn(),
}));

vi.mock('../../utils/sanitize', () => ({
  sanitizeText: (s: string) => s,
}));

vi.mock('../marketplace/WorkflowsTab', () => ({
  WorkflowsTab: () => <div data-testid="workflows-tab">Workflows</div>,
}));

vi.mock('../marketplace/SwarmTemplatesTab', () => ({
  SwarmTemplatesTab: () => <div data-testid="swarm-templates-tab">Swarm Templates</div>,
}));

import * as api from '../../api/client';

const mockSkills = [
  {
    id: 'sk1',
    name: 'Code Review',
    version: '1.0.0',
    description: 'Reviews code',
    category: 'development',
    author: 'YEOMAN',
    downloadCount: 500,
    installed: false,
    installedGlobally: false,
    tags: [],
    triggerPatterns: [],
    tools: [],
    source: 'builtin',
    updatedAt: Date.now(),
  },
  {
    id: 'sk2',
    name: 'Security Scanner',
    version: '2.0.0',
    description: 'Scans for vulnerabilities',
    category: 'security',
    author: 'TestPublisher',
    downloadCount: 200,
    installed: true,
    installedGlobally: false,
    tags: ['security'],
    triggerPatterns: ['/scan'],
    tools: [{ name: 'scan_tool' }],
    source: 'published',
    updatedAt: Date.now(),
  },
  {
    id: 'sk3',
    name: 'Dark Theme',
    version: '1.0.0',
    description: 'A dark theme',
    category: 'theme',
    author: 'YEOMAN',
    downloadCount: 100,
    installed: false,
    installedGlobally: false,
    tags: [],
    triggerPatterns: [],
    tools: [],
    source: 'builtin',
    updatedAt: Date.now(),
  },
  {
    id: 'sk4',
    name: 'Creative Persona',
    version: '1.0.0',
    description: 'A creative personality',
    category: 'personality',
    author: 'YEOMAN',
    downloadCount: 50,
    installed: false,
    installedGlobally: false,
    tags: [],
    triggerPatterns: [],
    tools: [],
    source: 'builtin',
    updatedAt: Date.now(),
  },
];

function renderTab(props: Parameters<typeof MarketplaceTab>[0] = {}) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MarketplaceTab {...props} />
    </QueryClientProvider>
  );
}

describe('MarketplaceTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchMarketplaceSkills).mockResolvedValue({ skills: mockSkills } as never);
    vi.mocked(api.fetchPersonalities).mockResolvedValue({
      personalities: [
        { id: 'p1', name: 'Default', isActive: true },
        { id: 'p2', name: 'Creative', isActive: false },
      ],
    } as never);
    vi.mocked(api.installMarketplaceSkill).mockResolvedValue({} as never);
    vi.mocked(api.uninstallMarketplaceSkill).mockResolvedValue({} as never);
  });

  it('should render skills view by default', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search skills…')).toBeInTheDocument();
    });
  });

  it('should show builtin YEOMAN skills', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Code Review')).toBeInTheDocument();
    });
  });

  it('should show published skills', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Security Scanner')).toBeInTheDocument();
    });
  });

  it('should filter skills by search query', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search skills…')).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText('Search skills…');
    fireEvent.change(input, { target: { value: 'code' } });
    // Query is sent to API
    await waitFor(() => {
      expect(api.fetchMarketplaceSkills).toHaveBeenCalled();
    });
  });

  it('should show empty state when no skills', async () => {
    vi.mocked(api.fetchMarketplaceSkills).mockResolvedValue({ skills: [] } as never);
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Marketplace is empty')).toBeInTheDocument();
    });
  });

  it('should switch to themes view', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Themes')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Themes'));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search themes…')).toBeInTheDocument();
    });
  });

  it('should show no themes message when empty', async () => {
    vi.mocked(api.fetchMarketplaceSkills).mockResolvedValue({
      skills: mockSkills.filter((s) => s.category !== 'theme'),
    } as never);
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Themes')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Themes'));
    await waitFor(() => {
      expect(screen.getByText('No themes found')).toBeInTheDocument();
    });
  });

  it('should switch to personalities view', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Personalities')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Personalities'));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search personalities…')).toBeInTheDocument();
    });
  });

  it('should show no personalities message when empty', async () => {
    vi.mocked(api.fetchMarketplaceSkills).mockResolvedValue({
      skills: mockSkills.filter((s) => s.category !== 'personality'),
    } as never);
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Personalities')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Personalities'));
    await waitFor(() => {
      expect(screen.getByText('No personalities found')).toBeInTheDocument();
    });
  });

  it('should render with initialContentType', async () => {
    renderTab({ initialContentType: 'themes' });
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search themes…')).toBeInTheDocument();
    });
  });

  it('should show category filter in skills view', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Code Review')).toBeInTheDocument();
    });
    // Category filter should be visible with All button
    const allButtons = screen.getAllByRole('tab');
    expect(allButtons.length).toBeGreaterThan(0);
  });

  it('should show personality selector', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Install to:')).toBeInTheDocument();
    });
  });
});
