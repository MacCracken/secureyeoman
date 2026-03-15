// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MarketplacePage } from './MarketplacePage';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchMarketplaceSkills: vi.fn(),
    installMarketplaceSkill: vi.fn(),
    uninstallMarketplaceSkill: vi.fn(),
  };
});

import * as api from '../api/client';
const mockFetchSkills = vi.mocked(api.fetchMarketplaceSkills);
const _mockInstall = vi.mocked(api.installMarketplaceSkill);

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderPage() {
  return render(
    <QueryClientProvider client={createQC()}>
      <MemoryRouter>
        <MarketplacePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const mockSkills = [
  {
    id: 's1',
    name: 'Code Review',
    description: 'AI code review',
    version: '1.0.0',
    author: 'acme',
    category: 'dev',
    downloadCount: 100,
    installed: false,
    origin: 'marketplace',
  },
  {
    id: 's2',
    name: 'Summarizer',
    description: 'Text summarizer',
    version: '2.1.0',
    author: 'labs',
    category: 'nlp',
    downloadCount: 50,
    installed: true,
    origin: 'community',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchSkills.mockResolvedValue({ skills: [], total: 0 } as any);
});

describe('MarketplacePage', () => {
  it('renders heading', async () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Marketplace' })).toBeInTheDocument();
  });

  it('shows type tabs', () => {
    renderPage();
    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('Workflows')).toBeInTheDocument();
    expect(screen.getByText('Swarm Templates')).toBeInTheDocument();
    expect(screen.getByText('Personalities')).toBeInTheDocument();
  });

  it('shows empty state when no skills', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Marketplace is empty')).toBeInTheDocument();
    });
  });

  it('shows "No skills found" with search query', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search skills...')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('Search skills...'), { target: { value: 'xyz' } });
    await waitFor(() => {
      expect(screen.getByText('No skills found')).toBeInTheDocument();
    });
  });

  it('renders skill cards', async () => {
    mockFetchSkills.mockResolvedValue({ skills: mockSkills, total: 2 } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Code Review')).toBeInTheDocument();
      expect(screen.getByText('Summarizer')).toBeInTheDocument();
    });
  });

  it('shows version and author', async () => {
    mockFetchSkills.mockResolvedValue({ skills: mockSkills, total: 2 } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('v1.0.0')).toBeInTheDocument();
      expect(screen.getByText('acme')).toBeInTheDocument();
    });
  });

  it('shows Install button for non-installed skills', async () => {
    mockFetchSkills.mockResolvedValue({ skills: mockSkills, total: 2 } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Install')).toBeInTheDocument();
    });
  });

  it('shows Uninstall button for installed skills', async () => {
    mockFetchSkills.mockResolvedValue({ skills: mockSkills, total: 2 } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Uninstall/)).toBeInTheDocument();
    });
  });

  it('shows Community badge for community skills', async () => {
    mockFetchSkills.mockResolvedValue({ skills: mockSkills, total: 2 } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Community')).toBeInTheDocument();
    });
  });

  it('shows origin filter tabs', async () => {
    renderPage();
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getAllByText('Marketplace').length).toBeGreaterThanOrEqual(1);
  });

  it('shows pagination when total exceeds page size', async () => {
    const manySkills = Array.from({ length: 20 }, (_, i) => ({
      id: `s${i}`,
      name: `Skill ${i}`,
      description: '',
      version: '1.0',
      author: 'a',
      category: 'c',
      downloadCount: 0,
      installed: false,
      origin: 'marketplace',
    }));
    mockFetchSkills.mockResolvedValue({ skills: manySkills, total: 40 } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
      expect(screen.getByText('Next →')).toBeInTheDocument();
    });
  });

  it('shows install count', async () => {
    mockFetchSkills.mockResolvedValue({ skills: mockSkills, total: 2 } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('100 installs')).toBeInTheDocument();
    });
  });
});
