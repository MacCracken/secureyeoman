// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RiskAssessmentTab } from './RiskAssessmentTab';
import type { RiskDomain } from '../types';

// ── Mock API client ──────────────────────────────────────────────
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    runRiskAssessment: vi.fn(),
    fetchRiskAssessments: vi.fn(),
    fetchRiskAssessment: vi.fn(),
    downloadRiskReport: vi.fn(),
    fetchRiskFeeds: vi.fn(),
    createRiskFeed: vi.fn(),
    deleteRiskFeed: vi.fn(),
    ingestRiskFindings: vi.fn(),
    fetchRiskFindings: vi.fn(),
    acknowledgeRiskFinding: vi.fn(),
    resolveRiskFinding: vi.fn(),
  };
});

// Mock lazy-loaded sub-tabs to avoid dynamic import issues
vi.mock('./security/SecurityATHITab', () => ({
  ATHITab: () => <div data-testid="athi-tab">ATHI Tab</div>,
}));
vi.mock('./security/SecuritySandboxTab', () => ({
  SandboxTab: () => <div data-testid="sandbox-tab">Sandbox Tab</div>,
}));
vi.mock('./DepartmentalRiskTab', () => ({
  DepartmentalRiskTab: () => <div data-testid="dept-tab">Departments Tab</div>,
}));

import * as api from '../api/client';

const mockFetchRiskAssessments = vi.mocked(api.fetchRiskAssessments);
const mockFetchRiskFindings = vi.mocked(api.fetchRiskFindings);
const mockFetchRiskFeeds = vi.mocked(api.fetchRiskFeeds);
const mockRunRiskAssessment = vi.mocked(api.runRiskAssessment);

// ── Helpers ──────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderComponent() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <RiskAssessmentTab />
    </QueryClientProvider>
  );
}

// ── Tests ────────────────────────────────────────────────────────

describe('RiskAssessmentTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default mocks — overview tab fetches assessments with limit:1
    mockFetchRiskAssessments.mockResolvedValue({ items: [], total: 0 });
    mockFetchRiskFindings.mockResolvedValue({ items: [], total: 0 });
    mockFetchRiskFeeds.mockResolvedValue([]);
  });

  it('renders sub-tab navigation', async () => {
    renderComponent();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Assessments')).toBeInTheDocument();
    expect(screen.getByText('Findings')).toBeInTheDocument();
    expect(screen.getByText('External Feeds')).toBeInTheDocument();
    expect(screen.getByText('Departments')).toBeInTheDocument();
    expect(screen.getByText('ATHI Threats')).toBeInTheDocument();
    expect(screen.getByText('Sandbox Scanning')).toBeInTheDocument();
  });

  it('shows overview tab by default with "No assessments yet" empty state', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Risk Overview')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('No assessments yet')).toBeInTheDocument();
    });
  });

  it('shows overview with latest assessment data', async () => {
    const assessmentData = {
      items: [
        {
          id: 'a-1',
          name: 'Weekly Assessment',
          status: 'completed' as const,
          assessmentTypes: ['security', 'governance'] as RiskDomain[],
          windowDays: 7,
          compositeScore: 65,
          riskLevel: 'high' as const,
          findingsCount: 3,
          createdAt: Date.now() - 3600000,
          completedAt: Date.now() - 3500000,
          domainScores: { security: 70, governance: 60 },
          findings: [],
        },
      ],
      total: 1,
    };
    // The OverviewSection queries with { limit: 1, status: 'completed' }
    mockFetchRiskAssessments.mockResolvedValue(assessmentData);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('65')).toBeInTheDocument();
    });
    // The assessment name and finding count are rendered in the overview card
    expect(screen.getByText(/Weekly Assessment/)).toBeInTheDocument();
    expect(screen.getByText(/3 finding/)).toBeInTheDocument();
  });

  it('switches to Assessments tab', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByText('Assessments'));

    await waitFor(() => {
      expect(screen.getByText('Past Assessments')).toBeInTheDocument();
    });
  });

  it('switches to Findings tab and shows empty state', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByText('Findings'));

    await waitFor(() => {
      expect(screen.getByText('External Findings')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('No external findings found.')).toBeInTheDocument();
    });
  });

  it('switches to External Feeds tab', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByText('External Feeds'));

    await waitFor(() => {
      expect(screen.getAllByText('External Feeds').length).toBeGreaterThanOrEqual(1);
    });
    await waitFor(() => {
      expect(screen.getByText('No external feeds configured.')).toBeInTheDocument();
    });
  });

  it('switches to Departments tab', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByText('Departments'));

    await waitFor(() => {
      expect(screen.getByTestId('dept-tab')).toBeInTheDocument();
    });
  });

  it('switches to ATHI Threats tab', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByText('ATHI Threats'));

    await waitFor(() => {
      expect(screen.getByTestId('athi-tab')).toBeInTheDocument();
    });
  });

  it('switches to Sandbox Scanning tab', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByText('Sandbox Scanning'));

    await waitFor(() => {
      expect(screen.getByTestId('sandbox-tab')).toBeInTheDocument();
    });
  });

  it('opens the Run Assessment modal from overview', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => screen.getByText('Run Assessment'));

    await user.click(screen.getByText('Run Assessment'));

    await waitFor(() => {
      expect(screen.getByText('Run New Assessment')).toBeInTheDocument();
    });

    // Modal should show domain checkboxes
    expect(screen.getByText('security')).toBeInTheDocument();
    expect(screen.getByText('governance')).toBeInTheDocument();
    expect(screen.getByText('infrastructure')).toBeInTheDocument();
  });

  it('closes the Run Assessment modal on Cancel', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => screen.getByText('Run Assessment'));
    await user.click(screen.getByText('Run Assessment'));

    await waitFor(() => screen.getByText('Run New Assessment'));

    await user.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Run New Assessment')).not.toBeInTheDocument();
    });
  });

  it('submits a risk assessment from the modal', async () => {
    const user = userEvent.setup();
    mockRunRiskAssessment.mockResolvedValue({
      id: 'a-new',
      name: 'test',
      status: 'running',
    } as never);

    renderComponent();

    await waitFor(() => screen.getByText('Run Assessment'));
    await user.click(screen.getByText('Run Assessment'));

    await waitFor(() => screen.getByText('Run New Assessment'));

    // Click the Run Assessment button in the modal
    const runButtons = screen.getAllByText('Run Assessment');
    const modalRunBtn = runButtons[runButtons.length - 1];
    await user.click(modalRunBtn);

    await waitFor(() => {
      expect(mockRunRiskAssessment).toHaveBeenCalled();
    });
  });

  it('shows Findings tab filter dropdowns', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByText('Findings'));

    await waitFor(() => screen.getByText('External Findings'));

    expect(screen.getByDisplayValue('All Statuses')).toBeInTheDocument();
    expect(screen.getByDisplayValue('All Severities')).toBeInTheDocument();
  });

  it('renders feed list when feeds exist', async () => {
    const user = userEvent.setup();
    mockFetchRiskFeeds.mockResolvedValue([
      {
        id: 'feed-1',
        name: 'NVD CVE Feed',
        sourceType: 'webhook' as const,
        category: 'cyber' as const,
        enabled: true,
        recordCount: 100,
        lastIngestedAt: Date.now() - 60000,
        description: 'CVE data',
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now() - 60000,
      },
    ]);

    renderComponent();

    await user.click(screen.getByText('External Feeds'));

    await waitFor(() => {
      expect(screen.getByText('NVD CVE Feed')).toBeInTheDocument();
    });
    expect(screen.getByText(/webhook/)).toBeInTheDocument();
    expect(screen.getByText(/100 records/)).toBeInTheDocument();
  });

  it('shows Add Feed form when Add Feed is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByText('External Feeds'));

    await waitFor(() => screen.getByText('Add Feed'));

    await user.click(screen.getByText('Add Feed'));

    await waitFor(() => {
      expect(screen.getByText('New External Feed')).toBeInTheDocument();
    });
  });
});
