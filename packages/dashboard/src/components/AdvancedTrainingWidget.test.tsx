// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdvancedTrainingWidget from './AdvancedTrainingWidget';

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
      <AdvancedTrainingWidget />
    </QueryClientProvider>
  );
}

const mockJobs = [
  {
    id: 'tj1',
    method: 'sft',
    gpuCount: 2,
    status: 'running',
    currentStep: 50,
    totalSteps: 100,
    checkpoints: [
      { id: 'cp1', step: 25, loss: 0.45, date: '2026-03-01T00:00:00Z', path: '/ckpt/25' },
      { id: 'cp2', step: 50, loss: 0.32, date: '2026-03-01T01:00:00Z', path: '/ckpt/50' },
    ],
  },
  {
    id: 'tj2',
    method: 'dpo',
    gpuCount: 4,
    status: 'completed',
    currentStep: 200,
    totalSteps: 200,
    checkpoints: [],
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('AdvancedTrainingWidget', () => {
  it('shows loading state', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderWidget();
    expect(screen.getByText('Loading training data...')).toBeInTheDocument();
  });

  it('shows error state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Error',
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText(/Error loading training data/)).toBeInTheDocument();
    });
  });

  it('renders heading', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Advanced Training')).toBeInTheDocument();
    });
  });

  it('shows training method selector with SFT, DPO, RLHF', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('SFT')).toBeInTheDocument();
      expect(screen.getByText('DPO')).toBeInTheDocument();
      expect(screen.getByText('RLHF')).toBeInTheDocument();
      expect(screen.getByText('- Supervised Fine-Tuning')).toBeInTheDocument();
    });
  });

  it('shows GPU count slider', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('GPU Count')).toBeInTheDocument();
      expect(screen.getByRole('slider')).toBeInTheDocument();
    });
  });

  it('shows Start Training button', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Start Training')).toBeInTheDocument();
    });
  });

  it('shows Training in Progress when active job exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockJobs),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Training in Progress...')).toBeInTheDocument();
    });
  });

  it('shows active job progress with step count', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockJobs),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Running: SFT on 2 GPU(s)')).toBeInTheDocument();
      expect(screen.getByText('50/100')).toBeInTheDocument();
    });
  });

  it('renders checkpoints with Resume buttons', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockJobs),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Checkpoints')).toBeInTheDocument();
      expect(screen.getByText('Step 25')).toBeInTheDocument();
      expect(screen.getByText('Step 50')).toBeInTheDocument();
      expect(screen.getAllByText('Resume').length).toBe(2);
    });
  });

  it('shows loss values in checkpoints', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockJobs),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Loss: 0.4500')).toBeInTheDocument();
      expect(screen.getByText('Loss: 0.3200')).toBeInTheDocument();
    });
  });

  it('shows no checkpoints message when empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'tj3',
            method: 'rlhf',
            gpuCount: 1,
            status: 'completed',
            currentStep: 10,
            totalSteps: 10,
            checkpoints: [],
          },
        ]),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('No checkpoints yet')).toBeInTheDocument();
    });
  });

  it('updates GPU count via slider', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByRole('slider')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByRole('slider'), { target: { value: '4' } });
    expect(screen.getByText('4')).toBeInTheDocument();
  });
});
