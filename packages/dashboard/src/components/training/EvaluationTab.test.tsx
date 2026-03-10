// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EvaluationTab } from './EvaluationTab';

vi.mock('../../api/client', () => ({
  fetchEvalDatasets: vi.fn(),
  createEvalDataset: vi.fn(),
  deleteEvalDataset: vi.fn(),
  runPointwiseEval: vi.fn(),
  fetchEvalRuns: vi.fn(),
  fetchEvalRunScores: vi.fn(),
  runPairwiseComparison: vi.fn(),
  fetchPairwiseComparisons: vi.fn(),
  fetchPairwiseDetails: vi.fn(),
  getAccessToken: vi.fn(() => null),
}));

// Mock recharts to avoid canvas rendering issues in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  RadarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="radar-mock">{children}</div>
  ),
  Radar: () => null,
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-mock">{children}</div>
  ),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
}));

import * as api from '../../api/client';

const mockFetchDatasets = vi.mocked(api.fetchEvalDatasets);
const mockCreateDataset = vi.mocked(api.createEvalDataset);
const mockDeleteDataset = vi.mocked(api.deleteEvalDataset);
const mockFetchRuns = vi.mocked(api.fetchEvalRuns);
const mockFetchComparisons = vi.mocked(api.fetchPairwiseComparisons);
const mockRunPointwise = vi.mocked(api.runPointwiseEval);
const mockRunPairwise = vi.mocked(api.runPairwiseComparison);

const NOW = 1_700_000_000_000;

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchDatasets.mockResolvedValue([]);
  mockFetchRuns.mockResolvedValue([]);
  mockFetchComparisons.mockResolvedValue([]);
});

describe('EvaluationTab', () => {
  it('renders the evaluation tab with all sections', async () => {
    wrap(<EvaluationTab />);
    expect(screen.getByTestId('evaluation-tab')).toBeInTheDocument();
    expect(screen.getByText('LLM-as-Judge Evaluation')).toBeInTheDocument();
    expect(screen.getByText('Eval Datasets')).toBeInTheDocument();
    expect(screen.getByText('Pointwise Evaluation')).toBeInTheDocument();
    expect(screen.getByText('Pairwise Comparison')).toBeInTheDocument();
    expect(screen.getByText('Auto-Eval Configuration')).toBeInTheDocument();
  });

  it('shows empty state when no datasets', async () => {
    mockFetchDatasets.mockResolvedValue([]);
    wrap(<EvaluationTab />);
    await waitFor(() => {
      expect(screen.getByText('No eval datasets yet.')).toBeInTheDocument();
    });
  });

  it('displays datasets when available', async () => {
    mockFetchDatasets.mockResolvedValue([
      {
        id: 'd-1',
        name: 'Test Dataset',
        personalityId: null,
        contentHash: 'abc',
        samples: [{ prompt: 'Hello' }],
        sampleCount: 1,
        judgePrompt: null,
        judgeModel: null,
        createdAt: NOW,
      },
    ]);
    wrap(<EvaluationTab />);
    await waitFor(() => {
      expect(screen.getAllByText('Test Dataset').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/1 samples/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows create form when clicking New Dataset', async () => {
    wrap(<EvaluationTab />);
    const newBtn = screen.getByText('New Dataset');
    fireEvent.click(newBtn);
    expect(screen.getByPlaceholderText('Dataset name')).toBeInTheDocument();
  });

  it('displays eval run with radar chart when runs exist', async () => {
    mockFetchRuns.mockResolvedValue([
      {
        evalRunId: 'r-1',
        datasetId: 'd-1',
        modelName: 'llama3',
        sampleCount: 5,
        avgGroundedness: 4.2,
        avgCoherence: 3.8,
        avgRelevance: 4.0,
        avgFluency: 4.5,
        avgHarmlessness: 4.8,
        scoredAt: NOW,
      },
    ]);
    wrap(<EvaluationTab />);
    await waitFor(() => {
      expect(screen.getAllByText(/llama3/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
    });
  });

  it('displays pairwise comparisons', async () => {
    mockFetchComparisons.mockResolvedValue([
      {
        comparisonId: 'c-1',
        datasetId: 'd-1',
        modelA: 'llama3',
        modelB: 'mistral',
        sampleCount: 10,
        winsA: 6,
        winsB: 3,
        ties: 1,
        winRateA: 0.6,
        winRateB: 0.3,
        scoredAt: NOW,
      },
    ]);
    wrap(<EvaluationTab />);
    await waitFor(() => {
      expect(screen.getByText('6W')).toBeInTheDocument();
      expect(screen.getByText('3W')).toBeInTheDocument();
      expect(screen.getByText('1T')).toBeInTheDocument();
    });
  });

  it('shows auto-eval threshold inputs', () => {
    wrap(<EvaluationTab />);
    const inputs = screen.getAllByRole('spinbutton');
    const thresholdInputs = inputs.filter(
      (el) => el.getAttribute('min') === '1' && el.getAttribute('max') === '5'
    );
    expect(thresholdInputs).toHaveLength(2);
  });

  it('displays the auto-eval gate explanation', () => {
    wrap(<EvaluationTab />);
    expect(screen.getByText(/pass the auto-eval gate/)).toBeInTheDocument();
  });

  // --- New tests for better coverage ---

  it('shows create form with Cancel button and hides on cancel', async () => {
    const user = userEvent.setup();
    wrap(<EvaluationTab />);
    await user.click(screen.getByText('New Dataset'));
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Dataset name')).toBeInTheDocument();
    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('Dataset name')).not.toBeInTheDocument();
  });

  it('shows Create button disabled when fields empty', async () => {
    const user = userEvent.setup();
    wrap(<EvaluationTab />);
    await user.click(screen.getByText('New Dataset'));
    const createBtn = screen.getByRole('button', { name: 'Create' });
    expect(createBtn).toBeDisabled();
  });

  it('calls createEvalDataset with valid JSON samples', async () => {
    const user = userEvent.setup();
    mockCreateDataset.mockResolvedValue({} as never);
    wrap(<EvaluationTab />);
    await user.click(screen.getByText('New Dataset'));

    fireEvent.change(screen.getByPlaceholderText('Dataset name'), {
      target: { value: 'My Dataset' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Samples JSON/), {
      target: { value: '[{"prompt":"Hello","gold":"World"}]' },
    });

    const createBtn = screen.getByRole('button', { name: 'Create' });
    expect(createBtn).not.toBeDisabled();
    await user.click(createBtn);

    await waitFor(() => {
      expect(mockCreateDataset).toHaveBeenCalled();
    });
  });

  it('does not call createEvalDataset with invalid JSON', async () => {
    const user = userEvent.setup();
    wrap(<EvaluationTab />);
    await user.click(screen.getByText('New Dataset'));

    fireEvent.change(screen.getByPlaceholderText('Dataset name'), {
      target: { value: 'Bad Dataset' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Samples JSON/), {
      target: { value: 'not valid json' },
    });

    const createBtn = screen.getByRole('button', { name: 'Create' });
    await user.click(createBtn);

    expect(mockCreateDataset).not.toHaveBeenCalled();
  });

  it('does not call createEvalDataset with empty array JSON', async () => {
    const user = userEvent.setup();
    wrap(<EvaluationTab />);
    await user.click(screen.getByText('New Dataset'));

    fireEvent.change(screen.getByPlaceholderText('Dataset name'), {
      target: { value: 'Empty Dataset' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Samples JSON/), {
      target: { value: '[]' },
    });

    const createBtn = screen.getByRole('button', { name: 'Create' });
    await user.click(createBtn);

    expect(mockCreateDataset).not.toHaveBeenCalled();
  });

  it('shows delete button for datasets and calls deleteEvalDataset', async () => {
    const user = userEvent.setup();
    mockFetchDatasets.mockResolvedValue([
      {
        id: 'd-1',
        name: 'Dataset to Delete',
        personalityId: null,
        contentHash: 'abc',
        samples: [],
        sampleCount: 3,
        judgePrompt: null,
        judgeModel: null,
        createdAt: NOW,
      },
    ]);
    mockDeleteDataset.mockResolvedValue(undefined as never);
    wrap(<EvaluationTab />);

    await waitFor(() => {
      expect(screen.getAllByText('Dataset to Delete').length).toBeGreaterThanOrEqual(1);
    });

    const deleteBtn = screen.getByTitle('Delete dataset');
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(mockDeleteDataset).toHaveBeenCalled();
    });
  });

  it('shows dataset selector in pointwise eval section', async () => {
    mockFetchDatasets.mockResolvedValue([
      {
        id: 'd-1',
        name: 'Eval DS',
        personalityId: null,
        contentHash: 'abc',
        samples: [],
        sampleCount: 5,
        judgePrompt: null,
        judgeModel: null,
        createdAt: NOW,
      },
    ]);
    wrap(<EvaluationTab />);
    await waitFor(() => {
      expect(screen.getAllByText(/Eval DS/).length).toBeGreaterThan(0);
    });
  });

  it('shows model input in pointwise eval section', () => {
    wrap(<EvaluationTab />);
    expect(screen.getAllByPlaceholderText('e.g. llama3:8b').length).toBeGreaterThanOrEqual(1);
  });

  it('disables Evaluate button when no dataset or model selected', () => {
    wrap(<EvaluationTab />);
    expect(screen.getByText('Evaluate')).toBeDisabled();
  });

  it('calls runPointwiseEval when Evaluate clicked with valid inputs', async () => {
    const user = userEvent.setup();
    mockFetchDatasets.mockResolvedValue([
      {
        id: 'd-1',
        name: 'Test DS',
        personalityId: null,
        contentHash: 'abc',
        samples: [],
        sampleCount: 5,
        judgePrompt: null,
        judgeModel: null,
        createdAt: NOW,
      },
    ]);
    mockRunPointwise.mockResolvedValue({} as never);

    wrap(<EvaluationTab />);

    await waitFor(() => {
      expect(screen.getAllByText(/Test DS/).length).toBeGreaterThan(0);
    });

    // Select dataset in pointwise section
    const datasetSelects = screen.getAllByRole('combobox').filter((s) => {
      const options = s.querySelectorAll('option');
      return Array.from(options).some((o) => o.textContent === 'Select dataset...');
    });
    if (datasetSelects.length > 0) {
      await user.selectOptions(datasetSelects[0], 'd-1');
    }

    const modelInputs = screen.getAllByPlaceholderText('e.g. llama3:8b');
    await user.type(modelInputs[0], 'test-model');
    await user.click(screen.getByText('Evaluate'));

    await waitFor(() => {
      expect(mockRunPointwise).toHaveBeenCalled();
    });
  });

  it('shows run history when eval runs exist', async () => {
    mockFetchRuns.mockResolvedValue([
      {
        evalRunId: 'r-1',
        datasetId: 'd-1',
        modelName: 'llama3',
        sampleCount: 5,
        avgGroundedness: 4.2,
        avgCoherence: 3.8,
        avgRelevance: 4.0,
        avgFluency: 4.5,
        avgHarmlessness: 4.8,
        scoredAt: NOW,
      },
      {
        evalRunId: 'r-2',
        datasetId: 'd-1',
        modelName: 'mistral',
        sampleCount: 3,
        avgGroundedness: 3.0,
        avgCoherence: 3.5,
        avgRelevance: 3.2,
        avgFluency: 3.8,
        avgHarmlessness: 4.0,
        scoredAt: NOW - 86400000,
      },
    ]);
    wrap(<EvaluationTab />);
    await waitFor(() => {
      expect(screen.getByText('Run History')).toBeInTheDocument();
    });
  });

  it('shows model A and model B inputs for pairwise comparison', () => {
    wrap(<EvaluationTab />);
    expect(screen.getByPlaceholderText('e.g. mistral:7b')).toBeInTheDocument();
  });

  it('disables Compare button when fields are empty', () => {
    wrap(<EvaluationTab />);
    expect(screen.getByText('Compare')).toBeDisabled();
  });

  it('shows win rate bar chart when comparisons have data', async () => {
    mockFetchComparisons.mockResolvedValue([
      {
        comparisonId: 'c-1',
        datasetId: 'd-1',
        modelA: 'llama3',
        modelB: 'mistral',
        sampleCount: 10,
        winsA: 6,
        winsB: 3,
        ties: 1,
        winRateA: 0.6,
        winRateB: 0.3,
        scoredAt: NOW,
      },
    ]);
    wrap(<EvaluationTab />);
    await waitFor(() => {
      expect(screen.getByText('Win Rates (%)')).toBeInTheDocument();
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });
  });

  it('shows sample count in pairwise comparisons', async () => {
    mockFetchComparisons.mockResolvedValue([
      {
        comparisonId: 'c-1',
        datasetId: 'd-1',
        modelA: 'llama3',
        modelB: 'mistral',
        sampleCount: 10,
        winsA: 6,
        winsB: 3,
        ties: 1,
        winRateA: 0.6,
        winRateB: 0.3,
        scoredAt: NOW,
      },
    ]);
    wrap(<EvaluationTab />);
    await waitFor(() => {
      expect(screen.getByText('10 samples')).toBeInTheDocument();
    });
  });

  it('updates auto-eval thresholds when changed', async () => {
    const user = userEvent.setup();
    wrap(<EvaluationTab />);

    const thresholdInputs = screen.getAllByRole('spinbutton').filter(
      (el) => el.getAttribute('min') === '1' && el.getAttribute('max') === '5'
    );

    await user.clear(thresholdInputs[0]);
    await user.type(thresholdInputs[0], '4.0');

    expect(thresholdInputs[0]).toHaveValue(4.0);
  });

  it('shows updated threshold values in explanation text', async () => {
    const user = userEvent.setup();
    wrap(<EvaluationTab />);

    const thresholdInputs = screen.getAllByRole('spinbutton').filter(
      (el) => el.getAttribute('min') === '1' && el.getAttribute('max') === '5'
    );

    await user.clear(thresholdInputs[0]);
    await user.type(thresholdInputs[0], '4.5');

    await waitFor(() => {
      expect(screen.getByText(/4\.5 on groundedness/)).toBeInTheDocument();
    });
  });

  it('shows latest run details with model name and sample count', async () => {
    mockFetchRuns.mockResolvedValue([
      {
        evalRunId: 'r-1',
        datasetId: 'd-1',
        modelName: 'llama3:8b',
        sampleCount: 15,
        avgGroundedness: 4.2,
        avgCoherence: 3.8,
        avgRelevance: 4.0,
        avgFluency: 4.5,
        avgHarmlessness: 4.8,
        scoredAt: NOW,
      },
    ]);
    wrap(<EvaluationTab />);
    await waitFor(() => {
      expect(screen.getByText(/15 samples/)).toBeInTheDocument();
    });
  });

  it('toggles New Dataset form on repeated clicks', async () => {
    const user = userEvent.setup();
    wrap(<EvaluationTab />);

    await user.click(screen.getByText('New Dataset'));
    expect(screen.getByPlaceholderText('Dataset name')).toBeInTheDocument();

    await user.click(screen.getByText('New Dataset'));
    expect(screen.queryByPlaceholderText('Dataset name')).not.toBeInTheDocument();
  });
});
