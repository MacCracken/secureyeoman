// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
}));

import * as api from '../api/client';

const mockFetchRoles = vi.mocked(api.fetchRoles);
const mockFetchAssignments = vi.mocked(api.fetchAssignments);
const mockFetchAuditStats = vi.mocked(api.fetchAuditStats);
const mockFetchMetrics = vi.mocked(api.fetchMetrics);
const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);
const mockUpdateSecurityPolicy = vi.mocked(api.updateSecurityPolicy);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <SecuritySettings />
    </QueryClientProvider>
  );
}

describe('SecuritySettings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchRoles.mockResolvedValue({
      roles: [
        { id: 'role_admin', name: 'admin', permissions: [{ resource: 'read', action: '*' }, { resource: 'write', action: '*' }, { resource: 'delete', action: '*' }], isBuiltin: true },
        { id: 'role_viewer', name: 'viewer', permissions: [{ resource: 'read', action: '*' }], isBuiltin: true },
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
      allowExtensions: false,
      allowExecution: true,
    });
    mockUpdateSecurityPolicy.mockResolvedValue({
      allowSubAgents: true,
      allowA2A: false,
      allowExtensions: false,
      allowExecution: true,
    });
  });

  it('renders the heading', async () => {
    renderComponent();
    expect(await screen.findByText('Security')).toBeInTheDocument();
  });

  it('displays roles and permissions', async () => {
    renderComponent();
    expect(await screen.findByText('admin')).toBeInTheDocument();
    expect(screen.getByText('viewer')).toBeInTheDocument();
  });

  it('displays audit chain status', async () => {
    renderComponent();
    expect(await screen.findByText('Valid')).toBeInTheDocument();
  });

  it('shows rate limiting section', async () => {
    renderComponent();
    expect(await screen.findByText('Rate Limiting')).toBeInTheDocument();
  });

  it('renders Sub-Agent Delegation section', async () => {
    renderComponent();
    expect(await screen.findByText('Sub-Agent Delegation')).toBeInTheDocument();
  });

  it('renders A2A Networks as sub-item of delegation', async () => {
    renderComponent();
    expect(await screen.findByText('A2A Networks')).toBeInTheDocument();
    expect(screen.getByLabelText('Toggle A2A Networks')).toBeInTheDocument();
  });

  it('renders Lifecycle Extensions section', async () => {
    renderComponent();
    expect(await screen.findByText('Lifecycle Extensions')).toBeInTheDocument();
    expect(screen.getByLabelText('Toggle Extensions')).toBeInTheDocument();
  });

  it('renders Sandbox Execution section enabled by default', async () => {
    renderComponent();
    expect(await screen.findByText('Sandbox Execution')).toBeInTheDocument();
    const toggle = screen.getByLabelText('Toggle Sandbox Execution');
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('calls updateSecurityPolicy when toggling A2A', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle A2A Networks');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalledWith({ allowA2A: true });
    });
  });

  it('calls updateSecurityPolicy when toggling Extensions', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Extensions');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalledWith({ allowExtensions: true });
    });
  });

  it('calls updateSecurityPolicy when toggling Sandbox Execution off', async () => {
    renderComponent();
    const toggle = await screen.findByLabelText('Toggle Sandbox Execution');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSecurityPolicy).toHaveBeenCalledWith({ allowExecution: false });
    });
  });
});
