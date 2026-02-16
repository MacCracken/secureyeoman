// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { createMetricsSnapshot } from '../test/mocks';
import type { HealthStatus } from '../types';

// ── Capture navigate calls ──────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Mock lazy-loaded components ─────────────────────────────────────
// Only MetricsGraph is relevant; stub others to avoid pulling in
// heavy dependencies (ReactFlow, Recharts, Monaco, etc.)

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

vi.mock('./ResourceMonitor', () => ({
  ResourceMonitor: () => <div data-testid="resource-monitor">ResourceMonitor</div>,
}));

vi.mock('./SecurityPage', () => ({
  SecurityPage: () => <div>SecurityPage</div>,
}));

vi.mock('./PersonalityEditor', () => ({
  PersonalityEditor: () => <div>PersonalityEditor</div>,
}));

vi.mock('./CodePage', () => ({
  CodePage: () => <div>CodePage</div>,
}));

vi.mock('./ChatPage', () => ({
  ChatPage: () => <div>ChatPage</div>,
}));

vi.mock('./ExperimentsPage', () => ({
  ExperimentsPage: () => <div>ExperimentsPage</div>,
}));

vi.mock('./SettingsPage', () => ({
  SettingsPage: () => <div>SettingsPage</div>,
}));

vi.mock('./SkillsPage', () => ({
  SkillsPage: () => <div>SkillsPage</div>,
}));

vi.mock('./ConnectionsPage', () => ({
  ConnectionsPage: () => <div>ConnectionsPage</div>,
}));

// ── Mock hooks and other components ─────────────────────────────────

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock('../hooks/useSidebar', () => ({
  useSidebar: () => ({ collapsed: false, setMobileOpen: vi.fn() }),
}));

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => ({ connected: true, reconnecting: false }),
}));

vi.mock('./Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar">Sidebar</div>,
}));

vi.mock('./SearchBar', () => ({
  SearchBar: () => <div>SearchBar</div>,
}));

vi.mock('./NotificationBell', () => ({
  NotificationBell: () => <div>NotificationBell</div>,
}));

vi.mock('./OnboardingWizard', () => ({
  OnboardingWizard: () => <div>OnboardingWizard</div>,
}));

vi.mock('./common/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Mock API client ─────────────────────────────────────────────────

vi.mock('../api/client', () => ({
  fetchHealth: vi.fn(),
  fetchMetrics: vi.fn(),
  fetchOnboardingStatus: vi.fn(),
  fetchHeartbeatStatus: vi.fn(),
  fetchMcpServers: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchHealth = vi.mocked(api.fetchHealth);
const mockFetchMetrics = vi.mocked(api.fetchMetrics);
const mockFetchOnboardingStatus = vi.mocked(api.fetchOnboardingStatus);
const mockFetchHeartbeatStatus = vi.mocked(api.fetchHeartbeatStatus);
const mockFetchMcpServers = vi.mocked(api.fetchMcpServers);

// ── Import after mocks ──────────────────────────────────────────────
import { DashboardLayout } from './DashboardLayout';

// ── Helpers ──────────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderOverviewPage() {
  const qc = createQueryClient();
  return render(
    <MemoryRouter initialEntries={['/']}>
      <QueryClientProvider client={qc}>
        <DashboardLayout />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────

describe('DashboardLayout — OverviewPage node click routing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    capturedOnNodeClick = undefined;
    mockNavigate.mockReset();

    mockFetchHealth.mockResolvedValue({
      status: 'ok',
      version: '1.0.0',
      uptime: 3_600_000,
      checks: { database: true, auditChain: true },
    });
    mockFetchMetrics.mockResolvedValue(createMetricsSnapshot());
    mockFetchOnboardingStatus.mockResolvedValue({
      needed: false,
      agentName: 'Friday',
      personality: null,
    });
    mockFetchHeartbeatStatus.mockResolvedValue({
      running: true,
      enabled: true,
      intervalMs: 60_000,
      beatCount: 42,
      lastBeat: null,
      tasks: [],
    });
    mockFetchMcpServers.mockResolvedValue({ servers: [], total: 0 });
  });

  it('renders MetricsGraph with onNodeClick on the overview page', async () => {
    renderOverviewPage();
    expect(await screen.findByTestId('metrics-graph')).toBeInTheDocument();
    expect(capturedOnNodeClick).toBeDefined();
  });

  it('navigates to /security?tab=overview when security node is clicked', async () => {
    renderOverviewPage();
    await screen.findByTestId('metrics-graph');

    capturedOnNodeClick!('security');
    expect(mockNavigate).toHaveBeenCalledWith('/security?tab=overview');
  });

  it('navigates to /security?tab=audit when audit node is clicked', async () => {
    renderOverviewPage();
    await screen.findByTestId('metrics-graph');

    capturedOnNodeClick!('audit');
    expect(mockNavigate).toHaveBeenCalledWith('/security?tab=audit');
  });

  it('navigates to /security?tab=tasks when tasks node is clicked', async () => {
    renderOverviewPage();
    await screen.findByTestId('metrics-graph');

    capturedOnNodeClick!('tasks');
    expect(mockNavigate).toHaveBeenCalledWith('/security?tab=tasks');
  });

  it('navigates to /mcp when mcp node is clicked', async () => {
    renderOverviewPage();
    await screen.findByTestId('metrics-graph');

    capturedOnNodeClick!('mcp');
    expect(mockNavigate).toHaveBeenCalledWith('/mcp');
  });

  it('navigates to /security?tab=nodes&node=agent for agent node', async () => {
    renderOverviewPage();
    await screen.findByTestId('metrics-graph');

    capturedOnNodeClick!('agent');
    expect(mockNavigate).toHaveBeenCalledWith('/security?tab=nodes&node=agent');
  });

  it('navigates to /security?tab=nodes&node=database for database node', async () => {
    renderOverviewPage();
    await screen.findByTestId('metrics-graph');

    capturedOnNodeClick!('database');
    expect(mockNavigate).toHaveBeenCalledWith('/security?tab=nodes&node=database');
  });

  it('navigates to /security?tab=nodes&node=resources for resources node', async () => {
    renderOverviewPage();
    await screen.findByTestId('metrics-graph');

    capturedOnNodeClick!('resources');
    expect(mockNavigate).toHaveBeenCalledWith('/security?tab=nodes&node=resources');
  });
});
