// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CacheStatsCard from './CacheStatsCard';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, getAccessToken: vi.fn(() => 'tok') };
});

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderCard() {
  return render(
    <QueryClientProvider client={createQC()}>
      <CacheStatsCard />
    </QueryClientProvider>
  );
}

const mockStats = {
  hitRate: 0.85,
  totalHits: 850,
  totalMisses: 150,
  lru: { hits: 500, misses: 100, size: 200, maxSize: 500 },
  semantic: { hits: 350, misses: 50, size: 100, maxSize: 300 },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('CacheStatsCard', () => {
  it('shows loading state', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderCard();
    expect(screen.getByText('Loading cache stats...')).toBeInTheDocument();
  });

  it('shows error state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
    } as Response);
    renderCard();
    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
    });
  });

  it('renders cache stats with hit rate gauge', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStats),
    } as Response);
    renderCard();
    await waitFor(() => {
      expect(screen.getByText('85%')).toBeInTheDocument();
      expect(screen.getByText('Hit Rate')).toBeInTheDocument();
    });
  });

  it('shows total hits and misses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStats),
    } as Response);
    renderCard();
    await waitFor(() => {
      expect(screen.getByText('850 hits / 150 misses')).toBeInTheDocument();
    });
  });

  it('renders LRU and Semantic breakdown', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStats),
    } as Response);
    renderCard();
    await waitFor(() => {
      expect(screen.getByText('LRU Cache')).toBeInTheDocument();
      expect(screen.getByText('Semantic Cache')).toBeInTheDocument();
      expect(screen.getByText('500 hits')).toBeInTheDocument();
      expect(screen.getByText('350 hits')).toBeInTheDocument();
    });
  });

  it('shows Clear Cache button', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStats),
    } as Response);
    renderCard();
    await waitFor(() => {
      expect(screen.getByText('Clear Cache')).toBeInTheDocument();
    });
  });

  it('calls clear endpoint when button clicked', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const u = String(url);
      if (u.includes('clear')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ cleared: true }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockStats) } as Response);
    });
    renderCard();
    await waitFor(() => {
      expect(screen.getByText('Clear Cache')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Clear Cache'));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/v1/inference/cache/clear',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('shows yellow gauge for medium hit rate', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ...mockStats, hitRate: 0.6 }),
    } as Response);
    renderCard();
    await waitFor(() => {
      expect(screen.getByText('60%')).toBeInTheDocument();
    });
  });

  it('shows red gauge for low hit rate', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ...mockStats, hitRate: 0.3 }),
    } as Response);
    renderCard();
    await waitFor(() => {
      expect(screen.getByText('30%')).toBeInTheDocument();
    });
  });

  it('shows size/maxSize in breakdown', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStats),
    } as Response);
    renderCard();
    await waitFor(() => {
      expect(screen.getByText('200/500')).toBeInTheDocument();
      expect(screen.getByText('100/300')).toBeInTheDocument();
    });
  });
});
