// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from './SettingsPage';
import { LicenseProvider } from '../hooks/useLicense';
import { createSoulConfig } from '../test/mocks';

// ── Mock hooks ───────────────────────────────────────────────────

vi.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', isDark: true, setTheme: vi.fn(), toggle: vi.fn() }),
  THEMES: [],
}));

// ── Mock API client ──────────────────────────────────────────────
// Must include every export that SettingsPage and its child tabs
// (SecuritySettings, RolesSettings, ApiKeysSettings, etc.) import.
vi.mock('../api/client', () => ({
  fetchSoulConfig: vi.fn(),
  updateSoulConfig: vi.fn(),
  fetchMcpServers: vi.fn(),
  fetchAuditStats: vi.fn(),
  repairAuditChain: vi.fn(),
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
  fetchBackups: vi.fn(),
  createBackup: vi.fn(),
  downloadBackup: vi.fn(),
  deleteBackup: vi.fn(),
  fetchLicenseStatus: vi.fn(),
  setLicenseKey: vi.fn(),
  fetchStrategies: vi.fn(),
  createStrategy: vi.fn(),
  deleteStrategy: vi.fn(),
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
const mockFetchBackups = vi.mocked(api.fetchBackups);
const mockFetchLicenseStatus = vi.mocked(api.fetchLicenseStatus);
const mockFetchStrategies = vi.mocked(api.fetchStrategies);

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
        <LicenseProvider>
          <SettingsPage />
        </LicenseProvider>
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
    mockFetchBackups.mockResolvedValue({ backups: [], total: 0 });
    mockFetchStrategies.mockResolvedValue({ items: [] });
    mockFetchLicenseStatus.mockResolvedValue({
      tier: 'community',
      valid: false,
      organization: null,
      seats: null,
      features: [],
      licenseId: null,
      expiresAt: null,
      error: null,
      enforcementEnabled: false,
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
  });

  it('renders the Settings heading', async () => {
    renderComponent();
    expect(await screen.findByText('Administration')).toBeInTheDocument();
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

  it('renders the Appearance tab button', async () => {
    renderComponent();
    expect(await screen.findByRole('button', { name: /Appearance/i })).toBeInTheDocument();
  });

  it('switches to Appearance tab and shows theme chooser heading', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(await screen.findByRole('button', { name: /Appearance/i }));
    expect(await screen.findByText('Choose a theme for the dashboard')).toBeInTheDocument();
  });

  it('Appearance tab appears before Security tab in the tab bar', async () => {
    renderComponent();
    await screen.findByRole('button', { name: /Appearance/i });
    const tabs = screen.getAllByRole('button', {
      name: /General|Appearance|Security/,
    });
    const labels = tabs.map((t) => t.textContent?.trim());
    const appearanceIdx = labels.findIndex((l) => l?.includes('Appearance'));
    const securityIdx = labels.findIndex((l) => l?.includes('Security'));
    expect(appearanceIdx).toBeGreaterThanOrEqual(0);
    expect(securityIdx).toBeGreaterThanOrEqual(0);
    expect(appearanceIdx).toBeLessThan(securityIdx);
  });

  it('renders the Backup tab button', async () => {
    renderComponent();
    expect(await screen.findByRole('button', { name: /Backup/i })).toBeInTheDocument();
  });

  it('switches to Backup tab and shows backup heading', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(await screen.findByRole('button', { name: /Backup/i }));
    expect(await screen.findByText('Backup & Disaster Recovery')).toBeInTheDocument();
  });

  it('Backup tab shows empty state when no backups', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(await screen.findByRole('button', { name: /Backup/i }));
    expect(await screen.findByText('No backups yet. Create one above.')).toBeInTheDocument();
  });

  it('Backup tab shows backup list when backups exist', async () => {
    const user = userEvent.setup();
    mockFetchBackups.mockResolvedValue({
      backups: [
        {
          id: 'bkp-001',
          label: 'daily backup',
          status: 'completed',
          sizeBytes: 204800,
          filePath: '/data/bkp-001.pgdump',
          error: null,
          pgDumpVersion: null,
          createdBy: 'admin',
          createdAt: 1700000000000,
          completedAt: 1700000060000,
        },
      ],
      total: 1,
    });
    renderComponent();

    await user.click(await screen.findByRole('button', { name: /Backup/i }));
    expect(await screen.findByText('daily backup')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  // ── License Card Tests ──────────────────────────────────────────

  it('shows community tier chip and all features as locked when on community tier', async () => {
    renderComponent();
    expect(await screen.findByText('Community')).toBeInTheDocument();
    expect(screen.getByText('Adaptive Learning Pipeline')).toBeInTheDocument();
    expect(screen.getByText('SSO / SAML')).toBeInTheDocument();
    expect(screen.getByText('Multi-Tenancy')).toBeInTheDocument();
    expect(screen.getByText('CI/CD Integration')).toBeInTheDocument();
    expect(screen.getByText('Advanced Observability')).toBeInTheDocument();
    // Community tier message
    expect(
      screen.getByText(/Enter a license key to unlock enterprise features/)
    ).toBeInTheDocument();
  });

  it('shows enterprise tier with green feature chips for enabled features', async () => {
    mockFetchLicenseStatus.mockResolvedValue({
      tier: 'enterprise',
      valid: true,
      organization: 'Acme Corp',
      seats: 25,
      features: ['adaptive_learning', 'sso_saml', 'cicd_integration'],
      licenseId: 'lic-123',
      expiresAt: null,
      error: null,
      enforcementEnabled: false,
    });
    renderComponent();
    expect(await screen.findByText('Enterprise')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('Never')).toBeInTheDocument();
    // All 5 features are shown — 3 enabled, 2 locked
    expect(screen.getByText('Adaptive Learning Pipeline')).toBeInTheDocument();
    expect(screen.getByText('SSO / SAML')).toBeInTheDocument();
    expect(screen.getByText('CI/CD Integration')).toBeInTheDocument();
    expect(screen.getByText('Multi-Tenancy')).toBeInTheDocument();
    expect(screen.getByText('Advanced Observability')).toBeInTheDocument();
  });

  it('shows expiry countdown banner when license expires within 30 days', async () => {
    const in15Days = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
    mockFetchLicenseStatus.mockResolvedValue({
      tier: 'enterprise',
      valid: true,
      organization: 'Acme Corp',
      seats: 10,
      features: ['adaptive_learning'],
      licenseId: 'lic-456',
      expiresAt: in15Days,
      error: null,
      enforcementEnabled: false,
    });
    renderComponent();
    expect(await screen.findByText(/License expires in 15 days/)).toBeInTheDocument();
  });

  it('shows urgent expiry banner when license expires within 7 days', async () => {
    const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    mockFetchLicenseStatus.mockResolvedValue({
      tier: 'enterprise',
      valid: true,
      organization: 'Acme Corp',
      seats: 10,
      features: ['adaptive_learning'],
      licenseId: 'lic-789',
      expiresAt: in3Days,
      error: null,
      enforcementEnabled: false,
    });
    renderComponent();
    expect(await screen.findByText(/License expires in 3 days/)).toBeInTheDocument();
  });

  it('shows expired banner when license has expired', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    mockFetchLicenseStatus.mockResolvedValue({
      tier: 'enterprise',
      valid: true,
      organization: 'Acme Corp',
      seats: 10,
      features: [],
      licenseId: 'lic-exp',
      expiresAt: yesterday,
      error: null,
      enforcementEnabled: false,
    });
    renderComponent();
    expect(await screen.findByText(/License has expired/)).toBeInTheDocument();
  });

  it('does not show expiry banner when license expires in more than 30 days', async () => {
    const in60Days = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    mockFetchLicenseStatus.mockResolvedValue({
      tier: 'enterprise',
      valid: true,
      organization: 'Acme Corp',
      seats: 10,
      features: ['adaptive_learning'],
      licenseId: 'lic-ok',
      expiresAt: in60Days,
      error: null,
      enforcementEnabled: false,
    });
    renderComponent();
    expect(await screen.findByText('Enterprise')).toBeInTheDocument();
    expect(screen.queryByText(/License expires/)).not.toBeInTheDocument();
    expect(screen.queryByText(/License has expired/)).not.toBeInTheDocument();
  });
});
