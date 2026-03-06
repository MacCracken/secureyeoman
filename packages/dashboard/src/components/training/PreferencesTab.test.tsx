// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PreferencesTab } from './PreferencesTab';

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    fetchPreferencePairs: vi.fn(),
    deletePreferencePair: vi.fn(),
    exportPreferencesAsDpo: vi.fn(),
  };
});

import * as api from '../../api/client';
const mockFetch = vi.mocked(api.fetchPreferencePairs);
const mockDelete = vi.mocked(api.deletePreferencePair);

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderTab() {
  return render(
    <QueryClientProvider client={createQC()}>
      <PreferencesTab />
    </QueryClientProvider>
  );
}

const mockPairs = [
  { id: 'p1', prompt: 'What is AI?', chosen: 'Good answer', rejected: 'Bad answer', source: 'annotation' },
  { id: 'p2', prompt: 'Explain ML', chosen: 'ML is...', rejected: 'IDK', source: 'comparison' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ pairs: [] } as any);
});

describe('PreferencesTab', () => {
  it('shows loading state', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderTab();
    expect(screen.getByText(/Loading preferences/)).toBeInTheDocument();
  });

  it('shows empty state', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText(/No preference pairs recorded/)).toBeInTheDocument();
    });
  });

  it('renders heading', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Preference Pairs (DPO)')).toBeInTheDocument();
    });
  });

  it('shows Export DPO button', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Export DPO')).toBeInTheDocument();
    });
  });

  it('shows source filter dropdown', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByDisplayValue('All sources')).toBeInTheDocument();
    });
  });

  it('renders preference pairs', async () => {
    mockFetch.mockResolvedValue({ pairs: mockPairs } as any);
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('What is AI?')).toBeInTheDocument();
      expect(screen.getByText('Good answer')).toBeInTheDocument();
      expect(screen.getByText('Bad answer')).toBeInTheDocument();
    });
  });

  it('shows Chosen and Rejected labels', async () => {
    mockFetch.mockResolvedValue({ pairs: mockPairs } as any);
    renderTab();
    await waitFor(() => {
      expect(screen.getAllByText('Chosen').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Rejected').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows source badges', async () => {
    mockFetch.mockResolvedValue({ pairs: mockPairs } as any);
    renderTab();
    await waitFor(() => {
      expect(screen.getAllByText(/annotation/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/comparison/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows source count chips', async () => {
    mockFetch.mockResolvedValue({ pairs: mockPairs } as any);
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('annotation: 1')).toBeInTheDocument();
      expect(screen.getByText('comparison: 1')).toBeInTheDocument();
    });
  });

  it('has delete buttons for each pair', async () => {
    mockFetch.mockResolvedValue({ pairs: mockPairs } as any);
    renderTab();
    await waitFor(() => {
      expect(screen.getAllByTitle('Delete').length).toBe(2);
    });
  });
});
