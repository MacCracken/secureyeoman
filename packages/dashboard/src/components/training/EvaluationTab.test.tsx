// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
  RadarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="radar-mock">{children}</div>,
  Radar: () => null,
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-mock">{children}</div>,
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

const NOW = 1_700_000_000_000;

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
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
});
