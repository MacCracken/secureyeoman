// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CognitiveMemoryWidget } from './CognitiveMemoryWidget';
import { clearAuthTokens, setAuthTokens } from '../../api/client';

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

/** Answer every fetch with a fresh JSON Response (a body can only be read once). */
function mockFetchJson(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  clearAuthTokens();
});

describe('CognitiveMemoryWidget', () => {
  it('shows loading state', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderWidget();
    expect(screen.getByText('Loading cognitive stats...')).toBeInTheDocument();
  });

  it('shows error state', async () => {
    mockFetchJson({ error: 'boom' }, 500);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Cognitive memory not available')).toBeInTheDocument();
    });
  });

  it('renders heading', async () => {
    mockFetchJson({ stats: mockStats });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Cognitive Memory')).toBeInTheDocument();
    });
  });

  it('shows association count', async () => {
    mockFetchJson({ stats: mockStats });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });
  });

  it('shows avg weight', async () => {
    mockFetchJson({ stats: mockStats });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('0.567')).toBeInTheDocument();
    });
  });

  it('shows access trend section', async () => {
    mockFetchJson({ stats: mockStats });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('7-Day Access Trend')).toBeInTheDocument();
    });
  });

  it('shows top activated memories', async () => {
    mockFetchJson({ stats: mockStats });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Top Activated Memories')).toBeInTheDocument();
      expect(screen.getByText('mem-abc123')).toBeInTheDocument();
      expect(screen.getByText('0.95')).toBeInTheDocument();
    });
  });

  it('shows empty trend message when no data', async () => {
    mockFetchJson({ stats: { ...mockStats, accessTrend: [] } });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText(/No access data/)).toBeInTheDocument();
    });
  });

  it('sends the access token (the raw fetch it replaced got a 401)', async () => {
    setAuthTokens('access-token', 'refresh-token');
    const fetchSpy = mockFetchJson({ stats: mockStats });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/v1/brain/cognitive-stats');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access-token');
  });

  it('shows the unavailable state for a body without the stats envelope', async () => {
    // The Rust gateway currently answers with plain counts.
    mockFetchJson({ memoryCount: 3, knowledgeCount: 1, avgRelevance: 0.5 });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Cognitive memory not available')).toBeInTheDocument();
    });
  });
});
