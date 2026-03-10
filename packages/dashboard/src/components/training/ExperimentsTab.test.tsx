// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExperimentsTab } from './ExperimentsTab';

vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => <div />,
  CartesianGrid: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
  RadarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="radar-chart">{children}</div>
  ),
  Radar: () => <div />,
  PolarGrid: () => <div />,
  PolarAngleAxis: () => <div />,
  PolarRadiusAxis: () => <div />,
}));

vi.mock('../../api/client', () => ({
  fetchTrainingExperiments: vi.fn(),
  createTrainingExperiment: vi.fn(),
  deleteTrainingExperiment: vi.fn(),
  getTrainingExperiment: vi.fn(),
  diffTrainingExperiments: vi.fn(),
}));

import * as api from '../../api/client';

function renderTab() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ExperimentsTab />
    </QueryClientProvider>
  );
}

const mockExperiments = [
  {
    id: 'exp1',
    name: 'Fine-tune GPT',
    status: 'running',
    createdAt: Date.now(),
    metrics: { loss: 0.5 },
    hyperparameters: { lr: 0.001, epochs: 10 },
    lossCurve: [
      { step: 1, loss: 1.0 },
      { step: 2, loss: 0.5 },
    ],
    evalMetrics: { accuracy: 4.2, coherence: 3.8 },
    environment: {},
    notes: 'Testing GPT fine-tune',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'exp2',
    name: 'BERT Training',
    status: 'completed',
    createdAt: Date.now() - 86400000,
    metrics: { loss: 0.3, accuracy: 0.95 },
    hyperparameters: {},
    lossCurve: [],
    evalMetrics: {},
    environment: {},
    notes: null,
    updatedAt: new Date().toISOString(),
  },
];

describe('ExperimentsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchTrainingExperiments).mockResolvedValue({ experiments: [] } as never);
  });

  it('should render the experiments tab', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('No experiments yet.')).toBeInTheDocument();
    });
  });

  it('should show create experiment form', () => {
    renderTab();
    expect(screen.getByPlaceholderText('Experiment name...')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('should show no experiments message when empty', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('No experiments yet.')).toBeInTheDocument();
    });
  });

  it('should show experiments list when data available', async () => {
    vi.mocked(api.fetchTrainingExperiments).mockResolvedValue({
      experiments: mockExperiments,
    } as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getAllByText('Fine-tune GPT').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('BERT Training').length).toBeGreaterThan(0);
    expect(screen.getByText('Compare two experiments:')).toBeInTheDocument();
  });

  it('should show status badges for experiments', async () => {
    vi.mocked(api.fetchTrainingExperiments).mockResolvedValue({
      experiments: [
        { id: 'exp1', name: 'Exp 1', status: 'running', createdAt: Date.now(), metrics: {} },
        { id: 'exp2', name: 'Exp 2', status: 'completed', createdAt: Date.now(), metrics: {} },
        { id: 'exp3', name: 'Exp 3', status: 'failed', createdAt: Date.now(), metrics: {} },
        { id: 'exp4', name: 'Exp 4', status: 'draft', createdAt: Date.now(), metrics: {} },
      ],
    } as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getByText('running')).toBeInTheDocument();
    });
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
  });

  it('should disable Create button when name is empty', () => {
    renderTab();
    expect(screen.getByText('Create')).toBeDisabled();
  });

  it('should call createTrainingExperiment on Create', async () => {
    vi.mocked(api.createTrainingExperiment).mockResolvedValue({} as never);
    renderTab();

    fireEvent.change(screen.getByPlaceholderText('Experiment name...'), {
      target: { value: 'New Experiment' },
    });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(api.createTrainingExperiment).toHaveBeenCalled();
    });
  });

  it('should show comparison selectors when 2+ experiments', async () => {
    vi.mocked(api.fetchTrainingExperiments).mockResolvedValue({
      experiments: mockExperiments,
    } as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getAllByText('Fine-tune GPT').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('Select A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Select B').length).toBeGreaterThan(0);
  });

  it('should show loading state', () => {
    vi.mocked(api.fetchTrainingExperiments).mockReturnValue(new Promise(() => {}) as never);
    renderTab();
    expect(screen.getByText(/Loading experiments/)).toBeInTheDocument();
  });

  it('should show experiment detail when experiment is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchTrainingExperiments).mockResolvedValue({
      experiments: mockExperiments,
    } as never);
    vi.mocked(api.getTrainingExperiment).mockResolvedValue(mockExperiments[0] as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getAllByText('Fine-tune GPT').length).toBeGreaterThan(0);
    });

    // Click the experiment row (the div containing the name)
    const expRows = screen.getAllByText('Fine-tune GPT');
    await user.click(expRows[0].closest('[class*="cursor-pointer"]')!);

    await waitFor(() => {
      expect(api.getTrainingExperiment).toHaveBeenCalledWith('exp1');
    });
  });

  it('should show placeholder text when no experiment is selected', async () => {
    vi.mocked(api.fetchTrainingExperiments).mockResolvedValue({
      experiments: mockExperiments,
    } as never);
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Select an experiment to view details')).toBeInTheDocument();
    });
  });

  it('should delete experiment when delete button clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchTrainingExperiments).mockResolvedValue({
      experiments: mockExperiments,
    } as never);
    vi.mocked(api.deleteTrainingExperiment).mockResolvedValue(undefined as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getAllByText('Fine-tune GPT').length).toBeGreaterThan(0);
    });

    // Find delete buttons (Trash2 icons wrapped in buttons)
    const deleteButtons = screen.getAllByRole('button').filter((btn) => {
      return btn.querySelector('svg') && btn.className.includes('hover:text-destructive');
    });
    expect(deleteButtons.length).toBeGreaterThan(0);
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(api.deleteTrainingExperiment).toHaveBeenCalled();
    });
  });

  it('should enable Create button when name has non-whitespace text', () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText('Experiment name...'), {
      target: { value: 'My Exp' },
    });
    expect(screen.getByText('Create')).not.toBeDisabled();
  });

  it('should not call create when name is only whitespace', async () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText('Experiment name...'), {
      target: { value: '   ' },
    });
    expect(screen.getByText('Create')).toBeDisabled();
  });

  it('should show experiment count in header', async () => {
    vi.mocked(api.fetchTrainingExperiments).mockResolvedValue({
      experiments: mockExperiments,
    } as never);
    renderTab();
    await waitFor(() => {
      expect(screen.getByText(/Experiments \(2\)/)).toBeInTheDocument();
    });
  });

  it('should show experiment detail with hyperparameters', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchTrainingExperiments).mockResolvedValue({
      experiments: mockExperiments,
    } as never);
    vi.mocked(api.getTrainingExperiment).mockResolvedValue(mockExperiments[0] as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getAllByText('Fine-tune GPT').length).toBeGreaterThan(0);
    });

    const expRows = screen.getAllByText('Fine-tune GPT');
    await user.click(expRows[0].closest('[class*="cursor-pointer"]')!);

    await waitFor(() => {
      expect(screen.getByText('Hyperparameters')).toBeInTheDocument();
    });
    expect(screen.getByText('lr:')).toBeInTheDocument();
    expect(screen.getByText('0.001')).toBeInTheDocument();
  });

  it('should show experiment detail with notes', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchTrainingExperiments).mockResolvedValue({
      experiments: mockExperiments,
    } as never);
    vi.mocked(api.getTrainingExperiment).mockResolvedValue(mockExperiments[0] as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getAllByText('Fine-tune GPT').length).toBeGreaterThan(0);
    });

    const expRows = screen.getAllByText('Fine-tune GPT');
    await user.click(expRows[0].closest('[class*="cursor-pointer"]')!);

    await waitFor(() => {
      expect(screen.getByText('Testing GPT fine-tune')).toBeInTheDocument();
    });
  });

  it('should show loss curve chart in experiment detail', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchTrainingExperiments).mockResolvedValue({
      experiments: mockExperiments,
    } as never);
    vi.mocked(api.getTrainingExperiment).mockResolvedValue(mockExperiments[0] as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getAllByText('Fine-tune GPT').length).toBeGreaterThan(0);
    });

    const expRows = screen.getAllByText('Fine-tune GPT');
    await user.click(expRows[0].closest('[class*="cursor-pointer"]')!);

    await waitFor(() => {
      expect(screen.getByText('Loss Curve')).toBeInTheDocument();
    });
  });

  it('should show eval metrics radar chart in experiment detail', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchTrainingExperiments).mockResolvedValue({
      experiments: mockExperiments,
    } as never);
    vi.mocked(api.getTrainingExperiment).mockResolvedValue(mockExperiments[0] as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getAllByText('Fine-tune GPT').length).toBeGreaterThan(0);
    });

    const expRows = screen.getAllByText('Fine-tune GPT');
    await user.click(expRows[0].closest('[class*="cursor-pointer"]')!);

    await waitFor(() => {
      expect(screen.getByText('Eval Metrics')).toBeInTheDocument();
    });
  });

  it('should show diff view when two experiments are compared', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchTrainingExperiments).mockResolvedValue({
      experiments: mockExperiments,
    } as never);
    vi.mocked(api.diffTrainingExperiments).mockResolvedValue({
      hyperparamDiffs: { lr: { a: 0.001, b: 0.01 } },
      metricDiffs: { accuracy: { a: 0.9, b: 0.95 } },
      lossCurveA: [{ step: 1, loss: 1.0 }],
      lossCurveB: [{ step: 1, loss: 0.8 }],
    } as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getAllByText('Fine-tune GPT').length).toBeGreaterThan(0);
    });

    // Select experiment A
    const selects = screen.getAllByRole('combobox').filter((s) => {
      const options = s.querySelectorAll('option');
      return Array.from(options).some((o) => o.textContent === 'Select A');
    });

    if (selects.length > 0) {
      await user.selectOptions(selects[0], 'exp1');
    }

    // Select experiment B
    const selectsB = screen.getAllByRole('combobox').filter((s) => {
      const options = s.querySelectorAll('option');
      return Array.from(options).some((o) => o.textContent === 'Select B');
    });

    if (selectsB.length > 0) {
      await user.selectOptions(selectsB[0], 'exp2');
    }

    await waitFor(() => {
      expect(api.diffTrainingExperiments).toHaveBeenCalledWith('exp1', 'exp2');
    });

    await waitFor(() => {
      expect(screen.getByText('Experiment Diff')).toBeInTheDocument();
      expect(screen.getByText('Hyperparameter Differences')).toBeInTheDocument();
      expect(screen.getByText('Metric Differences')).toBeInTheDocument();
      expect(screen.getByText('Loss Curves')).toBeInTheDocument();
    });
  });

  it('should show dates for experiments', async () => {
    vi.mocked(api.fetchTrainingExperiments).mockResolvedValue({
      experiments: mockExperiments,
    } as never);
    renderTab();
    await waitFor(() => {
      // Experiment dates should be displayed
      expect(screen.getAllByText(/\d+\/\d+\/\d+/).length).toBeGreaterThan(0);
    });
  });
});
