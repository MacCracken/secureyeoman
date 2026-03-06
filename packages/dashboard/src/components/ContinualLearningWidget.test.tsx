// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ContinualLearningWidget from './ContinualLearningWidget';

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
      <ContinualLearningWidget />
    </QueryClientProvider>
  );
}

const datasetStatus = {
  cron: '0 */6 * * *',
  lastRunAt: '2026-03-01T12:00:00Z',
  samplesAdded: 1500,
  nextRunAt: '2026-03-01T18:00:00Z',
  status: 'idle',
};

const driftData = {
  snapshots: [
    {
      personality: 'default',
      mean: 0.5,
      baseline: 0.45,
      driftScore: 0.05,
      timestamp: '2026-03-01T12:00:00Z',
    },
    {
      personality: 'formal',
      mean: 0.7,
      baseline: 0.4,
      driftScore: 0.35,
      timestamp: '2026-03-01T12:00:00Z',
    },
  ],
  latestPerPersonality: {
    default: {
      personality: 'default',
      mean: 0.5,
      baseline: 0.45,
      driftScore: 0.05,
      timestamp: '2026-03-01T12:00:00Z',
    },
    formal: {
      personality: 'formal',
      mean: 0.7,
      baseline: 0.4,
      driftScore: 0.35,
      timestamp: '2026-03-01T12:00:00Z',
    },
  },
};

const onlineJobs = [
  {
    id: 'j1',
    personality: 'default',
    status: 'completed',
    conversationCount: 50,
    startedAt: null,
    completedAt: null,
  },
  {
    id: 'j2',
    personality: 'formal',
    status: 'running',
    conversationCount: 20,
    startedAt: null,
    completedAt: null,
  },
  {
    id: 'j3',
    personality: 'casual',
    status: 'failed',
    conversationCount: 10,
    startedAt: null,
    completedAt: null,
  },
];

let fetchCallCount: number;
beforeEach(() => {
  vi.restoreAllMocks();
  fetchCallCount = 0;
});

function mockFetchFor(panel: 'dataset' | 'drift' | 'online') {
  vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
    const u = String(url);
    if (u.includes('dataset-refresh')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(datasetStatus) } as Response);
    }
    if (u.includes('drift')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(driftData) } as Response);
    }
    if (u.includes('online-updates')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(onlineJobs) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
}

describe('ContinualLearningWidget', () => {
  it('renders heading and panel tabs', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderWidget();
    expect(screen.getByText('Continual Learning')).toBeInTheDocument();
    expect(screen.getByText('Dataset Refresh')).toBeInTheDocument();
    expect(screen.getByText('Drift Monitor')).toBeInTheDocument();
    expect(screen.getByText('Online Updates')).toBeInTheDocument();
  });

  it('shows dataset refresh panel by default with schedule', async () => {
    mockFetchFor('dataset');
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('0 */6 * * *')).toBeInTheDocument();
    });
  });

  it('shows samples added count', async () => {
    mockFetchFor('dataset');
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('1,500')).toBeInTheDocument();
    });
  });

  it('shows Trigger Now button', async () => {
    mockFetchFor('dataset');
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Trigger Now')).toBeInTheDocument();
    });
  });

  it('shows Running... when status is running', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ...datasetStatus, status: 'running' }),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Running...')).toBeInTheDocument();
    });
  });

  it('shows last run failed when status is error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ...datasetStatus, status: 'error' }),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Last run failed')).toBeInTheDocument();
    });
  });

  it('shows Never when lastRunAt is null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ...datasetStatus, lastRunAt: null }),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText(/Never/)).toBeInTheDocument();
    });
  });

  it('switches to Drift Monitor panel', async () => {
    mockFetchFor('drift');
    renderWidget();
    fireEvent.click(screen.getByText('Drift Monitor'));
    await waitFor(() => {
      expect(screen.getAllByText('formal').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('0.050').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows drift scores with color coding', async () => {
    mockFetchFor('drift');
    renderWidget();
    fireEvent.click(screen.getByText('Drift Monitor'));
    await waitFor(() => {
      expect(screen.getAllByText('0.050').length).toBeGreaterThanOrEqual(1); // green (< 0.1)
      expect(screen.getAllByText('0.350').length).toBeGreaterThanOrEqual(1); // red (>= 0.3)
    });
  });

  it('shows Recent Snapshots in drift panel', async () => {
    mockFetchFor('drift');
    renderWidget();
    fireEvent.click(screen.getByText('Drift Monitor'));
    await waitFor(() => {
      expect(screen.getByText('Recent Snapshots')).toBeInTheDocument();
    });
  });

  it('shows empty drift message when no data', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const u = String(url);
      if (u.includes('drift')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ snapshots: [], latestPerPersonality: {} }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(datasetStatus) } as Response);
    });
    renderWidget();
    fireEvent.click(screen.getByText('Drift Monitor'));
    await waitFor(() => {
      expect(screen.getByText('No drift data available')).toBeInTheDocument();
    });
  });

  it('switches to Online Updates panel', async () => {
    mockFetchFor('online');
    renderWidget();
    fireEvent.click(screen.getByText('Online Updates'));
    await waitFor(() => {
      expect(screen.getByText('default')).toBeInTheDocument();
      expect(screen.getByText('50 convos')).toBeInTheDocument();
    });
  });

  it('shows different job statuses', async () => {
    mockFetchFor('online');
    renderWidget();
    fireEvent.click(screen.getByText('Online Updates'));
    await waitFor(() => {
      expect(screen.getByText('completed')).toBeInTheDocument();
      expect(screen.getByText('running')).toBeInTheDocument();
      expect(screen.getByText('failed')).toBeInTheDocument();
    });
  });

  it('shows empty online updates message', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const u = String(url);
      if (u.includes('online-updates')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(datasetStatus) } as Response);
    });
    renderWidget();
    fireEvent.click(screen.getByText('Online Updates'));
    await waitFor(() => {
      expect(screen.getByText('No online update jobs')).toBeInTheDocument();
    });
  });
});
