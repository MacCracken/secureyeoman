import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReplayBatchPanel } from './ReplayBatchPanel';

vi.mock('../../api/client', () => ({
  createReplayBatch: vi.fn(),
  fetchReplayJobs: vi.fn(),
  fetchReplayReport: vi.fn(),
  getAccessToken: vi.fn(() => null),
}));

const { createReplayBatch, fetchReplayJobs, fetchReplayReport } = await import('../../api/client');

const NOW = Date.now();

const REPLAY_JOB = {
  id: 'job-1',
  status: 'completed' as const,
  sourceConversationIds: ['conv-1', 'conv-2'],
  replayModel: 'gpt-4',
  replayProvider: 'openai',
  replayPersonalityId: null,
  totalConversations: 2,
  completedConversations: 2,
  failedConversations: 0,
  errorMessage: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const REPORT = {
  job: REPLAY_JOB,
  results: [
    {
      id: 'r1',
      replayJobId: 'job-1',
      sourceConversationId: 'conv-1',
      replayConversationId: 'rep-1',
      sourceModel: null,
      replayModel: 'gpt-4',
      sourceQualityScore: 0.6,
      replayQualityScore: 0.8,
      pairwiseWinner: 'replay' as const,
      pairwiseReason: 'Higher quality',
      createdAt: NOW,
    },
  ],
  summary: {
    sourceWins: 0,
    replayWins: 1,
    ties: 1,
    avgSourceQuality: 0.6,
    avgReplayQuality: 0.8,
  },
};

function renderPanel(props?: Partial<Parameters<typeof ReplayBatchPanel>[0]>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ReplayBatchPanel
        selectedConversationIds={['conv-1', 'conv-2']}
        onClearSelection={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  );
}

describe('ReplayBatchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchReplayJobs).mockResolvedValue({ jobs: [REPLAY_JOB] });
    vi.mocked(fetchReplayReport).mockResolvedValue(REPORT);
    vi.mocked(createReplayBatch).mockResolvedValue(REPLAY_JOB);
  });

  it('renders the panel', () => {
    renderPanel();
    expect(screen.getByTestId('replay-batch-panel')).toBeInTheDocument();
    expect(screen.getByText('Batch Replay')).toBeInTheDocument();
  });

  it('shows selected count', () => {
    renderPanel({ selectedConversationIds: ['a', 'b', 'c'] });
    expect(screen.getByText('3 conversations selected')).toBeInTheDocument();
  });

  it('submit disabled without model/provider', () => {
    renderPanel();
    expect(screen.getByTestId('batch-submit')).toBeDisabled();
  });

  it('submits batch replay', async () => {
    const onClear = vi.fn();
    renderPanel({ onClearSelection: onClear });
    const user = userEvent.setup();

    await user.type(screen.getByTestId('batch-model-input'), 'gpt-4');
    await user.type(screen.getByTestId('batch-provider-input'), 'openai');
    await user.click(screen.getByTestId('batch-submit'));

    await waitFor(() => {
      expect(createReplayBatch).toHaveBeenCalledWith({
        sourceConversationIds: ['conv-1', 'conv-2'],
        replayModel: 'gpt-4',
        replayProvider: 'openai',
      });
    });
  });

  it('renders job list', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId('job-list')).toBeInTheDocument();
      expect(screen.getByText('gpt-4')).toBeInTheDocument();
    });
  });

  it('shows report on click', async () => {
    renderPanel();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByTestId('view-report-job-1')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('view-report-job-1'));

    await waitFor(() => {
      expect(screen.getByTestId('report-view')).toBeInTheDocument();
      expect(screen.getByTestId('report-table')).toBeInTheDocument();
    });
  });
});
