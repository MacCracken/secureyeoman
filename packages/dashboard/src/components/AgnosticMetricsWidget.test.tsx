import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AgnosticMetricsWidget from './AgnosticMetricsWidget';

vi.mock('../api/client', () => ({
  getAccessToken: () => 'test-token',
}));

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderWithProvider(ui: React.ReactElement) {
  const client = makeQueryClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('AgnosticMetricsWidget', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state initially', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    renderWithProvider(<AgnosticMetricsWidget />);
    expect(screen.getByText(/loading agnostic/i)).toBeInTheDocument();
  });

  it('shows offline state on fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    renderWithProvider(<AgnosticMetricsWidget />);
    await waitFor(() => {
      expect(screen.getByText(/unable to connect/i)).toBeInTheDocument();
    });
  });

  it('renders task counts when data is available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: 'healthy',
            tasks: { pending: 2, running: 1, completed: 10, failed: 0 },
            agents: { total: 5, active: 3 },
            recentTasks: [
              {
                id: '1',
                title: 'QA Check',
                status: 'completed',
                createdAt: '2026-03-06T00:00:00Z',
              },
            ],
          }),
      })
    );

    renderWithProvider(<AgnosticMetricsWidget />);

    await waitFor(() => {
      expect(screen.getByText('Agnostic')).toBeInTheDocument();
      expect(screen.getByText('healthy')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument(); // pending
      expect(screen.getByText('1')).toBeInTheDocument(); // running
      expect(screen.getByText('10')).toBeInTheDocument(); // completed
    });
  });

  it('renders agent counts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: 'degraded',
            tasks: { pending: 0, running: 0, completed: 0, failed: 0 },
            agents: { total: 4, active: 2 },
            recentTasks: [],
          }),
      })
    );

    renderWithProvider(<AgnosticMetricsWidget />);

    await waitFor(() => {
      expect(screen.getByText('degraded')).toBeInTheDocument();
      expect(screen.getByText('/ 4')).toBeInTheDocument();
    });
  });
});
