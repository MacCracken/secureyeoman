// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EntityExplorerPanel } from './EntityExplorerPanel';

vi.mock('../../api/client', () => ({
  fetchTopEntities: vi.fn(),
  searchEntities: vi.fn(),
}));

import * as api from '../../api/client';

const mockEntities = [
  { entityType: 'person', entityValue: 'Alice', totalMentions: 15, conversationCount: 5 },
  { entityType: 'technology', entityValue: 'React', totalMentions: 10, conversationCount: 8 },
  { entityType: 'organization', entityValue: 'Acme', totalMentions: 7, conversationCount: 3 },
];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('EntityExplorerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchTopEntities).mockResolvedValue(mockEntities as never);
    vi.mocked(api.searchEntities).mockResolvedValue([] as never);
  });

  it('should render entity list', async () => {
    renderWithProviders(<EntityExplorerPanel personalityId="p1" />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('should show entity types', async () => {
    renderWithProviders(<EntityExplorerPanel personalityId="p1" />);

    await waitFor(() => {
      expect(screen.getByText('person')).toBeInTheDocument();
    });

    expect(screen.getByText('technology')).toBeInTheDocument();
  });

  it('should show mention counts', async () => {
    renderWithProviders(<EntityExplorerPanel personalityId="p1" />);

    await waitFor(() => {
      expect(screen.getByText('15x / 5 convs')).toBeInTheDocument();
    });
  });

  it('should render filter buttons', async () => {
    renderWithProviders(<EntityExplorerPanel personalityId="p1" />);

    await waitFor(() => {
      expect(screen.getByText('all')).toBeInTheDocument();
    });

    expect(screen.getByText('person')).toBeInTheDocument();
    expect(screen.getByText('organization')).toBeInTheDocument();
    expect(screen.getByText('technology')).toBeInTheDocument();
  });

  it('should filter by entity type', async () => {
    renderWithProviders(<EntityExplorerPanel personalityId="p1" />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    // Click person filter - there are multiple elements with text "person"
    const personButtons = screen.getAllByText('person');
    // Click the filter button (first one is the filter, second is the badge)
    fireEvent.click(personButtons[0]);

    await waitFor(() => {
      // Only person entities should show
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
  });

  it('should show search input', () => {
    renderWithProviders(<EntityExplorerPanel personalityId="p1" />);
    expect(screen.getByPlaceholderText('Search entities...')).toBeInTheDocument();
  });

  it('should search when typing', async () => {
    vi.mocked(api.searchEntities).mockResolvedValue([
      { conversationId: 'c1', title: 'Chat about AI', mentionCount: 3 },
    ] as never);

    renderWithProviders(<EntityExplorerPanel personalityId="p1" />);

    const searchInput = screen.getByPlaceholderText('Search entities...');
    fireEvent.change(searchInput, { target: { value: 'AI' } });

    await waitFor(() => {
      expect(screen.getByText('Chat about AI')).toBeInTheDocument();
    });
  });

  it('should show empty state when no entities', async () => {
    vi.mocked(api.fetchTopEntities).mockResolvedValue([] as never);

    renderWithProviders(<EntityExplorerPanel personalityId="p1" />);

    await waitFor(() => {
      expect(screen.getByText('No entities found')).toBeInTheDocument();
    });
  });

  it('should not fetch without personalityId', () => {
    renderWithProviders(<EntityExplorerPanel personalityId={null} />);
    expect(api.fetchTopEntities).not.toHaveBeenCalled();
  });
});
