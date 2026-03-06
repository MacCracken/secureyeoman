// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

// ── Mock recharts ────────────────────────────────────────────────────────────
vi.mock('recharts', () => ({
  ResponsiveContainer: function ResponsiveContainer({ children }: { children: ReactNode }) {
    return <div data-testid="responsive-container">{children}</div>;
  },
  LineChart: function LineChart({ children }: { children: ReactNode }) {
    return <div data-testid="line-chart">{children}</div>;
  },
  Line: function Line() {
    return <div data-testid="line" />;
  },
  CartesianGrid: function CartesianGrid() {
    return <div />;
  },
  XAxis: function XAxis() {
    return <div />;
  },
  YAxis: function YAxis() {
    return <div />;
  },
  Tooltip: function Tooltip() {
    return <div />;
  },
  RadarChart: function RadarChart({ children }: { children: ReactNode }) {
    return <div data-testid="radar-chart">{children}</div>;
  },
  Radar: function Radar() {
    return <div />;
  },
  PolarGrid: function PolarGrid() {
    return <div />;
  },
  PolarAngleAxis: function PolarAngleAxis() {
    return <div />;
  },
  PolarRadiusAxis: function PolarRadiusAxis() {
    return <div />;
  },
}));

// ── Mock lazy-loaded sub-tabs ────────────────────────────────────────────────
vi.mock('./training/EvaluationTab', () => ({
  EvaluationTab: function EvaluationTab() {
    return <div data-testid="evaluation-tab">EvaluationTab</div>;
  },
}));
vi.mock('./training/PreferencesTab', () => ({
  PreferencesTab: function PreferencesTab() {
    return <div data-testid="preferences-tab">PreferencesTab</div>;
  },
}));
vi.mock('./training/ExperimentsTab', () => ({
  ExperimentsTab: function ExperimentsTab() {
    return <div data-testid="experiments-tab">ExperimentsTab</div>;
  },
}));
vi.mock('./training/DeploymentTab', () => ({
  DeploymentTab: function DeploymentTab() {
    return <div data-testid="deployment-tab">DeploymentTab</div>;
  },
}));

// ── Mock FeatureLock to pass children through ────────────────────────────────
vi.mock('./FeatureLock', () => ({
  FeatureLock: function FeatureLock({ children }: { children: ReactNode }) {
    return <>{children}</>;
  },
}));

// ── Mock API client ──────────────────────────────────────────────────────────
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
    fetchTrainingStream: vi.fn(),
    fetchQualityScores: vi.fn(),
    triggerQualityScoring: vi.fn(),
    fetchComputerUseEpisodes: vi.fn(),
    fetchComputerUseStats: vi.fn(),
    deleteComputerUseEpisode: vi.fn(),
  };
});

import * as api from '../api/client';

const mockFetchTrainingStats = vi.mocked(api.fetchTrainingStats);
const mockExportTrainingDataset = vi.mocked(api.exportTrainingDataset);
const mockFetchDistillationJobs = vi.mocked(api.fetchDistillationJobs);
const mockCreateDistillationJob = vi.mocked(api.createDistillationJob);
const mockDeleteDistillationJob = vi.mocked(api.deleteDistillationJob);
const mockRunDistillationJob = vi.mocked(api.runDistillationJob);
const mockFetchFinetuneJobs = vi.mocked(api.fetchFinetuneJobs);
const mockCreateFinetuneJob = vi.mocked(api.createFinetuneJob);
const mockDeleteFinetuneJob = vi.mocked(api.deleteFinetuneJob);
const mockRegisterFinetuneAdapter = vi.mocked(api.registerFinetuneAdapter);
const mockFetchTrainingStream = vi.mocked(api.fetchTrainingStream);
const mockFetchQualityScores = vi.mocked(api.fetchQualityScores);
const mockTriggerQualityScoring = vi.mocked(api.triggerQualityScoring);
const mockFetchComputerUseEpisodes = vi.mocked(api.fetchComputerUseEpisodes);
const mockFetchComputerUseStats = vi.mocked(api.fetchComputerUseStats);
const mockDeleteComputerUseEpisode = vi.mocked(api.deleteComputerUseEpisode);

import { TrainingTab, EvalResultRadarCard } from './TrainingTab';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function makeMockEventSource() {
  const listeners: Record<string, ((evt: MessageEvent) => void)[]> = {};
  return {
    addEventListener: vi.fn((type: string, cb: (evt: MessageEvent) => void) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(cb);
    }),
    removeEventListener: vi.fn(),
    close: vi.fn(),
    _emit(type: string, data: unknown) {
      for (const cb of listeners[type] ?? []) {
        cb(new MessageEvent(type, { data: JSON.stringify(data) }));
      }
    },
  };
}

const MOCK_STATS = { conversations: 120, memories: 55, knowledge: 18 };

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TrainingTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default mocks so queries don't hang
    mockFetchTrainingStats.mockResolvedValue(MOCK_STATS);
    mockExportTrainingDataset.mockResolvedValue({
      url: 'blob:mock-url',
      filename: 'training-export-2026-02-27.jsonl',
    });
    mockFetchDistillationJobs.mockResolvedValue([]);
    mockFetchFinetuneJobs.mockResolvedValue([]);
    const es = makeMockEventSource();
    mockFetchTrainingStream.mockReturnValue(es as unknown as EventSource);
    mockFetchQualityScores.mockResolvedValue({ conversations: [] });
    mockFetchComputerUseEpisodes.mockResolvedValue([]);
    mockFetchComputerUseStats.mockResolvedValue({
      skillBreakdown: [],
      totals: { totalEpisodes: 0, avgReward: 0 },
    });
  });

  // ── Tab navigation ─────────────────────────────────────────────────────────

  describe('tab navigation', () => {
    it('renders all sub-tab buttons', () => {
      renderWithProviders(<TrainingTab />);
      const tabLabels = [
        'Export', 'Distillation', 'Fine-tune', 'Live',
        'Computer Use', 'Evaluation', 'Preferences', 'Experiments', 'Deployment',
      ];
      for (const label of tabLabels) {
        expect(screen.getByRole('tab', { name: new RegExp(label) })).toBeInTheDocument();
      }
    });

    it('defaults to Export tab (aria-selected)', () => {
      renderWithProviders(<TrainingTab />);
      expect(screen.getByRole('tab', { name: /Export/ })).toHaveAttribute('aria-selected', 'true');
    });

    it('switches to Distillation tab on click', async () => {
      const user = userEvent.setup();
      renderWithProviders(<TrainingTab />);
      await user.click(screen.getByRole('tab', { name: /Distillation/ }));
      expect(screen.getByRole('tab', { name: /Distillation/ })).toHaveAttribute('aria-selected', 'true');
    });

    it('switches to Fine-tune tab on click', async () => {
      const user = userEvent.setup();
      renderWithProviders(<TrainingTab />);
      await user.click(screen.getByRole('tab', { name: /Fine-tune/ }));
      expect(screen.getByRole('tab', { name: /Fine-tune/ })).toHaveAttribute('aria-selected', 'true');
    });

    it('switches to Live tab on click', async () => {
      const user = userEvent.setup();
      renderWithProviders(<TrainingTab />);
      await user.click(screen.getByRole('tab', { name: /Live/ }));
      expect(screen.getByRole('tab', { name: /Live/ })).toHaveAttribute('aria-selected', 'true');
    });

    it('switches to Computer Use tab on click', async () => {
      const user = userEvent.setup();
      renderWithProviders(<TrainingTab />);
      await user.click(screen.getByRole('tab', { name: /Computer Use/ }));
      expect(screen.getByRole('tab', { name: /Computer Use/ })).toHaveAttribute('aria-selected', 'true');
    });

    it('loads lazy Evaluation tab', async () => {
      const user = userEvent.setup();
      renderWithProviders(<TrainingTab />);
      await user.click(screen.getByRole('tab', { name: /Evaluation/ }));
      await waitFor(() => {
        expect(screen.getByTestId('evaluation-tab')).toBeInTheDocument();
      });
    });

    it('loads lazy Preferences tab', async () => {
      const user = userEvent.setup();
      renderWithProviders(<TrainingTab />);
      await user.click(screen.getByRole('tab', { name: /Preferences/ }));
      await waitFor(() => {
        expect(screen.getByTestId('preferences-tab')).toBeInTheDocument();
      });
    });

    it('loads lazy Experiments tab', async () => {
      const user = userEvent.setup();
      renderWithProviders(<TrainingTab />);
      await user.click(screen.getByRole('tab', { name: /Experiments/ }));
      await waitFor(() => {
        expect(screen.getByTestId('experiments-tab')).toBeInTheDocument();
      });
    });

    it('loads lazy Deployment tab', async () => {
      const user = userEvent.setup();
      renderWithProviders(<TrainingTab />);
      await user.click(screen.getByRole('tab', { name: /Deployment/ }));
      await waitFor(() => {
        expect(screen.getByTestId('deployment-tab')).toBeInTheDocument();
      });
    });
  });

  // ── Export Tab ──────────────────────────────────────────────────────────────

  describe('Export tab', () => {
    it('renders the Training Dataset Export heading', async () => {
      renderWithProviders(<TrainingTab />);
      expect(await screen.findByText('Training Dataset Export')).toBeInTheDocument();
    });

    it('shows stats after loading', async () => {
      renderWithProviders(<TrainingTab />);
      expect(await screen.findByText('120')).toBeInTheDocument();
      expect(screen.getByText('55')).toBeInTheDocument();
      expect(screen.getByText('18')).toBeInTheDocument();
    });

    it('shows loading state while fetching stats', () => {
      mockFetchTrainingStats.mockReturnValue(new Promise(() => {}));
      renderWithProviders(<TrainingTab />);
      expect(screen.getByText(/loading stats/i)).toBeInTheDocument();
    });

    it('shows error state when stats fail', async () => {
      mockFetchTrainingStats.mockRejectedValue(new Error('Network error'));
      renderWithProviders(<TrainingTab />);
      expect(await screen.findByText('Could not load stats', {}, { timeout: 3000 })).toBeInTheDocument();
    });

    it('renders all three format radio options', async () => {
      renderWithProviders(<TrainingTab />);
      await screen.findByText('Training Dataset Export');
      expect(screen.getByDisplayValue('sharegpt')).toBeInTheDocument();
      expect(screen.getByDisplayValue('instruction')).toBeInTheDocument();
      expect(screen.getByDisplayValue('raw')).toBeInTheDocument();
    });

    it('defaults to sharegpt format selected', async () => {
      renderWithProviders(<TrainingTab />);
      await screen.findByText('Training Dataset Export');
      const radio = screen.getByDisplayValue('sharegpt') as HTMLInputElement;
      expect(radio.checked).toBe(true);
    });

    it('allows changing to instruction format', async () => {
      const user = userEvent.setup();
      renderWithProviders(<TrainingTab />);
      await screen.findByText('Training Dataset Export');
      const radio = screen.getByDisplayValue('instruction') as HTMLInputElement;
      await user.click(radio);
      expect(radio.checked).toBe(true);
    });

    it('renders the Download Dataset button', async () => {
      renderWithProviders(<TrainingTab />);
      expect(await screen.findByRole('button', { name: /download dataset/i })).toBeInTheDocument();
    });

    it('disables Download button when conversations = 0', async () => {
      mockFetchTrainingStats.mockResolvedValue({ conversations: 0, memories: 0, knowledge: 0 });
      renderWithProviders(<TrainingTab />);
      const btn = await screen.findByRole('button', { name: /download dataset/i });
      expect(btn).toBeDisabled();
    });

    it('enables Download button when conversations > 0', async () => {
      renderWithProviders(<TrainingTab />);
      await screen.findByText('120');
      const btn = screen.getByRole('button', { name: /download dataset/i });
      expect(btn).not.toBeDisabled();
    });

    it('calls exportTrainingDataset on Download button click', async () => {
      const user = userEvent.setup();
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      renderWithProviders(<TrainingTab />);
      const btn = await screen.findByRole('button', { name: /download dataset/i });
      await user.click(btn);
      await waitFor(() => {
        expect(mockExportTrainingDataset).toHaveBeenCalledWith({ format: 'sharegpt', limit: 10000 });
      });
      clickSpy.mockRestore();
    });

    it('shows error message when export fails', async () => {
      mockExportTrainingDataset.mockRejectedValue(new Error('Export failed: server error'));
      const user = userEvent.setup();
      renderWithProviders(<TrainingTab />);
      const btn = await screen.findByRole('button', { name: /download dataset/i });
      await user.click(btn);
      await waitFor(() => {
        expect(screen.getByText(/export failed: server error/i)).toBeInTheDocument();
      });
    });

    it('renders the Local Training Pipeline guide', async () => {
      renderWithProviders(<TrainingTab />);
      expect(await screen.findByText('Local Training Pipeline')).toBeInTheDocument();
      expect(screen.getAllByText(/sentence-transformers/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/serve via ollama/i)).toBeInTheDocument();
    });

    it('renders the max conversations input with default 10000', async () => {
      renderWithProviders(<TrainingTab />);
      await screen.findByText('Training Dataset Export');
      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input.value).toBe('10000');
    });

    it('uses custom limit when changed', async () => {
      const user = userEvent.setup();
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      renderWithProviders(<TrainingTab />);
      await screen.findByText('Training Dataset Export');
      const input = screen.getByRole('spinbutton');
      await user.clear(input);
      await user.type(input, '500');
      const btn = screen.getByRole('button', { name: /download dataset/i });
      await user.click(btn);
      await waitFor(() => {
        expect(mockExportTrainingDataset).toHaveBeenCalledWith(expect.objectContaining({ limit: 500 }));
      });
      clickSpy.mockRestore();
    });

    it('exports with raw format when selected', async () => {
      const user = userEvent.setup();
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      mockExportTrainingDataset.mockResolvedValue({ url: 'blob:x', filename: 'test.txt' });
      renderWithProviders(<TrainingTab />);
      await screen.findByText('120');
      await user.click(screen.getByDisplayValue('raw'));
      await user.click(screen.getByRole('button', { name: /download dataset/i }));
      await waitFor(() => {
        expect(mockExportTrainingDataset).toHaveBeenCalledWith({ format: 'raw', limit: 10000 });
      });
      clickSpy.mockRestore();
    });

    it('renders format descriptions', async () => {
      renderWithProviders(<TrainingTab />);
      await screen.findByText('Training Dataset Export');
      expect(screen.getByText(/Standard format for chat fine-tuning/)).toBeInTheDocument();
      expect(screen.getByText(/Alpaca-style pairs/)).toBeInTheDocument();
      expect(screen.getByText(/Plain text with role labels/)).toBeInTheDocument();
    });

    it('renders stat card labels', async () => {
      renderWithProviders(<TrainingTab />);
      await screen.findByText('120');
      expect(screen.getByText('Conversations')).toBeInTheDocument();
      expect(screen.getByText('Memories')).toBeInTheDocument();
      expect(screen.getByText('Knowledge')).toBeInTheDocument();
    });

    it('renders pipeline steps', async () => {
      renderWithProviders(<TrainingTab />);
      await screen.findByText('Local Training Pipeline');
      expect(screen.getByText(/Fine-tune a chat model/)).toBeInTheDocument();
      expect(screen.getByText(/Connect back/)).toBeInTheDocument();
      expect(screen.getByText(/Serve via Ollama/)).toBeInTheDocument();
    });
  });

  // ── Distillation Tab ───────────────────────────────────────────────────────

  describe('Distillation tab', () => {
    const MOCK_PENDING_JOB: api.DistillationJob = {
      id: 'job-1',
      name: 'Test distillation',
      teacherProvider: 'anthropic',
      teacherModel: 'claude-opus-4-6',
      exportFormat: 'sharegpt',
      maxSamples: 100,
      personalityIds: [],
      outputPath: '/tmp/out.jsonl',
      status: 'pending',
      samplesGenerated: 0,
      errorMessage: null,
      createdAt: Date.now(),
      completedAt: null,
    };

    async function goToDistillation() {
      const user = userEvent.setup();
      renderWithProviders(<TrainingTab />);
      await user.click(screen.getByRole('tab', { name: /Distillation/ }));
      return user;
    }

    it('shows loading state', async () => {
      mockFetchDistillationJobs.mockReturnValue(new Promise(() => {}));
      await goToDistillation();
      await waitFor(() => {
        expect(screen.getByText(/Loading/)).toBeInTheDocument();
      });
    });

    it('shows error state', async () => {
      mockFetchDistillationJobs.mockRejectedValue(new Error('fail'));
      await goToDistillation();
      await waitFor(() => {
        expect(screen.getByText(/Could not load jobs/)).toBeInTheDocument();
      });
    });

    it('shows empty state when no jobs', async () => {
      await goToDistillation();
      await waitFor(() => {
        expect(screen.getByText(/No distillation jobs yet/)).toBeInTheDocument();
      });
    });

    it('renders Model Distillation heading', async () => {
      await goToDistillation();
      expect(screen.getByText('Model Distillation')).toBeInTheDocument();
    });

    it('shows Run button for pending jobs', async () => {
      mockFetchDistillationJobs.mockResolvedValue([MOCK_PENDING_JOB]);
      await goToDistillation();
      expect(await screen.findByTitle('Run job')).toBeInTheDocument();
    });

    it('calls runDistillationJob when Run button is clicked', async () => {
      mockFetchDistillationJobs.mockResolvedValue([MOCK_PENDING_JOB]);
      mockRunDistillationJob.mockResolvedValue({ id: 'job-1', status: 'running' });
      const user = await goToDistillation();
      await user.click(await screen.findByTitle('Run job'));
      expect(mockRunDistillationJob).toHaveBeenCalledWith('job-1', expect.any(Object));
    });

    it('shows Retry button for failed jobs', async () => {
      mockFetchDistillationJobs.mockResolvedValue([{ ...MOCK_PENDING_JOB, status: 'failed' as const }]);
      await goToDistillation();
      expect(await screen.findByTitle('Retry job')).toBeInTheDocument();
    });

    it('does not show Run button for running or complete jobs', async () => {
      mockFetchDistillationJobs.mockResolvedValue([{ ...MOCK_PENDING_JOB, status: 'running' as const }]);
      await goToDistillation();
      await screen.findByText('Test distillation');
      expect(screen.queryByTitle('Run job')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Retry job')).not.toBeInTheDocument();
    });

    it('shows progress bar for running job', async () => {
      mockFetchDistillationJobs.mockResolvedValue([
        { ...MOCK_PENDING_JOB, status: 'running' as const, samplesGenerated: 50, maxSamples: 200 },
      ]);
      await goToDistillation();
      await waitFor(() => {
        expect(screen.getByText('50 / 200 samples')).toBeInTheDocument();
      });
      expect(screen.getByText('25%')).toBeInTheDocument();
    });

    it('shows complete status with output path', async () => {
      mockFetchDistillationJobs.mockResolvedValue([
        {
          ...MOCK_PENDING_JOB,
          status: 'complete' as const,
          samplesGenerated: 100,
          completedAt: Date.now(),
        },
      ]);
      await goToDistillation();
      await waitFor(() => {
        expect(screen.getByText('Complete')).toBeInTheDocument();
      });
      expect(screen.getByText(/Output: \/tmp\/out\.jsonl/)).toBeInTheDocument();
    });

    it('shows error message for failed jobs', async () => {
      mockFetchDistillationJobs.mockResolvedValue([
        { ...MOCK_PENDING_JOB, status: 'failed' as const, errorMessage: 'API rate limited' },
      ]);
      await goToDistillation();
      await waitFor(() => {
        expect(screen.getByText('API rate limited')).toBeInTheDocument();
      });
    });

    it('shows teacher provider/model info', async () => {
      mockFetchDistillationJobs.mockResolvedValue([MOCK_PENDING_JOB]);
      await goToDistillation();
      await waitFor(() => {
        expect(screen.getByText(/anthropic\/claude-opus-4-6/)).toBeInTheDocument();
      });
    });

    it('opens new job form via New Job button', async () => {
      const user = await goToDistillation();
      await waitFor(() => {
        expect(screen.getByText(/No distillation jobs yet/)).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /New Job/ }));
      expect(screen.getByText('Create Distillation Job')).toBeInTheDocument();
    });

    it('cancel button hides form', async () => {
      const user = await goToDistillation();
      await waitFor(() => {
        expect(screen.getByText(/No distillation jobs yet/)).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /New Job/ }));
      expect(screen.getByText('Create Distillation Job')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Cancel/ }));
      expect(screen.queryByText('Create Distillation Job')).not.toBeInTheDocument();
    });

    it('creates a distillation job via form submit', async () => {
      mockCreateDistillationJob.mockResolvedValue({
        ...MOCK_PENDING_JOB,
        id: 'new-dj',
        name: 'My Distill',
      });
      const user = await goToDistillation();
      await waitFor(() => {
        expect(screen.getByText(/No distillation jobs yet/)).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /New Job/ }));
      const nameInput = screen.getByPlaceholderText('e.g. claude-opus distillation');
      await user.type(nameInput, 'My Distill');
      await user.click(screen.getByRole('button', { name: /Create Job/ }));
      expect(mockCreateDistillationJob).toHaveBeenCalled();
    });

    it('Create Job button disabled when name is empty', async () => {
      const user = await goToDistillation();
      await waitFor(() => {
        expect(screen.getByText(/No distillation jobs yet/)).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /New Job/ }));
      const createBtn = screen.getByRole('button', { name: /Create Job/ });
      expect(createBtn).toBeDisabled();
    });

    it('calls deleteDistillationJob on delete click', async () => {
      mockDeleteDistillationJob.mockResolvedValue(undefined);
      mockFetchDistillationJobs.mockResolvedValue([
        { ...MOCK_PENDING_JOB, id: 'dj-del', name: 'To Delete', status: 'complete' as const, samplesGenerated: 100 },
      ]);
      const user = await goToDistillation();
      await waitFor(() => {
        expect(screen.getByText('To Delete')).toBeInTheDocument();
      });
      await user.click(screen.getByTitle('Delete job'));
      expect(mockDeleteDistillationJob).toHaveBeenCalledWith('dj-del', expect.any(Object));
    });

    it('renders form fields for priority and curriculum modes', async () => {
      const user = await goToDistillation();
      await waitFor(() => {
        expect(screen.getByText(/No distillation jobs yet/)).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /New Job/ }));
      expect(screen.getByText('Curriculum mode')).toBeInTheDocument();
      expect(screen.getByText('Counterfactual mode')).toBeInTheDocument();
    });

    it('shows counterfactual max samples field when enabled', async () => {
      const user = await goToDistillation();
      await waitFor(() => {
        expect(screen.getByText(/No distillation jobs yet/)).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /New Job/ }));
      // Counterfactual max samples shouldn't be visible yet
      expect(screen.queryByText('Max Counterfactual Samples')).not.toBeInTheDocument();
      // Enable counterfactual
      await user.click(screen.getByText('Counterfactual mode'));
      expect(screen.getByText('Max Counterfactual Samples')).toBeInTheDocument();
    });

    it('renders cancelled status chip', async () => {
      mockFetchDistillationJobs.mockResolvedValue([
        { ...MOCK_PENDING_JOB, status: 'cancelled' as const },
      ]);
      await goToDistillation();
      await waitFor(() => {
        expect(screen.getByText('Cancelled')).toBeInTheDocument();
      });
    });
  });

  // ── Fine-tune Tab ──────────────────────────────────────────────────────────

  describe('Fine-tune tab', () => {
    const MOCK_FT_JOB: api.FinetuneJob = {
      id: 'ft-1',
      name: 'My Finetune',
      baseModel: 'llama3:8b',
      adapterName: 'my-adapter',
      datasetPath: '/data/train.jsonl',
      loraRank: 16,
      loraAlpha: 32,
      batchSize: 4,
      epochs: 3,
      vramBudgetGb: 12,
      image: 'unsloth:latest',
      containerId: null,
      status: 'pending',
      adapterPath: null,
      errorMessage: null,
      createdAt: Date.now(),
      completedAt: null,
    };

    async function goToFinetune() {
      const user = userEvent.setup();
      renderWithProviders(<TrainingTab />);
      await user.click(screen.getByRole('tab', { name: /Fine-tune/ }));
      return user;
    }

    it('shows empty state', async () => {
      await goToFinetune();
      await waitFor(() => {
        expect(screen.getByText(/No fine-tuning jobs yet/)).toBeInTheDocument();
      });
    });

    it('shows loading state', async () => {
      mockFetchFinetuneJobs.mockReturnValue(new Promise(() => {}));
      await goToFinetune();
      await waitFor(() => {
        expect(screen.getByText(/Loading/)).toBeInTheDocument();
      });
    });

    it('shows error state', async () => {
      mockFetchFinetuneJobs.mockRejectedValue(new Error('fail'));
      await goToFinetune();
      await waitFor(() => {
        expect(screen.getByText(/Could not load jobs/)).toBeInTheDocument();
      });
    });

    it('renders heading', async () => {
      await goToFinetune();
      expect(screen.getByText(/LoRA \/ QLoRA Fine-Tuning/)).toBeInTheDocument();
    });

    it('renders finetune job card with details', async () => {
      mockFetchFinetuneJobs.mockResolvedValue([
        { ...MOCK_FT_JOB, status: 'complete' as const, adapterPath: '/models/my-adapter', completedAt: Date.now() },
      ]);
      await goToFinetune();
      await waitFor(() => {
        expect(screen.getByText('My Finetune')).toBeInTheDocument();
      });
      expect(screen.getAllByText(/my-adapter/).length).toBeGreaterThan(0);
      expect(screen.getByText(/rank=16/)).toBeInTheDocument();
      expect(screen.getByText('Complete')).toBeInTheDocument();
    });

    it('shows Register button for complete jobs', async () => {
      mockFetchFinetuneJobs.mockResolvedValue([
        { ...MOCK_FT_JOB, id: 'ft-reg', status: 'complete' as const, adapterPath: '/models/adapter-x', completedAt: Date.now() },
      ]);
      mockRegisterFinetuneAdapter.mockResolvedValue({ success: true, adapterName: 'adapter-x' });
      const user = await goToFinetune();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Register/ })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /Register/ }));
      expect(mockRegisterFinetuneAdapter).toHaveBeenCalledWith('ft-reg', expect.any(Object));
    });

    it('opens create form and submits', async () => {
      mockCreateFinetuneJob.mockResolvedValue({ ...MOCK_FT_JOB, id: 'ft-new', name: 'New FT' });
      const user = await goToFinetune();
      await waitFor(() => {
        expect(screen.getByText(/No fine-tuning jobs yet/)).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /New Job/ }));
      expect(screen.getByText('Create Fine-Tuning Job')).toBeInTheDocument();
      const nameInput = screen.getByPlaceholderText('e.g. llama3 customer-support adapter');
      await user.type(nameInput, 'New FT');
      await user.click(screen.getByRole('button', { name: /Create & Start/ }));
      expect(mockCreateFinetuneJob).toHaveBeenCalled();
    });

    it('deletes a finetune job', async () => {
      mockDeleteFinetuneJob.mockResolvedValue(undefined);
      mockFetchFinetuneJobs.mockResolvedValue([{ ...MOCK_FT_JOB, id: 'ft-del', name: 'Delete Me' }]);
      const user = await goToFinetune();
      await waitFor(() => {
        expect(screen.getByText('Delete Me')).toBeInTheDocument();
      });
      await user.click(screen.getByTitle('Delete job'));
      expect(mockDeleteFinetuneJob).toHaveBeenCalledWith('ft-del', expect.any(Object));
    });

    it('shows adapter path for complete job', async () => {
      mockFetchFinetuneJobs.mockResolvedValue([
        { ...MOCK_FT_JOB, status: 'complete' as const, adapterPath: '/models/path-adapter', completedAt: Date.now() },
      ]);
      await goToFinetune();
      await waitFor(() => {
        expect(screen.getByText(/Adapter: \/models\/path-adapter/)).toBeInTheDocument();
      });
    });

    it('shows error message for failed job', async () => {
      mockFetchFinetuneJobs.mockResolvedValue([
        { ...MOCK_FT_JOB, status: 'failed' as const, errorMessage: 'CUDA out of memory' },
      ]);
      await goToFinetune();
      await waitFor(() => {
        expect(screen.getByText('CUDA out of memory')).toBeInTheDocument();
      });
    });

    it('shows Logs button for running jobs', async () => {
      mockFetchFinetuneJobs.mockResolvedValue([
        { ...MOCK_FT_JOB, status: 'running' as const },
      ]);
      await goToFinetune();
      await waitFor(() => {
        expect(screen.getByText('Logs')).toBeInTheDocument();
      });
    });

    it('cancel hides finetune form', async () => {
      const user = await goToFinetune();
      await waitFor(() => {
        expect(screen.getByText(/No fine-tuning jobs yet/)).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /New Job/ }));
      expect(screen.getByText('Create Fine-Tuning Job')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Cancel/ }));
      expect(screen.queryByText('Create Fine-Tuning Job')).not.toBeInTheDocument();
    });

    it('Create & Start button disabled when name is empty', async () => {
      const user = await goToFinetune();
      await waitFor(() => {
        expect(screen.getByText(/No fine-tuning jobs yet/)).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /New Job/ }));
      const createBtn = screen.getByRole('button', { name: /Create & Start/ });
      expect(createBtn).toBeDisabled();
    });
  });

  // ── Live Tab ───────────────────────────────────────────────────────────────

  describe('Live tab', () => {
    async function goToLive() {
      const user = userEvent.setup();
      renderWithProviders(<TrainingTab />);
      await user.click(screen.getByRole('tab', { name: /Live/ }));
      return user;
    }

    it('renders live training stream heading', async () => {
      await goToLive();
      expect(screen.getByText('Live Training Stream')).toBeInTheDocument();
    });

    it('renders throughput and agreement KPIs', async () => {
      await goToLive();
      expect(screen.getByText('Throughput')).toBeInTheDocument();
      expect(screen.getByText('Agreement Rate')).toBeInTheDocument();
      expect(screen.getByText('0.0')).toBeInTheDocument();
      expect(screen.getByText('0.0%')).toBeInTheDocument();
    });

    it('shows empty quality scores state', async () => {
      await goToLive();
      await waitFor(() => {
        expect(screen.getByText(/No quality scores yet/)).toBeInTheDocument();
      });
    });

    it('renders quality scores when present', async () => {
      mockFetchQualityScores.mockResolvedValue({
        conversations: [
          { conversationId: 'conv-123456', qualityScore: 0.85, signalSource: 'jaccard', scoredAt: '2026-03-06' },
        ],
      });
      await goToLive();
      await waitFor(() => {
        expect(screen.queryByText(/No quality scores yet/)).not.toBeInTheDocument();
      });
    });

    it('triggers quality scoring', async () => {
      mockTriggerQualityScoring.mockResolvedValue({ scored: 5 });
      const user = await goToLive();
      await waitFor(() => {
        expect(screen.getAllByText(/Score now/).length).toBeGreaterThan(0);
      });
      // The button contains both an icon and "Score now" text
      const scoreButtons = screen.getAllByRole('button').filter((b) => b.textContent?.includes('Score now'));
      await user.click(scoreButtons[0]);
      expect(mockTriggerQualityScoring).toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.getByText(/Scored 5 conversation/)).toBeInTheDocument();
      });
    });

    it('opens EventSource for live stream', async () => {
      await goToLive();
      expect(mockFetchTrainingStream).toHaveBeenCalled();
    });

    it('renders Conversation Quality Coverage heading', async () => {
      await goToLive();
      expect(screen.getByText('Conversation Quality Coverage')).toBeInTheDocument();
    });

    it('shows description text', async () => {
      await goToLive();
      expect(screen.getByText(/Real-time telemetry from active/)).toBeInTheDocument();
    });
  });

  // ── Computer Use Tab ───────────────────────────────────────────────────────

  describe('Computer Use tab', () => {
    async function goToComputerUse() {
      const user = userEvent.setup();
      renderWithProviders(<TrainingTab />);
      await user.click(screen.getByRole('tab', { name: /Computer Use/ }));
      return user;
    }

    it('renders heading', async () => {
      await goToComputerUse();
      expect(screen.getByText('Computer Use Episodes')).toBeInTheDocument();
    });

    it('shows stat cards with data', async () => {
      mockFetchComputerUseStats.mockResolvedValue({
        skillBreakdown: [],
        totals: { totalEpisodes: 42, avgReward: 0.75 },
      });
      await goToComputerUse();
      await waitFor(() => {
        expect(screen.getByText('42')).toBeInTheDocument();
      });
      expect(screen.getByText('0.750')).toBeInTheDocument();
    });

    it('shows empty episodes state', async () => {
      await goToComputerUse();
      await waitFor(() => {
        expect(screen.getByText(/No episodes found/)).toBeInTheDocument();
      });
    });

    it('renders episodes list', async () => {
      mockFetchComputerUseEpisodes.mockResolvedValue([
        {
          id: 'ep-1',
          sessionId: 'sess-1',
          skillName: 'click-button',
          stateEncoding: {},
          actionType: 'click',
          actionTarget: 'button.submit',
          actionValue: '',
          reward: 0.5,
          done: false,
          createdAt: '2026-03-06',
        },
      ]);
      await goToComputerUse();
      await waitFor(() => {
        expect(screen.getByText('click')).toBeInTheDocument();
      });
      expect(screen.getByText('button.submit')).toBeInTheDocument();
      expect(screen.getByText('r=0.50')).toBeInTheDocument();
      expect(screen.getByText('click-button')).toBeInTheDocument();
    });

    it('renders episode with done flag', async () => {
      mockFetchComputerUseEpisodes.mockResolvedValue([
        {
          id: 'ep-done',
          sessionId: 'sess-2',
          skillName: 'type-text',
          stateEncoding: {},
          actionType: 'type',
          actionTarget: 'input.name',
          actionValue: 'hello',
          reward: 1.0,
          done: true,
          createdAt: '2026-03-06',
        },
      ]);
      await goToComputerUse();
      await waitFor(() => {
        expect(screen.getByText('done')).toBeInTheDocument();
      });
    });

    it('renders episode with actionValue', async () => {
      mockFetchComputerUseEpisodes.mockResolvedValue([
        {
          id: 'ep-val',
          sessionId: 'sess-3',
          skillName: 'type-text',
          stateEncoding: {},
          actionType: 'type',
          actionTarget: 'input.name',
          actionValue: 'some typed text',
          reward: 0.3,
          done: false,
          createdAt: '2026-03-06',
        },
      ]);
      await goToComputerUse();
      await waitFor(() => {
        expect(screen.getByText('some typed text')).toBeInTheDocument();
      });
    });

    it('renders negative reward styling', async () => {
      mockFetchComputerUseEpisodes.mockResolvedValue([
        {
          id: 'ep-neg',
          sessionId: 'sess-4',
          skillName: 'nav',
          stateEncoding: {},
          actionType: 'scroll',
          actionTarget: 'window',
          actionValue: '',
          reward: -0.5,
          done: false,
          createdAt: '2026-03-06',
        },
      ]);
      await goToComputerUse();
      await waitFor(() => {
        expect(screen.getByText('r=-0.50')).toBeInTheDocument();
      });
    });

    it('renders skill breakdown table', async () => {
      mockFetchComputerUseStats.mockResolvedValue({
        skillBreakdown: [
          { skillName: 'navigate', episodeCount: 10, successRate: 0.8, avgReward: 0.6 },
        ],
        totals: { totalEpisodes: 10, avgReward: 0.6 },
      });
      await goToComputerUse();
      await waitFor(() => {
        expect(screen.getByText('Skill Breakdown')).toBeInTheDocument();
      });
      expect(screen.getByText('navigate')).toBeInTheDocument();
      expect(screen.getByText('80.0%')).toBeInTheDocument();
    });

    it('deletes an episode', async () => {
      mockDeleteComputerUseEpisode.mockResolvedValue(undefined);
      mockFetchComputerUseEpisodes.mockResolvedValue([
        {
          id: 'ep-del',
          sessionId: 'sess-5',
          skillName: 'delete-skill',
          stateEncoding: {},
          actionType: 'click',
          actionTarget: 'window',
          actionValue: '',
          reward: 0.1,
          done: false,
          createdAt: '2026-03-06',
        },
      ]);
      const user = await goToComputerUse();
      await waitFor(() => {
        expect(screen.getByText('delete-skill')).toBeInTheDocument();
      });
      await user.click(screen.getByTitle('Delete episode'));
      expect(mockDeleteComputerUseEpisode).toHaveBeenCalledWith('ep-del', expect.any(Object));
    });

    it('shows session filter input', async () => {
      await goToComputerUse();
      expect(screen.getByPlaceholderText('Session ID…')).toBeInTheDocument();
    });

    it('renders Session Replay heading', async () => {
      await goToComputerUse();
      expect(screen.getByText('Session Replay')).toBeInTheDocument();
    });

    it('renders stat card labels', async () => {
      await goToComputerUse();
      await waitFor(() => {
        expect(screen.getByText('Total Episodes')).toBeInTheDocument();
      });
      expect(screen.getByText('Avg Reward')).toBeInTheDocument();
      expect(screen.getByText('Skills')).toBeInTheDocument();
    });

    it('shows loading state for stats', async () => {
      mockFetchComputerUseStats.mockReturnValue(new Promise(() => {}));
      await goToComputerUse();
      // When loading, stats show ellipsis character
      const ellipses = screen.getAllByText('…');
      expect(ellipses.length).toBeGreaterThan(0);
    });

    it('renders description text', async () => {
      await goToComputerUse();
      expect(screen.getByText(/State→action→reward tuples/)).toBeInTheDocument();
    });
  });

  // ── EvalResultRadarCard ────────────────────────────────────────────────────

  describe('EvalResultRadarCard', () => {
    it('renders radar card with metrics', () => {
      renderWithProviders(
        <EvalResultRadarCard
          metrics={{
            tool_name_accuracy: 0.9,
            tool_arg_match: 0.8,
            semantic_similarity: 0.7,
            char_similarity: 0.6,
          }}
        />,
      );
      expect(screen.getByText('Evaluation Metrics')).toBeInTheDocument();
      expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
    });

    it('handles missing metrics gracefully', () => {
      renderWithProviders(<EvalResultRadarCard metrics={{}} />);
      expect(screen.getByText('Evaluation Metrics')).toBeInTheDocument();
    });

    it('renders responsive container', () => {
      renderWithProviders(
        <EvalResultRadarCard metrics={{ tool_name_accuracy: 1.0 }} />,
      );
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });
  });
});
