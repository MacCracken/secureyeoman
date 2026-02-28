// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { createMetricsSnapshot } from '../test/mocks';
import type { HealthStatus } from '../types';

// ── Mock recharts (ResizeObserver not available in jsdom) ─────────────
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Area: () => null,
  Bar: () => null,
  Pie: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

// ── Capture navigate calls ────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Capture MetricsGraph onNodeClick ──────────────────────────────────

let capturedOnNodeClick: ((nodeId: string) => void) | undefined;

vi.mock('./MetricsGraph', () => ({
  MetricsGraph: ({
    onNodeClick,
  }: {
    onNodeClick?: (nodeId: string) => void;
    [key: string]: unknown;
  }) => {
    capturedOnNodeClick = onNodeClick;
    return <div data-testid="metrics-graph">MetricsGraph</div>;
  },
}));

// ── Mock API client ───────────────────────────────────────────────────

vi.mock('../api/client', () => ({
  fetchHeartbeatStatus: vi.fn(),
  fetchMcpServers: vi.fn(),
  fetchActiveDelegations: vi.fn(),
  fetchMetrics: vi.fn(),
  fetchCostBreakdown: vi.fn(),
  fetchCostHistory: vi.fn(),
  fetchPersonalities: vi.fn(),
  resetUsageStat: vi.fn(),
  fetchTasks: vi.fn(),
  fetchSecurityEvents: vi.fn(),
  fetchAuditEntries: vi.fn(),
  fetchWorkflows: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchHeartbeatStatus = vi.mocked(api.fetchHeartbeatStatus);
const mockFetchMcpServers = vi.mocked(api.fetchMcpServers);
const mockFetchActiveDelegations = vi.mocked(api.fetchActiveDelegations);
const mockFetchMetrics = vi.mocked(api.fetchMetrics);
const mockFetchCostBreakdown = vi.mocked(api.fetchCostBreakdown);
const mockFetchCostHistory = vi.mocked(api.fetchCostHistory);
const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);
const mockFetchTasks = vi.mocked(api.fetchTasks);
const mockFetchSecurityEvents = vi.mocked(api.fetchSecurityEvents);
const mockFetchAuditEntries = vi.mocked(api.fetchAuditEntries);
const mockFetchWorkflows = vi.mocked(api.fetchWorkflows);

// ── Mock ErrorBoundary (prevents Suspense errors swallowing output) ───

vi.mock('./common/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Import after mocks ────────────────────────────────────────────────

import { MetricsPage } from './MetricsPage';

// ── Fixtures ──────────────────────────────────────────────────────────

const HEALTH: HealthStatus = {
  status: 'ok',
  version: '1.2.3',
  uptime: 7_200_000,
  checks: { database: true, auditChain: true },
};

// ── Helpers ───────────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderMetricsPage(
  props: { metrics?: ReturnType<typeof createMetricsSnapshot>; health?: HealthStatus } = {}
) {
  const { metrics = createMetricsSnapshot(), health = HEALTH } = props;
  const qc = createQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MetricsPage metrics={metrics} health={health} />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('MetricsPage — layout and header', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    capturedOnNodeClick = undefined;
    mockNavigate.mockReset();

    mockFetchHeartbeatStatus.mockResolvedValue({
      running: true,
      enabled: true,
      intervalMs: 60_000,
      beatCount: 42,
      lastBeat: null,
      tasks: [
        {
          enabled: true,
          name: 'health',
          type: 'health',
          lastRunAt: null,
          config: {},
          personalityId: null,
          personalityName: null,
        },
      ],
    });
    mockFetchMcpServers.mockResolvedValue({ servers: [], total: 0 });
    mockFetchActiveDelegations.mockResolvedValue({ delegations: [] });
    mockFetchMetrics.mockResolvedValue(createMetricsSnapshot());
    mockFetchCostBreakdown.mockResolvedValue({ byProvider: {}, recommendations: [] });
    mockFetchCostHistory.mockResolvedValue({
      records: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 },
    });
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    mockFetchSecurityEvents.mockResolvedValue({ events: [], total: 0 });
    mockFetchAuditEntries.mockResolvedValue({ entries: [], total: 0, limit: 6, offset: 0 });
    mockFetchWorkflows.mockResolvedValue({ definitions: [], total: 0 });
  });

  it('renders the "Mission Control" page heading', () => {
    renderMetricsPage();
    expect(screen.getByRole('heading', { name: /mission control/i })).toBeInTheDocument();
  });

  it('shows a Mission Control tab button selected by default', () => {
    renderMetricsPage();
    const mcBtn = screen.getByRole('tab', { name: /mission control/i });
    expect(mcBtn).toBeInTheDocument();
    expect(mcBtn).toHaveAttribute('aria-selected', 'true');
  });

  it('shows a Full Metrics tab button', () => {
    renderMetricsPage();
    const fullBtn = screen.getByRole('tab', { name: /full metrics/i });
    expect(fullBtn).toBeInTheDocument();
    expect(fullBtn).toHaveAttribute('aria-selected', 'false');
  });

  it('has a data-testid for the container', () => {
    renderMetricsPage();
    expect(screen.getByTestId('metrics-page')).toBeInTheDocument();
  });
});

describe('MetricsPage — Mission Control tab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    capturedOnNodeClick = undefined;
    mockNavigate.mockReset();

    mockFetchHeartbeatStatus.mockResolvedValue({
      running: true,
      enabled: true,
      intervalMs: 60_000,
      beatCount: 7,
      lastBeat: null,
      tasks: [],
    });
    mockFetchMcpServers.mockResolvedValue({ servers: [], total: 0 });
    mockFetchActiveDelegations.mockResolvedValue({ delegations: [] });
    mockFetchMetrics.mockResolvedValue(createMetricsSnapshot());
    mockFetchCostBreakdown.mockResolvedValue({ byProvider: {}, recommendations: [] });
    mockFetchCostHistory.mockResolvedValue({
      records: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 },
    });
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    mockFetchSecurityEvents.mockResolvedValue({ events: [], total: 0 });
    mockFetchAuditEntries.mockResolvedValue({ entries: [], total: 0, limit: 6, offset: 0 });
    mockFetchWorkflows.mockResolvedValue({ definitions: [], total: 0 });
  });

  it('renders the MetricsGraph in the Mission Control tab', async () => {
    renderMetricsPage();
    expect(await screen.findByTestId('metrics-graph')).toBeInTheDocument();
  });

  it('passes onNodeClick to MetricsGraph', async () => {
    renderMetricsPage();
    await screen.findByTestId('metrics-graph');
    expect(capturedOnNodeClick).toBeDefined();
  });

  it('displays KPI stat card titles', () => {
    renderMetricsPage();
    // "Active Tasks" appears in both the KPI bar and the feed panel header
    expect(screen.getAllByText('Active Tasks').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Tasks Today')).toBeInTheDocument();
    expect(screen.getByText('Cost Today')).toBeInTheDocument();
    expect(screen.getByText('Audit Entries')).toBeInTheDocument();
  });

  it('displays health status items', () => {
    renderMetricsPage();
    expect(screen.getByText('Core')).toBeInTheDocument();
    expect(screen.getByText('Database')).toBeInTheDocument();
    expect(screen.getByText('Audit Chain')).toBeInTheDocument();
  });

  it('shows correct metric values from the snapshot', () => {
    const metrics = createMetricsSnapshot();
    renderMetricsPage({ metrics });
    // Active tasks (inProgress count)
    expect(screen.getByText(String(metrics.tasks.inProgress))).toBeInTheDocument();
  });
});

describe('MetricsPage — tab switching', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchHeartbeatStatus.mockResolvedValue({
      running: false,
      enabled: false,
      intervalMs: 60_000,
      beatCount: 0,
      lastBeat: null,
      tasks: [],
    });
    mockFetchMcpServers.mockResolvedValue({ servers: [], total: 0 });
    mockFetchActiveDelegations.mockResolvedValue({ delegations: [] });
    mockFetchMetrics.mockResolvedValue(createMetricsSnapshot());
    mockFetchCostBreakdown.mockResolvedValue({ byProvider: {}, recommendations: [] });
    mockFetchCostHistory.mockResolvedValue({
      records: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 },
    });
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    mockFetchSecurityEvents.mockResolvedValue({ events: [], total: 0 });
    mockFetchAuditEntries.mockResolvedValue({ entries: [], total: 0, limit: 6, offset: 0 });
    mockFetchWorkflows.mockResolvedValue({ definitions: [], total: 0 });
  });

  it('switches to Full Metrics tab when clicked', () => {
    renderMetricsPage();
    const fullBtn = screen.getByRole('tab', { name: /full metrics/i });
    fireEvent.click(fullBtn);
    expect(fullBtn).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /mission control/i })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  it('shows Task Performance section in Full Metrics tab', () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));
    expect(screen.getByText('Task Performance')).toBeInTheDocument();
  });

  it('shows Infrastructure section in Full Metrics tab', () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));
    expect(screen.getByText('Infrastructure')).toBeInTheDocument();
  });

  it('shows Security section in Full Metrics tab', () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));
    expect(screen.getByText('Security')).toBeInTheDocument();
  });

  it('does not render MetricsGraph in Full Metrics tab', () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));
    expect(screen.queryByTestId('metrics-graph')).not.toBeInTheDocument();
  });

  it('can switch back to Mission Control from Full Metrics', () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));
    fireEvent.click(screen.getByRole('tab', { name: /mission control/i }));
    expect(screen.getByRole('tab', { name: /mission control/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});

describe('MetricsPage — Mission Control node click routing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    capturedOnNodeClick = undefined;
    mockNavigate.mockReset();
    mockFetchHeartbeatStatus.mockResolvedValue({
      running: true,
      enabled: true,
      intervalMs: 60_000,
      beatCount: 5,
      lastBeat: null,
      tasks: [],
    });
    mockFetchMcpServers.mockResolvedValue({ servers: [], total: 0 });
    mockFetchActiveDelegations.mockResolvedValue({ delegations: [] });
    mockFetchMetrics.mockResolvedValue(createMetricsSnapshot());
    mockFetchCostBreakdown.mockResolvedValue({ byProvider: {}, recommendations: [] });
    mockFetchCostHistory.mockResolvedValue({
      records: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 },
    });
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    mockFetchSecurityEvents.mockResolvedValue({ events: [], total: 0 });
    mockFetchAuditEntries.mockResolvedValue({ entries: [], total: 0, limit: 6, offset: 0 });
    mockFetchWorkflows.mockResolvedValue({ definitions: [], total: 0 });
  });

  it('navigates to /security?tab=overview when security node is clicked', async () => {
    renderMetricsPage();
    await screen.findByTestId('metrics-graph');
    capturedOnNodeClick!('security');
    expect(mockNavigate).toHaveBeenCalledWith('/security?tab=overview');
  });

  it('navigates to /security?tab=audit when audit node is clicked', async () => {
    renderMetricsPage();
    await screen.findByTestId('metrics-graph');
    capturedOnNodeClick!('audit');
    expect(mockNavigate).toHaveBeenCalledWith('/security?tab=audit');
  });

  it('navigates to /security?tab=tasks when tasks node is clicked', async () => {
    renderMetricsPage();
    await screen.findByTestId('metrics-graph');
    capturedOnNodeClick!('tasks');
    expect(mockNavigate).toHaveBeenCalledWith('/security?tab=tasks');
  });

  it('navigates to /mcp when mcp node is clicked', async () => {
    renderMetricsPage();
    await screen.findByTestId('metrics-graph');
    capturedOnNodeClick!('mcp');
    expect(mockNavigate).toHaveBeenCalledWith('/mcp');
  });

  it('navigates to /security?tab=nodes&node=agent for unknown node', async () => {
    renderMetricsPage();
    await screen.findByTestId('metrics-graph');
    capturedOnNodeClick!('agent');
    expect(mockNavigate).toHaveBeenCalledWith('/security?tab=nodes&node=agent');
  });

  it('navigates to /security?tab=nodes&node=database for database node', async () => {
    renderMetricsPage();
    await screen.findByTestId('metrics-graph');
    capturedOnNodeClick!('database');
    expect(mockNavigate).toHaveBeenCalledWith('/security?tab=nodes&node=database');
  });

  it('navigates to /security?tab=nodes&node=resources for resources node', async () => {
    renderMetricsPage();
    await screen.findByTestId('metrics-graph');
    capturedOnNodeClick!('resources');
    expect(mockNavigate).toHaveBeenCalledWith('/security?tab=nodes&node=resources');
  });
});

describe('MetricsPage — Full Metrics data display', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchHeartbeatStatus.mockResolvedValue({
      running: false,
      enabled: false,
      intervalMs: 60_000,
      beatCount: 0,
      lastBeat: null,
      tasks: [],
    });
    mockFetchMcpServers.mockResolvedValue({ servers: [], total: 0 });
    mockFetchActiveDelegations.mockResolvedValue({ delegations: [] });
    mockFetchMetrics.mockResolvedValue(createMetricsSnapshot());
    mockFetchCostBreakdown.mockResolvedValue({ byProvider: {}, recommendations: [] });
    mockFetchCostHistory.mockResolvedValue({
      records: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 },
    });
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    mockFetchSecurityEvents.mockResolvedValue({ events: [], total: 0 });
    mockFetchAuditEntries.mockResolvedValue({ entries: [], total: 0, limit: 6, offset: 0 });
    mockFetchWorkflows.mockResolvedValue({ definitions: [], total: 0 });
  });

  it('shows task stat cards in Full Metrics', () => {
    const metrics = createMetricsSnapshot();
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));
    expect(screen.getByText('Total Tasks')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Avg Duration')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
  });

  it('shows authentication section in Security', () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));
    expect(screen.getByText('Authentication')).toBeInTheDocument();
  });

  it('shows Audit Trail section in Security', () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));
    expect(screen.getByText('Audit Trail')).toBeInTheDocument();
  });

  it('displays Chain Integrity Verified when auditChainValid is true', () => {
    const metrics = createMetricsSnapshot({
      security: { ...createMetricsSnapshot().security, auditChainValid: true },
    });
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));
    expect(screen.getByText('Chain Integrity Verified')).toBeInTheDocument();
  });

  it('displays Chain Integrity Compromised when auditChainValid is false', () => {
    const metrics = createMetricsSnapshot({
      security: { ...createMetricsSnapshot().security, auditChainValid: false },
    });
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));
    expect(screen.getByText('Chain Integrity Compromised')).toBeInTheDocument();
  });
});

describe('MetricsPage — Costs tab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchHeartbeatStatus.mockResolvedValue({
      running: false,
      enabled: false,
      intervalMs: 60_000,
      beatCount: 0,
      lastBeat: null,
      tasks: [],
    });
    mockFetchMcpServers.mockResolvedValue({ servers: [], total: 0 });
    mockFetchActiveDelegations.mockResolvedValue({ delegations: [] });
    mockFetchMetrics.mockResolvedValue(createMetricsSnapshot());
    mockFetchCostBreakdown.mockResolvedValue({ byProvider: {}, recommendations: [] });
    mockFetchCostHistory.mockResolvedValue({
      records: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 },
    });
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    mockFetchSecurityEvents.mockResolvedValue({ events: [], total: 0 });
    mockFetchAuditEntries.mockResolvedValue({ entries: [], total: 0, limit: 6, offset: 0 });
    mockFetchWorkflows.mockResolvedValue({ definitions: [], total: 0 });
  });

  it('shows a Costs tab button', () => {
    renderMetricsPage();
    const costsBtn = screen.getByRole('tab', { name: /costs/i });
    expect(costsBtn).toBeInTheDocument();
    expect(costsBtn).toHaveAttribute('aria-selected', 'false');
  });

  it('tab order is Mission Control | Costs | Full Metrics', () => {
    renderMetricsPage();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveTextContent(/mission control/i);
    expect(tabs[1]).toHaveTextContent(/costs/i);
    expect(tabs[2]).toHaveTextContent(/full metrics/i);
  });

  it('switches to Costs tab when clicked', () => {
    renderMetricsPage();
    const costsBtn = screen.getByRole('tab', { name: /costs/i });
    fireEvent.click(costsBtn);
    expect(costsBtn).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /mission control/i })).toHaveAttribute(
      'aria-selected',
      'false'
    );
    expect(screen.getByRole('tab', { name: /full metrics/i })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  it('shows Summary and History sub-tab buttons in Costs tab', () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /costs/i }));
    expect(screen.getByRole('button', { name: /summary/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument();
  });

  it('does not render MetricsGraph in Costs tab', () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /costs/i }));
    expect(screen.queryByTestId('metrics-graph')).not.toBeInTheDocument();
  });

  it('can switch back to Mission Control from Costs tab', () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /costs/i }));
    fireEvent.click(screen.getByRole('tab', { name: /mission control/i }));
    expect(screen.getByRole('tab', { name: /mission control/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('can navigate from Costs to Full Metrics tab', () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /costs/i }));
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));
    expect(screen.getByRole('tab', { name: /full metrics/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});

// ── Agent World card ────────────────────────────────────────────────────────────

describe('MetricsPage — Agent World card', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    capturedOnNodeClick = undefined;
    mockNavigate.mockReset();

    mockFetchHeartbeatStatus.mockResolvedValue({
      running: true, enabled: true, intervalMs: 60_000, beatCount: 0, lastBeat: null, tasks: [],
    });
    mockFetchMcpServers.mockResolvedValue({ servers: [], total: 0 });
    mockFetchActiveDelegations.mockResolvedValue({ delegations: [] });
    mockFetchMetrics.mockResolvedValue(createMetricsSnapshot());
    mockFetchCostBreakdown.mockResolvedValue({ byProvider: {}, recommendations: [] });
    mockFetchCostHistory.mockResolvedValue({
      records: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 },
    });
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    mockFetchSecurityEvents.mockResolvedValue({ events: [], total: 0 });
    mockFetchAuditEntries.mockResolvedValue({ entries: [], total: 0, limit: 6, offset: 0 });
    mockFetchWorkflows.mockResolvedValue({ definitions: [], total: 0 });
  });

  it('renders "Agent World" card heading in Mission Control tab', async () => {
    renderMetricsPage();
    expect(await screen.findByText('Agent World')).toBeInTheDocument();
  });

  it('renders "Live personality activity" card description', async () => {
    renderMetricsPage();
    expect(await screen.findByText('Live personality activity')).toBeInTheDocument();
  });

  it('shows empty message when no personalities returned', async () => {
    renderMetricsPage();
    expect(await screen.findByText(/no agents found/i)).toBeInTheDocument();
  });

  it('shows agent cards when personalities are available', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [
        { id: 'p-1', name: 'FRIDAY', isActive: true, createdAt: 1000, updatedAt: 1000 } as any,
      ],
    });
    renderMetricsPage();
    expect(await screen.findByText('FRIDAY')).toBeInTheDocument();
  });

  it('Agent World card is absent from the Costs tab', async () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /costs/i }));
    await screen.findByRole('tab', { name: /costs/i });
    expect(screen.queryByText('Agent World')).not.toBeInTheDocument();
  });

  it('clicking an agent card navigates to /soul/personalities?focus=<id>', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [
        {
          id: 'p-nav-1',
          name: 'NavAgent',
          isActive: true,
          createdAt: 1_000_000,
          updatedAt: 1_000_000,
        } as any,
      ],
    });
    renderMetricsPage();
    await screen.findByText('NavAgent');
    fireEvent.click(screen.getByTitle(/NavAgent/i));
    expect(mockNavigate).toHaveBeenCalledWith('/soul/personalities?focus=p-nav-1');
  });

  it('zoom buttons appear in the Agent World card header', async () => {
    renderMetricsPage();
    await screen.findByText('Agent World');
    expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /zoom out/i })).toBeInTheDocument();
  });

  it('double-clicking the card header opens the fullscreen overlay', async () => {
    renderMetricsPage();
    const header = await screen.findByTitle('Double-click to expand');
    fireEvent.dblClick(header);
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /agent world.*fullscreen/i })).toBeInTheDocument();
    });
  });

  it('clicking the × button in fullscreen closes the overlay', async () => {
    renderMetricsPage();
    const header = await screen.findByTitle('Double-click to expand');
    fireEvent.dblClick(header);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /exit fullscreen/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('pressing Escape closes the fullscreen overlay', async () => {
    renderMetricsPage();
    const header = await screen.findByTitle('Double-click to expand');
    fireEvent.dblClick(header);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('fullscreen overlay contains view-mode toggle buttons', async () => {
    renderMetricsPage();
    const header = await screen.findByTitle('Double-click to expand');
    fireEvent.dblClick(header);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('[title="Card grid view"]')).toBeInTheDocument();
    expect(dialog.querySelector('[title="World map view"]')).toBeInTheDocument();
    expect(dialog.querySelector('[title="Large zone view"]')).toBeInTheDocument();
  });
});
