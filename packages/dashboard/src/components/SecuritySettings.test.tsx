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
    });
    mockFetchMcpServers.mockResolvedValue({ servers: [], total: 0 });
    vi.mocked(api.fetchModelDefault).mockResolvedValue(null);
    vi.mocked(api.fetchModelInfo).mockResolvedValue({ current: { provider: 'anthropic', model: 'claude-opus-4-5', maxTokens: 8192, temperature: 0.7 }, available: {} });
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

  it('renders Code Execution section enabled by default', async () => {
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
});
