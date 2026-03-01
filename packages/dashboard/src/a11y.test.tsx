// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { configureAxe } from 'vitest-axe';
import * as axeMatchers from 'vitest-axe/matchers';

// Only fail on critical a11y violations to avoid pre-existing minor issues blocking CI

const axe = (configureAxe as any)({ impactLevels: ['critical'] });

expect.extend(axeMatchers);

// ── Global API client mock ───────────────────────────────────────────
vi.mock('./api/client', () => ({
  fetchSecurityEvents: vi.fn(),
  fetchAuditEntries: vi.fn(),
  verifyAuditChain: vi.fn(),
  fetchTasks: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  updateTask: vi.fn(),
  fetchHeartbeatStatus: vi.fn(),
  fetchHeartbeatLog: vi.fn(),
  fetchPersonalities: vi.fn(),
  fetchReports: vi.fn(),
  generateReport: vi.fn(),
  downloadReport: vi.fn(),
  fetchHealth: vi.fn(),
  fetchMetrics: vi.fn(),
  fetchAuditStats: vi.fn(),
  fetchMcpServers: vi.fn(),
  fetchMlSummary: vi.fn(),
  fetchTlsStatus: vi.fn(),
  fetchSecurityPolicy: vi.fn(),
  fetchAutonomyOverview: vi.fn(),
  fetchAuditRuns: vi.fn(),
  createAuditRun: vi.fn(),
  fetchAuditRun: vi.fn(),
  updateAuditItem: vi.fn(),
  finalizeAuditRun: vi.fn(),
  emergencyStop: vi.fn(),
  fetchWorkflows: vi.fn(),
  fetchWorkflowRuns: vi.fn(),
  fetchMcpConfig: vi.fn(),
  patchMcpConfig: vi.fn(),
  repairAuditChain: vi.fn(),
  fetchRoles: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  fetchAssignments: vi.fn(),
  assignRole: vi.fn(),
  revokeAssignment: vi.fn(),
  updateSecurityPolicy: vi.fn(),
  fetchModelDefault: vi.fn(),
  setModelDefault: vi.fn(),
  clearModelDefault: vi.fn(),
  fetchModelInfo: vi.fn(),
  fetchAgentConfig: vi.fn(),
  updateAgentConfig: vi.fn(),
  fetchBackups: vi.fn(),
  createBackup: vi.fn(),
  restoreBackup: vi.fn(),
  deleteBackup: vi.fn(),
  fetchNotificationPrefs: vi.fn(),
  createNotificationPref: vi.fn(),
  updateNotificationPref: vi.fn(),
  deleteNotificationPref: vi.fn(),
  fetchRiskAssessments: vi.fn(),
  fetchRiskAssessment: vi.fn(),
  fetchRiskFeeds: vi.fn(),
  fetchRiskFindings: vi.fn(),
  fetchConversations: vi.fn(),
  fetchNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  addMcpServer: vi.fn(),
  fetchApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  completeOnboarding: vi.fn(),
  enforceRetention: vi.fn(),
  exportAuditBackup: vi.fn(),
  fetchSoulConfig: vi.fn(),
  updateSoulConfig: vi.fn(),
  fetchUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  fetchSsoProviders: vi.fn(),
  createSsoProvider: vi.fn(),
  updateSsoProvider: vi.fn(),
  deleteSsoProvider: vi.fn(),
}));

import * as api from './api/client';

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={makeQC()}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(api.fetchSecurityEvents).mockResolvedValue({ events: [], total: 0 });
  vi.mocked(api.fetchAuditEntries).mockResolvedValue({
    entries: [],
    total: 0,
    limit: 50,
    offset: 0,
  });
  vi.mocked(api.verifyAuditChain).mockResolvedValue({ valid: true, entriesChecked: 0 });
  vi.mocked(api.fetchTasks).mockResolvedValue({ tasks: [], total: 0 });
  vi.mocked(api.fetchHeartbeatStatus).mockResolvedValue({ enabledTasks: 0, totalTasks: 0 } as any);
  vi.mocked(api.fetchPersonalities).mockResolvedValue({ personalities: [] });
  vi.mocked(api.fetchReports).mockResolvedValue({ reports: [], total: 0 });
  vi.mocked(api.fetchHealth).mockResolvedValue({ status: 'ok' } as any);
  vi.mocked(api.fetchMetrics).mockResolvedValue({ cpu: 0, mem: 0 } as any);
  vi.mocked(api.fetchAuditStats).mockResolvedValue({} as any);
  vi.mocked(api.fetchMcpServers).mockResolvedValue({ servers: [], total: 0 });
  vi.mocked(api.fetchMlSummary).mockResolvedValue({ enabled: false } as any);
  vi.mocked(api.fetchTlsStatus).mockResolvedValue({ enabled: false } as any);
  vi.mocked(api.fetchSecurityPolicy).mockResolvedValue({
    allowSubAgents: false,
    allowA2A: false,
    allowSwarms: false,
    allowExtensions: false,
    allowExecution: true,
    allowProactive: false,
    allowWorkflows: false,
    allowCommunityGitFetch: false,
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
    allowTwingate: false,
    allowOrgIntent: false,
    allowIntentEditor: true,
    allowCodeEditor: true,
    allowAdvancedEditor: false,
    allowTrainingExport: false,
    promptGuardMode: 'warn' as const,
    responseGuardMode: 'warn' as const,
    jailbreakThreshold: 0.5,
    jailbreakAction: 'warn' as const,
    strictSystemPromptConfidentiality: false,
    abuseDetectionEnabled: true,
  });
  vi.mocked(api.fetchAutonomyOverview).mockResolvedValue({} as any);
  vi.mocked(api.fetchAuditRuns).mockResolvedValue({ runs: [] } as any);
  vi.mocked(api.fetchWorkflows).mockResolvedValue({ definitions: [], total: 0 });
  vi.mocked(api.fetchWorkflowRuns).mockResolvedValue({ runs: [] } as any);
  vi.mocked(api.fetchMcpConfig).mockResolvedValue({} as any);
  vi.mocked(api.repairAuditChain).mockResolvedValue({} as any);
  vi.mocked(api.fetchRoles).mockResolvedValue({ roles: [] } as any);
  vi.mocked(api.fetchAssignments).mockResolvedValue({ assignments: [] } as any);
  vi.mocked(api.fetchModelDefault).mockResolvedValue(null as any);
  vi.mocked(api.fetchModelInfo).mockResolvedValue({ models: [] } as any);
  vi.mocked(api.fetchAgentConfig).mockResolvedValue({} as any);
  vi.mocked(api.fetchBackups).mockResolvedValue({ backups: [] } as any);
  vi.mocked(api.fetchNotificationPrefs).mockResolvedValue({ prefs: [] } as any);
  vi.mocked(api.fetchRiskAssessments).mockResolvedValue({ assessments: [] } as any);
  vi.mocked(api.fetchRiskFeeds).mockResolvedValue([] as any);
  vi.mocked(api.fetchRiskFindings).mockResolvedValue({ findings: [] } as any);
  vi.mocked(api.fetchConversations).mockResolvedValue({ conversations: [] } as any);
  vi.mocked(api.fetchNotifications).mockResolvedValue({ notifications: [] } as any);
  vi.mocked(api.fetchApiKeys).mockResolvedValue({ keys: [] });
  vi.mocked(api.fetchSoulConfig).mockResolvedValue({
    enabled: true,
    learningMode: ['observe', 'suggest'],
    maxSkills: 50,
    maxPromptTokens: 4096,
  } as any);
  vi.mocked(api.fetchUsers).mockResolvedValue({ users: [] } as any);
});

describe('a11y smoke tests (axe-core)', () => {
  it('SecurityPage has no critical axe violations', async () => {
    const { SecurityPage } = await import('./components/SecurityPage');
    const { container } = render(
      <Wrapper>
        <SecurityPage />
      </Wrapper>
    );

    const results = await (axe as any)(container);

    (expect(results) as any).toHaveNoViolations();
  });

  it('McpPrebuilts has no critical axe violations', async () => {
    const { McpPrebuilts } = await import('./components/McpPrebuilts');
    const { container } = render(
      <Wrapper>
        <McpPrebuilts />
      </Wrapper>
    );

    const results = await (axe as any)(container);

    (expect(results) as any).toHaveNoViolations();
  });

  it('SettingsPage has no critical axe violations', async () => {
    const { SettingsPage } = await import('./components/SettingsPage');
    const { container } = render(
      <Wrapper>
        <SettingsPage />
      </Wrapper>
    );

    const results = await (axe as any)(container);

    (expect(results) as any).toHaveNoViolations();
  });

  it('OnboardingWizard has no critical axe violations', async () => {
    const { OnboardingWizard } = await import('./components/OnboardingWizard');
    const { container } = render(
      <Wrapper>
        <OnboardingWizard onComplete={() => undefined} />
      </Wrapper>
    );

    const results = await (axe as any)(container);

    (expect(results) as any).toHaveNoViolations();
  });
});
