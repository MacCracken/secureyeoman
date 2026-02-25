// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SecurityPage } from './SecurityPage';
import { createMetricsSnapshot } from '../test/mocks';

// ── Mock API client ──────────────────────────────────────────────────
vi.mock('../api/client', () => ({
  fetchSecurityEvents: vi.fn(),
  fetchAuditEntries: vi.fn(),
  verifyAuditChain: vi.fn(),
  fetchTasks: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  updateTask: vi.fn(),
  fetchHeartbeatTasks: vi.fn(),
  fetchReports: vi.fn(),
  generateReport: vi.fn(),
  downloadReport: vi.fn(),
  fetchHealth: vi.fn(),
  fetchMetrics: vi.fn(),
  fetchAuditStats: vi.fn(),
  fetchMcpServers: vi.fn(),
  fetchMlSummary: vi.fn(),
  fetchSecurityPolicy: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchSecurityEvents = vi.mocked(api.fetchSecurityEvents);
const mockFetchHealth = vi.mocked(api.fetchHealth);
const mockFetchMetrics = vi.mocked(api.fetchMetrics);
const mockFetchAuditStats = vi.mocked(api.fetchAuditStats);
const mockFetchMcpServers = vi.mocked(api.fetchMcpServers);
const mockFetchHeartbeatTasks = vi.mocked(api.fetchHeartbeatTasks);
const mockFetchTasks = vi.mocked(api.fetchTasks);
const mockFetchReports = vi.mocked(api.fetchReports);
const mockFetchAuditEntries = vi.mocked(api.fetchAuditEntries);
const mockFetchMlSummary = vi.mocked(api.fetchMlSummary);
const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);

// ── Helpers ──────────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderWithRoute(route = '/security?tab=nodes') {
  const qc = createQueryClient();
  return render(
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider client={qc}>
        <SecurityPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

// ── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  mockFetchSecurityEvents.mockResolvedValue({ events: [], total: 0 });
  mockFetchHealth.mockResolvedValue({
    status: 'ok',
    version: '1.2.3',
    uptime: 7_200_000,
    checks: { database: true, auditChain: true },
  });
  mockFetchMetrics.mockResolvedValue(createMetricsSnapshot());
  mockFetchAuditStats.mockResolvedValue({
    totalEntries: 500,
    oldestEntry: Date.now() - 86_400_000,
    lastVerification: Date.now() - 3_600_000,
    chainValid: true,
    dbSizeEstimateMb: 12.5,
  });
  mockFetchMcpServers.mockResolvedValue({
    servers: [
      {
        id: 'mcp-1',
        name: 'Git Server',
        description: 'Git tools',
        transport: 'stdio',
        command: 'git-mcp',
        args: [],
        url: null,
        env: {},
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    total: 1,
  });
  mockFetchHeartbeatTasks.mockResolvedValue({ tasks: [] });
  mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
  mockFetchReports.mockResolvedValue({ reports: [], total: 0 });
  mockFetchAuditEntries.mockResolvedValue({ entries: [], total: 0, limit: 20, offset: 0 });
  mockFetchMlSummary.mockResolvedValue({
    enabled: false,
    period: '7d',
    riskScore: 0,
    riskLevel: 'low',
    detections: { anomaly: 0, injectionAttempt: 0, sandboxViolation: 0, secretAccess: 0, total: 0 },
    trend: [],
  });
  mockFetchSecurityPolicy.mockResolvedValue({
    allowSubAgents: false,
    allowA2A: false,
    allowSwarms: false,
    allowExtensions: false,
    allowExecution: true,
    allowProactive: false,
    allowExperiments: false,
    allowStorybook: false,
    allowMultimodal: false,
      allowDesktopControl: false,
      allowCamera: false,
    allowDynamicTools: false,
    sandboxDynamicTools: true,
    allowAnomalyDetection: false,
    sandboxGvisor: false,
    sandboxWasm: false,
    sandboxCredentialProxy: false,
    allowNetworkTools: false,
    allowNetBoxWrite: false,
    allowWorkflows: false,
    allowCommunityGitFetch: false,
    allowTwingate: false,
    allowOrgIntent: false,
    allowIntentEditor: false,
  });
});

// ── Tests ────────────────────────────────────────────────────────────

describe('SecurityPage — System Details tab', () => {
  it('renders the System Details tab button', () => {
    renderWithRoute('/security');
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('shows system details content when tab=nodes', async () => {
    renderWithRoute('/security?tab=nodes');
    expect(await screen.findByText('System', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByText('Status for each system component')).toBeInTheDocument();
  });

  it('renders all 7 node panels', async () => {
    renderWithRoute('/security?tab=nodes');
    expect(await screen.findByText('Agent Core')).toBeInTheDocument();
    expect(screen.getByText('Task Queue')).toBeInTheDocument();
    expect(screen.getByText('Postgres')).toBeInTheDocument();
    expect(screen.getByText('Audit Chain')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    // "Security" appears in both the page header and the node panel
    const securityElements = screen.getAllByText('Security');
    expect(securityElements.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('MCP Servers')).toBeInTheDocument();
  });

  it('auto-expands the node specified in ?node= param', async () => {
    renderWithRoute('/security?tab=nodes&node=database');

    // Wait for query data to resolve — "Connected" only shows when health query resolves
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Connection')).toBeInTheDocument();
    expect(screen.getByText('DB Size')).toBeInTheDocument();
  });

  it('does not auto-expand panels when no node param is set', async () => {
    renderWithRoute('/security?tab=nodes');

    await screen.findByText('Agent Core');

    // Detail rows should not be visible since no panel is expanded
    expect(screen.queryByText('Version')).not.toBeInTheDocument();
    expect(screen.queryByText('Connection')).not.toBeInTheDocument();
  });

  it('expands and collapses a node panel on click', async () => {
    renderWithRoute('/security?tab=nodes');

    await screen.findByText('Agent Core');

    // Click the Agent Core panel header
    fireEvent.click(screen.getByText('Agent Core'));

    // Should show detail rows (wait for query data)
    expect(await screen.findByText('Version')).toBeInTheDocument();
    expect(screen.getByText('Uptime')).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(screen.getByText('Agent Core'));
    expect(screen.queryByText('Version')).not.toBeInTheDocument();
  });

  it('shows agent core details with metrics data', async () => {
    renderWithRoute('/security?tab=nodes&node=agent');

    // Wait for health query to resolve
    expect(await screen.findByText('1.2.3')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('ok')).toBeInTheDocument();
    expect(screen.getByText('Active Tasks')).toBeInTheDocument();
    expect(screen.getByText('Queue Depth')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
  });

  it('shows task queue details with duration stats', async () => {
    renderWithRoute('/security?tab=nodes&node=tasks');

    // Wait for metrics query to resolve — check for a value from the mock data
    expect(await screen.findByText('1.23s')).toBeInTheDocument();
    expect(screen.getByText('Queue Depth')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Avg Duration')).toBeInTheDocument();
    expect(screen.getByText('P95 Duration')).toBeInTheDocument();
    expect(screen.getByText('P99 Duration')).toBeInTheDocument();
  });

  it('shows database details with audit stats', async () => {
    renderWithRoute('/security?tab=nodes&node=database');

    // Wait for both health and audit stats to resolve
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Connection')).toBeInTheDocument();
    expect(screen.getByText('Audit Entries')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('Chain Valid')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('12.5 MB')).toBeInTheDocument();
  });

  it('shows audit chain details', async () => {
    renderWithRoute('/security?tab=nodes&node=audit');

    // Wait for audit stats to resolve
    expect(await screen.findByText('Valid')).toBeInTheDocument();
    expect(screen.getByText('Chain Status')).toBeInTheDocument();
    expect(screen.getByText('Total Entries')).toBeInTheDocument();
    expect(screen.getByText('Oldest Entry')).toBeInTheDocument();
  });

  it('shows resource/memory details', async () => {
    renderWithRoute('/security?tab=nodes&node=resources');

    // Wait for metrics to resolve
    expect(await screen.findByText('256.0 MB')).toBeInTheDocument();
    expect(screen.getByText('Memory Used')).toBeInTheDocument();
    expect(screen.getByText('CPU %')).toBeInTheDocument();
    expect(screen.getByText('34.5%')).toBeInTheDocument();
    expect(screen.getByText('Tokens Today')).toBeInTheDocument();
    expect(screen.getByText('48500')).toBeInTheDocument();
    expect(screen.getByText('Cost Today')).toBeInTheDocument();
    expect(screen.getByText('$1.2300')).toBeInTheDocument();
  });

  it('shows security details', async () => {
    renderWithRoute('/security?tab=nodes&node=security');

    // Wait for metrics to resolve
    expect(await screen.findByText('45')).toBeInTheDocument();
    expect(screen.getByText('Auth Attempts')).toBeInTheDocument();
    expect(screen.getByText('Auth Failures')).toBeInTheDocument();
    expect(screen.getByText('Blocked Requests')).toBeInTheDocument();
    expect(screen.getByText('Injection Attempts')).toBeInTheDocument();
    expect(screen.getByText('Rate Limit Hits')).toBeInTheDocument();
  });

  it('shows MCP server details with individual servers', async () => {
    renderWithRoute('/security?tab=nodes&node=mcp');

    // Wait for MCP servers query to resolve
    expect(await screen.findByText('Git Server')).toBeInTheDocument();
    expect(screen.getByText('Enabled / Total')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
  });

  it('shows OK status badge for healthy nodes', async () => {
    renderWithRoute('/security?tab=nodes');
    await screen.findByText('Agent Core');

    await waitFor(() => {
      const badges = screen.getAllByText('OK');
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it('shows Warning badge when injection attempts detected', async () => {
    renderWithRoute('/security?tab=nodes');

    // Security node should show Warning because injectionAttemptsTotal > 0
    await waitFor(() => {
      expect(screen.getByText('Warning')).toBeInTheDocument();
    });
  });

  it('shows Error badge when database is down', async () => {
    mockFetchHealth.mockResolvedValue({
      status: 'ok',
      version: '1.2.3',
      uptime: 7_200_000,
      checks: { database: false, auditChain: true },
    });

    renderWithRoute('/security?tab=nodes');

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
  });

  it('can expand multiple panels simultaneously', async () => {
    renderWithRoute('/security?tab=nodes');
    await screen.findByText('Agent Core');

    fireEvent.click(screen.getByText('Agent Core'));
    fireEvent.click(screen.getByText('Postgres'));

    // Both panels should show their detail rows
    expect(screen.getByText('Version')).toBeInTheDocument();
    expect(screen.getByText('Connection')).toBeInTheDocument();
  });

  it('switches to System Details tab when clicking the tab button', async () => {
    renderWithRoute('/security');

    fireEvent.click(screen.getByText('System'));

    expect(await screen.findByText('Status for each system component')).toBeInTheDocument();
  });
});

// ── ML tab ───────────────────────────────────────────────────────────

/** Enable allowAnomalyDetection in the policy mock */
function enableMlPolicy() {
  mockFetchSecurityPolicy.mockResolvedValue({
    allowSubAgents: false,
    allowA2A: false,
    allowSwarms: false,
    allowExtensions: false,
    allowExecution: true,
    allowProactive: false,
    allowExperiments: false,
    allowStorybook: false,
    allowMultimodal: false,
      allowDesktopControl: false,
      allowCamera: false,
    allowDynamicTools: false,
    sandboxDynamicTools: true,
    allowAnomalyDetection: true,
    sandboxGvisor: false,
    sandboxWasm: false,
    sandboxCredentialProxy: false,
    allowNetworkTools: false,
    allowNetBoxWrite: false,
    allowWorkflows: false,
    allowCommunityGitFetch: false,
    allowTwingate: false,
    allowOrgIntent: false,
    allowIntentEditor: false,
  });
}

describe('SecurityPage — ML tab', () => {
  it('does NOT render the ML tab button when allowAnomalyDetection is false', () => {
    renderWithRoute('/security');
    expect(screen.queryByText('ML')).not.toBeInTheDocument();
  });

  it('renders the ML tab button when allowAnomalyDetection is true', async () => {
    enableMlPolicy();
    renderWithRoute('/security');
    expect(await screen.findByText('ML')).toBeInTheDocument();
  });

  it('shows ML content when clicking the ML tab', async () => {
    enableMlPolicy();
    renderWithRoute('/security');
    fireEvent.click(await screen.findByText('ML'));
    expect(await screen.findByText('ML & Anomaly Detection')).toBeInTheDocument();
  });

  it('shows ML content when navigating to ?tab=ml with policy enabled', async () => {
    enableMlPolicy();
    renderWithRoute('/security?tab=ml');
    expect(await screen.findByText('ML & Anomaly Detection')).toBeInTheDocument();
  });

  it('redirects to overview when navigating to ?tab=ml with policy disabled', async () => {
    // policy mock returns allowAnomalyDetection: false (beforeEach default)
    renderWithRoute('/security?tab=ml');
    // ML content should never appear; overview content should be shown instead
    await waitFor(() => {
      expect(screen.queryByText('ML & Anomaly Detection')).not.toBeInTheDocument();
    });
  });

  it('shows disabled banner when enabled is false (inside ML summary)', async () => {
    enableMlPolicy();
    mockFetchMlSummary.mockResolvedValue({
      enabled: false,
      period: '7d',
      riskScore: 0,
      riskLevel: 'low',
      detections: { anomaly: 0, injectionAttempt: 0, sandboxViolation: 0, secretAccess: 0, total: 0 },
      trend: [],
    });
    renderWithRoute('/security?tab=ml');
    expect(await screen.findByText(/ML anomaly detection is disabled/)).toBeInTheDocument();
  });

  it('shows enabled banner when enabled is true', async () => {
    enableMlPolicy();
    mockFetchMlSummary.mockResolvedValue({
      enabled: true,
      period: '7d',
      riskScore: 5,
      riskLevel: 'low',
      detections: { anomaly: 0, injectionAttempt: 0, sandboxViolation: 0, secretAccess: 0, total: 0 },
      trend: [],
    });
    renderWithRoute('/security?tab=ml');
    expect(await screen.findByText(/ML anomaly detection is active/)).toBeInTheDocument();
  });

  it('shows risk score from summary data', async () => {
    enableMlPolicy();
    mockFetchMlSummary.mockResolvedValue({
      enabled: true,
      period: '7d',
      riskScore: 42,
      riskLevel: 'medium',
      detections: { anomaly: 2, injectionAttempt: 1, sandboxViolation: 0, secretAccess: 0, total: 3 },
      trend: [],
    });
    renderWithRoute('/security?tab=ml');
    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(screen.getByText('medium')).toBeInTheDocument();
  });

  it('shows detection stat cards', async () => {
    enableMlPolicy();
    mockFetchMlSummary.mockResolvedValue({
      enabled: true,
      period: '7d',
      riskScore: 15,
      riskLevel: 'low',
      detections: { anomaly: 3, injectionAttempt: 2, sandboxViolation: 1, secretAccess: 4, total: 10 },
      trend: [],
    });
    renderWithRoute('/security?tab=ml');
    expect(await screen.findByText('Anomalies')).toBeInTheDocument();
    expect(screen.getByText('Injections')).toBeInTheDocument();
    expect(screen.getByText('Sandbox Violations')).toBeInTheDocument();
    expect(screen.getByText('Credential Scans')).toBeInTheDocument();
  });

  it('shows event feed using fetchSecurityEvents', async () => {
    enableMlPolicy();
    mockFetchSecurityEvents.mockResolvedValue({
      events: [
        {
          id: 'ev-1',
          type: 'anomaly',
          severity: 'warn',
          message: 'Anomalous request pattern detected',
          timestamp: Date.now(),
          acknowledged: false,
        },
      ],
      total: 1,
    });
    renderWithRoute('/security?tab=ml');
    expect(await screen.findByText('Anomalous request pattern detected')).toBeInTheDocument();
  });
});
