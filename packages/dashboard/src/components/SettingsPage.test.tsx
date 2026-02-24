// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from './SettingsPage';
import { createSoulConfig } from '../test/mocks';

// ── Mock API client ──────────────────────────────────────────────
// Must include every export that SettingsPage and its child tabs
// (SecuritySettings, RolesSettings, ApiKeysSettings, etc.) import.
vi.mock('../api/client', () => ({
  fetchSoulConfig: vi.fn(),
  updateSoulConfig: vi.fn(),
  fetchMcpServers: vi.fn(),
  fetchAuditStats: vi.fn(),
  fetchMetrics: vi.fn(),
  fetchPersonalities: vi.fn(),
  enablePersonality: vi.fn(),
  disablePersonality: vi.fn(),
  setDefaultPersonality: vi.fn(),
  clearDefaultPersonality: vi.fn(),
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
  fetchUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchSoulConfig = vi.mocked(api.fetchSoulConfig);
const mockFetchMcpServers = vi.mocked(api.fetchMcpServers);
const mockFetchAuditStats = vi.mocked(api.fetchAuditStats);
const mockFetchMetrics = vi.mocked(api.fetchMetrics);
const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);
const mockFetchRoles = vi.mocked(api.fetchRoles);
const mockFetchAssignments = vi.mocked(api.fetchAssignments);
const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);
const mockFetchUsers = vi.mocked(api.fetchUsers);

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
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    mockFetchRoles.mockResolvedValue({ roles: [] });
    mockFetchAssignments.mockResolvedValue({ assignments: [] });
    mockFetchUsers.mockResolvedValue({ users: [] });
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
    expect(screen.getByText('User Authored')).toBeInTheDocument();
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();
    expect(screen.getByDisplayValue('4096')).toBeInTheDocument();
  });

  it('renders Rate Limiting and Audit Chain on General tab', async () => {
    renderComponent();

    expect(await screen.findByText('Rate Limiting')).toBeInTheDocument();
    expect(screen.getByText('Audit Chain')).toBeInTheDocument();
    expect(await screen.findByText('Valid')).toBeInTheDocument();
  });

  it('renders a Users tab', async () => {
    renderComponent();
    expect(await screen.findByRole('button', { name: /Users/ })).toBeInTheDocument();
  });

  it('Users tab appears before Roles tab in the tab bar', async () => {
    renderComponent();
    await screen.findByRole('button', { name: /Users/ });
    const tabs = screen.getAllByRole('button', {
      name: /General|Security|Keys|Users|Roles|Logs/,
    });
    const labels = tabs.map((t) => t.textContent?.trim());
    const usersIdx = labels.findIndex((l) => l?.includes('Users'));
    const rolesIdx = labels.findIndex((l) => l?.includes('Roles'));
    expect(usersIdx).toBeGreaterThanOrEqual(0);
    expect(rolesIdx).toBeGreaterThanOrEqual(0);
    expect(usersIdx).toBeLessThan(rolesIdx);
  });

  it('switches to Users tab and shows user management content', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(await screen.findByRole('button', { name: /Users/ }));
    expect(await screen.findByText('Add User')).toBeInTheDocument();
  });

  it('shows empty user list on Users tab when no users exist', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(await screen.findByRole('button', { name: /Users/ }));
    expect(await screen.findByText('No users found.')).toBeInTheDocument();
  });

  it('shows users when the Users tab is active', async () => {
    const user = userEvent.setup();
    mockFetchUsers.mockResolvedValue({
      users: [
        {
          id: 'u1',
          email: 'test@example.com',
          displayName: 'Test User',
          isAdmin: false,
          createdAt: Date.now(),
        },
      ],
    });
    renderComponent();

    await user.click(await screen.findByRole('button', { name: /Users/ }));
    expect(await screen.findByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });
});
