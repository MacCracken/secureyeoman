// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SimilaritySearch } from './SimilaritySearch';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    searchSimilar: vi.fn(),
  };
});

vi.mock('../utils/sanitize', () => ({
  sanitizeText: (s: string) => s,
}));

import * as api from '../api/client';

const mockSearchSimilar = vi.mocked(api.searchSimilar);

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderSearch() {
  return render(
    <QueryClientProvider client={createQC()}>
      <SimilaritySearch />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchSimilar.mockResolvedValue({ results: [] } as any);
});

describe('SimilaritySearch', () => {
  it('renders Semantic Search heading', () => {
    renderSearch();
    expect(screen.getByText('Semantic Search')).toBeInTheDocument();
  });

  it('shows search input', () => {
    renderSearch();
    const input = screen.getByPlaceholderText(/search/i);
    expect(input).toBeInTheDocument();
  });

  it('shows search submit button', () => {
    renderSearch();
    // There should be a submit button in the form
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('shows settings toggle button', () => {
    renderSearch();
    // The SlidersHorizontal icon button
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('shows no results initially', () => {
    renderSearch();
    expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
  });
});
