// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SecuritySettings } from './SecuritySettings';
import { createMetricsSnapshot } from '../test/mocks';

vi.mock('../api/client', () => ({
  fetchRoles: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  fetchAssignments: vi.fn(),
  assignRole: vi.fn(),
  revokeAssignment: vi.fn(),
  fetchAuditStats: vi.fn(),
  fetchMetrics: vi.fn(),
  fetchSecurityPolicy: vi.fn(),
  updateSecurityPolicy: vi.fn(),
  fetchMcpServers: vi.fn(),
  fetchModelDefault: vi.fn(),
  setModelDefault: vi.fn(),
  clearModelDefault: vi.fn(),
  fetchModelInfo: vi.fn(),
  fetchAgentConfig: vi.fn(),
  updateAgentConfig: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchRoles = vi.mocked(api.fetchRoles);
const mockFetchAssignments = vi.mocked(api.fetchAssignments);
const mockFetchAuditStats = vi.mocked(api.fetchAuditStats);
const mockFetchMetrics = vi.mocked(api.fetchMetrics);
const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);
const mockUpdateSecurityPolicy = vi.mocked(api.updateSecurityPolicy);
const mockFetchMcpServers = vi.mocked(api.fetchMcpServers);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <SecuritySettings />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('SecuritySettings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchRoles.mockResolvedValue({
      roles: [
        {
          id: 'role_admin',
          name: 'admin',
          permissions: [
            { resource: 'read', action: '*' },
            { resource: 'write', action: '*' },
            { resource: 'delete', action: '*' },
          ],
          isBuiltin: true,
        },
        {
          id: 'role_viewer',
          name: 'viewer',
          permissions: [{ resource: 'read', action: '*' }],
          isBuiltin: true,
        },
      ],
    });
    mockFetchAssignments.mockResolvedValue({ assignments: [] });
    mockFetchAuditStats.mockResolvedValue({
      totalEntries: 1250,
      chainValid: true,
      lastVerification: Date.now(),
    });
    mockFetchMetrics.mockResolvedValue(
      createMetricsSnapshot({
        security: {
          authAttemptsTotal: 0,
          authSuccessTotal: 0,
          authFailuresTotal: 0,
          activeSessions: 0,
          permissionChecksTotal: 0,
          permissionDenialsTotal: 0,
          blockedRequestsTotal: 0,
          rateLimitHitsTotal: 5,
          injectionAttemptsTotal: 0,
          eventsBySeverity: {},
          eventsByType: {},
          auditEntriesTotal: 1250,
          auditChainValid: true,
        },
      })
    );
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
      allowCodeEditor: true,
      allowAdvancedEditor: false,
    });
    mockUpdateSecurityPolicy.mockResolvedValue({
      allowSubAgents: true,
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
      allowCodeEditor: true,
      allowAdvancedEditor: false,
    });
    mockFetchMcpServers.mockResolvedValue({ servers: [], total: 0 });
    vi.mocked(api.fetchModelDefault).mockResolvedValue({ provider: null, model: null });
    vi.mocked(api.fetchAgentConfig).mockResolvedValue({ config: { enabled: false } } as never);
    vi.mocked(api.fetchModelInfo).mockResolvedValue({
      current: {
        provider: 'anthropic',
        model: 'claude-opus-4-5',
        maxTokens: 8192,
        temperature: 0.7,
      },
      available: {},
    });
  });

  it('renders the heading', async () => {
    renderComponent();
    expect(await screen.findByText('Security')).toBeInTheDocument();
  });

  it('renders Sub-Agent Delegation section', async () => {
    renderComponent();
    expect(await screen.findByText('Sub-Agent Delegation')).toBeInTheDocument();
  });

  it('hides A2A Networks toggle when Sub-Agent Delegation is off', async () => {
    renderComponent();
    await screen.findByText('Sub-Agent Delegation');
    expect(screen.queryByLabelText('Toggle A2A Networks')).not.toBeInTheDocument();
  });

  it('shows A2A Networks toggle when Sub-Agent Delegation is on', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: true,
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
      allowCodeEditor: true,
      allowAdvancedEditor: false,
    });
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle A2A Networks');
    expect(toggle).toBeInTheDocument();
  });

  it('renders Lifecycle Extensions section', async () => {
    renderComponent();
    expect(await screen.findByText('Lifecycle Extensions')).toBeInTheDocument();
    expect(screen.getByLabelText('Toggle Lifecycle Extensions')).toBeInTheDocument();
  });

  it('renders Code Execution toggle enabled by default', async () => {
    renderComponent();
    expect(await screen.findByText('Code Execution')).toBeInTheDocument();
    const toggle = screen.getByLabelText('Toggle Code Execution');
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('renders MCP Servers section with manage link', async () => {
    renderComponent();
    expect(await screen.findByText('MCP Servers')).toBeInTheDocument();
    expect(screen.getByText('Manage')).toBeInTheDocument();
  });

  it('displays MCP server counts', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        { id: '1', name: 'srv1', transport: 'stdio', enabled: true } as never,
        { id: '2', name: 'srv2', transport: 'http', enabled: false } as never,
      ],
      total: 2,
    });
    renderComponent();
    expect(await screen.findByText('2 servers')).toBeInTheDocument();
    expect(screen.getByText('1 servers')).toBeInTheDocument();
  });

  // ── ML Security ────────────────────────────────────────────────────

  it('renders ML Security section header', async () => {
    renderComponent();
    expect(await screen.findByText('ML Security')).toBeInTheDocument();
  });

  it('renders Anomaly Detection toggle', async () => {
    renderComponent();
    expect(await screen.findByText('Anomaly Detection')).toBeInTheDocument();
    expect(screen.getByLabelText('Toggle Anomaly Detection')).toBeInTheDocument();
  });

  it('Anomaly Detection is disabled by default (aria-checked=false)', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Anomaly Detection');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('calls updateSecurityPolicy with allowAnomalyDetection when toggled', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Anomaly Detection');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ allowAnomalyDetection: true });
    });
  });

  it('shows Sub-Agent Delegation as disabled by default', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Sub-Agent Delegation');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('calls updateSecurityPolicy when toggling Sub-Agent Delegation', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Sub-Agent Delegation');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ allowSubAgents: true });
    });
  });

  it('calls updateSecurityPolicy when toggling A2A (with sub-agents enabled)', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: true,
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
      allowCodeEditor: true,
      allowAdvancedEditor: false,
    });
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle A2A Networks');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ allowA2A: true });
    });
  });

  it('hides Agent Swarms toggle when Sub-Agent Delegation is off', async () => {
    renderComponent();
    await screen.findByText('Sub-Agent Delegation');
    expect(screen.queryByLabelText('Toggle Agent Swarms')).not.toBeInTheDocument();
  });

  it('shows Agent Swarms toggle when Sub-Agent Delegation is on', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: true,
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
      allowCodeEditor: true,
      allowAdvancedEditor: false,
    });
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Agent Swarms');
    expect(toggle).toBeInTheDocument();
  });

  it('calls updateSecurityPolicy when toggling Agent Swarms', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: true,
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
      allowCodeEditor: true,
      allowAdvancedEditor: false,
    });
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Agent Swarms');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ allowSwarms: true });
    });
  });

  it('calls updateSecurityPolicy when toggling Extensions', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Lifecycle Extensions');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ allowExtensions: true });
    });
  });

  it('calls updateSecurityPolicy when toggling Code Execution off', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Code Execution');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ allowExecution: false });
    });
  });

  it('renders Proactive Assistance toggle', async () => {
    renderComponent();
    expect(await screen.findByText('Proactive Assistance')).toBeInTheDocument();
    const toggle = screen.getByLabelText('Toggle Proactive Assistance');
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('calls updateSecurityPolicy when toggling Proactive Assistance', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Proactive Assistance');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ allowProactive: true });
    });
  });

  it('renders Multimodal I/O toggle', async () => {
    renderComponent();
    expect(await screen.findByText('Multimodal I/O')).toBeInTheDocument();
    const toggle = screen.getByLabelText('Toggle Multimodal I/O');
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('calls updateSecurityPolicy when toggling Multimodal I/O', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Multimodal I/O');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ allowMultimodal: true });
    });
  });

  it('renders Experiments toggle', async () => {
    renderComponent();
    expect(await screen.findByText('Experiments')).toBeInTheDocument();
    const toggle = screen.getByLabelText('Toggle Experiments');
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('calls updateSecurityPolicy when toggling Experiments', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Experiments');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ allowExperiments: true });
    });
  });

  // ── Dynamic Tool Creation ──────────────────────────────────────────

  it('renders Dynamic Tool Creation toggle', async () => {
    renderComponent();
    expect(await screen.findByText('Dynamic Tool Creation')).toBeInTheDocument();
    const toggle = screen.getByLabelText('Toggle Dynamic Tool Creation');
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('DTC sandbox toggle not shown when DTC is disabled', async () => {
    renderComponent();
    await screen.findByText('Dynamic Tool Creation');
    expect(screen.queryByLabelText('Toggle Sandboxed Execution')).not.toBeInTheDocument();
  });

  it('shows sandbox toggle when DTC is enabled', async () => {
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
      allowDynamicTools: true,
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
      allowCodeEditor: true,
      allowAdvancedEditor: false,
    });
    renderComponent();
    const sandboxToggle = await screen.findByLabelText('Toggle Sandboxed Execution');
    expect(sandboxToggle).toBeInTheDocument();
  });

  it('sandbox toggle is enabled by default when DTC is on', async () => {
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
      allowDynamicTools: true,
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
      allowCodeEditor: true,
      allowAdvancedEditor: false,
    });
    renderComponent();
    const sandboxToggle = await screen.findByLabelText('Toggle Sandboxed Execution');
    expect(sandboxToggle.getAttribute('aria-checked')).toBe('true');
  });

  it('calls updateSecurityPolicy with allowDynamicTools when DTC toggled', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Dynamic Tool Creation');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ allowDynamicTools: true });
    });
  });

  it('calls updateSecurityPolicy with sandboxDynamicTools when sandbox toggled', async () => {
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
      allowDynamicTools: true,
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
      allowCodeEditor: true,
      allowAdvancedEditor: false,
    });
    renderComponent();
    const sandboxToggle = await screen.findByLabelText('Toggle Sandboxed Execution');
    fireEvent.click(sandboxToggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ sandboxDynamicTools: false });
    });
  });

  it('AI model default: fetchModelDefault is called on mount', async () => {
    renderComponent();
    await screen.findByText('Security');
    expect(vi.mocked(api.fetchModelDefault)).toHaveBeenCalled();
  });

  // ── Sandbox Isolation (includes Code Execution) ────────────────────

  it('renders Sandbox Isolation section header', async () => {
    renderComponent();
    expect(await screen.findByText('Sandbox Isolation')).toBeInTheDocument();
  });

  it('renders gVisor Isolation toggle', async () => {
    renderComponent();
    expect(await screen.findByText('gVisor Isolation')).toBeInTheDocument();
    const toggle = screen.getByLabelText('Toggle gVisor Isolation');
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('calls updateSecurityPolicy with sandboxGvisor when toggled', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle gVisor Isolation');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ sandboxGvisor: true });
    });
  });

  it('calls updateSecurityPolicy with sandboxWasm when toggled', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle WASM Isolation');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ sandboxWasm: true });
    });
  });

  // ── Workflow Orchestration ─────────────────────────────────────────

  it('renders Workflow Orchestration toggle (off by default)', async () => {
    renderComponent();
    expect(await screen.findByText('Workflow Orchestration')).toBeInTheDocument();
    const toggle = screen.getByLabelText('Toggle Workflow Orchestration');
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('calls updateSecurityPolicy when toggling Workflow Orchestration', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Workflow Orchestration');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ allowWorkflows: true });
    });
  });

  // ── Community Skills ───────────────────────────────────────────────

  it('renders Community Skills toggle (off by default)', async () => {
    renderComponent();
    expect(await screen.findByText('Community Skills')).toBeInTheDocument();
    const toggle = screen.getByLabelText('Toggle Community Skills');
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('calls updateSecurityPolicy when toggling Community Skills', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Community Skills');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ allowCommunityGitFetch: true });
    });
  });

  // ── Twingate ───────────────────────────────────────────────────────

  it('renders Twingate card and toggle (off by default)', async () => {
    renderComponent();
    // The card heading "Twingate" is always rendered
    expect(await screen.findByRole('heading', { name: /^twingate$/i })).toBeInTheDocument();
    const toggle = screen.getByLabelText('Toggle Allow Twingate');
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('calls updateSecurityPolicy when toggling Allow Twingate', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Allow Twingate');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ allowTwingate: true });
    });
  });

  // ── Code Editor ────────────────────────────────────────────────────

  it('renders Code Editor toggle enabled by default', async () => {
    renderComponent();
    expect(await screen.findByText('Code Editor')).toBeInTheDocument();
    const toggle = screen.getByLabelText('Toggle Code Editor');
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('calls updateSecurityPolicy with allowCodeEditor when toggled', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Code Editor');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ allowCodeEditor: false });
    });
  });

  it('renders Advanced Editor Mode toggle disabled by default', async () => {
    renderComponent();
    expect(await screen.findByText('Advanced Editor Mode')).toBeInTheDocument();
    const toggle = screen.getByLabelText('Toggle Advanced Editor Mode');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('calls updateSecurityPolicy with allowAdvancedEditor when toggled', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Advanced Editor Mode');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ allowAdvancedEditor: true });
    });
  });

  it('greyed-out wrapper is absent when Code Editor is enabled', async () => {
    renderComponent();
    await screen.findByText('Advanced Editor Mode');
    // When codeEditorAllowed=true the opacity-40 wrapper should not be present
    const wrapper = document.querySelector('.opacity-40.pointer-events-none');
    expect(wrapper).not.toBeInTheDocument();
  });

  it('shows "Requires Code Editor" hint when Code Editor is off', async () => {
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
      allowCodeEditor: false,
      allowAdvancedEditor: false,
    });
    renderComponent();
    expect(await screen.findByText(/requires code editor/i)).toBeInTheDocument();
  });
});
