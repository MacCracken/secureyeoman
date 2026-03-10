// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VectorMemoryExplorerPage } from './VectorMemoryExplorerPage';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchMemories: vi.fn(),
    fetchKnowledge: vi.fn(),
    fetchPersonalities: vi.fn(),
    searchSimilar: vi.fn(),
    addMemory: vi.fn(),
    deleteMemory: vi.fn(),
    deleteKnowledge: vi.fn(),
    reindexBrain: vi.fn(),
  };
});

vi.mock('./knowledge/KnowledgeBaseTab', () => ({
  KnowledgeBaseTab: () => <div data-testid="kb-tab">KnowledgeBaseTab</div>,
}));

vi.mock('./brain/MemoryHealthTab', () => ({
  default: () => <div data-testid="health-tab">MemoryHealthTab</div>,
}));

vi.mock('./brain/AuditScheduleConfig', () => ({
  default: () => <div data-testid="audit-tab">AuditScheduleConfig</div>,
}));

import * as api from '../api/client';

const mockFetchMemories = vi.mocked(api.fetchMemories);
const mockFetchKnowledge = vi.mocked(api.fetchKnowledge);
const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);
const mockSearchSimilar = vi.mocked(api.searchSimilar);

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderPage(props?: { embedded?: boolean }) {
  return render(
    <QueryClientProvider client={createQC()}>
      <VectorMemoryExplorerPage {...props} />
    </QueryClientProvider>
  );
}

const MEMORY = {
  id: 'mem-1',
  personalityId: 'p-1',
  type: 'semantic' as const,
  content: 'The user prefers dark mode',
  source: 'conversation',
  importance: 0.8,
  accessCount: 5,
  lastAccessedAt: 1700000000000,
  createdAt: 1700000000000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchPersonalities.mockResolvedValue({
    personalities: [{ id: 'p-1', name: 'FRIDAY' } as any],
  });
  mockFetchMemories.mockResolvedValue({ memories: [MEMORY] } as any);
  mockFetchKnowledge.mockResolvedValue({ entries: [] } as any);
  mockSearchSimilar.mockResolvedValue({ results: [] } as any);
});

describe('VectorMemoryExplorerPage', () => {
  it('renders Semantic Search tab', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText(/Semantic Search/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows Memories tab with count', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Memories \(/)).toBeInTheDocument();
    });
  });

  it('shows Knowledge tab with count', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Knowledge \(/)).toBeInTheDocument();
    });
  });

  it('shows Add Entry tab', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Add Entry/)).toBeInTheDocument();
    });
  });

  it('shows search input on default Search tab', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });
  });

  it('switches to Memories tab and shows memory content', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Memories \(/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Memories \(/));
    await waitFor(() => {
      expect(screen.getByText(/dark mode/)).toBeInTheDocument();
    });
  });

  it('shows personality filter', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/FRIDAY/)).toBeInTheDocument();
    });
  });

  it('switches to Documents tab', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Documents')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Documents'));
    await waitFor(() => {
      expect(screen.getByTestId('kb-tab')).toBeInTheDocument();
    });
  });

  it('renders in embedded mode', async () => {
    renderPage({ embedded: true });
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });
  });

  it('shows stat cards', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Search Results')).toBeInTheDocument();
      expect(screen.getByText('Reindex')).toBeInTheDocument();
      expect(screen.getByText('Reindex All')).toBeInTheDocument();
    });
  });

  it('shows Reindex All button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Reindex All')).toBeInTheDocument();
    });
  });

  it('performs semantic search and shows results', async () => {
    const user = userEvent.setup();
    mockSearchSimilar.mockResolvedValue({
      results: [
        { id: 'vec-1', score: 0.95, metadata: { type: 'semantic', content: 'dark mode preference' } },
        { id: 'vec-2', score: 0.82, metadata: { type: 'episodic' } },
      ],
    } as any);

    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/search/i);
    await user.type(input, 'dark mode');
    await user.click(screen.getByText('Search'));

    await waitFor(() => {
      expect(mockSearchSimilar).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'dark mode' })
      );
    });
  });

  it('shows no results message when search returns empty', async () => {
    const user = userEvent.setup();
    mockSearchSimilar.mockResolvedValue({ results: [] } as any);

    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/search/i);
    await user.type(input, 'nonexistent');
    await user.click(screen.getByText('Search'));

    await waitFor(() => {
      expect(screen.getByText(/No similar entries found/)).toBeInTheDocument();
    });
  });

  it('shows search error when search fails', async () => {
    const user = userEvent.setup();
    mockSearchSimilar.mockRejectedValue(new Error('Connection failed'));

    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/search/i);
    await user.type(input, 'test');
    await user.click(screen.getByText('Search'));

    await waitFor(() => {
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });
  });

  it('switches to Knowledge tab and shows empty state', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Knowledge \(/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Knowledge \(/));
    await waitFor(() => {
      expect(screen.getByText(/No knowledge entries/)).toBeInTheDocument();
    });
  });

  it('shows knowledge entries when data exists', async () => {
    mockFetchKnowledge.mockResolvedValue({
      knowledge: [
        {
          id: 'k-1',
          personalityId: 'p-1',
          topic: 'company-info',
          content: 'SecureYeoman is a security platform',
          source: 'manual',
          confidence: 0.9,
          createdAt: 1700000000000,
        },
      ],
    } as any);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Knowledge \(/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Knowledge \(/));
    await waitFor(() => {
      expect(screen.getByText('company-info')).toBeInTheDocument();
    });
  });

  it('switches to Add Entry tab and shows form', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Add Entry/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Add Entry/));
    await waitFor(() => {
      expect(screen.getByText('Add Memory')).toBeInTheDocument();
    });
  });

  it('expands memory item on click', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Memories \(/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Memories \(/));
    await waitFor(() => {
      expect(screen.getByText(/dark mode/)).toBeInTheDocument();
    });
    // Click on the memory row to expand it
    await user.click(screen.getByText(/dark mode/));
    await waitFor(() => {
      expect(screen.getByText('Source:')).toBeInTheDocument();
      expect(screen.getByText('conversation')).toBeInTheDocument();
    });
  });

  it('shows Memory Health tab', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Memory Health')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Memory Health'));
    await waitFor(() => {
      expect(screen.getByTestId('health-tab')).toBeInTheDocument();
    });
  });

  it('shows personality scope message when personality selected', async () => {
    const { fireEvent } = await import('@testing-library/react');
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/FRIDAY/)).toBeInTheDocument();
    });
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'p-1' } });
    await waitFor(() => {
      expect(screen.getByText(/Showing memories scoped to/)).toBeInTheDocument();
    });
  });

  it('shows empty memories state', async () => {
    mockFetchMemories.mockResolvedValue({ memories: [] } as any);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Memories \(/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Memories \(/));
    await waitFor(() => {
      expect(screen.getByText(/No memories stored/)).toBeInTheDocument();
    });
  });

  it('shows memory type labels', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Memories \(/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Memories \(/));
    await waitFor(() => {
      expect(screen.getByText('Semantic')).toBeInTheDocument();
    });
  });
});
