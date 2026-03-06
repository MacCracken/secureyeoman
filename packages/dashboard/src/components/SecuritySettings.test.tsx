// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SecuritySettings, RolesSettings, SecretsPanel } from './SecuritySettings';
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
  fetchSecretKeys: vi.fn(),
  setSecret: vi.fn(),
  deleteSecret: vi.fn(),
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
      allowCodeEditor: false,
      allowAdvancedEditor: false,
      allowTrainingExport: false,
      promptGuardMode: 'warn' as const,
      responseGuardMode: 'warn' as const,
      jailbreakThreshold: 0.5,
      jailbreakAction: 'warn' as const,
      strictSystemPromptConfidentiality: false,
      abuseDetectionEnabled: true,
      contentGuardrailsEnabled: false,
      contentGuardrailsPiiMode: 'disabled' as const,
      contentGuardrailsToxicityEnabled: false,
      contentGuardrailsToxicityMode: 'warn' as const,
      contentGuardrailsToxicityThreshold: 0.7,
      contentGuardrailsBlockList: [],
      contentGuardrailsBlockedTopics: [],
      contentGuardrailsGroundingEnabled: false,
      contentGuardrailsGroundingMode: 'flag' as const,
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
      allowTrainingExport: false,
      promptGuardMode: 'warn' as const,
      responseGuardMode: 'warn' as const,
      jailbreakThreshold: 0.5,
      jailbreakAction: 'warn' as const,
      strictSystemPromptConfidentiality: false,
      abuseDetectionEnabled: true,
      contentGuardrailsEnabled: false,
      contentGuardrailsPiiMode: 'disabled' as const,
      contentGuardrailsToxicityEnabled: false,
      contentGuardrailsToxicityMode: 'warn' as const,
      contentGuardrailsToxicityThreshold: 0.7,
      contentGuardrailsBlockList: [],
      contentGuardrailsBlockedTopics: [],
      contentGuardrailsGroundingEnabled: false,
      contentGuardrailsGroundingMode: 'flag' as const,
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
        localFirst: false,
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
      allowTrainingExport: false,
      promptGuardMode: 'warn' as const,
      responseGuardMode: 'warn' as const,
      jailbreakThreshold: 0.5,
      jailbreakAction: 'warn' as const,
      strictSystemPromptConfidentiality: false,
      abuseDetectionEnabled: true,
      contentGuardrailsEnabled: false,
      contentGuardrailsPiiMode: 'disabled' as const,
      contentGuardrailsToxicityEnabled: false,
      contentGuardrailsToxicityMode: 'warn' as const,
      contentGuardrailsToxicityThreshold: 0.7,
      contentGuardrailsBlockList: [],
      contentGuardrailsBlockedTopics: [],
      contentGuardrailsGroundingEnabled: false,
      contentGuardrailsGroundingMode: 'flag' as const,
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
      allowTrainingExport: false,
      promptGuardMode: 'warn' as const,
      responseGuardMode: 'warn' as const,
      jailbreakThreshold: 0.5,
      jailbreakAction: 'warn' as const,
      strictSystemPromptConfidentiality: false,
      abuseDetectionEnabled: true,
      contentGuardrailsEnabled: false,
      contentGuardrailsPiiMode: 'disabled' as const,
      contentGuardrailsToxicityEnabled: false,
      contentGuardrailsToxicityMode: 'warn' as const,
      contentGuardrailsToxicityThreshold: 0.7,
      contentGuardrailsBlockList: [],
      contentGuardrailsBlockedTopics: [],
      contentGuardrailsGroundingEnabled: false,
      contentGuardrailsGroundingMode: 'flag' as const,
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
      allowTrainingExport: false,
      promptGuardMode: 'warn' as const,
      responseGuardMode: 'warn' as const,
      jailbreakThreshold: 0.5,
      jailbreakAction: 'warn' as const,
      strictSystemPromptConfidentiality: false,
      abuseDetectionEnabled: true,
      contentGuardrailsEnabled: false,
      contentGuardrailsPiiMode: 'disabled' as const,
      contentGuardrailsToxicityEnabled: false,
      contentGuardrailsToxicityMode: 'warn' as const,
      contentGuardrailsToxicityThreshold: 0.7,
      contentGuardrailsBlockList: [],
      contentGuardrailsBlockedTopics: [],
      contentGuardrailsGroundingEnabled: false,
      contentGuardrailsGroundingMode: 'flag' as const,
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
      allowTrainingExport: false,
      promptGuardMode: 'warn' as const,
      responseGuardMode: 'warn' as const,
      jailbreakThreshold: 0.5,
      jailbreakAction: 'warn' as const,
      strictSystemPromptConfidentiality: false,
      abuseDetectionEnabled: true,
      contentGuardrailsEnabled: false,
      contentGuardrailsPiiMode: 'disabled' as const,
      contentGuardrailsToxicityEnabled: false,
      contentGuardrailsToxicityMode: 'warn' as const,
      contentGuardrailsToxicityThreshold: 0.7,
      contentGuardrailsBlockList: [],
      contentGuardrailsBlockedTopics: [],
      contentGuardrailsGroundingEnabled: false,
      contentGuardrailsGroundingMode: 'flag' as const,
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
      allowTrainingExport: false,
      promptGuardMode: 'warn' as const,
      responseGuardMode: 'warn' as const,
      jailbreakThreshold: 0.5,
      jailbreakAction: 'warn' as const,
      strictSystemPromptConfidentiality: false,
      abuseDetectionEnabled: true,
      contentGuardrailsEnabled: false,
      contentGuardrailsPiiMode: 'disabled' as const,
      contentGuardrailsToxicityEnabled: false,
      contentGuardrailsToxicityMode: 'warn' as const,
      contentGuardrailsToxicityThreshold: 0.7,
      contentGuardrailsBlockList: [],
      contentGuardrailsBlockedTopics: [],
      contentGuardrailsGroundingEnabled: false,
      contentGuardrailsGroundingMode: 'flag' as const,
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
      allowTrainingExport: false,
      promptGuardMode: 'warn' as const,
      responseGuardMode: 'warn' as const,
      jailbreakThreshold: 0.5,
      jailbreakAction: 'warn' as const,
      strictSystemPromptConfidentiality: false,
      abuseDetectionEnabled: true,
      contentGuardrailsEnabled: false,
      contentGuardrailsPiiMode: 'disabled' as const,
      contentGuardrailsToxicityEnabled: false,
      contentGuardrailsToxicityMode: 'warn' as const,
      contentGuardrailsToxicityThreshold: 0.7,
      contentGuardrailsBlockList: [],
      contentGuardrailsBlockedTopics: [],
      contentGuardrailsGroundingEnabled: false,
      contentGuardrailsGroundingMode: 'flag' as const,
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
      allowTrainingExport: false,
      promptGuardMode: 'warn' as const,
      responseGuardMode: 'warn' as const,
      jailbreakThreshold: 0.5,
      jailbreakAction: 'warn' as const,
      strictSystemPromptConfidentiality: false,
      abuseDetectionEnabled: true,
      contentGuardrailsEnabled: false,
      contentGuardrailsPiiMode: 'disabled' as const,
      contentGuardrailsToxicityEnabled: false,
      contentGuardrailsToxicityMode: 'warn' as const,
      contentGuardrailsToxicityThreshold: 0.7,
      contentGuardrailsBlockList: [],
      contentGuardrailsBlockedTopics: [],
      contentGuardrailsGroundingEnabled: false,
      contentGuardrailsGroundingMode: 'flag' as const,
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

  // ── Editor card ────────────────────────────────────────────────────

  it('renders a dedicated Editor card (separate from Developers)', async () => {
    renderComponent();
    // The Editor card heading should exist — it's a separate card from Developers
    const headings = await screen.findAllByRole('heading');
    const editorHeading = headings.find((h) => h.textContent === 'Editor');
    expect(editorHeading).toBeDefined();
  });

  it('Code Editor and Advanced Editor Mode are NOT inside the Developers card', async () => {
    renderComponent();
    await screen.findByText('Code Editor');
    // Find the Developers card and verify it doesn't contain the Code Editor toggle
    const developersHeadings = screen
      .getAllByRole('heading')
      .filter((h) => h.textContent === 'Developers');
    if (developersHeadings.length > 0) {
      const developersCard = developersHeadings[0].closest('.card');
      expect(developersCard?.querySelector('[aria-label="Toggle Code Editor"]')).toBeNull();
    }
  });

  it('renders Code Editor toggle disabled by default', async () => {
    renderComponent();
    expect(await screen.findByText('Code Editor')).toBeInTheDocument();
    const toggle = screen.getByLabelText('Toggle Code Editor');
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('calls updateSecurityPolicy with allowCodeEditor when toggled', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Code Editor');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ allowCodeEditor: true });
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

  it('Advanced Editor Mode wrapper is not greyed out when Code Editor is enabled', async () => {
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
      allowOrgIntent: true,
      allowIntentEditor: false,
      allowCodeEditor: true,
      allowAdvancedEditor: false,
      allowTrainingExport: false,
      promptGuardMode: 'warn' as const,
      responseGuardMode: 'warn' as const,
      jailbreakThreshold: 0.5,
      jailbreakAction: 'warn' as const,
      strictSystemPromptConfidentiality: false,
      abuseDetectionEnabled: true,
      contentGuardrailsEnabled: false,
      contentGuardrailsPiiMode: 'disabled' as const,
      contentGuardrailsToxicityEnabled: false,
      contentGuardrailsToxicityMode: 'warn' as const,
      contentGuardrailsToxicityThreshold: 0.7,
      contentGuardrailsBlockList: [],
      contentGuardrailsBlockedTopics: [],
      contentGuardrailsGroundingEnabled: false,
      contentGuardrailsGroundingMode: 'flag' as const,
    });
    renderComponent();
    const advancedToggle = await screen.findByLabelText('Toggle Advanced Editor Mode');
    await waitFor(() => {
      // The Advanced Editor Mode toggle's wrapper should not have opacity-40 when Code Editor is enabled
      const wrapper = advancedToggle.closest('.opacity-40');
      expect(wrapper).toBeNull();
    });
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
      allowTrainingExport: false,
      promptGuardMode: 'warn' as const,
      responseGuardMode: 'warn' as const,
      jailbreakThreshold: 0.5,
      jailbreakAction: 'warn' as const,
      strictSystemPromptConfidentiality: false,
      abuseDetectionEnabled: true,
      contentGuardrailsEnabled: false,
      contentGuardrailsPiiMode: 'disabled' as const,
      contentGuardrailsToxicityEnabled: false,
      contentGuardrailsToxicityMode: 'warn' as const,
      contentGuardrailsToxicityThreshold: 0.7,
      contentGuardrailsBlockList: [],
      contentGuardrailsBlockedTopics: [],
      contentGuardrailsGroundingEnabled: false,
      contentGuardrailsGroundingMode: 'flag' as const,
    });
    renderComponent();
    expect(await screen.findByText(/requires code editor/i)).toBeInTheDocument();
  });

  it('renders Training Dataset Export toggle disabled by default', async () => {
    renderComponent();
    expect(await screen.findByText('Training Data Export')).toBeInTheDocument();
    const toggle = screen.getByLabelText('Toggle Training Dataset Export');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('calls updateSecurityPolicy with allowTrainingExport when toggled', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Training Dataset Export');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ allowTrainingExport: true });
    });
  });

  // ── Prompt Security selects ──────────────────────────────────────────

  it('renders Prompt Guard Mode select', async () => {
    renderComponent();
    expect(await screen.findByText('Prompt Guard Mode')).toBeInTheDocument();
  });

  it('renders Response Guard Mode select', async () => {
    renderComponent();
    expect(await screen.findByText('Response Guard Mode')).toBeInTheDocument();
  });

  it('renders Jailbreak Score Threshold slider', async () => {
    renderComponent();
    expect(await screen.findByText('Jailbreak Score Threshold')).toBeInTheDocument();
    expect(screen.getByText('0.50')).toBeInTheDocument();
  });

  it('renders System Prompt Confidentiality toggle', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle System Prompt Confidentiality');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('renders Rate-Aware Abuse Detection toggle (on by default)', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Rate-Aware Abuse Detection');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  // ── Content Guardrails ──────────────────────────────────────────────

  it('renders Content Guardrails toggle (off by default)', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Enable Content Guardrails');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('does not show PII mode when guardrails disabled', async () => {
    renderComponent();
    await screen.findByText('Content Guardrails');
    expect(screen.queryByText('PII Detection Mode')).not.toBeInTheDocument();
  });

  it('shows content guardrail sub-settings when enabled', async () => {
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
      allowTrainingExport: false,
      promptGuardMode: 'warn' as const,
      responseGuardMode: 'warn' as const,
      jailbreakThreshold: 0.5,
      jailbreakAction: 'warn' as const,
      strictSystemPromptConfidentiality: false,
      abuseDetectionEnabled: true,
      contentGuardrailsEnabled: true,
      contentGuardrailsPiiMode: 'disabled' as const,
      contentGuardrailsToxicityEnabled: false,
      contentGuardrailsToxicityMode: 'warn' as const,
      contentGuardrailsToxicityThreshold: 0.7,
      contentGuardrailsBlockList: [],
      contentGuardrailsBlockedTopics: [],
      contentGuardrailsGroundingEnabled: false,
      contentGuardrailsGroundingMode: 'flag' as const,
    });
    renderComponent();
    expect(await screen.findByText('PII Detection Mode')).toBeInTheDocument();
    expect(screen.getByLabelText('Toggle Toxicity Filtering')).toBeInTheDocument();
    expect(screen.getByText('Block List')).toBeInTheDocument();
    expect(screen.getByText('Blocked Topics')).toBeInTheDocument();
    expect(screen.getByLabelText('Toggle Grounding Verification')).toBeInTheDocument();
  });

  // ── Desktop Control sub-toggles ─────────────────────────────────────

  it('does not show Camera toggle when Desktop Control is off', async () => {
    renderComponent();
    await screen.findByText('Desktop Control');
    expect(screen.queryByLabelText('Toggle Camera Capture')).not.toBeInTheDocument();
  });

  it('shows Camera toggle when Desktop Control is on', async () => {
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
      allowDesktopControl: true,
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
      allowTrainingExport: false,
      promptGuardMode: 'warn' as const,
      responseGuardMode: 'warn' as const,
      jailbreakThreshold: 0.5,
      jailbreakAction: 'warn' as const,
      strictSystemPromptConfidentiality: false,
      abuseDetectionEnabled: true,
      contentGuardrailsEnabled: false,
      contentGuardrailsPiiMode: 'disabled' as const,
      contentGuardrailsToxicityEnabled: false,
      contentGuardrailsToxicityMode: 'warn' as const,
      contentGuardrailsToxicityThreshold: 0.7,
      contentGuardrailsBlockList: [],
      contentGuardrailsBlockedTopics: [],
      contentGuardrailsGroundingEnabled: false,
      contentGuardrailsGroundingMode: 'flag' as const,
    });
    renderComponent();
    expect(await screen.findByLabelText('Toggle Camera Capture')).toBeInTheDocument();
  });

  // ── Organizational Intent sub-toggles ──────────────────────────────

  it('renders Organizational Intent section', async () => {
    renderComponent();
    const headings = await screen.findAllByText('Organizational Intent');
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Outbound Credential Proxy toggle', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Outbound Credential Proxy');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('calls updateSecurityPolicy with sandboxCredentialProxy when toggled', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Outbound Credential Proxy');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ sandboxCredentialProxy: true });
    });
  });

  // ── Network Tools ────────────────────────────────────────────────────

  it('renders Network Tools toggle (off by default)', async () => {
    renderComponent();
    expect(await screen.findByText('Network Tools')).toBeInTheDocument();
    const toggle = screen.getByLabelText('Toggle Allow Network Tools');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('calls updateSecurityPolicy when toggling Network Tools', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Allow Network Tools');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ allowNetworkTools: true });
    });
  });

  // ── Storybook toggle ─────────────────────────────────────────────────

  it('renders Storybook toggle', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Storybook');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('calls updateSecurityPolicy when toggling Storybook', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Storybook');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalled();
      expect(mockUpdateSecurityPolicy.mock.calls[0][0]).toEqual({ allowStorybook: true });
    });
  });

  // ── Model default with provider set ──────────────────────────────────

  it('renders "Using config file" badge when no model default is set', async () => {
    renderComponent();
    expect(await screen.findByText('Using config file')).toBeInTheDocument();
  });

  it('renders provider/model badge when default is set', async () => {
    vi.mocked(api.fetchModelDefault).mockResolvedValue({ provider: 'openai', model: 'gpt-4' });
    renderComponent();
    expect(await screen.findByText(/OpenAI/)).toBeInTheDocument();
  });

  it('renders Clear button when model default is set', async () => {
    vi.mocked(api.fetchModelDefault).mockResolvedValue({ provider: 'openai', model: 'gpt-4' });
    renderComponent();
    expect(await screen.findByText('Clear')).toBeInTheDocument();
  });
});

// ── RolesSettings ─────────────────────────────────────────────────────

function renderRolesSettings() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <RolesSettings />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('RolesSettings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchRoles.mockResolvedValue({
      roles: [
        {
          id: 'role_admin',
          name: 'admin',
          permissions: [{ resource: 'read', action: '*' }],
          isBuiltin: true,
        },
        {
          id: 'role_custom',
          name: 'Custom Ops',
          description: 'Custom role',
          permissions: [{ resource: 'tasks', action: 'read' }],
          isBuiltin: false,
          inheritFrom: ['role_admin'],
        },
      ],
    });
    mockFetchAssignments.mockResolvedValue({
      assignments: [{ userId: 'alice', roleId: 'role_admin' }],
    });
    vi.mocked(api.createRole).mockResolvedValue({ id: 'new-role' } as never);
    vi.mocked(api.deleteRole).mockResolvedValue({ message: 'deleted' } as never);
    vi.mocked(api.updateRole).mockResolvedValue({ id: 'role_custom' } as never);
    vi.mocked(api.assignRole).mockResolvedValue({ message: 'assigned' } as never);
    vi.mocked(api.revokeAssignment).mockResolvedValue({ message: 'revoked' } as never);
  });

  it('renders Roles & Permissions heading', async () => {
    renderRolesSettings();
    expect(await screen.findByText('Roles & Permissions')).toBeInTheDocument();
  });

  it('shows loading state for roles', () => {
    mockFetchRoles.mockReturnValue(new Promise(() => {}));
    renderRolesSettings();
    expect(screen.getByText('Loading roles...')).toBeInTheDocument();
  });

  it('renders roles list with built-in badge', async () => {
    renderRolesSettings();
    const adminElements = await screen.findAllByText('admin');
    expect(adminElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Built-in')).toBeInTheDocument();
    expect(screen.getByText('Custom Ops')).toBeInTheDocument();
  });

  it('renders permissions for each role', async () => {
    renderRolesSettings();
    expect(await screen.findByText('read:*')).toBeInTheDocument();
    expect(screen.getByText('tasks:read')).toBeInTheDocument();
  });

  it('shows edit and delete buttons for custom roles only', async () => {
    renderRolesSettings();
    await screen.findByText('Custom Ops');
    expect(screen.getByTitle('Edit role')).toBeInTheDocument();
    expect(screen.getByTitle('Delete role')).toBeInTheDocument();
  });

  it('opens role creation form when Add Custom Role clicked', async () => {
    const user = userEvent.setup();
    renderRolesSettings();
    await screen.findByText('Custom Ops');
    await user.click(screen.getByText(/Add Custom Role/));
    expect(screen.getByPlaceholderText('e.g. Custom Ops')).toBeInTheDocument();
  });

  it('opens edit form when Edit button clicked', async () => {
    const user = userEvent.setup();
    renderRolesSettings();
    await screen.findByText('Custom Ops');
    await user.click(screen.getByTitle('Edit role'));
    expect(screen.getByDisplayValue('Custom Ops')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Custom role')).toBeInTheDocument();
  });

  it('shows delete confirmation dialog', async () => {
    const user = userEvent.setup();
    renderRolesSettings();
    await screen.findByText('Custom Ops');
    await user.click(screen.getByTitle('Delete role'));
    expect(await screen.findByText(/Are you sure you want to delete/)).toBeInTheDocument();
  });

  it('renders User Role Assignments table', async () => {
    renderRolesSettings();
    expect(await screen.findByText('User Role Assignments')).toBeInTheDocument();
    expect(await screen.findByText('alice')).toBeInTheDocument();
  });

  it('shows loading state for assignments', () => {
    mockFetchAssignments.mockReturnValue(new Promise(() => {}));
    renderRolesSettings();
    expect(screen.getByText('Loading assignments...')).toBeInTheDocument();
  });

  it('shows empty assignments message when no assignments', async () => {
    mockFetchAssignments.mockResolvedValue({ assignments: [] });
    renderRolesSettings();
    expect(await screen.findByText('No active user role assignments.')).toBeInTheDocument();
  });

  it('shows empty roles message when no roles', async () => {
    mockFetchRoles.mockResolvedValue({ roles: [] });
    renderRolesSettings();
    expect(await screen.findByText('No roles configured.')).toBeInTheDocument();
  });

  it('shows "No permissions" for roles with empty permissions', async () => {
    mockFetchRoles.mockResolvedValue({
      roles: [{ id: 'r-empty', name: 'Empty', permissions: [], isBuiltin: false, inheritFrom: [] }],
    });
    renderRolesSettings();
    expect(await screen.findByText('No permissions')).toBeInTheDocument();
  });

  it('opens assignment form and shows role select', async () => {
    const user = userEvent.setup();
    renderRolesSettings();
    await screen.findByText('Custom Ops');
    await user.click(screen.getByText(/Assign Role/));
    expect(screen.getByPlaceholderText('e.g. admin')).toBeInTheDocument();
    expect(screen.getByText('Select a role...')).toBeInTheDocument();
  });

  it('shows revoke confirmation dialog', async () => {
    const user = userEvent.setup();
    renderRolesSettings();
    await screen.findByText('alice');
    const revokeBtn = screen.getByTitle('Revoke assignment');
    await user.click(revokeBtn);
    expect(await screen.findByText(/Revoke role assignment for user/)).toBeInTheDocument();
  });
});

// ── SecretsPanel ──────────────────────────────────────────────────────

function renderSecretsPanel() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <SecretsPanel />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const mockFetchSecretKeys = vi.mocked(api.fetchSecretKeys);

describe('SecretsPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchSecretKeys.mockResolvedValue({ keys: ['API_KEY', 'DB_PASS'] });
    vi.mocked(api.setSecret).mockResolvedValue(undefined as never);
    vi.mocked(api.deleteSecret).mockResolvedValue(undefined as never);
    // Reset SecuritySettings mocks too since they share the module mock
    mockFetchRoles.mockResolvedValue({ roles: [] });
    mockFetchAssignments.mockResolvedValue({ assignments: [] });
  });

  it('renders Secrets heading and description', async () => {
    renderSecretsPanel();
    expect(screen.getByText('Secrets')).toBeInTheDocument();
    expect(screen.getByText(/write-only/)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockFetchSecretKeys.mockReturnValue(new Promise(() => {}));
    renderSecretsPanel();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows error state', async () => {
    mockFetchSecretKeys.mockRejectedValue(new Error('fail'));
    renderSecretsPanel();
    expect(await screen.findByText('Failed to load secrets')).toBeInTheDocument();
  });

  it('shows empty state', async () => {
    mockFetchSecretKeys.mockResolvedValue({ keys: [] });
    renderSecretsPanel();
    expect(await screen.findByText('No secrets stored yet.')).toBeInTheDocument();
  });

  it('renders secret keys', async () => {
    renderSecretsPanel();
    expect(await screen.findByText('API_KEY')).toBeInTheDocument();
    expect(screen.getByText('DB_PASS')).toBeInTheDocument();
  });

  it('has delete button per secret', async () => {
    renderSecretsPanel();
    expect(await screen.findByLabelText('Delete secret API_KEY')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete secret DB_PASS')).toBeInTheDocument();
  });

  it('shows delete confirmation dialog', async () => {
    const user = userEvent.setup();
    renderSecretsPanel();
    await screen.findByText('API_KEY');
    await user.click(screen.getByLabelText('Delete secret API_KEY'));
    expect(await screen.findByText(/Delete secret "API_KEY"/)).toBeInTheDocument();
  });

  it('opens add form when Add Secret clicked', async () => {
    const user = userEvent.setup();
    renderSecretsPanel();
    await screen.findByText('API_KEY');
    await user.click(screen.getByText('Add Secret'));
    expect(screen.getByPlaceholderText('MY_SECRET_KEY')).toBeInTheDocument();
  });

  it('add form has name and value inputs', async () => {
    const user = userEvent.setup();
    renderSecretsPanel();
    await screen.findByText('API_KEY');
    await user.click(screen.getByText('Add Secret'));
    expect(screen.getByPlaceholderText('MY_SECRET_KEY')).toBeInTheDocument();
    const valueInputs = screen.getAllByDisplayValue('');
    expect(valueInputs.length).toBeGreaterThan(0);
  });

  it('cancel button in add form hides the form', async () => {
    const user = userEvent.setup();
    renderSecretsPanel();
    await screen.findByText('API_KEY');
    await user.click(screen.getByText('Add Secret'));
    expect(screen.getByPlaceholderText('MY_SECRET_KEY')).toBeInTheDocument();
    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('MY_SECRET_KEY')).not.toBeInTheDocument();
  });
});
