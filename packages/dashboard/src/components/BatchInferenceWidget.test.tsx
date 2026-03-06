// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BatchInferenceWidget from './BatchInferenceWidget';

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
      <BatchInferenceWidget />
    </QueryClientProvider>
  );
}

const mockJobs = [
  {
    id: 'b1',
    name: 'eval-batch',
    status: 'completed',
    totalPrompts: 5,
    completedPrompts: 5,
    concurrency: 4,
    results: [
      {
        promptIndex: 0,
        prompt: 'Explain AI',
        output: 'AI is...',
        latencyMs: 120,
        status: 'completed',
      },
      {
        promptIndex: 1,
        prompt: 'Summarize',
        output: 'Summary...',
        latencyMs: 200,
        status: 'failed',
      },
    ],
    createdAt: '2026-03-01T00:00:00Z',
  },
  {
    id: 'b2',
    name: 'test-batch',
    status: 'running',
    totalPrompts: 10,
    completedPrompts: 3,
    concurrency: 2,
    results: [],
    createdAt: '2026-03-01T01:00:00Z',
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('BatchInferenceWidget', () => {
  it('shows loading state', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderWidget();
    expect(screen.getByText('Loading batch jobs...')).toBeInTheDocument();
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

  it('renders heading and form', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Batch Inference')).toBeInTheDocument();
      expect(screen.getByText('New Batch Job')).toBeInTheDocument();
    });
  });

  it('shows form fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('batch-eval-01')).toBeInTheDocument();
      expect(screen.getByText('Prompts (one per line)')).toBeInTheDocument();
      expect(screen.getByText('Concurrency: 4')).toBeInTheDocument();
      expect(screen.getByText('Submit Batch')).toBeInTheDocument();
    });
  });

  it('submit button is disabled when fields are empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Submit Batch')).toBeDisabled();
    });
  });

  it('renders job cards with progress', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockJobs),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('eval-batch')).toBeInTheDocument();
      expect(screen.getByText('test-batch')).toBeInTheDocument();
      expect(screen.getByText('5/5')).toBeInTheDocument();
      expect(screen.getByText('3/10')).toBeInTheDocument();
    });
  });

  it('renders results table for completed job', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockJobs),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Explain AI')).toBeInTheDocument();
      expect(screen.getByText('120ms')).toBeInTheDocument();
      expect(screen.getByText('200ms')).toBeInTheDocument();
    });
  });

  it('shows job status badges', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockJobs),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('completed')).toBeInTheDocument();
      expect(screen.getByText('running')).toBeInTheDocument();
    });
  });

  it('updates concurrency slider', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Concurrency: 4')).toBeInTheDocument();
    });
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '8' } });
    expect(screen.getByText('Concurrency: 8')).toBeInTheDocument();
  });

  it('submits batch job with prompts', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
    renderWidget();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('batch-eval-01')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('batch-eval-01'), {
      target: { value: 'my-batch' },
    });
    const textarea = screen.getByPlaceholderText(/Explain quantum/);
    fireEvent.change(textarea, { target: { value: 'Hello\nWorld' } });
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'new' }),
    } as Response);
    fireEvent.click(screen.getByText('Submit Batch'));
    await waitFor(() => {
      const postCalls = fetchSpy.mock.calls.filter((c) => {
        const opts = c[1] as RequestInit | undefined;
        return opts?.method === 'POST';
      });
      expect(postCalls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
