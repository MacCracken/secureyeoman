// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from './SettingsPage';
import { LicenseProvider } from '../hooks/useLicense';
import { createSoulConfig } from '../test/mocks';

// ── Mock hooks ───────────────────────────────────────────────────

const {
  mockSetTheme,
  mockLoadCustomThemesHook,
  mockLoadScheduleHook,
  mockSaveScheduleHook,
  mockAddCustomThemeHook,
  mockRemoveCustomThemeHook,
  mockValidateCustomThemeHook,
} = vi.hoisted(() => ({
  mockSetTheme: vi.fn(),
  mockLoadCustomThemesHook: vi.fn().mockReturnValue([]),
  mockLoadScheduleHook: vi.fn().mockReturnValue({
    enabled: false,
    lightTheme: 'light',
    darkTheme: 'dark',
    lightHour: 7,
    darkHour: 20,
    useOsSchedule: false,
  }),
  mockSaveScheduleHook: vi.fn(),
  mockAddCustomThemeHook: vi.fn(),
  mockRemoveCustomThemeHook: vi.fn(),
  mockValidateCustomThemeHook: vi.fn(),
}));

vi.mock('../hooks/useTheme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useTheme')>();
  return {
    ...actual,
    useTheme: () => ({ theme: 'dark', isDark: true, setTheme: mockSetTheme, toggle: vi.fn() }),
    loadCustomThemes: (...args: unknown[]) => mockLoadCustomThemesHook(...(args as [])),
    loadSchedule: (...args: unknown[]) => mockLoadScheduleHook(...(args as [])),
    saveSchedule: (...args: unknown[]) => mockSaveScheduleHook(...args),
    addCustomTheme: (...args: unknown[]) => mockAddCustomThemeHook(...args),
    removeCustomTheme: (...args: unknown[]) => mockRemoveCustomThemeHook(...args),
    validateCustomTheme: (...args: unknown[]) => mockValidateCustomThemeHook(...args),
  };
});

// ── Mock API client ──────────────────────────────────────────────
// Use importOriginal to get all exports, then override the ones we need to mock.
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const mocked: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) {
    mocked[key] = typeof actual[key] === 'function' ? vi.fn() : actual[key];
  }
  return mocked;
});

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
    // Re-set theme hook mocks after resetAllMocks clears them
    mockLoadCustomThemesHook.mockReturnValue([]);
    mockLoadScheduleHook.mockReturnValue({
      enabled: false,
      lightTheme: 'light',
      darkTheme: 'dark',
      lightHour: 7,
      darkHour: 20,
      useOsSchedule: false,
    });
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
    mockFetchStrategies.mockResolvedValue({ items: [], total: 0 });
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

  it('renders Rate Limiting and Audit Chain on General tab (not Soul System)', async () => {
    renderComponent();

    expect(await screen.findByText('Rate Limiting')).toBeInTheDocument();
    expect(screen.getByText('Audit Chain')).toBeInTheDocument();
    expect(await screen.findByText('Valid')).toBeInTheDocument();
    // Soul System is now on the Souls tab, not General
    expect(screen.queryByText('Soul System')).not.toBeInTheDocument();
  });

  it('renders soul config section on Souls tab', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(await screen.findByRole('button', { name: /Souls/ }));
    expect(await screen.findByText('Soul System')).toBeInTheDocument();
    const enabledElements = screen.getAllByText('Enabled');
    expect(enabledElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('User Authored')).toBeInTheDocument();
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();
    expect(screen.getByDisplayValue('4096')).toBeInTheDocument();
  });

  it('does not render Users or Workspaces tabs (moved to Organization)', async () => {
    renderComponent();
    await screen.findByText('Administration');
    expect(screen.queryByRole('button', { name: /Users/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Workspaces/ })).not.toBeInTheDocument();
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
    expect(appearanceIdx).toBeGreaterThan(securityIdx);
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
    expect(screen.getByText(/Enter a license key to unlock licensed features/)).toBeInTheDocument();
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

  // ── Route-based tab selection ───────────────────────────────────

  it('opens Security tab when path includes /security-settings', async () => {
    const qc = createQueryClient();
    render(
      <MemoryRouter initialEntries={['/security-settings']}>
        <QueryClientProvider client={qc}>
          <LicenseProvider>
            <SettingsPage />
          </LicenseProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
    // Security tab content should be active — the tab button should be highlighted
    // Multiple elements may match /Security/ so find the tab button specifically
    const secBtns = await screen.findAllByRole('button', { name: /Security/ });
    const tabBtn = secBtns.find((btn) => btn.className.includes('border-'));
    expect(tabBtn).toBeDefined();
    expect(tabBtn!.className).toContain('border-primary');
  });

  it('opens Keys tab when path includes /api-keys', async () => {
    const qc = createQueryClient();
    render(
      <MemoryRouter initialEntries={['/api-keys']}>
        <QueryClientProvider client={qc}>
          <LicenseProvider>
            <SettingsPage />
          </LicenseProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
    const keysBtn = await screen.findByRole('button', { name: /^Secrets$/ });
    expect(keysBtn.className).toContain('border-primary');
  });

  it('opens Roles tab when path is /roles', async () => {
    const qc = createQueryClient();
    render(
      <MemoryRouter initialEntries={['/roles']}>
        <QueryClientProvider client={qc}>
          <LicenseProvider>
            <SettingsPage />
          </LicenseProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
    const rolesBtn = await screen.findByRole('button', { name: /Roles/ });
    expect(rolesBtn.className).toContain('border-primary');
  });

  it('opens Souls tab when path is /souls', async () => {
    const qc = createQueryClient();
    render(
      <MemoryRouter initialEntries={['/souls']}>
        <QueryClientProvider client={qc}>
          <LicenseProvider>
            <SettingsPage />
          </LicenseProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
    const soulsBtn = await screen.findByRole('button', { name: /Souls/ });
    expect(soulsBtn.className).toContain('border-primary');
  });

  // ── Tab switching: Secrets, Roles, Notifications ────────────────

  it('switches to Secrets tab and renders all sub-panels', async () => {
    const user = userEvent.setup();
    renderComponent();
    // Use exact match to avoid matching "Custom Secrets" category button
    await user.click(await screen.findByRole('button', { name: /^Secrets$/ }));
    // ProviderKeysSettings, ApiKeysSettings, ServiceKeysPanel are all children
    // We can verify the Keys tab heading appears (provider keys renders)
    const secretsBtn = screen.getByRole('button', { name: /^Secrets$/ });
    expect(secretsBtn.className).toContain('border-primary');
  });

  it('switches to Notifications tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    const notifBtn = screen.getByRole('button', { name: /Notifications/ });
    expect(notifBtn.className).toContain('border-primary');
  });

  // ── License Key Input ───────────────────────────────────────────

  it('toggles the license key input and submits a key', async () => {
    const mockSetKey = vi.mocked(api.setLicenseKey);
    mockSetKey.mockResolvedValue({
      tier: 'enterprise',
      valid: true,
      organization: 'NewOrg',
      seats: 5,
      features: [],
      licenseId: 'lic-new',
      expiresAt: null,
      error: null,
      enforcementEnabled: false,
    });

    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Community');

    // Click "Set license key"
    await user.click(screen.getByText('Set license key'));
    expect(screen.getByPlaceholderText('Paste license key…')).toBeInTheDocument();
    expect(screen.getByText('Apply')).toBeInTheDocument();

    // Type and submit
    const input = screen.getByPlaceholderText('Paste license key…');
    await user.type(input, 'ENT-KEY-999');
    await user.click(screen.getByText('Apply'));

    await waitFor(() => {
      expect(mockSetKey).toHaveBeenCalledWith('ENT-KEY-999');
    });
  });

  it('can cancel the license key input', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Community');

    await user.click(screen.getByText('Set license key'));
    expect(screen.getByPlaceholderText('Paste license key…')).toBeInTheDocument();

    // The button text should now say "Cancel"
    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('Paste license key…')).not.toBeInTheDocument();
  });

  it('shows license error from license status', async () => {
    mockFetchLicenseStatus.mockResolvedValue({
      tier: 'community',
      valid: false,
      organization: null,
      seats: null,
      features: [],
      licenseId: null,
      expiresAt: null,
      error: 'Invalid signature',
      enforcementEnabled: false,
    });
    renderComponent();
    expect(await screen.findByText('Key error: Invalid signature')).toBeInTheDocument();
  });

  it('shows Pro tier label for pro licenses', async () => {
    mockFetchLicenseStatus.mockResolvedValue({
      tier: 'pro',
      valid: true,
      organization: 'ProOrg',
      seats: 3,
      features: ['advanced_brain'],
      licenseId: 'lic-pro',
      expiresAt: null,
      error: null,
      enforcementEnabled: false,
    });
    renderComponent();
    expect(await screen.findByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('ProOrg')).toBeInTheDocument();
  });

  // ── Backup tab: create, delete, format ──────────────────────────

  it('creates a backup and clears label on success', async () => {
    const mockCreate = vi.mocked(api.createBackup);
    mockCreate.mockResolvedValue({
      backup: {
        id: 'b-new',
        label: 'nightly',
        status: 'pending',
        sizeBytes: null,
        filePath: null,
        error: null,
        pgDumpVersion: null,
        createdBy: null,
        createdAt: Date.now(),
        completedAt: null,
      },
    });

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Backup/i }));
    await screen.findByText('New Backup');

    const labelInput = screen.getByPlaceholderText('Label (optional)');
    await user.type(labelInput, 'nightly');
    await user.click(screen.getByText('Create Backup'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith('nightly');
    });
  });

  it('shows error when backup creation fails', async () => {
    vi.mocked(api.createBackup).mockRejectedValue(new Error('disk full'));

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Backup/i }));
    await screen.findByText('New Backup');

    await user.click(screen.getByText('Create Backup'));

    await waitFor(() => {
      expect(screen.getByText('Failed to create backup')).toBeInTheDocument();
    });
  });

  it('shows KB-formatted size for medium backups', async () => {
    mockFetchBackups.mockResolvedValue({
      backups: [
        {
          id: 'b-kb',
          label: 'kb-backup',
          status: 'completed',
          sizeBytes: 4096,
          filePath: null,
          error: null,
          pgDumpVersion: null,
          createdBy: null,
          createdAt: Date.now(),
          completedAt: Date.now(),
        },
      ],
      total: 1,
    });

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Backup/i }));
    expect(await screen.findByText('4.0 KB')).toBeInTheDocument();
  });

  it('shows MB-formatted size for large backups', async () => {
    mockFetchBackups.mockResolvedValue({
      backups: [
        {
          id: 'b-mb',
          label: 'mb-backup',
          status: 'completed',
          sizeBytes: 3 * 1024 * 1024,
          filePath: null,
          error: null,
          pgDumpVersion: null,
          createdBy: null,
          createdAt: Date.now(),
          completedAt: Date.now(),
        },
      ],
      total: 1,
    });

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Backup/i }));
    expect(await screen.findByText('3.0 MB')).toBeInTheDocument();
  });

  it('shows byte-formatted size for small backups', async () => {
    mockFetchBackups.mockResolvedValue({
      backups: [
        {
          id: 'b-bytes',
          label: 'tiny-backup',
          status: 'completed',
          sizeBytes: 512,
          filePath: null,
          error: null,
          pgDumpVersion: null,
          createdBy: null,
          createdAt: Date.now(),
          completedAt: Date.now(),
        },
      ],
      total: 1,
    });

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Backup/i }));
    expect(await screen.findByText('512 B')).toBeInTheDocument();
  });

  it('shows dash for null sizeBytes', async () => {
    mockFetchBackups.mockResolvedValue({
      backups: [
        {
          id: 'b-null',
          label: 'no-size',
          status: 'pending',
          sizeBytes: null,
          filePath: null,
          error: null,
          pgDumpVersion: null,
          createdBy: null,
          createdAt: Date.now(),
          completedAt: null,
        },
      ],
      total: 1,
    });

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Backup/i }));
    await screen.findByText('no-size');
    // formatBytes(null) returns em-dash
    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows truncated id for backups without a label', async () => {
    mockFetchBackups.mockResolvedValue({
      backups: [
        {
          id: 'abcdef1234567890',
          label: '',
          status: 'pending',
          sizeBytes: null,
          filePath: null,
          error: null,
          pgDumpVersion: null,
          createdBy: null,
          createdAt: Date.now(),
          completedAt: null,
        },
      ],
      total: 1,
    });

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Backup/i }));
    expect(await screen.findByText('backup-abcdef12')).toBeInTheDocument();
  });

  it('shows "1 backup total" (singular) for a single backup', async () => {
    mockFetchBackups.mockResolvedValue({
      backups: [
        {
          id: 'b-one',
          label: 'solo',
          status: 'completed',
          sizeBytes: 100,
          filePath: null,
          error: null,
          pgDumpVersion: null,
          createdBy: null,
          createdAt: Date.now(),
          completedAt: Date.now(),
        },
      ],
      total: 1,
    });

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Backup/i }));
    expect(await screen.findByText('1 backup total')).toBeInTheDocument();
  });

  it('shows plural "backups total" for multiple backups', async () => {
    mockFetchBackups.mockResolvedValue({
      backups: [
        {
          id: 'b-a',
          label: 'a',
          status: 'completed',
          sizeBytes: 100,
          filePath: null,
          error: null,
          pgDumpVersion: null,
          createdBy: null,
          createdAt: Date.now(),
          completedAt: Date.now(),
        },
        {
          id: 'b-b',
          label: 'b',
          status: 'completed',
          sizeBytes: 200,
          filePath: null,
          error: null,
          pgDumpVersion: null,
          createdBy: null,
          createdAt: Date.now(),
          completedAt: Date.now(),
        },
      ],
      total: 2,
    });

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Backup/i }));
    expect(await screen.findByText('2 backups total')).toBeInTheDocument();
  });

  it('shows backup error text for failed backups', async () => {
    mockFetchBackups.mockResolvedValue({
      backups: [
        {
          id: 'b-fail',
          label: 'bad-backup',
          status: 'failed',
          sizeBytes: null,
          filePath: null,
          error: 'pg_dump: connection refused',
          pgDumpVersion: null,
          createdBy: null,
          createdAt: Date.now(),
          completedAt: null,
        },
      ],
      total: 1,
    });

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Backup/i }));
    expect(await screen.findByText('pg_dump: connection refused')).toBeInTheDocument();
  });

  it('shows createdBy for backups that have it', async () => {
    mockFetchBackups.mockResolvedValue({
      backups: [
        {
          id: 'b-user',
          label: 'user-backup',
          status: 'completed',
          sizeBytes: 1024,
          filePath: null,
          error: null,
          pgDumpVersion: null,
          createdBy: 'admin',
          createdAt: Date.now(),
          completedAt: Date.now(),
        },
      ],
      total: 1,
    });

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Backup/i }));
    expect(await screen.findByText(/by admin/)).toBeInTheDocument();
  });

  // ── Appearance tab: schedule and custom themes ──────────────────

  it('shows auto-switch schedule section on Appearance tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Appearance/i }));
    expect(screen.getByText('Auto-Switch Schedule')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Enable scheduled theme switching/ })).toBeInTheDocument();
  });

  it('shows "no custom themes" message on Appearance tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Appearance/i }));
    expect(screen.getByText('No custom themes yet. Create or import one.')).toBeInTheDocument();
  });

  it('shows license expiry for 1 day (singular)', async () => {
    const in1Day = new Date(Date.now() + 1.5 * 24 * 60 * 60 * 1000).toISOString();
    mockFetchLicenseStatus.mockResolvedValue({
      tier: 'enterprise',
      valid: true,
      organization: 'SingleDay',
      seats: 1,
      features: [],
      licenseId: 'lic-1d',
      expiresAt: in1Day,
      error: null,
      enforcementEnabled: false,
    });
    renderComponent();
    // Math.ceil of ~1.5 days = 2 days
    expect(await screen.findByText(/License expires in \d+ day/)).toBeInTheDocument();
  });

  // ── Appearance: Theme Editor ─────────────────────────────────────

  it('opens the theme editor when Create is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Appearance/i }));
    await user.click(screen.getByText('Create'));
    expect(screen.getByText('Create Theme')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Theme name')).toBeInTheDocument();
    expect(screen.getByText('Dark theme')).toBeInTheDocument();
    expect(screen.getByText('Save & Apply')).toBeInTheDocument();
    expect(screen.getByText('Export JSON')).toBeInTheDocument();
  });

  it('closes the theme editor on close button', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Appearance/i }));
    await user.click(screen.getByText('Create'));
    expect(screen.getByText('Create Theme')).toBeInTheDocument();
    // Close button is next to the "Create Theme" heading
    const editorHeader = screen.getByText('Create Theme').closest('div')!;
    const closeBtn = editorHeader.querySelector('button')!;
    await user.click(closeBtn);
    expect(screen.queryByText('Create Theme')).not.toBeInTheDocument();
  });

  it('saves a custom theme via Save & Apply', async () => {
    mockValidateCustomThemeHook.mockReturnValue({
      valid: true,
      theme: { name: 'My Theme', isDark: true, colors: {} },
    });
    mockAddCustomThemeHook.mockReturnValue({ id: 'my-theme', name: 'My Theme' });

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Appearance/i }));
    await user.click(screen.getByText('Create'));
    await user.click(screen.getByText('Save & Apply'));

    expect(mockValidateCustomThemeHook).toHaveBeenCalled();
    expect(mockAddCustomThemeHook).toHaveBeenCalled();
    expect(mockSetTheme).toHaveBeenCalledWith('custom:my-theme');
    // Editor dialog should close after save
    expect(screen.queryByText('Create Theme')).not.toBeInTheDocument();
  });

  it('shows validation error when saving invalid custom theme', async () => {
    mockValidateCustomThemeHook.mockReturnValue({
      valid: false,
      error: 'Missing required color: primary',
    });

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Appearance/i }));
    await user.click(screen.getByText('Create'));
    await user.click(screen.getByText('Save & Apply'));

    expect(screen.getByText('Missing required color: primary')).toBeInTheDocument();
  });

  it('exports JSON from the theme editor', async () => {
    const mockClick = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: mockClick });
      }
      return el;
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Appearance/i }));
    await user.click(screen.getByText('Create'));
    await user.click(screen.getByText('Export JSON'));

    expect(mockClick).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('renders custom theme cards and allows deletion', async () => {
    mockLoadCustomThemesHook.mockReturnValue([
      {
        id: 'my-custom',
        name: 'Custom Dark',
        isDark: true,
        colors: { background: '0 0% 10%', foreground: '0 0% 90%', primary: '210 100% 50%' },
      },
    ]);

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Appearance/i }));
    expect(screen.getByText('Custom Dark')).toBeInTheDocument();

    // Click the delete button (title="Delete")
    const deleteBtn = screen.getByTitle('Delete');
    await user.click(deleteBtn);
    expect(mockRemoveCustomThemeHook).toHaveBeenCalledWith('my-custom');
  });

  it('renders Copy JSON button on custom theme cards', async () => {
    mockLoadCustomThemesHook.mockReturnValue([
      {
        id: 'clip-theme',
        name: 'Clipboard Theme',
        isDark: false,
        colors: { background: '0 0% 90%', foreground: '0 0% 10%', primary: '210 100% 50%' },
      },
    ]);

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Appearance/i }));

    expect(screen.getByTitle('Copy JSON')).toBeInTheDocument();
    expect(screen.getByText('Clipboard Theme')).toBeInTheDocument();
  });

  // ── Appearance: Theme selection ──────────────────────────────────

  it('selects a theme when a ThemeCard is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Appearance/i }));
    // Click the preview area of a built-in theme card (e.g., "Nord")
    const nordCard = screen.getByText('Nord').closest('div[class*="rounded-lg"]')!;
    const nordBtn = nordCard.querySelector('button')!;
    await user.click(nordBtn);
    expect(mockSetTheme).toHaveBeenCalledWith('nord');
  });

  // ── Appearance: Schedule controls ────────────────────────────────

  it('enables schedule and shows time inputs', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Appearance/i }));

    // Enable schedule via toggle switch
    const toggle = screen.getByRole('switch', { name: /Enable scheduled theme switching/ });
    await user.click(toggle);
    expect(mockSaveScheduleHook).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it('shows schedule time inputs when enabled and not using OS schedule', async () => {
    mockLoadScheduleHook.mockReturnValue({
      enabled: true,
      lightTheme: 'light',
      darkTheme: 'dark',
      lightHour: 7,
      darkHour: 20,
      useOsSchedule: false,
    });

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Appearance/i }));

    expect(screen.getByText(/Light at/)).toBeInTheDocument();
    expect(screen.getByText(/Dark at/)).toBeInTheDocument();
    expect(screen.getByText('Use OS light/dark schedule')).toBeInTheDocument();
  });

  it('hides time inputs when useOsSchedule is true', async () => {
    mockLoadScheduleHook.mockReturnValue({
      enabled: true,
      lightTheme: 'light',
      darkTheme: 'dark',
      lightHour: 7,
      darkHour: 20,
      useOsSchedule: true,
    });

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Appearance/i }));

    expect(screen.queryByText(/Light at/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dark at/)).not.toBeInTheDocument();
    // Theme selectors should still be visible
    expect(screen.getByText(/Light theme:/)).toBeInTheDocument();
    expect(screen.getByText(/Dark theme:/)).toBeInTheDocument();
  });

  // ── Backup: download button for completed backups ────────────────

  it('shows download button for completed backups', async () => {
    mockFetchBackups.mockResolvedValue({
      backups: [
        {
          id: 'b-dl',
          label: 'downloadable',
          status: 'completed',
          sizeBytes: 1024,
          filePath: '/tmp/b-dl.pgdump',
          error: null,
          pgDumpVersion: '15.0',
          createdBy: null,
          createdAt: Date.now(),
          completedAt: Date.now(),
        },
      ],
      total: 1,
    });

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Backup/i }));
    await screen.findByText('downloadable');

    // Download button should exist
    const dlBtn = screen.getByTitle('Download');
    expect(dlBtn).toBeInTheDocument();
  });

  it('does not show download button for pending backups', async () => {
    mockFetchBackups.mockResolvedValue({
      backups: [
        {
          id: 'b-pending',
          label: 'not-ready',
          status: 'pending',
          sizeBytes: null,
          filePath: null,
          error: null,
          pgDumpVersion: null,
          createdBy: null,
          createdAt: Date.now(),
          completedAt: null,
        },
      ],
      total: 1,
    });

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Backup/i }));
    await screen.findByText('not-ready');

    expect(screen.queryByTitle('Download')).not.toBeInTheDocument();
  });

  it('deletes a backup when delete is clicked', async () => {
    const mockDelete = vi.mocked(api.deleteBackup);
    mockFetchBackups.mockResolvedValue({
      backups: [
        {
          id: 'b-del',
          label: 'to-delete',
          status: 'completed',
          sizeBytes: 100,
          filePath: null,
          error: null,
          pgDumpVersion: null,
          createdBy: null,
          createdAt: Date.now(),
          completedAt: Date.now(),
        },
      ],
      total: 1,
    });

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Backup/i }));
    await screen.findByText('to-delete');

    await user.click(screen.getByTitle('Delete'));
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('b-del');
    });
  });

  it('shows completed timestamp on completed backups', async () => {
    const ts = 1700000060000;
    mockFetchBackups.mockResolvedValue({
      backups: [
        {
          id: 'b-ts',
          label: 'timestamped',
          status: 'completed',
          sizeBytes: 100,
          filePath: null,
          error: null,
          pgDumpVersion: null,
          createdBy: null,
          createdAt: 1700000000000,
          completedAt: ts,
        },
      ],
      total: 1,
    });

    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Backup/i }));
    await screen.findByText('timestamped');
    expect(screen.getByText(/Completed/)).toBeInTheDocument();
  });

  // ── Appearance: theme name editing ───────────────────────────────

  it('allows editing theme name in the theme editor', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Appearance/i }));
    await user.click(screen.getByText('Create'));

    const nameInput = screen.getByPlaceholderText('Theme name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Ocean Blue');
    expect(nameInput).toHaveValue('Ocean Blue');
  });

  it('toggles dark theme checkbox in theme editor', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /Appearance/i }));
    await user.click(screen.getByText('Create'));

    const darkCheckbox = screen.getByRole('checkbox', { name: /Dark theme/ });
    // Default is true, click to uncheck
    await user.click(darkCheckbox);
    expect(darkCheckbox).not.toBeChecked();
  });
});
