// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MemoryHealthTab from './MemoryHealthTab';

vi.mock('../../api/client', () => ({
  fetchMemoryHealth: vi.fn(),
  fetchAuditReports: vi.fn(),
  triggerMemoryAudit: vi.fn(),
  approveAuditReport: vi.fn(),
}));

import * as api from '../../api/client';

const mockFetchMemoryHealth = vi.mocked(api.fetchMemoryHealth);
const mockFetchAuditReports = vi.mocked(api.fetchAuditReports);
const mockTriggerMemoryAudit = vi.mocked(api.triggerMemoryAudit);
const mockApproveAuditReport = vi.mocked(api.approveAuditReport);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryHealthTab />
    </QueryClientProvider>
  );
}

const MOCK_HEALTH = {
  health: {
    healthScore: 85,
    totalMemories: 1234,
    totalKnowledge: 56,
    avgImportance: 0.742,
    expiringWithin7Days: 12,
    lowImportanceRatio: 0.15,
    duplicateEstimate: 3,
    lastAuditAt: Date.now() - 3600000,
    lastAuditScope: 'daily',
    compressionSavings: 48,
  },
};

const MOCK_REPORTS = {
  reports: [
    {
      id: 'rpt-1',
      scope: 'daily',
      status: 'completed',
      startedAt: Date.now() - 7200000,
      error: null,
    },
    {
      id: 'rpt-2',
      scope: 'weekly',
      status: 'pending_approval',
      startedAt: Date.now() - 3600000,
      error: null,
    },
    {
      id: 'rpt-3',
      scope: 'monthly',
      status: 'failed',
      startedAt: Date.now() - 1800000,
      error: 'Timeout during scan of large memory pool',
    },
  ],
};

describe('MemoryHealthTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchMemoryHealth.mockResolvedValue(MOCK_HEALTH);
    mockFetchAuditReports.mockResolvedValue(MOCK_REPORTS);
    mockTriggerMemoryAudit.mockResolvedValue({ report: {} });
    mockApproveAuditReport.mockResolvedValue({ report: {} });
  });

  it('renders loading spinner when health data is loading', () => {
    mockFetchMemoryHealth.mockReturnValue(new Promise(() => {}));
    renderComponent();
    // The component shows a Loader2 spinner div while healthLoading is true
    const spinnerContainer = document.querySelector('.animate-spin');
    expect(spinnerContainer).toBeInTheDocument();
  });

  it('displays the Memory Health heading after loading', async () => {
    renderComponent();
    expect(await screen.findByText('Memory Health')).toBeInTheDocument();
  });

  it('displays health score with Healthy text for score >= 80', async () => {
    renderComponent();
    expect(await screen.findByText('85')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('displays Needs Attention text for score between 50 and 79', async () => {
    mockFetchMemoryHealth.mockResolvedValue({
      health: { ...MOCK_HEALTH.health, healthScore: 65 },
    });
    renderComponent();
    expect(await screen.findByText('65')).toBeInTheDocument();
    expect(screen.getByText('Needs Attention')).toBeInTheDocument();
  });

  it('displays Degraded text for score below 50', async () => {
    mockFetchMemoryHealth.mockResolvedValue({
      health: { ...MOCK_HEALTH.health, healthScore: 30 },
    });
    renderComponent();
    expect(await screen.findByText('30')).toBeInTheDocument();
    expect(screen.getByText('Degraded')).toBeInTheDocument();
  });

  it('applies correct color class for healthy score', async () => {
    renderComponent();
    const scoreEl = await screen.findByText('85');
    expect(scoreEl.className).toContain('text-success');
  });

  it('applies correct color class for warning score', async () => {
    mockFetchMemoryHealth.mockResolvedValue({
      health: { ...MOCK_HEALTH.health, healthScore: 60 },
    });
    renderComponent();
    const scoreEl = await screen.findByText('60');
    expect(scoreEl.className).toContain('text-warning');
  });

  it('applies correct color class for degraded score', async () => {
    mockFetchMemoryHealth.mockResolvedValue({
      health: { ...MOCK_HEALTH.health, healthScore: 25 },
    });
    renderComponent();
    const scoreEl = await screen.findByText('25');
    expect(scoreEl.className).toContain('text-destructive');
  });

  it('shows stat cards with proper values', async () => {
    renderComponent();
    expect(await screen.findByText('1234')).toBeInTheDocument();
    expect(screen.getByText('0.742')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('48')).toBeInTheDocument();
    // Verify stat labels
    expect(screen.getByText('Total Memories')).toBeInTheDocument();
    expect(screen.getByText('Avg Importance')).toBeInTheDocument();
    expect(screen.getByText('Expiring (7d)')).toBeInTheDocument();
    expect(screen.getByText('Compressed')).toBeInTheDocument();
  });

  it('renders audit history table with report rows', async () => {
    renderComponent();
    expect(await screen.findByText('Audit History')).toBeInTheDocument();
    // Table headers
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByText('Scope')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
    // Report statuses
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  it('shows "No audits run yet" when reports list is empty', async () => {
    mockFetchAuditReports.mockResolvedValue({ reports: [] });
    renderComponent();
    expect(await screen.findByText('No audits run yet')).toBeInTheDocument();
  });

  it('displays pending approvals section when pending reports exist', async () => {
    renderComponent();
    expect(await screen.findByText('Pending Approvals (1)')).toBeInTheDocument();
    expect(screen.getByText('weekly audit')).toBeInTheDocument();
  });

  it('does not display pending approvals section when no pending reports', async () => {
    mockFetchAuditReports.mockResolvedValue({
      reports: [
        { id: 'rpt-1', scope: 'daily', status: 'completed', startedAt: Date.now(), error: null },
      ],
    });
    renderComponent();
    await screen.findByText('Audit History');
    expect(screen.queryByText(/Pending Approvals/)).not.toBeInTheDocument();
  });

  it('calls triggerMemoryAudit when Run button is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    const runBtn = await screen.findByText('Run');
    await user.click(runBtn);
    await waitFor(() => {
      expect(mockTriggerMemoryAudit).toHaveBeenCalledWith({ scope: 'daily' });
    });
  });

  it('calls approveAuditReport when Approve button is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    const approveBtn = await screen.findByText('Approve');
    await user.click(approveBtn);
    await waitFor(() => {
      expect(mockApproveAuditReport).toHaveBeenCalledWith('rpt-2');
    });
  });

  it('shows last audit timestamp and scope', async () => {
    renderComponent();
    expect(await screen.findByText('Last audit:')).toBeInTheDocument();
    // The timestamp span includes the scope in parentheses, e.g. "3/3/2026, ... (daily)"
    expect(screen.getByText(/\(daily\)/)).toBeInTheDocument();
  });

  it('shows "Never" when no audit has been run', async () => {
    mockFetchMemoryHealth.mockResolvedValue({
      health: { ...MOCK_HEALTH.health, lastAuditAt: null, lastAuditScope: null },
    });
    renderComponent();
    expect(await screen.findByText('Never')).toBeInTheDocument();
  });
});
