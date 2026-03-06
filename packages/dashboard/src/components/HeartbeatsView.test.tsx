// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeartbeatsView } from './HeartbeatsView';

// ── Mock API client ──────────────────────────────────────────────
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchHeartbeatStatus: vi.fn(),
    fetchHeartbeatLog: vi.fn(),
    fetchPersonalities: vi.fn(),
  };
});

import * as api from '../api/client';
import type { HeartbeatTask } from '../types';

const mockFetchHeartbeatStatus = vi.mocked(api.fetchHeartbeatStatus);
const mockFetchHeartbeatLog = vi.mocked(api.fetchHeartbeatLog);
const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);

// ── Helpers ──────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderComponent() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <HeartbeatsView />
    </QueryClientProvider>,
  );
}

const MOCK_TASK: HeartbeatTask = {
  name: 'db-health-check',
  type: 'system_health',
  enabled: true,
  intervalMs: 60000,
  lastRunAt: Date.now() - 120000,
  config: {},
  personalities: [],
};

const MOCK_TASK_DISABLED: HeartbeatTask = {
  name: 'email-check',
  type: 'integration',
  enabled: false,
  intervalMs: 300000,
  lastRunAt: null,
  config: {},
  personalities: [],
};

// ── Tests ────────────────────────────────────────────────────────

describe('HeartbeatsView', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchPersonalities.mockResolvedValue({ personalities: [] } as never);
    mockFetchHeartbeatLog.mockResolvedValue({ entries: [], total: 0 });
  });

  it('shows loading state initially', () => {
    mockFetchHeartbeatStatus.mockReturnValue(new Promise(() => {}));
    renderComponent();
    expect(screen.getByText(/Loading heartbeat monitors/)).toBeInTheDocument();
  });

  it('shows empty state when no tasks configured', async () => {
    mockFetchHeartbeatStatus.mockResolvedValue({ tasks: [], running: true, enabled: true, intervalMs: 60000, beatCount: 0, lastBeat: null });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/No heartbeat monitors configured/)).toBeInTheDocument();
    });
  });

  it('renders a list of heartbeat tasks', async () => {
    mockFetchHeartbeatStatus.mockResolvedValue({
      tasks: [MOCK_TASK, MOCK_TASK_DISABLED],
      running: true, enabled: true, intervalMs: 60000, beatCount: 0, lastBeat: null,
    });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('db-health-check')).toBeInTheDocument();
    });
    expect(screen.getByText('email-check')).toBeInTheDocument();
  });

  it('displays the correct monitor count', async () => {
    mockFetchHeartbeatStatus.mockResolvedValue({
      tasks: [MOCK_TASK, MOCK_TASK_DISABLED],
      running: true, enabled: true, intervalMs: 60000, beatCount: 0, lastBeat: null,
    });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('2 monitors')).toBeInTheDocument();
    });
  });

  it('shows task type badge', async () => {
    mockFetchHeartbeatStatus.mockResolvedValue({
      tasks: [MOCK_TASK],
      running: true, enabled: true, intervalMs: 60000, beatCount: 0, lastBeat: null,
    });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('system_health')).toBeInTheDocument();
    });
  });

  it('shows interval for tasks with intervalMs', async () => {
    mockFetchHeartbeatStatus.mockResolvedValue({
      tasks: [MOCK_TASK],
      running: true, enabled: true, intervalMs: 60000, beatCount: 0, lastBeat: null,
    });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('every 1m')).toBeInTheDocument();
    });
  });

  it('shows last run time for tasks that have run', async () => {
    mockFetchHeartbeatStatus.mockResolvedValue({
      tasks: [MOCK_TASK],
      running: true, enabled: true, intervalMs: 60000, beatCount: 0, lastBeat: null,
    });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/last run 2m ago/)).toBeInTheDocument();
    });
  });

  it('shows "never run" for tasks without lastRunAt', async () => {
    mockFetchHeartbeatStatus.mockResolvedValue({
      tasks: [MOCK_TASK_DISABLED],
      running: true, enabled: true, intervalMs: 60000, beatCount: 0, lastBeat: null,
    });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('never run')).toBeInTheDocument();
    });
  });

  it('filters tasks by search text', async () => {
    const user = userEvent.setup();
    mockFetchHeartbeatStatus.mockResolvedValue({
      tasks: [MOCK_TASK, MOCK_TASK_DISABLED],
      running: true, enabled: true, intervalMs: 60000, beatCount: 0, lastBeat: null,
    });
    renderComponent();

    await waitFor(() => screen.getByText('db-health-check'));

    const searchInput = screen.getByLabelText('Search heartbeat monitors');
    await user.type(searchInput, 'db-health');

    expect(screen.getByText('db-health-check')).toBeInTheDocument();
    expect(screen.queryByText('email-check')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
  });

  it('filters by enabled/disabled state', async () => {
    const user = userEvent.setup();
    mockFetchHeartbeatStatus.mockResolvedValue({
      tasks: [MOCK_TASK, MOCK_TASK_DISABLED],
      running: true, enabled: true, intervalMs: 60000, beatCount: 0, lastBeat: null,
    });
    renderComponent();

    await waitFor(() => screen.getByText('db-health-check'));

    const stateFilter = screen.getByLabelText('Filter by state');
    await user.selectOptions(stateFilter, 'disabled');

    expect(screen.queryByText('db-health-check')).not.toBeInTheDocument();
    expect(screen.getByText('email-check')).toBeInTheDocument();
  });

  it('shows "No monitors match" when all are filtered out', async () => {
    const user = userEvent.setup();
    mockFetchHeartbeatStatus.mockResolvedValue({
      tasks: [MOCK_TASK],
      running: true, enabled: true, intervalMs: 60000, beatCount: 0, lastBeat: null,
    });
    renderComponent();

    await waitFor(() => screen.getByText('db-health-check'));

    const searchInput = screen.getByLabelText('Search heartbeat monitors');
    await user.type(searchInput, 'nonexistent');

    expect(screen.getByText(/No monitors match/)).toBeInTheDocument();
  });

  it('clears all filters when Clear is clicked', async () => {
    const user = userEvent.setup();
    mockFetchHeartbeatStatus.mockResolvedValue({
      tasks: [MOCK_TASK, MOCK_TASK_DISABLED],
      running: true, enabled: true, intervalMs: 60000, beatCount: 0, lastBeat: null,
    });
    renderComponent();

    await waitFor(() => screen.getByText('db-health-check'));

    const searchInput = screen.getByLabelText('Search heartbeat monitors');
    await user.type(searchInput, 'db-health');

    expect(screen.getByText('1 of 2')).toBeInTheDocument();

    await user.click(screen.getByText('Clear'));

    expect(screen.getByText('db-health-check')).toBeInTheDocument();
    expect(screen.getByText('email-check')).toBeInTheDocument();
    expect(screen.getByText('2 monitors')).toBeInTheDocument();
  });

  it('shows date preset buttons', async () => {
    mockFetchHeartbeatStatus.mockResolvedValue({
      tasks: [MOCK_TASK],
      running: true, enabled: true, intervalMs: 60000, beatCount: 0, lastBeat: null,
    });
    renderComponent();

    await waitFor(() => screen.getByText('db-health-check'));

    expect(screen.getByText('Last hour')).toBeInTheDocument();
    expect(screen.getByText('Last 24h')).toBeInTheDocument();
    expect(screen.getByText('Last 7 days')).toBeInTheDocument();
    expect(screen.getByText('All time')).toBeInTheDocument();
  });

  it('expands a card to show execution log', async () => {
    const user = userEvent.setup();
    mockFetchHeartbeatStatus.mockResolvedValue({
      tasks: [MOCK_TASK],
      running: true, enabled: true, intervalMs: 60000, beatCount: 0, lastBeat: null,
    });
    mockFetchHeartbeatLog.mockResolvedValue({
      entries: [
        {
          id: 'log-1',
          checkName: 'db-health-check',
          status: 'ok' as const,
          message: 'All good',
          ranAt: Date.now() - 60000,
          durationMs: 150,
          personalityId: null,
          errorDetail: null,
        },
      ],
      total: 1,
    });

    renderComponent();

    await waitFor(() => screen.getByText('db-health-check'));

    // Click expand button
    const expandBtn = screen.getByTitle('Toggle execution history');
    await user.click(expandBtn);

    await waitFor(() => {
      expect(screen.getByText('Execution Log')).toBeInTheDocument();
    });

    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('shows type filter when multiple types exist', async () => {
    const taskB: HeartbeatTask = {
      name: 'api-check',
      type: 'api',
      enabled: true,
      intervalMs: 30000,
      lastRunAt: Date.now(),
      config: {},
      personalities: [],
    };
    mockFetchHeartbeatStatus.mockResolvedValue({
      tasks: [MOCK_TASK, taskB],
      running: true, enabled: true, intervalMs: 60000, beatCount: 0, lastBeat: null,
    });
    renderComponent();

    await waitFor(() => screen.getByText('db-health-check'));

    expect(screen.getByLabelText('Filter by type')).toBeInTheDocument();
  });
});
