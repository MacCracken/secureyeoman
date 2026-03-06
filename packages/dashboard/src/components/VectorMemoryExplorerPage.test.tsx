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
});
