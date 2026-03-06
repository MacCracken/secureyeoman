// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HyperparamSearchWidget from './HyperparamSearchWidget';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, getAccessToken: vi.fn(() => 'tok') };
});

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderWidget() {
  return render(
    <QueryClientProvider client={createQC()}>
      <HyperparamSearchWidget />
    </QueryClientProvider>
  );
}

const mockSearches = [
  {
    id: 'h1',
    name: 'lr-search',
    strategy: 'bayesian',
    status: 'running',
    bestTrialId: 't2',
    trials: [
      {
        id: 't1',
        params: { lr: 0.001 },
        status: 'completed',
        loss: 0.5,
        startedAt: null,
        completedAt: null,
      },
      {
        id: 't2',
        params: { lr: 0.0005 },
        status: 'completed',
        loss: 0.3,
        startedAt: null,
        completedAt: null,
      },
      {
        id: 't3',
        params: { lr: 0.01 },
        status: 'running',
        loss: null,
        startedAt: null,
        completedAt: null,
      },
      {
        id: 't4',
        params: { lr: 0.1 },
        status: 'failed',
        loss: null,
        startedAt: null,
        completedAt: null,
      },
    ],
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('HyperparamSearchWidget', () => {
  it('shows loading state', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderWidget();
    expect(screen.getByText('Loading searches...')).toBeInTheDocument();
  });

  it('shows error state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Error',
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
    });
  });

  it('renders heading and wizard form', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Hyperparameter Search')).toBeInTheDocument();
      expect(screen.getByText('New Search')).toBeInTheDocument();
    });
  });

  it('shows strategy radio buttons', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('grid')).toBeInTheDocument();
      expect(screen.getByText('random')).toBeInTheDocument();
      expect(screen.getByText('bayesian')).toBeInTheDocument();
    });
  });

  it('shows Create Search button', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Create Search')).toBeInTheDocument();
    });
  });

  it('renders search jobs with trials', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSearches),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('lr-search')).toBeInTheDocument();
      expect(screen.getByText(/bayesian \| running/)).toBeInTheDocument();
      expect(screen.getByText('2/4 trials complete')).toBeInTheDocument();
    });
  });

  it('shows Best Trial highlight', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSearches),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Best Trial')).toBeInTheDocument();
      expect(screen.getByText(/0.300000/)).toBeInTheDocument();
    });
  });

  it('shows name input placeholder', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('my-search-run')).toBeInTheDocument();
    });
  });

  it('disables Create Search when name is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Create Search')).toBeDisabled();
    });
  });

  it('shows no trials message when empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'h2',
            name: 'empty-search',
            strategy: 'grid',
            status: 'pending',
            bestTrialId: null,
            trials: [],
          },
        ]),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('No trials yet')).toBeInTheDocument();
    });
  });
});
