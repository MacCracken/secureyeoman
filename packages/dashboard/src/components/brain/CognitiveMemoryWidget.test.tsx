// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CognitiveMemoryWidget } from './CognitiveMemoryWidget';

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderWidget() {
  return render(
    <QueryClientProvider client={createQC()}>
      <CognitiveMemoryWidget />
    </QueryClientProvider>
  );
}

const mockStats = {
  topMemories: [
    { id: 'mem-abc123', activation: 0.95 },
    { id: 'mem-def456', activation: 0.82 },
  ],
  topDocuments: [],
  associationCount: 42,
  avgAssociationWeight: 0.567,
  accessTrend: [
    { day: '2026-03-01', count: 10 },
    { day: '2026-03-02', count: 25 },
    { day: '2026-03-03', count: 15 },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('CognitiveMemoryWidget', () => {
  it('shows loading state', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderWidget();
    expect(screen.getByText('Loading cognitive stats...')).toBeInTheDocument();
  });

  it('shows error state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Cognitive memory not available')).toBeInTheDocument();
    });
  });

  it('renders heading', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ stats: mockStats }),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Cognitive Memory')).toBeInTheDocument();
    });
  });

  it('shows association count', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ stats: mockStats }),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });
  });

  it('shows avg weight', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ stats: mockStats }),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('0.567')).toBeInTheDocument();
    });
  });

  it('shows access trend section', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ stats: mockStats }),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('7-Day Access Trend')).toBeInTheDocument();
    });
  });

  it('shows top activated memories', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ stats: mockStats }),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Top Activated Memories')).toBeInTheDocument();
      expect(screen.getByText('mem-abc123')).toBeInTheDocument();
      expect(screen.getByText('0.95')).toBeInTheDocument();
    });
  });

  it('shows empty trend message when no data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ stats: { ...mockStats, accessTrend: [] } }),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText(/No access data/)).toBeInTheDocument();
    });
  });
});
