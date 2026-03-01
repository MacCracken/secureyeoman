// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TrainingTab } from './TrainingTab';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchTrainingStats: vi.fn(),
    exportTrainingDataset: vi.fn(),
    fetchDistillationJobs: vi.fn(),
    createDistillationJob: vi.fn(),
    deleteDistillationJob: vi.fn(),
    runDistillationJob: vi.fn(),
    fetchFinetuneJobs: vi.fn(),
    createFinetuneJob: vi.fn(),
    deleteFinetuneJob: vi.fn(),
    registerFinetuneAdapter: vi.fn(),
  };
});

import * as api from '../api/client';

const mockFetchTrainingStats = vi.mocked(api.fetchTrainingStats);
const mockExportTrainingDataset = vi.mocked(api.exportTrainingDataset);
const mockFetchDistillationJobs = vi.mocked(api.fetchDistillationJobs);
const mockRunDistillationJob = vi.mocked(api.runDistillationJob);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <TrainingTab />
    </QueryClientProvider>
  );
}

const MOCK_STATS = { conversations: 120, memories: 55, knowledge: 18 };

describe('TrainingTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchTrainingStats.mockResolvedValue(MOCK_STATS);
    mockExportTrainingDataset.mockResolvedValue({
      url: 'blob:mock-url',
      filename: 'training-export-2026-02-27.jsonl',
    });
    mockFetchDistillationJobs.mockResolvedValue([]);
    vi.mocked(api.fetchFinetuneJobs).mockResolvedValue([]);
  });

  it('renders the Training Dataset Export heading', async () => {
    renderComponent();
    expect(await screen.findByText('Training Dataset Export')).toBeInTheDocument();
  });

  it('shows stats after loading', async () => {
    renderComponent();
    expect(await screen.findByText('120')).toBeInTheDocument();
    expect(screen.getByText('55')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
  });

  it('shows loading state while fetching stats', () => {
    mockFetchTrainingStats.mockReturnValue(new Promise(() => {})); // never resolves
    renderComponent();
    expect(screen.getByText(/loading stats/i)).toBeInTheDocument();
  });

  it('shows error state when stats fail', async () => {
    mockFetchTrainingStats.mockRejectedValue(new Error('Network error'));
    renderComponent();
    expect(
      await screen.findByText('Could not load stats', {}, { timeout: 3000 })
    ).toBeInTheDocument();
  });

  it('renders all three format radio options', async () => {
    renderComponent();
    await screen.findByText('Training Dataset Export');
    expect(screen.getByDisplayValue('sharegpt')).toBeInTheDocument();
    expect(screen.getByDisplayValue('instruction')).toBeInTheDocument();
    expect(screen.getByDisplayValue('raw')).toBeInTheDocument();
  });

  it('defaults to sharegpt format selected', async () => {
    renderComponent();
    await screen.findByText('Training Dataset Export');
    const radio = screen.getByDisplayValue('sharegpt') as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it('allows changing to instruction format', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Training Dataset Export');
    const radio = screen.getByDisplayValue('instruction') as HTMLInputElement;
    await user.click(radio);
    expect(radio.checked).toBe(true);
  });

  it('renders the Download Dataset button', async () => {
    renderComponent();
    expect(await screen.findByRole('button', { name: /download dataset/i })).toBeInTheDocument();
  });

  it('disables Download button when conversations = 0', async () => {
    mockFetchTrainingStats.mockResolvedValue({ conversations: 0, memories: 0, knowledge: 0 });
    renderComponent();
    const btn = await screen.findByRole('button', { name: /download dataset/i });
    expect(btn).toBeDisabled();
  });

  it('enables Download button when conversations > 0', async () => {
    renderComponent();
    // Wait for stats to load first (conversations: 120 enables the button)
    await screen.findByText('120');
    const btn = screen.getByRole('button', { name: /download dataset/i });
    expect(btn).not.toBeDisabled();
  });

  it('calls exportTrainingDataset on Download button click', async () => {
    const user = userEvent.setup();
    // Mock DOM anchor click to avoid jsdom errors
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderComponent();
    const btn = await screen.findByRole('button', { name: /download dataset/i });
    await user.click(btn);
    await waitFor(() => {
      expect(mockExportTrainingDataset).toHaveBeenCalledWith({
        format: 'sharegpt',
        limit: 10000,
      });
    });
    clickSpy.mockRestore();
  });

  it('shows error message when export fails', async () => {
    mockExportTrainingDataset.mockRejectedValue(new Error('Export failed: server error'));
    const user = userEvent.setup();
    renderComponent();
    const btn = await screen.findByRole('button', { name: /download dataset/i });
    await user.click(btn);
    await waitFor(() => {
      expect(screen.getByText(/export failed: server error/i)).toBeInTheDocument();
    });
  });

  it('renders the Local Training Pipeline guide', async () => {
    renderComponent();
    expect(await screen.findByText('Local Training Pipeline')).toBeInTheDocument();
    // sentence-transformers appears in both step label text and code snippet — use getAllByText
    expect(screen.getAllByText(/sentence-transformers/i).length).toBeGreaterThan(0);
    // "Serve via Ollama" step title
    expect(screen.getByText(/serve via ollama/i)).toBeInTheDocument();
  });

  it('renders the max conversations input', async () => {
    renderComponent();
    await screen.findByText('Training Dataset Export');
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('10000');
  });

  it('uses custom limit when changed', async () => {
    const user = userEvent.setup();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderComponent();
    const input = await screen.findByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '500');
    const btn = screen.getByRole('button', { name: /download dataset/i });
    await user.click(btn);
    await waitFor(() => {
      expect(mockExportTrainingDataset).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 500 })
      );
    });
    clickSpy.mockRestore();
  });
});

describe('TrainingTab — Distillation tab', () => {
  const MOCK_PENDING_JOB = {
    id: 'job-1',
    name: 'Test distillation',
    teacherProvider: 'anthropic',
    teacherModel: 'claude-opus-4-6',
    exportFormat: 'sharegpt' as const,
    maxSamples: 100,
    personalityIds: [],
    outputPath: '/tmp/out.jsonl',
    status: 'pending' as const,
    samplesGenerated: 0,
    errorMessage: null,
    createdAt: Date.now(),
    completedAt: null,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchTrainingStats.mockResolvedValue({ conversations: 5, memories: 0, knowledge: 0 });
    mockExportTrainingDataset.mockResolvedValue({ url: 'blob:x', filename: 'x.jsonl' });
    vi.mocked(api.fetchFinetuneJobs).mockResolvedValue([]);
  });

  function setup() {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={createQueryClient()}>
        <TrainingTab />
      </QueryClientProvider>
    );
    return user;
  }

  async function switchToDistillationTab(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('tab', { name: /distillation/i }));
  }

  it('shows Run button for pending jobs', async () => {
    mockFetchDistillationJobs.mockResolvedValue([MOCK_PENDING_JOB]);
    const user = setup();
    await switchToDistillationTab(user);
    expect(await screen.findByTitle('Run job')).toBeInTheDocument();
  });

  it('calls runDistillationJob when Run button is clicked', async () => {
    mockFetchDistillationJobs.mockResolvedValue([MOCK_PENDING_JOB]);
    mockRunDistillationJob.mockResolvedValue({ id: 'job-1', status: 'running' });
    const user = setup();
    await switchToDistillationTab(user);
    await user.click(await screen.findByTitle('Run job'));
    // TanStack Query v5 passes a context object as the second argument to mutationFn
    expect(mockRunDistillationJob).toHaveBeenCalledWith('job-1', expect.any(Object));
  });

  it('shows Retry button for failed jobs', async () => {
    mockFetchDistillationJobs.mockResolvedValue([{ ...MOCK_PENDING_JOB, status: 'failed' }]);
    const user = setup();
    await switchToDistillationTab(user);
    expect(await screen.findByTitle('Retry job')).toBeInTheDocument();
  });

  it('does not show Run button for running or complete jobs', async () => {
    mockFetchDistillationJobs.mockResolvedValue([{ ...MOCK_PENDING_JOB, status: 'running' }]);
    const user = setup();
    await switchToDistillationTab(user);
    await screen.findByText('Test distillation');
    expect(screen.queryByTitle('Run job')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Retry job')).not.toBeInTheDocument();
  });
});
