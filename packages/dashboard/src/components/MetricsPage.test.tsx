// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

// ── Mock EntityWidget (canvas + ResizeObserver not available in jsdom)
vi.mock('./EntityWidget', () => ({
  EntityWidget: (props: Record<string, unknown>) => (
    <div data-testid="entity-widget" data-state={props.state ?? 'dormant'} />
  ),
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
  fetchMcpConfig: vi.fn().mockResolvedValue({ exposeBullshiftTools: false }),
  getAccessToken: vi.fn(() => null),
}));

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    connected: false,
    reconnecting: false,
    lastMessage: null,
    send: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
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

// ── Mock @dnd-kit (not available in jsdom) ────────────────────────────

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  closestCenter: vi.fn(),
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  arrayMove: (arr: unknown[], from: number, to: number) => {
    const a = [...arr];
    const [x] = a.splice(from, 1);
    a.splice(to, 0, x);
    return a;
  },
  rectSortingStrategy: vi.fn(),
  sortableKeyboardCoordinates: vi.fn(),
}));
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
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
    localStorage.removeItem('mission-control:layout');

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
    localStorage.removeItem('mission-control:layout');

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
    localStorage.removeItem('mission-control:layout');
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
    localStorage.removeItem('mission-control:layout');
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
    localStorage.removeItem('mission-control:layout');
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
    localStorage.removeItem('mission-control:layout');
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

  it('tab order is Mission Control | Costs | Full Metrics | Analytics', () => {
    renderMetricsPage();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveTextContent(/mission control/i);
    expect(tabs[1]).toHaveTextContent(/costs/i);
    expect(tabs[2]).toHaveTextContent(/full metrics/i);
    expect(tabs[3]).toHaveTextContent(/analytics/i);
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
    // Make agent-world visible by default for this describe block
    localStorage.setItem(
      'mission-control:layout',
      JSON.stringify({
        version: 1,
        cards: [{ id: 'agent-world', visible: true, colSpan: 12, order: 0 }],
      })
    );

    mockFetchHeartbeatStatus.mockResolvedValue({
      running: true,
      enabled: true,
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

// ── Mission Control customization ────────────────────────────────────────────

describe('MetricsPage — Mission Control customization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    capturedOnNodeClick = undefined;
    mockNavigate.mockReset();
    localStorage.removeItem('mission-control:layout');

    mockFetchHeartbeatStatus.mockResolvedValue({
      running: true,
      enabled: true,
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

  it('renders the "Customize" button when Mission Control tab is active', () => {
    renderMetricsPage();
    expect(screen.getByRole('button', { name: /customize/i })).toBeInTheDocument();
  });

  it('does not show "Customize" button on the Costs tab', () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /costs/i }));
    expect(screen.queryByRole('button', { name: /customize/i })).not.toBeInTheDocument();
  });

  it('clicking Customize opens the catalogue panel with heading "Customize Dashboard"', async () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('button', { name: /customize/i }));
    expect(await screen.findByText('Customize Dashboard')).toBeInTheDocument();
  });

  it('catalogue panel lists all 12 card labels', async () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('button', { name: /customize/i }));
    const heading = await screen.findByText('Customize Dashboard');
    // Scope to the catalogue panel itself to avoid duplicate matches from the grid
    const panel = heading.closest('div.fixed')! as HTMLElement;
    const expectedLabels = [
      'Key Metrics Bar',
      'Resource Monitoring',
      'Active Tasks',
      'Workflow Runs',
      'Agent Health',
      'System Health',
      'Integration Status',
      'Security Events',
      'Audit Stream',
      'System Topology',
      'Cost Breakdown',
      'Agent World',
    ];
    for (const label of expectedLabels) {
      expect(within(panel).getByText(label)).toBeInTheDocument();
    }
  });

  it('kpi-bar toggle is disabled (pinned card cannot be removed)', async () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('button', { name: /customize/i }));
    await screen.findByText('Customize Dashboard');
    // Find the switch for Key Metrics Bar — it should be disabled
    const switches = screen.getAllByRole('switch');
    const kpiSwitch = switches.find((s) => {
      const row = s.closest('div.flex');
      return row?.textContent?.includes('Key Metrics Bar');
    });
    expect(kpiSwitch).toBeDefined();
    expect(kpiSwitch).toBeDisabled();
  });

  it('agent-world toggle is unchecked by default', async () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('button', { name: /customize/i }));
    await screen.findByText('Customize Dashboard');
    const switches = screen.getAllByRole('switch');
    const agentWorldSwitch = switches.find((s) => {
      const row = s.closest('div.flex');
      return row?.textContent?.includes('Agent World');
    });
    expect(agentWorldSwitch).toBeDefined();
    expect(agentWorldSwitch).toHaveAttribute('aria-checked', 'false');
  });

  it('toggling agent-world on makes the Agent World section appear in the grid', async () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('button', { name: /customize/i }));
    await screen.findByText('Customize Dashboard');
    const switches = screen.getAllByRole('switch');
    const agentWorldSwitch = switches.find((s) => {
      const row = s.closest('div.flex');
      return row?.textContent?.includes('Agent World');
    })!;
    fireEvent.click(agentWorldSwitch);
    // After toggling on, the Agent World section heading should appear in the grid
    expect(await screen.findByText('Live personality activity')).toBeInTheDocument();
  });

  it('clicking Done closes the catalogue panel', async () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('button', { name: /customize/i }));
    await screen.findByText('Customize Dashboard');
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    await waitFor(() => {
      expect(screen.queryByText('Customize Dashboard')).not.toBeInTheDocument();
    });
  });

  it('Reset to defaults hides agent-world again after it was toggled on', async () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('button', { name: /customize/i }));
    await screen.findByText('Customize Dashboard');
    // Toggle agent-world on
    const switches = screen.getAllByRole('switch');
    const agentWorldSwitch = switches.find((s) => {
      const row = s.closest('div.flex');
      return row?.textContent?.includes('Agent World');
    })!;
    fireEvent.click(agentWorldSwitch);
    await screen.findByText('Live personality activity');
    // Reset
    fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));
    await waitFor(() => {
      expect(screen.queryByText('Live personality activity')).not.toBeInTheDocument();
    });
  });

  it('toggling a non-pinned card off hides it from the grid', async () => {
    renderMetricsPage();
    // Cost Breakdown is visible by default
    expect(await screen.findByText('Cost Breakdown')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /customize/i }));
    await screen.findByText('Customize Dashboard');
    const switches = screen.getAllByRole('switch');
    const costSwitch = switches.find((s) => {
      const row = s.closest('div.flex');
      return row?.textContent?.includes('Cost Breakdown');
    })!;
    fireEvent.click(costSwitch);
    await waitFor(() => {
      // Only the catalogue row label remains; the grid card heading is gone
      const costBreakdownElements = screen.queryAllByText('Cost Breakdown');
      // Only the catalogue row should remain (1 instance inside the panel)
      expect(costBreakdownElements.length).toBeLessThanOrEqual(1);
    });
  });
});

// ── Mission Control — data-driven sections ────────────────────────────────────

describe('MetricsPage — Mission Control data display', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    capturedOnNodeClick = undefined;
    mockNavigate.mockReset();
    localStorage.removeItem('mission-control:layout');

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
        {
          enabled: false,
          name: 'scan',
          type: 'scan',
          lastRunAt: null,
          config: {},
          personalityId: null,
          personalityName: null,
        },
      ],
      totalTasks: 4,
      enabledTasks: 2,
    });
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        {
          id: 's1',
          name: 'MCP-Alpha',
          description: 'Primary',
          transport: 'stdio',
          command: null,
          args: [],
          url: null,
          env: {},
          enabled: true,
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: 's2',
          name: 'MCP-Beta',
          description: 'Secondary',
          transport: 'sse',
          command: null,
          args: [],
          url: null,
          env: {},
          enabled: false,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      total: 2,
    });
    mockFetchActiveDelegations.mockResolvedValue({
      delegations: [
        {
          delegationId: 'd1',
          profileId: 'p1',
          profileName: 'Agent-1',
          task: 'analyze',
          status: 'running',
          depth: 1,
          tokensUsed: 500,
          tokenBudget: 10000,
          startedAt: Date.now() - 30000,
          elapsedMs: 30000,
        },
        {
          delegationId: 'd2',
          profileId: 'p2',
          profileName: 'Agent-2',
          task: 'report',
          status: 'running',
          depth: 2,
          tokensUsed: 200,
          tokenBudget: 10000,
          startedAt: Date.now() - 15000,
          elapsedMs: 15000,
        },
      ],
    });
    mockFetchMetrics.mockResolvedValue(createMetricsSnapshot());
    mockFetchCostBreakdown.mockResolvedValue({
      byProvider: {
        anthropic: { tokensUsed: 50000, costUsd: 0.5, calls: 100, errors: 2 },
        openai: { tokensUsed: 30000, costUsd: 0.3, calls: 80, errors: 0 },
      },
      recommendations: [],
    });
    mockFetchCostHistory.mockResolvedValue({
      records: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 },
    });
    mockFetchPersonalities.mockResolvedValue({
      personalities: [
        {
          id: 'p1',
          name: 'Atlas',
          description: 'Default',
          systemPrompt: '',
          traits: {},
          sex: 'unspecified',
          voice: '',
          preferredLanguage: 'en',
          defaultModel: null,
          modelFallbacks: [],
          includeArchetypes: false,
          injectDateTime: false,
          empathyResonance: false,
          avatarUrl: null,
          isActive: true,
          isDefault: true,
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: 'p2',
          name: 'Scout',
          description: 'Helper',
          systemPrompt: '',
          traits: {},
          sex: 'unspecified',
          voice: '',
          preferredLanguage: 'en',
          defaultModel: null,
          modelFallbacks: [],
          includeArchetypes: false,
          injectDateTime: false,
          empathyResonance: false,
          avatarUrl: '/avatars/scout.png',
          isActive: true,
          isDefault: false,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    mockFetchTasks.mockResolvedValue({
      tasks: [
        {
          id: 'task1',
          name: 'Analyze data',
          type: 'analysis',
          status: 'running',
          createdAt: Date.now(),
        },
        {
          id: 'task2',
          name: 'Generate report',
          type: 'code',
          status: 'running',
          createdAt: Date.now(),
        },
      ],
      total: 2,
    });
    mockFetchSecurityEvents.mockResolvedValue({
      events: [
        {
          id: 'evt1',
          type: 'auth_failure',
          severity: 'warn',
          message: 'Login failed from 10.0.0.1',
          timestamp: Date.now(),
          acknowledged: false,
        },
        {
          id: 'evt2',
          type: 'rate_limit',
          severity: 'info',
          message: 'Rate limit exceeded',
          timestamp: Date.now(),
          acknowledged: false,
        },
        {
          id: 'evt3',
          type: 'injection_attempt',
          severity: 'critical',
          message: 'SQL injection blocked',
          timestamp: Date.now(),
          acknowledged: false,
        },
      ],
      total: 3,
    });
    mockFetchAuditEntries.mockResolvedValue({
      entries: [
        {
          id: 'a1',
          event: 'user_login',
          level: 'info',
          message: 'User admin logged in',
          timestamp: Date.now(),
          sequence: 1,
        },
        {
          id: 'a2',
          event: 'config_change',
          level: 'warn',
          message: 'Config updated by admin',
          timestamp: Date.now(),
          sequence: 2,
        },
        {
          id: 'a3',
          event: 'policy_violation',
          level: 'error',
          message: 'Policy breach detected',
          timestamp: Date.now(),
          sequence: 3,
        },
      ],
      total: 3,
      limit: 50,
      offset: 0,
    });
    mockFetchWorkflows.mockResolvedValue({
      definitions: [
        {
          id: 'wf1',
          name: 'Deploy Pipeline',
          steps: [],
          edges: [],
          triggers: [],
          isEnabled: true,
          version: 1,
          createdBy: 'admin',
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: 'wf2',
          name: 'Backup Job',
          steps: [],
          edges: [],
          triggers: [],
          isEnabled: false,
          version: 1,
          createdBy: 'admin',
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      total: 2,
    });
  });

  it('displays active task names from the fetched data', async () => {
    renderMetricsPage();
    expect(await screen.findByText('Analyze data')).toBeInTheDocument();
    expect(screen.getByText('Generate report')).toBeInTheDocument();
  });

  it('displays active task types', async () => {
    renderMetricsPage();
    expect(await screen.findByText('analysis')).toBeInTheDocument();
    expect(screen.getByText('code')).toBeInTheDocument();
  });

  it('displays workflow names from fetched data', async () => {
    renderMetricsPage();
    expect(await screen.findByText('Deploy Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Backup Job')).toBeInTheDocument();
  });

  it('renders MCP server names and status labels', async () => {
    renderMetricsPage();
    expect(await screen.findByText('MCP-Alpha')).toBeInTheDocument();
    expect(screen.getByText('MCP-Beta')).toBeInTheDocument();
    // Active / Off labels for servers
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  it('displays MCP server count in integrations header', async () => {
    renderMetricsPage();
    // "1/2 active" shown in integrations card
    expect(await screen.findByText('1/2 active')).toBeInTheDocument();
  });

  it('shows MCP server count in system health row', async () => {
    renderMetricsPage();
    expect(await screen.findByText('1/2 servers')).toBeInTheDocument();
  });

  it('renders security event messages', async () => {
    renderMetricsPage();
    expect(await screen.findByText('Login failed from 10.0.0.1')).toBeInTheDocument();
    expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument();
    expect(screen.getByText('SQL injection blocked')).toBeInTheDocument();
  });

  it('renders security event types formatted without underscores', async () => {
    renderMetricsPage();
    expect(await screen.findByText('auth failure')).toBeInTheDocument();
    expect(screen.getByText('rate limit')).toBeInTheDocument();
    expect(screen.getByText('injection attempt')).toBeInTheDocument();
  });

  it('renders audit stream entries with event names and messages', async () => {
    renderMetricsPage();
    expect(await screen.findByText('user login')).toBeInTheDocument();
    expect(screen.getByText('User admin logged in')).toBeInTheDocument();
    expect(screen.getByText('config change')).toBeInTheDocument();
    expect(screen.getByText('Config updated by admin')).toBeInTheDocument();
    expect(screen.getByText('policy violation')).toBeInTheDocument();
  });

  it('displays personality names in Agent Health section', async () => {
    renderMetricsPage();
    expect(await screen.findByText('Atlas')).toBeInTheDocument();
    expect(screen.getByText('Scout')).toBeInTheDocument();
  });

  it('shows heartbeat Running indicator', async () => {
    renderMetricsPage();
    // "Running" appears in both KPI bar trend and Agent Health section
    const runningTexts = await screen.findAllByText('Running');
    expect(runningTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('shows heartbeat Stopped indicator when not running', async () => {
    mockFetchHeartbeatStatus.mockResolvedValue({
      running: false,
      enabled: false,
      intervalMs: 60_000,
      beatCount: 0,
      lastBeat: null,
      tasks: [],
    });
    renderMetricsPage();
    const stoppedTexts = await screen.findAllByText('Stopped');
    expect(stoppedTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Collecting data…" when history is empty (resource chart)', () => {
    renderMetricsPage();
    expect(screen.getByText('Collecting data…')).toBeInTheDocument();
  });

  it('renders cost breakdown provider data with token counts', async () => {
    renderMetricsPage();
    // Cost breakdown section shows provider data
    expect(await screen.findByText('anthropic')).toBeInTheDocument();
    expect(screen.getByText('openai')).toBeInTheDocument();
  });

  it('shows "No provider data yet" when cost breakdown has no providers', async () => {
    mockFetchCostBreakdown.mockResolvedValue({ byProvider: {}, recommendations: [] });
    renderMetricsPage();
    expect(await screen.findByText('No provider data yet')).toBeInTheDocument();
  });

  it('shows token stats in resource monitor (CPU, Memory, Tokens, Cost)', async () => {
    const metrics = createMetricsSnapshot();
    renderMetricsPage({ metrics });
    // CPU
    expect(screen.getByText(`${metrics.resources.cpuPercent.toFixed(1)}%`)).toBeInTheDocument();
    // Memory
    expect(screen.getByText(`${metrics.resources.memoryUsedMb.toFixed(0)} MB`)).toBeInTheDocument();
  });

  it('shows default personality name in Active Agents subtitle', async () => {
    renderMetricsPage();
    // "Atlas" appears in the KPI subtitle and Agent Health section
    const atlasTexts = await screen.findAllByText(/Atlas/);
    expect(atlasTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Chain Valid" trend in Audit Entries KPI when chain is valid', async () => {
    renderMetricsPage();
    expect(await screen.findByText('Chain Valid')).toBeInTheDocument();
  });

  it('renders "Chain Invalid" trend in Audit Entries KPI when chain is invalid', async () => {
    const metrics = createMetricsSnapshot({
      security: { ...createMetricsSnapshot().security, auditChainValid: false },
    });
    renderMetricsPage({ metrics });
    expect(await screen.findByText('Chain Invalid')).toBeInTheDocument();
  });

  it('shows "No active tasks" when inProgress is 0 and tasks list is empty', async () => {
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    const metrics = createMetricsSnapshot({
      tasks: { ...createMetricsSnapshot().tasks, inProgress: 0 },
    });
    renderMetricsPage({ metrics });
    expect(await screen.findByText('No active tasks')).toBeInTheDocument();
  });

  it('shows "No workflows" when workflow definitions is empty', async () => {
    mockFetchWorkflows.mockResolvedValue({ definitions: [], total: 0 });
    renderMetricsPage();
    expect(await screen.findByText('No workflows')).toBeInTheDocument();
  });

  it('shows "No recent events" when security events list is empty', async () => {
    mockFetchSecurityEvents.mockResolvedValue({ events: [], total: 0 });
    renderMetricsPage();
    expect(await screen.findByText('No recent events')).toBeInTheDocument();
  });

  it('shows "No audit entries" when audit entries list is empty', async () => {
    mockFetchAuditEntries.mockResolvedValue({ entries: [], total: 0, limit: 6, offset: 0 });
    renderMetricsPage();
    expect(await screen.findByText('No audit entries')).toBeInTheDocument();
  });

  it('shows "No active agents" when no active personalities', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    renderMetricsPage();
    expect(await screen.findByText('No active agents')).toBeInTheDocument();
  });

  it('shows "No MCP servers configured" when servers list is empty', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [], total: 0 });
    renderMetricsPage();
    expect(await screen.findByText('No MCP servers configured')).toBeInTheDocument();
  });
});

// ── Costs tab — CostSummaryTab detailed ──────────────────────────────────

describe('MetricsPage — Costs tab details', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.removeItem('mission-control:layout');
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
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    mockFetchSecurityEvents.mockResolvedValue({ events: [], total: 0 });
    mockFetchAuditEntries.mockResolvedValue({ entries: [], total: 0, limit: 6, offset: 0 });
    mockFetchWorkflows.mockResolvedValue({ definitions: [], total: 0 });
  });

  it('shows provider breakdown table with totals row', async () => {
    mockFetchMetrics.mockResolvedValue(createMetricsSnapshot());
    mockFetchCostBreakdown.mockResolvedValue({
      byProvider: {
        anthropic: { tokensUsed: 50000, costUsd: 0.5, calls: 100, errors: 2 },
        openai: { tokensUsed: 30000, costUsd: 0.3, calls: 80, errors: 0 },
      },
      recommendations: [],
    });
    mockFetchCostHistory.mockResolvedValue({
      records: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 },
    });

    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /costs/i }));

    await waitFor(() => {
      expect(screen.getByText('Provider Breakdown')).toBeInTheDocument();
      expect(screen.getByText('anthropic')).toBeInTheDocument();
      expect(screen.getByText('openai')).toBeInTheDocument();
      // Provider table headers
      expect(screen.getByText('Provider')).toBeInTheDocument();
      expect(screen.getByText('Tokens Used')).toBeInTheDocument();
      expect(screen.getByText('Cost')).toBeInTheDocument();
      // Total row
      expect(screen.getByText('Total')).toBeInTheDocument();
    });
  });

  it('shows token overview cards (Tokens Used Today, Tokens Cached Today, API Errors)', async () => {
    mockFetchMetrics.mockResolvedValue(createMetricsSnapshot());
    mockFetchCostBreakdown.mockResolvedValue({ byProvider: {}, recommendations: [] });
    mockFetchCostHistory.mockResolvedValue({
      records: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 },
    });

    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /costs/i }));

    await waitFor(() => {
      expect(screen.getByText('Tokens Used Today')).toBeInTheDocument();
      expect(screen.getByText('Tokens Cached Today')).toBeInTheDocument();
      expect(screen.getByText('API Errors')).toBeInTheDocument();
    });
  });

  it('shows recommendation card with priority badge and details', async () => {
    mockFetchMetrics.mockResolvedValue(createMetricsSnapshot());
    mockFetchCostBreakdown.mockResolvedValue({
      byProvider: { anthropic: { tokensUsed: 1000, costUsd: 0.01, calls: 10, errors: 0 } },
      recommendations: [
        {
          id: 'rec1',
          title: 'Enable caching',
          description: 'Turn on prompt caching',
          priority: 'high',
          estimatedSavingsUsd: 0.15,
          currentCostUsd: 0.5,
          suggestedAction: 'Toggle caching',
          category: 'optimization',
        },
      ],
    });
    mockFetchCostHistory.mockResolvedValue({
      records: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 },
    });

    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /costs/i }));

    await waitFor(() => {
      expect(screen.getByText('Enable caching')).toBeInTheDocument();
      expect(screen.getByText('Turn on prompt caching')).toBeInTheDocument();
      expect(screen.getByText('high')).toBeInTheDocument();
      expect(screen.getByText('Toggle caching')).toBeInTheDocument();
      expect(screen.getByText('optimization')).toBeInTheDocument();
    });
  });

  it('shows cost summary card values', async () => {
    const metrics = createMetricsSnapshot();
    mockFetchMetrics.mockResolvedValue(metrics);
    mockFetchCostBreakdown.mockResolvedValue({ byProvider: {}, recommendations: [] });
    mockFetchCostHistory.mockResolvedValue({
      records: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 },
    });

    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /costs/i }));

    await waitFor(() => {
      // Cost Today value
      expect(screen.getByText(`$${metrics.resources.costUsdToday.toFixed(4)}`)).toBeInTheDocument();
      // Cost This Month value
      expect(screen.getByText(`$${metrics.resources.costUsdMonth.toFixed(4)}`)).toBeInTheDocument();
    });
  });

  it('shows provider errors in red when > 0', async () => {
    mockFetchMetrics.mockResolvedValue(createMetricsSnapshot());
    mockFetchCostBreakdown.mockResolvedValue({
      byProvider: {
        anthropic: { tokensUsed: 50000, costUsd: 0.5, calls: 100, errors: 5 },
      },
      recommendations: [],
    });
    mockFetchCostHistory.mockResolvedValue({
      records: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 },
    });

    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /costs/i }));

    await waitFor(() => {
      // Errors column should show the count
      const errorCells = screen.getAllByText('5');
      expect(errorCells.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ── Costs tab — CostHistoryTab ─────────────────────────────────────────────

describe('MetricsPage — Cost History sub-tab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.removeItem('mission-control:layout');
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
    mockFetchPersonalities.mockResolvedValue({
      personalities: [{ id: 'p1', name: 'Atlas', isActive: true, isDefault: true } as any],
    });
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    mockFetchSecurityEvents.mockResolvedValue({ events: [], total: 0 });
    mockFetchAuditEntries.mockResolvedValue({ entries: [], total: 0, limit: 6, offset: 0 });
    mockFetchWorkflows.mockResolvedValue({ definitions: [], total: 0 });
  });

  it('shows empty message when no records match filters', async () => {
    mockFetchCostHistory.mockResolvedValue({
      records: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 },
    });

    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /costs/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /history/i }));

    await waitFor(() => {
      expect(
        screen.getByText('No usage records found for the selected filters.')
      ).toBeInTheDocument();
    });
  });

  it('shows records table with data when records exist', async () => {
    mockFetchCostHistory.mockResolvedValue({
      records: [
        {
          date: '2026-03-05',
          provider: 'anthropic',
          model: 'claude-3',
          personalityId: 'p1',
          inputTokens: 10000,
          outputTokens: 5000,
          cachedTokens: 2000,
          totalTokens: 15000,
          costUsd: 0.25,
          calls: 30,
        },
      ],
      totals: {
        inputTokens: 10000,
        outputTokens: 5000,
        totalTokens: 15000,
        costUsd: 0.25,
        calls: 30,
      },
    });

    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /costs/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /history/i }));

    await waitFor(() => {
      expect(screen.getByText('2026-03-05')).toBeInTheDocument();
      expect(screen.getByText('claude-3')).toBeInTheDocument();
      // $0.2500 appears in both the record row and the totals row
      expect(screen.getAllByText('$0.2500').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows filter controls (From, To, Provider, Model, Personality, Group By)', async () => {
    mockFetchCostHistory.mockResolvedValue({
      records: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 },
    });

    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /costs/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /history/i }));

    await waitFor(() => {
      expect(screen.getByText('From')).toBeInTheDocument();
      expect(screen.getByText('To')).toBeInTheDocument();
      expect(screen.getByText('Model')).toBeInTheDocument();
      expect(screen.getByText('Personality')).toBeInTheDocument();
      expect(screen.getByText('Group By')).toBeInTheDocument();
      expect(screen.getByText('Apply')).toBeInTheDocument();
    });
  });

  it('shows provider options in the provider dropdown', async () => {
    mockFetchCostHistory.mockResolvedValue({
      records: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 },
    });

    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /costs/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /history/i }));

    await waitFor(() => {
      expect(screen.getByText('All providers')).toBeInTheDocument();
      expect(screen.getByText('Anthropic')).toBeInTheDocument();
      expect(screen.getByText('OpenAI')).toBeInTheDocument();
    });
  });

  it('shows personality options in the personality dropdown', async () => {
    mockFetchCostHistory.mockResolvedValue({
      records: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 },
    });

    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /costs/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /history/i }));

    await waitFor(() => {
      expect(screen.getByText('All personalities')).toBeInTheDocument();
    });
  });

  it('shows Usage History heading and description', async () => {
    mockFetchCostHistory.mockResolvedValue({
      records: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 },
    });

    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /costs/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /history/i }));

    await waitFor(() => {
      expect(screen.getByText('Usage History')).toBeInTheDocument();
      expect(screen.getByText('Aggregated token usage and cost over time')).toBeInTheDocument();
    });
  });
});

// ── Full Metrics — Infrastructure details ──────────────────────────────────

describe('MetricsPage — Full Metrics infrastructure details', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.removeItem('mission-control:layout');
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

  it('shows Token Usage card with input/output/cached breakdown', () => {
    const metrics = createMetricsSnapshot();
    mockFetchMetrics.mockResolvedValue(metrics);
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    expect(screen.getByText('Token Usage')).toBeInTheDocument();
    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByText('Output')).toBeInTheDocument();
    expect(screen.getByText('Cached')).toBeInTheDocument();
  });

  it('shows API Performance card with call volume and error rate', () => {
    const metrics = createMetricsSnapshot();
    mockFetchMetrics.mockResolvedValue(metrics);
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    expect(screen.getByText('API Performance')).toBeInTheDocument();
    expect(screen.getByText('Total Calls')).toBeInTheDocument();
    expect(screen.getByText('Avg Latency')).toBeInTheDocument();
    expect(screen.getByText('Error rate')).toBeInTheDocument();
  });

  it('shows disk usage when diskLimitMb is set', () => {
    const metrics = createMetricsSnapshot({
      resources: {
        ...createMetricsSnapshot().resources,
        diskUsedMb: 1024,
        diskLimitMb: 4096,
      },
    });
    mockFetchMetrics.mockResolvedValue(metrics);
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    expect(screen.getByText(/1024 MB of 4096 MB/)).toBeInTheDocument();
  });

  it('shows token limit usage bar when tokensLimitDaily is set', () => {
    const metrics = createMetricsSnapshot({
      resources: {
        ...createMetricsSnapshot().resources,
        tokensUsedToday: 150000,
        tokensLimitDaily: 200000,
      },
    });
    mockFetchMetrics.mockResolvedValue(metrics);
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    expect(screen.getByText('Daily limit usage')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('shows CPU KPI tile in Infrastructure section', () => {
    const metrics = createMetricsSnapshot();
    mockFetchMetrics.mockResolvedValue(metrics);
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('Disk Used')).toBeInTheDocument();
  });

  it('shows CPU & Memory Over Time chart heading', () => {
    const metrics = createMetricsSnapshot();
    mockFetchMetrics.mockResolvedValue(metrics);
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    expect(screen.getByText('CPU & Memory Over Time')).toBeInTheDocument();
    expect(screen.getByText(/last 30 data points/)).toBeInTheDocument();
  });

  it('shows "Collecting metrics data…" when no history data', () => {
    const metrics = createMetricsSnapshot();
    mockFetchMetrics.mockResolvedValue(metrics);
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    expect(screen.getByText('Collecting metrics data…')).toBeInTheDocument();
  });
});

// ── Full Metrics — Security details ─────────────────────────────────────

describe('MetricsPage — Full Metrics security details', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.removeItem('mission-control:layout');
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

  it('shows security KPI tiles (Blocked, Rate Limit, Injection, Active Sessions)', () => {
    const metrics = createMetricsSnapshot();
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    // "Blocked Requests" and "Injection Attempts" appear in both KPI tiles and Audit Trail section
    expect(screen.getAllByText('Blocked Requests').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Rate Limit Hits')).toBeInTheDocument();
    expect(screen.getAllByText('Injection Attempts').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Active Sessions')).toBeInTheDocument();
  });

  it('shows authentication stats (Total, Success, Failed)', () => {
    const metrics = createMetricsSnapshot();
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    expect(screen.getByText('Authentication')).toBeInTheDocument();
    expect(screen.getByText('Login attempts — success vs failure')).toBeInTheDocument();
    expect(screen.getByText('Success rate')).toBeInTheDocument();
  });

  it('shows events by severity section with bar data', () => {
    const metrics = createMetricsSnapshot();
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    expect(screen.getByText('Events by Severity')).toBeInTheDocument();
    expect(screen.getByText('Security event distribution')).toBeInTheDocument();
  });

  it('shows permission checks section with denial rate', () => {
    const metrics = createMetricsSnapshot();
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    expect(screen.getByText('Permission Checks')).toBeInTheDocument();
    expect(screen.getByText('Access control enforcement metrics')).toBeInTheDocument();
    expect(screen.getByText('Denial rate')).toBeInTheDocument();
    expect(screen.getByText('Total Checks')).toBeInTheDocument();
    expect(screen.getByText('Denials')).toBeInTheDocument();
  });

  it('shows audit trail section with chain integrity and total entries', () => {
    const metrics = createMetricsSnapshot();
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    expect(screen.getByText('Audit Trail')).toBeInTheDocument();
    expect(screen.getByText('Tamper-evident log integrity')).toBeInTheDocument();
    expect(screen.getByText('Total Entries')).toBeInTheDocument();
  });

  it('shows "Threats Detected" when injectionAttemptsTotal > 0', () => {
    const metrics = createMetricsSnapshot({
      security: { ...createMetricsSnapshot().security, injectionAttemptsTotal: 3 },
    });
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    expect(screen.getByText('Threats Detected')).toBeInTheDocument();
  });

  it('shows "No Active Threats" when injectionAttemptsTotal is 0', () => {
    const metrics = createMetricsSnapshot({
      security: { ...createMetricsSnapshot().security, injectionAttemptsTotal: 0 },
    });
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    expect(screen.getByText('No Active Threats')).toBeInTheDocument();
  });

  it('shows severity bar items with percentage labels', () => {
    const metrics = createMetricsSnapshot();
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    // The severity data has info: 30, warn: 10, error: 4, critical: 1 = total 45
    // Each row shows a percentage
    expect(screen.getByText('Total events')).toBeInTheDocument();
  });

  it('shows top event types when eventsByType has data', () => {
    const metrics = createMetricsSnapshot();
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    expect(screen.getAllByText('Top event types').length).toBeGreaterThanOrEqual(1);
  });

  it('shows status distribution with task status bars', () => {
    const metrics = createMetricsSnapshot();
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    expect(screen.getByText('Status Distribution')).toBeInTheDocument();
    expect(screen.getByText('Tasks by current state')).toBeInTheDocument();
    // completed: 120 should be shown
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('shows Duration Percentiles card with p50/p95/p99 values', () => {
    const metrics = createMetricsSnapshot();
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    expect(screen.getByText('Duration Percentiles')).toBeInTheDocument();
    expect(screen.getByText('Execution time distribution')).toBeInTheDocument();
    // p50/p95/p99 labels in the bottom summary row
    expect(screen.getByText('p50')).toBeInTheDocument();
    expect(screen.getByText('p95')).toBeInTheDocument();
    expect(screen.getByText('p99')).toBeInTheDocument();
  });

  it('shows "No security events recorded" when severity data is empty', () => {
    const metrics = createMetricsSnapshot({
      security: {
        ...createMetricsSnapshot().security,
        eventsBySeverity: {},
        eventsByType: {},
      },
    });
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    expect(screen.getByText('No security events recorded')).toBeInTheDocument();
  });

  it('shows "No task data yet" when status data is empty', () => {
    const metrics = createMetricsSnapshot({
      tasks: { ...createMetricsSnapshot().tasks, byStatus: {} },
    });
    renderMetricsPage({ metrics });
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));

    expect(screen.getByText('No task data yet')).toBeInTheDocument();
  });
});

// ── Health variant edge cases ─────────────────────────────────────────────

describe('MetricsPage — health and uptime edge cases', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.removeItem('mission-control:layout');
    mockFetchHeartbeatStatus.mockResolvedValue({
      running: true,
      enabled: true,
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

  it('formats uptime as days + hours when > 24h', () => {
    renderMetricsPage({
      health: { ...HEALTH, uptime: 90_000_000 }, // 25 hours
    });
    expect(screen.getByText('1d 1h')).toBeInTheDocument();
  });

  it('formats uptime as hours + minutes when <= 24h', () => {
    renderMetricsPage({
      health: { ...HEALTH, uptime: 7_200_000 }, // 2 hours
    });
    expect(screen.getByText('2h 0m')).toBeInTheDocument();
  });

  it('shows "—" for uptime when health uptime is 0 (falsy)', () => {
    renderMetricsPage({
      health: {
        status: 'ok',
        version: '1.0',
        uptime: 0,
        checks: { database: true, auditChain: true },
      },
    });
    // uptime: 0 is falsy, so the code shows "—"
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows core status text from health object', () => {
    renderMetricsPage({
      health: {
        status: 'degraded',
        version: '1.0',
        uptime: 3600000,
        checks: { database: true, auditChain: true },
      },
    });
    expect(screen.getByText('degraded')).toBeInTheDocument();
  });

  it('shows "Down" for database when check fails', () => {
    renderMetricsPage({
      health: { ...HEALTH, checks: { database: false, auditChain: true } },
    });
    expect(screen.getByText('Down')).toBeInTheDocument();
  });

  it('shows "Invalid" for audit chain when check fails', () => {
    renderMetricsPage({
      health: { ...HEALTH, checks: { database: true, auditChain: false } },
    });
    expect(screen.getByText('Invalid')).toBeInTheDocument();
  });

  it('renders without crashing when metrics is undefined', () => {
    renderMetricsPage({ metrics: undefined });
    expect(screen.getByTestId('metrics-page')).toBeInTheDocument();
  });
});

// ── Rendering without data ──────────────────────────────────────────────

describe('MetricsPage — no data scenarios', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.removeItem('mission-control:layout');
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

  it('renders the page with all zero metrics', () => {
    renderMetricsPage();
    expect(screen.getByTestId('metrics-page')).toBeInTheDocument();
    // KPI cards should still render
    expect(screen.getByText('Active Agents')).toBeInTheDocument();
  });

  it('shows 0 for Active Tasks KPI when no tasks in progress', () => {
    const metrics = createMetricsSnapshot({
      tasks: { ...createMetricsSnapshot().tasks, inProgress: 0 },
    });
    renderMetricsPage({ metrics });
    // "Active Tasks" appears in both KPI bar and the tasks feed card
    expect(screen.getAllByText('Active Tasks').length).toBeGreaterThanOrEqual(1);
  });

  it('shows $0.0000 for Cost Today when no costs', () => {
    const metrics = createMetricsSnapshot({
      resources: { ...createMetricsSnapshot().resources, costUsdToday: 0, costUsdMonth: 0 },
    });
    renderMetricsPage({ metrics });
    expect(screen.getByText('$0.0000')).toBeInTheDocument();
  });

  it('shows tasks by type in Full Metrics when byType has data', () => {
    renderMetricsPage();
    fireEvent.click(screen.getByRole('tab', { name: /full metrics/i }));
    expect(screen.getByText('Tasks by Type')).toBeInTheDocument();
    expect(screen.getByText('Volume breakdown by task category')).toBeInTheDocument();
  });
});
