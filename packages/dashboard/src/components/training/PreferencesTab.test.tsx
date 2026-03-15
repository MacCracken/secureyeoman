// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
const mockExport = vi.mocked(api.exportPreferencesAsDpo);

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
  {
    id: 'p1',
    prompt: 'What is AI?',
    chosen: 'Good answer',
    rejected: 'Bad answer',
    source: 'annotation',
  },
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

  it('calls deletePreferencePair when delete button clicked', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({ pairs: mockPairs } as any);
    mockDelete.mockResolvedValue(undefined as any);
    renderTab();
    await waitFor(() => {
      expect(screen.getAllByTitle('Delete').length).toBe(2);
    });
    await user.click(screen.getAllByTitle('Delete')[0]);
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('p1', expect.anything());
    });
  });

  it('calls exportPreferencesAsDpo on Export DPO click', async () => {
    const user = userEvent.setup();
    const mockBlob = new Blob(['test'], { type: 'application/jsonl' });
    mockExport.mockResolvedValue({ blob: () => Promise.resolve(mockBlob) } as any);
    mockFetch.mockResolvedValue({ pairs: mockPairs } as any);

    const mockCreateObjectURL = vi.fn(() => 'blob:test');
    const mockRevokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = mockCreateObjectURL;
    globalThis.URL.revokeObjectURL = mockRevokeObjectURL;

    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Export DPO')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Export DPO'));
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalled();
    });
  });

  it('handles export error gracefully', async () => {
    const user = userEvent.setup();
    mockExport.mockRejectedValue(new Error('Network error'));
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Export DPO')).toBeInTheDocument();
    });
    // Should not throw
    await user.click(screen.getByText('Export DPO'));
    // Component still renders fine
    expect(screen.getByText('Preference Pairs (DPO)')).toBeInTheDocument();
  });

  it('filters by source when source filter changed', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({ pairs: mockPairs } as any);
    renderTab();
    await waitFor(() => {
      expect(screen.getByDisplayValue('All sources')).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByDisplayValue('All sources'), 'annotation');
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith({ source: 'annotation', limit: 200 });
    });
  });

  it('renders filter options for all source types', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByDisplayValue('All sources')).toBeInTheDocument();
    });
    const select = screen.getByDisplayValue('All sources');
    const options = select.querySelectorAll('option');
    const values = Array.from(options).map((o) => o.getAttribute('value'));
    expect(values).toContain('');
    expect(values).toContain('annotation');
    expect(values).toContain('comparison');
    expect(values).toContain('multi_turn');
  });

  it('shows Prompt label for each pair', async () => {
    mockFetch.mockResolvedValue({ pairs: mockPairs } as any);
    renderTab();
    await waitFor(() => {
      expect(screen.getAllByText('Prompt').length).toBe(2);
    });
  });

  it('renders multiple source count chips when pairs have different sources', async () => {
    const mixedPairs = [
      ...mockPairs,
      { id: 'p3', prompt: 'Test', chosen: 'A', rejected: 'B', source: 'annotation' },
    ];
    mockFetch.mockResolvedValue({ pairs: mixedPairs } as any);
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('annotation: 2')).toBeInTheDocument();
      expect(screen.getByText('comparison: 1')).toBeInTheDocument();
    });
  });

  it('passes source: undefined when All sources selected', async () => {
    renderTab();
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith({ source: undefined, limit: 200 });
    });
  });
});
