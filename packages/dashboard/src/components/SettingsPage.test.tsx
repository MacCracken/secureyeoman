// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from './SettingsPage';
import { createSoulConfig } from '../test/mocks';

// ── Mock API client ──────────────────────────────────────────────
// Must include every export that SettingsPage and its child tabs
// (SecuritySettings, RolesSettings, ApiKeysSettings, etc.) import.
vi.mock('../api/client', () => ({
  fetchSoulConfig: vi.fn(),
  fetchMcpServers: vi.fn(),
  fetchAuditStats: vi.fn(),
  fetchMetrics: vi.fn(),
  fetchRoles: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  fetchAssignments: vi.fn(),
  assignRole: vi.fn(),
  revokeAssignment: vi.fn(),
  fetchSecurityPolicy: vi.fn(),
  updateSecurityPolicy: vi.fn(),
  fetchApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchSoulConfig = vi.mocked(api.fetchSoulConfig);
const mockFetchMcpServers = vi.mocked(api.fetchMcpServers);
const mockFetchAuditStats = vi.mocked(api.fetchAuditStats);
const mockFetchMetrics = vi.mocked(api.fetchMetrics);
const mockFetchRoles = vi.mocked(api.fetchRoles);
const mockFetchAssignments = vi.mocked(api.fetchAssignments);
const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);

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
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <SettingsPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

// ── Tests ────────────────────────────────────────────────────────

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchSoulConfig.mockResolvedValue(createSoulConfig());
    mockFetchMcpServers.mockResolvedValue({ servers: [], total: 0 });
    mockFetchAuditStats.mockResolvedValue({
      totalEntries: 1000,
      chainValid: true,
      lastVerification: Date.now(),
    });
    mockFetchMetrics.mockResolvedValue({} as never);
    mockFetchRoles.mockResolvedValue({ roles: [] });
    mockFetchAssignments.mockResolvedValue({ assignments: [] });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowMultimodal: false,
    });
  });

  it('renders the Settings heading', async () => {
    renderComponent();
    expect(await screen.findByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('System configuration and preferences')).toBeInTheDocument();
  });

  it('renders soul config section when config is loaded', async () => {
    renderComponent();

    expect(await screen.findByText('Soul System')).toBeInTheDocument();
    const enabledElements = screen.getAllByText('Enabled');
    expect(enabledElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('observe, suggest')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('4,096')).toBeInTheDocument();
  });

  it('renders Rate Limiting and Audit Chain on General tab', async () => {
    renderComponent();

    expect(await screen.findByText('Rate Limiting')).toBeInTheDocument();
    expect(screen.getByText('Audit Chain')).toBeInTheDocument();
    expect(await screen.findByText('Valid')).toBeInTheDocument();
  });
});
