// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectionsPage } from './ConnectionsPage';
import type { SecurityPolicy } from '../api/client';
import { createIntegrationList, createIntegration } from '../test/mocks';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    fetchMcpServers: vi.fn(),
    addMcpServer: vi.fn(),
    deleteMcpServer: vi.fn(),
    patchMcpServer: vi.fn(),
    fetchMcpTools: vi.fn(),
    fetchMcpConfig: vi.fn(),
    updateMcpConfig: vi.fn(),
    fetchSecurityPolicy: vi.fn(),
    updateSecurityPolicy: vi.fn(),
    fetchIntegrations: vi.fn(),
    fetchAvailablePlatforms: vi.fn(),
    createIntegration: vi.fn(),
    claimGmailOAuth: vi.fn(),
    startIntegration: vi.fn(),
    stopIntegration: vi.fn(),
    deleteIntegration: vi.fn(),
    updateIntegration: vi.fn(),
    testIntegration: vi.fn(),
    fetchOAuthConfig: vi.fn(),
    fetchOAuthTokens: vi.fn(),
    revokeOAuthToken: vi.fn(),
    refreshOAuthToken: vi.fn(),
    reloadOAuthConfig: vi.fn(),
    setSecret: vi.fn(),
    createApiKey: vi.fn(),
    fetchApiKeys: vi.fn(),
    revokeApiKey: vi.fn(),
    // Federation / Routing sub-components
    fetchFederationPeers: vi.fn().mockResolvedValue({ peers: [] }),
    addFederationPeer: vi.fn(),
    removeFederationPeer: vi.fn(),
    updateFederationPeerFeatures: vi.fn(),
    checkFederationPeerHealth: vi.fn(),
    fetchPeerMarketplace: vi.fn().mockResolvedValue({ skills: [] }),
    installSkillFromPeer: vi.fn(),
    exportPersonalityBundle: vi.fn(),
    importPersonalityBundle: vi.fn(),
    fetchPersonalities: vi.fn().mockResolvedValue({ personalities: [] }),
    fetchRoutingRules: vi.fn().mockResolvedValue({ rules: [], total: 0 }),
    createRoutingRule: vi.fn(),
    updateRoutingRule: vi.fn(),
    deleteRoutingRule: vi.fn(),
    testRoutingRule: vi.fn(),
    fetchEcosystemServices: vi.fn().mockResolvedValue([]),
    probeEcosystemService: vi.fn().mockResolvedValue({}),
    enableEcosystemService: vi.fn().mockResolvedValue({}),
    disableEcosystemService: vi.fn().mockResolvedValue({}),
  };
});

import * as api from '../api/client';

const mockFetchMcpServers = vi.mocked(api.fetchMcpServers);
const mockFetchMcpTools = vi.mocked(api.fetchMcpTools);
const mockFetchMcpConfig = vi.mocked(api.fetchMcpConfig);
const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);
const mockFetchIntegrations = vi.mocked(api.fetchIntegrations);
const mockFetchAvailablePlatforms = vi.mocked(api.fetchAvailablePlatforms);
const mockTestIntegration = vi.mocked(api.testIntegration);
const mockFetchOAuthConfig = vi.mocked(api.fetchOAuthConfig);
const mockFetchOAuthTokens = vi.mocked(api.fetchOAuthTokens);
const mockCreateApiKey = vi.mocked(api.createApiKey);
const mockFetchApiKeys = vi.mocked(api.fetchApiKeys);
const mockRevokeApiKey = vi.mocked(api.revokeApiKey);
const mockAddMcpServer = vi.mocked(api.addMcpServer);
const mockDeleteMcpServer = vi.mocked(api.deleteMcpServer);
const mockPatchMcpServer = vi.mocked(api.patchMcpServer);
const mockUpdateMcpConfig = vi.mocked(api.updateMcpConfig);
const mockStartIntegration = vi.mocked(api.startIntegration);
const mockStopIntegration = vi.mocked(api.stopIntegration);
const mockDeleteIntegration = vi.mocked(api.deleteIntegration);
const mockRevokeOAuthToken = vi.mocked(api.revokeOAuthToken);
const mockRefreshOAuthToken = vi.mocked(api.refreshOAuthToken);
const mockUpdateSecurityPolicy = vi.mocked(api.updateSecurityPolicy);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderComponent(initialEntries = ['/connections']) {
  const qc = createQueryClient();
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={qc}>
        <ConnectionsPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

/** Click the YEOMAN MCP header to expand the collapsible card */
async function expandYeomanCard() {
  const user = userEvent.setup();
  const header = await screen.findByText('YEOMAN MCP');
  await user.click(header);
}

const DEFAULT_MCP_CONFIG = {
  exposeGit: false,
  exposeFilesystem: false,
  exposeWeb: false,
  exposeWebScraping: false,
  exposeWebSearch: false,
  exposeBrowser: false,
  exposeDesktopControl: false,
  exposeNetworkTools: false,
  exposeTwingateTools: false,
  exposeOrgIntentTools: false,
  respectContentSignal: true,
  allowedUrls: [],
  webRateLimitPerMinute: 10,
  proxyEnabled: false,
  proxyProviders: [],
  proxyStrategy: 'round-robin' as const,
  proxyDefaultCountry: '',
  exposeSecurityTools: false,
  allowedTargets: [],
  exposeGmail: false,
  exposeTwitter: false,
  exposeGithub: false,
  alwaysSendFullSchemas: false,
  exposeKnowledgeBase: false,
  exposeDockerTools: false,
  exposeTerminal: false,
  exposeGithubActions: false,
  exposeJenkins: false,
  exposeGitlabCi: false,
  exposeNorthflank: false,
};

const DEFAULT_SECURITY_POLICY = {
  allowSubAgents: false,
  allowA2A: false,
  allowSwarms: false,
  allowExtensions: false,
  allowExecution: false,
  allowProactive: false,
  allowExperiments: false,
  allowStorybook: false,
  allowMultimodal: false,
  allowDesktopControl: false,
  allowCamera: false,
  allowDynamicTools: false,
  sandboxDynamicTools: false,
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
} as unknown as SecurityPolicy;

const LOCAL_SERVER = {
  id: 'local',
  name: 'YEOMAN MCP',
  transport: 'streamable-http' as const,
  enabled: true,
  command: null,
  args: [],
  description: 'Local MCP',
  url: 'http://localhost:18789/mcp/v1',
  env: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const LOCAL_SERVER_STDIO = {
  id: 'local',
  name: 'YEOMAN MCP',
  transport: 'stdio' as const,
  enabled: true,
  command: 'secureyeoman',
  args: ['mcp-server'],
  description: 'Local MCP',
  url: null,
  env: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

describe('ConnectionsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchMcpServers.mockResolvedValue({ servers: [], total: 0 });
    mockFetchMcpTools.mockResolvedValue({ tools: [], total: 0 });
    mockFetchMcpConfig.mockResolvedValue(DEFAULT_MCP_CONFIG);
    mockFetchIntegrations.mockResolvedValue({ integrations: [], total: 0, running: 0 });
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: [] });
    mockFetchOAuthConfig.mockResolvedValue({
      providers: [
        { id: 'google', name: 'Google' },
        { id: 'github', name: 'GitHub' },
      ],
    });
    mockFetchOAuthTokens.mockResolvedValue([]);
    mockFetchApiKeys.mockResolvedValue({ keys: [] });
    mockCreateApiKey.mockResolvedValue({
      id: 'key-auto',
      name: 'YEOMAN MCP',
      role: 'operator',
      rawKey: 'sck_auto_generated',
      prefix: 'sck_auto',
      createdAt: new Date().toISOString(),
    } as never);
    mockRevokeApiKey.mockResolvedValue(undefined);
    mockFetchSecurityPolicy.mockResolvedValue(DEFAULT_SECURITY_POLICY);
    mockAddMcpServer.mockResolvedValue({ id: 'new-server' } as never);
    mockDeleteMcpServer.mockResolvedValue(undefined as never);
    mockPatchMcpServer.mockResolvedValue(undefined as never);
    mockUpdateMcpConfig.mockResolvedValue(undefined as never);
    mockStartIntegration.mockResolvedValue(undefined as never);
    mockStopIntegration.mockResolvedValue(undefined as never);
    mockDeleteIntegration.mockResolvedValue(undefined as never);
    mockRevokeOAuthToken.mockResolvedValue(undefined as never);
    mockRefreshOAuthToken.mockResolvedValue(undefined as never);
    mockUpdateSecurityPolicy.mockResolvedValue(undefined as never);
  });

  // ── Basic rendering ───────────────────────────────────────────────

  it('renders the Connections header', async () => {
    renderComponent();
    expect(await screen.findByText('Connections')).toBeInTheDocument();
  });

  it('renders MCP, Integrations, Routing Rules, and Federation tabs', async () => {
    renderComponent();
    expect(await screen.findByText('MCP')).toBeInTheDocument();
    expect(screen.getByText('Integrations')).toBeInTheDocument();
    expect(screen.getByText('Routing Rules')).toBeInTheDocument();
    expect(screen.getByText('Federation')).toBeInTheDocument();
  });

  it('shows MCP tab content by default', async () => {
    renderComponent();
    expect(
      await screen.findByText('Manage integrations, MCP servers, and authentication')
    ).toBeInTheDocument();
    expect(await screen.findByText('Featured MCP Servers')).toBeInTheDocument();
  });

  it('switches to MCP tab when clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    const mcpTab = await screen.findByText('MCP');
    await user.click(mcpTab);

    expect(screen.getByText('Add Server')).toBeInTheDocument();
  });

  it('switches to Integrations tab when clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    expect(screen.getByText('Messaging')).toBeInTheDocument();
  });

  it('switches to OAuth tab when clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const oauthTab = await screen.findByText('OAuth');
    await user.click(oauthTab);

    expect(screen.getByText(/Connect your accounts with OAuth providers/)).toBeInTheDocument();
  });

  it('displays OAuth providers when OAuth tab is active', async () => {
    const user = userEvent.setup();
    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const oauthTab = await screen.findByText('OAuth');
    await user.click(oauthTab);

    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('shows empty state when no integrations connected', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: [] });
    mockFetchIntegrations.mockResolvedValue({ integrations: [], total: 0, running: 0 });
    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    expect(await screen.findByText('No integrations connected yet')).toBeInTheDocument();
  });

  it('shows messaging integrations when available', async () => {
    const user = userEvent.setup();
    mockFetchIntegrations.mockResolvedValue({
      integrations: createIntegrationList(),
      total: 3,
      running: 1,
    });
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['telegram', 'discord'] });

    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    expect(await screen.findByText('Friday Telegram')).toBeInTheDocument();
    expect(screen.getByText('Dev Discord')).toBeInTheDocument();
  });

  it('shows MCP servers when available', async () => {
    const user = userEvent.setup();
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        {
          id: '1',
          name: 'Test MCP',
          transport: 'stdio',
          enabled: true,
          command: 'npx',
          args: [],
          description: 'Test server',
          url: null,
          env: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });
    mockFetchMcpTools.mockResolvedValue({ tools: [], total: 0 });

    renderComponent();

    const mcpTab = await screen.findByText('MCP');
    await user.click(mcpTab);

    expect(screen.getByText('Test MCP')).toBeInTheDocument();
  });

  it('shows Add Server form when Add Server button clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    const mcpTab = await screen.findByText('MCP');
    await user.click(mcpTab);

    const addButton = screen.getByText('Add Server');
    await user.click(addButton);

    expect(screen.getByText('Add MCP Server')).toBeInTheDocument();
  });

  it('shows Connected OAuth providers', async () => {
    const user = userEvent.setup();
    mockFetchOAuthTokens.mockResolvedValue([
      {
        id: 'tok-1',
        provider: 'google',
        email: 'test@gmail.com',
        userId: 'u1',
        scopes: 'email profile',
        expiresAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);

    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const oauthTab = await screen.findByText('OAuth');
    await user.click(oauthTab);

    // New heading is "Connected Accounts"
    expect(await screen.findByText('Connected Accounts')).toBeInTheDocument();
    expect(screen.getByText('test@gmail.com')).toBeInTheDocument();
    expect(screen.getAllByText('Google').length).toBeGreaterThan(0);
  });

  it('shows Test button for each integration', async () => {
    const user = userEvent.setup();
    mockFetchIntegrations.mockResolvedValue({
      integrations: createIntegrationList(),
      total: 3,
      running: 1,
    });
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['telegram', 'discord', 'slack'] });

    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    await screen.findByText('Friday Telegram');

    const testButtons = screen.getAllByText('Test');
    expect(testButtons.length).toBe(3);
  });

  it('calls testIntegration when Test button clicked', async () => {
    const user = userEvent.setup();
    mockTestIntegration.mockResolvedValue({ ok: true, message: 'Connection OK' });
    mockFetchIntegrations.mockResolvedValue({
      integrations: createIntegrationList(),
      total: 3,
      running: 1,
    });
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['telegram', 'discord', 'slack'] });

    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    await screen.findByText('Friday Telegram');

    const testButtons = screen.getAllByText('Test');
    await user.click(testButtons[0]);

    // Integrations are sorted alphabetically, so "Dev Discord" comes first
    expect(mockTestIntegration).toHaveBeenCalledWith('int-discord-1');
  });

  it('displays success result after test', async () => {
    const user = userEvent.setup();
    mockTestIntegration.mockResolvedValue({ ok: true, message: 'Connection OK' });
    mockFetchIntegrations.mockResolvedValue({
      integrations: createIntegrationList(),
      total: 3,
      running: 1,
    });
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['telegram', 'discord', 'slack'] });

    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    await screen.findByText('Friday Telegram');

    const testButtons = screen.getAllByText('Test');
    await user.click(testButtons[0]);

    expect(await screen.findByText('Connection OK')).toBeInTheDocument();
  });

  it('displays failure result after test', async () => {
    const user = userEvent.setup();
    mockTestIntegration.mockResolvedValue({ ok: false, message: 'Invalid token' });
    mockFetchIntegrations.mockResolvedValue({
      integrations: createIntegrationList(),
      total: 3,
      running: 1,
    });
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['telegram', 'discord', 'slack'] });

    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    await screen.findByText('Friday Telegram');

    const testButtons = screen.getAllByText('Test');
    await user.click(testButtons[0]);

    expect(await screen.findByText('Invalid token')).toBeInTheDocument();
  });

  // ── New Phase 18 Integrations ─────────────────────────────

  it('shows Figma in available platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['figma'] });
    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    // Figma is in DEVOPS_PLATFORMS — navigate to DevOps sub-tab first
    const devopsTab = await screen.findByText('DevOps');
    await user.click(devopsTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Figma')).toBeInTheDocument();
  });

  it('shows Stripe in available platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['stripe'] });
    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    // Stripe is in PRODUCTIVITY_PLATFORMS — navigate to Productivity sub-tab
    const productivityTab = await screen.findByText('Productivity');
    await user.click(productivityTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Stripe')).toBeInTheDocument();
  });

  it('shows Zapier in available platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['zapier'] });
    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const devopsTab = await screen.findByText('DevOps');
    await user.click(devopsTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Zapier')).toBeInTheDocument();
  });

  it('shows QQ in available platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['qq'] });
    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    // QQ is a messaging platform — Messaging is the default sub-tab
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('QQ')).toBeInTheDocument();
  });

  it('shows DingTalk in available platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['dingtalk'] });
    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('DingTalk')).toBeInTheDocument();
  });

  it('shows Line in available platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['line'] });
    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Line')).toBeInTheDocument();
  });

  it('shows Figma MCP featured server on MCP tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    const addFeaturedBtn = await screen.findByText('Add Featured MCP');
    await user.click(addFeaturedBtn);
    expect(screen.getByText('Figma')).toBeInTheDocument();
  });

  it('shows Stripe MCP featured server on MCP tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    const addFeaturedBtn = await screen.findByText('Add Featured MCP');
    await user.click(addFeaturedBtn);
    expect(screen.getByText('Stripe')).toBeInTheDocument();
  });

  it('shows Zapier MCP featured server on MCP tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    const addFeaturedBtn = await screen.findByText('Add Featured MCP');
    await user.click(addFeaturedBtn);
    expect(screen.getByText('Zapier')).toBeInTheDocument();
  });

  it('shows Linear in available platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['linear'] });
    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    // Linear is in PRODUCTIVITY_PLATFORMS — navigate to Productivity sub-tab
    const productivityTab = await screen.findByText('Productivity');
    await user.click(productivityTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Linear')).toBeInTheDocument();
  });

  it('shows Linear MCP featured server on MCP tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    const addFeaturedBtn = await screen.findByText('Add Featured MCP');
    await user.click(addFeaturedBtn);
    expect(screen.getByText('Linear')).toBeInTheDocument();
  });

  // ── Productivity sub-tab ──────────────────────────────────

  it('renders the Productivity sub-tab', async () => {
    const user = userEvent.setup();
    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    expect(await screen.findByText('Productivity')).toBeInTheDocument();
  });

  it('does not render a Calendar sub-tab', async () => {
    renderComponent();
    await screen.findByText('Featured MCP Servers'); // wait for render
    expect(screen.queryByRole('button', { name: /^Calendar$/i })).not.toBeInTheDocument();
  });

  it('shows Notion in available platforms under Productivity', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['notion'] });
    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const productivityTab = await screen.findByText('Productivity');
    await user.click(productivityTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Notion')).toBeInTheDocument();
  });

  it('shows Google Calendar in available platforms under Productivity', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['googlecalendar'] });
    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const productivityTab = await screen.findByText('Productivity');
    await user.click(productivityTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Google Calendar')).toBeInTheDocument();
  });

  it('shows Airtable in available platforms under Productivity', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['airtable'] });
    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const productivityTab = await screen.findByText('Productivity');
    await user.click(productivityTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Airtable')).toBeInTheDocument();
  });

  it('shows Todoist in available platforms under Productivity', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['todoist'] });
    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const productivityTab = await screen.findByText('Productivity');
    await user.click(productivityTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Todoist')).toBeInTheDocument();
  });

  it('shows Spotify in available platforms under Productivity', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['spotify'] });
    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const productivityTab = await screen.findByText('Productivity');
    await user.click(productivityTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Spotify')).toBeInTheDocument();
  });

  it('shows YouTube in available platforms under Productivity', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['youtube'] });
    renderComponent();

    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const productivityTab = await screen.findByText('Productivity');
    await user.click(productivityTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('YouTube')).toBeInTheDocument();
  });

  // ── Twingate gating ────────────────────────────────────────────────

  it('shows Twingate gate hint when allowTwingate is false', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [LOCAL_SERVER_STDIO],
      total: 1,
    });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowTwingate: false,
      allowNetBoxWrite: false,
      allowNetworkTools: false,
      allowOrgIntent: false,
      allowIntentEditor: false,
      allowCodeEditor: true,
      allowAdvancedEditor: false,
      allowTrainingExport: false,
    } as never);

    renderComponent();
    await expandYeomanCard();
    expect(
      await screen.findByText('Enable Twingate in Security settings first')
    ).toBeInTheDocument();
  });

  it('shows Twingate description when allowTwingate is true', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [LOCAL_SERVER_STDIO],
      total: 1,
    });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowTwingate: true,
      allowNetBoxWrite: false,
      allowNetworkTools: false,
      allowOrgIntent: false,
      allowIntentEditor: false,
      allowCodeEditor: true,
      allowAdvancedEditor: false,
      allowTrainingExport: false,
    } as never);

    renderComponent();
    await expandYeomanCard();
    expect(
      await screen.findByText('Agents can reach private MCP servers and resources via Twingate')
    ).toBeInTheDocument();
  });

  // ── Connection Setup section ────────────────────────────────────────

  it('shows Connect your MCP client section for LocalServerCard', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });
    renderComponent();
    await expandYeomanCard();
    expect(await screen.findByText('Connect your MCP client')).toBeInTheDocument();
    expect(screen.getByText('http://localhost:18789/mcp/v1')).toBeInTheDocument();
  });

  it('auto-generates a key on mount and shows new key banner', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });
    renderComponent();
    await expandYeomanCard();
    expect(await screen.findByText(/New key generated/)).toBeInTheDocument();
    expect(mockCreateApiKey).toHaveBeenCalledWith({ name: 'YEOMAN MCP', role: 'operator' });
  });

  it('shows existing keys listing with revoke button', async () => {
    mockFetchApiKeys.mockResolvedValue({
      keys: [
        {
          id: 'key-1',
          name: 'YEOMAN MCP',
          role: 'operator',
          prefix: 'sck_abcd',
          createdAt: '2026-02-27T00:00:00.000Z',
        },
      ],
    } as never);
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });

    renderComponent();
    await expandYeomanCard();
    expect(await screen.findByText(/sck_abcd/)).toBeInTheDocument();
    const user = userEvent.setup();
    const revokeBtn = screen.getByTitle('Revoke key');
    await user.click(revokeBtn);
    expect(mockRevokeApiKey).toHaveBeenCalledWith('key-1');
  });

  it('shows revealed token after clicking reveal button', async () => {
    const user = userEvent.setup();
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });

    renderComponent();
    await expandYeomanCard();
    await screen.findByText(/New key generated/);
    const revealBtn = screen.getByTitle('Reveal token');
    await user.click(revealBtn);
    expect(screen.getByText('sck_auto_generated')).toBeInTheDocument();
  });

  // ── MCP Add Server form ─────────────────────────────────────────────

  it('shows transport dropdown with stdio, sse, streamable-http options', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Add Server');
    await user.click(screen.getByText('Add Server'));
    expect(screen.getByText('Add MCP Server')).toBeInTheDocument();
    // Transport select options
    const select = screen.getByDisplayValue('stdio');
    expect(select).toBeInTheDocument();
  });

  it('shows URL field when non-stdio transport selected', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Add Server');
    await user.click(screen.getByText('Add Server'));

    const transportSelect = screen.getByDisplayValue('stdio');
    await user.selectOptions(transportSelect, 'sse');

    expect(screen.getByPlaceholderText('https://example.com/mcp')).toBeInTheDocument();
  });

  it('shows command and args fields for stdio transport', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Add Server');
    await user.click(screen.getByText('Add Server'));

    expect(screen.getByPlaceholderText('e.g. npx or python')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('e.g. -y @modelcontextprotocol/server-filesystem /tmp')
    ).toBeInTheDocument();
  });

  it('can add and remove environment variables', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Add Server');
    await user.click(screen.getByText('Add Server'));

    await user.click(screen.getByText('+ Add Variable'));
    expect(screen.getByPlaceholderText('KEY')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('value')).toBeInTheDocument();
  });

  it('cancels the Add Server form', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Add Server');
    await user.click(screen.getByText('Add Server'));
    expect(screen.getByText('Add MCP Server')).toBeInTheDocument();

    const cancelButtons = screen.getAllByText('Cancel');
    await user.click(cancelButtons[0]);
    expect(screen.queryByText('Add MCP Server')).not.toBeInTheDocument();
  });

  // ── External Server Card ───────────────────────────────────────────

  it('shows external servers under Configured Servers heading', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        {
          id: 'ext-1',
          name: 'External Server',
          transport: 'sse',
          enabled: true,
          command: null,
          args: [],
          description: 'Remote SSE server',
          url: 'https://remote.example.com/mcp',
          env: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });

    renderComponent();
    expect(await screen.findByText('Configured Servers')).toBeInTheDocument();
    expect(screen.getByText('External Server')).toBeInTheDocument();
    expect(screen.getByText('sse')).toBeInTheDocument();
  });

  it('shows disabled server with reduced opacity', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        {
          id: 'ext-1',
          name: 'Disabled Server',
          transport: 'stdio',
          enabled: false,
          command: 'npx',
          args: [],
          description: '',
          url: null,
          env: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });

    renderComponent();
    expect(await screen.findByText('Disabled Server')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('shows empty MCP state when no servers configured', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [], total: 0 });
    renderComponent();
    expect(await screen.findByText(/No MCP servers configured yet/)).toBeInTheDocument();
  });

  // ── Discovered Tools section ───────────────────────────────────────

  it('shows Discovered Tools section when tools exist', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        {
          id: 'ext-1',
          name: 'Test Server',
          transport: 'stdio',
          enabled: true,
          command: 'npx',
          args: [],
          description: '',
          url: null,
          env: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });
    mockFetchMcpTools.mockResolvedValue({
      tools: [
        {
          name: 'file_read',
          description: 'Read a file from disk',
          serverId: 'ext-1',
          serverName: 'Test Server',
          inputSchema: {},
        },
        {
          name: 'file_write',
          description: 'Write a file to disk',
          serverId: 'ext-1',
          serverName: 'Test Server',
          inputSchema: {},
        },
      ],
      total: 2,
    });

    renderComponent();
    expect(await screen.findByText('Discovered Tools')).toBeInTheDocument();
    const toolCountEls = screen.getAllByText('2 tools');
    expect(toolCountEls.length).toBeGreaterThan(0);
  });

  it('expands tools list when Discovered Tools is clicked', async () => {
    const user = userEvent.setup();
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        {
          id: 'ext-1',
          name: 'Test Server',
          transport: 'stdio',
          enabled: true,
          command: 'npx',
          args: [],
          description: '',
          url: null,
          env: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });
    mockFetchMcpTools.mockResolvedValue({
      tools: [
        {
          name: 'file_read',
          description: 'Read a file from disk',
          serverId: 'ext-1',
          serverName: 'Test Server',
          inputSchema: {},
        },
      ],
      total: 1,
    });

    renderComponent();
    const toolsBtn = await screen.findByText('Discovered Tools');
    await user.click(toolsBtn);

    expect(screen.getByText('file_read')).toBeInTheDocument();
    expect(screen.getByText('Read a file from disk')).toBeInTheDocument();
  });

  // ── Feature Toggles in LocalServerCard ─────────────────────────────

  it('shows Feature Toggles section for local server', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });
    renderComponent();
    await expandYeomanCard();
    expect(await screen.findByText('Feature Toggles')).toBeInTheDocument();
    expect(screen.getByText('Git & GitHub')).toBeInTheDocument();
    expect(screen.getByText('Filesystem')).toBeInTheDocument();
    expect(screen.getByText('Web Tools')).toBeInTheDocument();
    expect(screen.getByText('Browser Automation')).toBeInTheDocument();
  });

  it('shows Connected Account Tools section', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });
    renderComponent();
    await expandYeomanCard();
    expect(await screen.findByText('Connected Account Tools')).toBeInTheDocument();
    expect(screen.getByText('Gmail')).toBeInTheDocument();
    expect(screen.getByText('Twitter / X')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('shows Infrastructure Tools section with Docker and Terminal', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });
    renderComponent();
    await expandYeomanCard();
    expect(await screen.findByText('Infrastructure Tools')).toBeInTheDocument();
    expect(screen.getByText('Docker')).toBeInTheDocument();
    expect(screen.getByText('Terminal')).toBeInTheDocument();
  });

  it('shows Knowledge & Intent section', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });
    renderComponent();
    await expandYeomanCard();
    const headings = await screen.findAllByText(/Knowledge/);
    expect(headings.length).toBeGreaterThan(0);
    expect(screen.getByText('Knowledge Base Access')).toBeInTheDocument();
    expect(screen.getByText('Organizational Intent Access')).toBeInTheDocument();
  });

  it('shows Content Negotiation section with Respect Content-Signal', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });
    renderComponent();
    await expandYeomanCard();
    expect(await screen.findByText('Content Negotiation')).toBeInTheDocument();
    expect(screen.getByText('Respect Content-Signal')).toBeInTheDocument();
  });

  it('shows Remote Desktop Control gated by security policy', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });
    mockFetchSecurityPolicy.mockResolvedValue({
      ...DEFAULT_SECURITY_POLICY,
      allowDesktopControl: false,
    } as never);
    renderComponent();
    await expandYeomanCard();
    expect(await screen.findByText('Remote Desktop Control')).toBeInTheDocument();
    const hints = screen.getAllByText('Enable in Security Settings first');
    expect(hints.length).toBeGreaterThanOrEqual(1);
  });

  it('shows Network Tools gated by security policy', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });
    mockFetchSecurityPolicy.mockResolvedValue({
      ...DEFAULT_SECURITY_POLICY,
      allowNetworkTools: false,
    } as never);
    renderComponent();
    await expandYeomanCard();
    expect(await screen.findByText('Network Tools')).toBeInTheDocument();
    // "Enable in Security Settings first" appears for both desktop and network
    const hints = screen.getAllByText('Enable in Security Settings first');
    expect(hints.length).toBeGreaterThanOrEqual(1);
  });

  // ── Integration sub-tabs ────────────────────────────────────────────

  it('shows all integration sub-tabs: Messaging, Email, Productivity, DevOps, OAuth', async () => {
    const user = userEvent.setup();
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    expect(screen.getByText('Messaging')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Productivity')).toBeInTheDocument();
    expect(screen.getByText('DevOps')).toBeInTheDocument();
    expect(screen.getByText('OAuth')).toBeInTheDocument();
  });

  // ── Email tab ────────────────────────────────────────────────────────

  it('switches to Email sub-tab and shows email description', async () => {
    const user = userEvent.setup();
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const emailTab = screen.getByText('Email');
    await user.click(emailTab);

    expect(
      screen.getByText(/Connect email accounts for direct email integration/)
    ).toBeInTheDocument();
  });

  it('shows Gmail card on Email tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const emailTab = screen.getByText('Email');
    await user.click(emailTab);

    expect(screen.getByText('Add Email Account')).toBeInTheDocument();
    expect(screen.getByText('Connect with Google')).toBeInTheDocument();
  });

  it('shows IMAP/SMTP card on Email tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const emailTab = screen.getByText('Email');
    await user.click(emailTab);

    expect(screen.getByText('Email (IMAP/SMTP)')).toBeInTheDocument();
  });

  it('shows email integration cards on email tab when connected', async () => {
    const user = userEvent.setup();
    mockFetchIntegrations.mockResolvedValue({
      integrations: [
        createIntegration({
          id: 'int-gmail-1',
          platform: 'gmail',
          displayName: 'My Gmail',
          status: 'connected',
          config: { email: 'user@gmail.com' },
        }),
      ],
      total: 1,
      running: 1,
    });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const emailTab = screen.getByText('Email');
    await user.click(emailTab);

    expect(await screen.findByText('My Gmail')).toBeInTheDocument();
  });

  // ── Integration card actions ────────────────────────────────────────

  it('shows Stop button for connected integrations', async () => {
    const user = userEvent.setup();
    mockFetchIntegrations.mockResolvedValue({
      integrations: [
        createIntegration({
          id: 'int-1',
          platform: 'telegram',
          displayName: 'My Telegram',
          status: 'connected',
        }),
      ],
      total: 1,
      running: 1,
    });
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['telegram'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    await screen.findByText('My Telegram');
    expect(screen.getByText('Stop')).toBeInTheDocument();
  });

  it('shows Start button for disconnected integrations', async () => {
    const user = userEvent.setup();
    mockFetchIntegrations.mockResolvedValue({
      integrations: [
        createIntegration({
          id: 'int-1',
          platform: 'telegram',
          displayName: 'My Telegram',
          status: 'disconnected',
        }),
      ],
      total: 1,
      running: 0,
    });
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['telegram'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    await screen.findByText('My Telegram');
    expect(screen.getByText('Start')).toBeInTheDocument();
  });

  it('shows Retry button for error integrations', async () => {
    const user = userEvent.setup();
    mockFetchIntegrations.mockResolvedValue({
      integrations: [
        createIntegration({
          id: 'int-1',
          platform: 'telegram',
          displayName: 'Broken Telegram',
          status: 'error',
          errorMessage: 'Connection lost',
        }),
      ],
      total: 1,
      running: 0,
    });
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['telegram'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    await screen.findByText('Broken Telegram');
    expect(screen.getByText('Retry')).toBeInTheDocument();
    expect(screen.getByText('Connection lost')).toBeInTheDocument();
  });

  it('shows Edit button for integrations and toggles edit mode', async () => {
    const user = userEvent.setup();
    mockFetchIntegrations.mockResolvedValue({
      integrations: [
        createIntegration({
          id: 'int-1',
          platform: 'telegram',
          displayName: 'My Telegram',
          status: 'connected',
        }),
      ],
      total: 1,
      running: 1,
    });
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['telegram'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    await screen.findByText('My Telegram');
    const editBtn = screen.getByText('Edit');
    await user.click(editBtn);

    expect(screen.getByText('Account enabled')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('shows Delete button for integrations', async () => {
    const user = userEvent.setup();
    mockFetchIntegrations.mockResolvedValue({
      integrations: [
        createIntegration({
          id: 'int-1',
          platform: 'telegram',
          displayName: 'My Telegram',
          status: 'connected',
        }),
      ],
      total: 1,
      running: 1,
    });
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['telegram'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    await screen.findByText('My Telegram');
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('shows message count and status on integration card', async () => {
    const user = userEvent.setup();
    mockFetchIntegrations.mockResolvedValue({
      integrations: [
        createIntegration({
          id: 'int-1',
          platform: 'telegram',
          displayName: 'My Telegram',
          status: 'connected',
          messageCount: 42,
        }),
      ],
      total: 1,
      running: 1,
    });
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['telegram'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    await screen.findByText('My Telegram');
    expect(screen.getByText('42 messages')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  // ── Integration connect form ───────────────────────────────────────

  it('shows connect form when a platform is chosen from add picker', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['telegram'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);

    // Click on Telegram in the picker
    const telegramOption = screen.getByText('Telegram');
    await user.click(telegramOption);

    // Connect form should appear
    expect(screen.getByText('Connect Telegram')).toBeInTheDocument();
    expect(screen.getByText('Setup Steps')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Display Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Bot Token')).toBeInTheDocument();
  });

  it('shows cancel button in connect form that closes it', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['telegram'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    await user.click(screen.getByText('Telegram'));

    expect(screen.getByText('Connect Telegram')).toBeInTheDocument();

    // Cancel the form
    const cancelBtns = screen.getAllByText('Cancel');
    await user.click(cancelBtns[cancelBtns.length - 1]);

    expect(screen.queryByText('Connect Telegram')).not.toBeInTheDocument();
  });

  // ── DevOps sub-tab ─────────────────────────────────────────────────

  it('shows DevOps integrations when available', async () => {
    const user = userEvent.setup();
    mockFetchIntegrations.mockResolvedValue({
      integrations: [
        createIntegration({
          id: 'int-github-1',
          platform: 'github',
          displayName: 'My GitHub',
          status: 'connected',
        }),
      ],
      total: 1,
      running: 1,
    });
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['github'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const devopsTab = screen.getByText('DevOps');
    await user.click(devopsTab);

    expect(await screen.findByText('My GitHub')).toBeInTheDocument();
  });

  // ── OAuth tab: Refresh Token and Disconnect ────────────────────────

  it('shows Refresh Token and Disconnect buttons for connected OAuth', async () => {
    const user = userEvent.setup();
    mockFetchOAuthTokens.mockResolvedValue([
      {
        id: 'tok-1',
        provider: 'google',
        email: 'user@gmail.com',
        userId: 'u1',
        scopes: 'email profile',
        expiresAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const oauthTab = await screen.findByText('OAuth');
    await user.click(oauthTab);

    expect(await screen.findByText('Refresh Token')).toBeInTheDocument();
    expect(screen.getByText('Disconnect')).toBeInTheDocument();
  });

  it('shows Refresh Token button for connected OAuth tokens', async () => {
    const user = userEvent.setup();
    mockFetchOAuthTokens.mockResolvedValue([
      {
        id: 'tok-1',
        provider: 'google',
        email: 'user@gmail.com',
        userId: 'u1',
        scopes: 'email profile',
        expiresAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const oauthTab = await screen.findByText('OAuth');
    await user.click(oauthTab);

    const refreshBtn = await screen.findByText('Refresh Token');
    expect(refreshBtn).toBeInTheDocument();
  });

  it('shows disconnect confirmation dialog when Disconnect clicked', async () => {
    const user = userEvent.setup();
    mockFetchOAuthTokens.mockResolvedValue([
      {
        id: 'tok-1',
        provider: 'google',
        email: 'user@gmail.com',
        userId: 'u1',
        scopes: 'email profile',
        expiresAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const oauthTab = await screen.findByText('OAuth');
    await user.click(oauthTab);

    await screen.findByText('user@gmail.com');
    const disconnectBtn = screen.getByText('Disconnect');
    await user.click(disconnectBtn);

    expect(screen.getByText(/Disconnect Google/)).toBeInTheDocument();
    expect(screen.getByText(/remove the connection for user@gmail.com/)).toBeInTheDocument();
  });

  it('shows "Add Another Account" when tokens exist', async () => {
    const user = userEvent.setup();
    mockFetchOAuthTokens.mockResolvedValue([
      {
        id: 'tok-1',
        provider: 'google',
        email: 'user@gmail.com',
        userId: 'u1',
        scopes: 'email profile',
        expiresAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const oauthTab = await screen.findByText('OAuth');
    await user.click(oauthTab);

    expect(await screen.findByText('Add Another Account')).toBeInTheDocument();
  });

  it('shows "Connect an Account" when no tokens', async () => {
    const user = userEvent.setup();
    mockFetchOAuthTokens.mockResolvedValue([]);
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const oauthTab = await screen.findByText('OAuth');
    await user.click(oauthTab);

    expect(await screen.findByText('Connect an Account')).toBeInTheDocument();
  });

  // ── URL-based tab routing ──────────────────────────────────────────

  it('opens MCP tab when URL contains /mcp', async () => {
    renderComponent(['/connections/mcp']);
    expect(await screen.findByText('Add Server')).toBeInTheDocument();
  });

  it('opens integrations tab when tab=messaging query param is set', async () => {
    renderComponent(['/connections?tab=messaging']);
    expect(await screen.findByText('Messaging')).toBeInTheDocument();
    // Messaging sub-tab should be active
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('opens email sub-tab when URL contains /email', async () => {
    renderComponent(['/connections/email']);
    expect(
      await screen.findByText(/Connect email accounts for direct email integration/)
    ).toBeInTheDocument();
  });

  it('opens oauth sub-tab when URL contains /oauth', async () => {
    renderComponent(['/connections/oauth']);
    expect(
      await screen.findByText(/Connect your accounts with OAuth providers/)
    ).toBeInTheDocument();
  });

  // ── Local server enabled/disabled states ───────────────────────────

  it('shows Enabled status for local server when enabled', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });
    renderComponent();
    expect(await screen.findByText('Enabled')).toBeInTheDocument();
  });

  it('shows Disabled status for local server when disabled', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [{ ...LOCAL_SERVER, enabled: false }],
      total: 1,
    });
    renderComponent();
    expect(await screen.findByText('Disabled')).toBeInTheDocument();
  });

  it('does not show Feature Toggles when local server is disabled', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [{ ...LOCAL_SERVER, enabled: false }],
      total: 1,
    });
    renderComponent();
    await expandYeomanCard();
    expect(screen.queryByText('Feature Toggles')).not.toBeInTheDocument();
  });

  // ── Server enabled/disabled count display ──────────────────────────

  it('shows enabled/configured server count', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        LOCAL_SERVER,
        {
          id: 'ext-1',
          name: 'Ext',
          transport: 'stdio',
          enabled: false,
          command: 'npx',
          args: [],
          description: '',
          url: null,
          env: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 2,
    });
    renderComponent();
    expect(await screen.findByText('1 enabled / 2 configured')).toBeInTheDocument();
  });

  // ── CI/CD Platform section ─────────────────────────────────────────

  it('shows CI/CD Platforms section with GitHub Actions, Jenkins, GitLab CI, Northflank', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });
    renderComponent();
    await expandYeomanCard();
    expect(await screen.findByText('CI/CD Platforms')).toBeInTheDocument();
    expect(screen.getByText('GitHub Actions')).toBeInTheDocument();
    expect(screen.getByText('Jenkins')).toBeInTheDocument();
    expect(screen.getByText('GitLab CI')).toBeInTheDocument();
    expect(screen.getByText('Northflank')).toBeInTheDocument();
  });

  // ── Federation tab ─────────────────────────────────────────────────

  it('switches to Federation tab when clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    const fedTab = await screen.findByText('Federation');
    await user.click(fedTab);
    // Federation tab renders the FederationTab component
    // It should no longer show MCP-specific content
    expect(screen.queryByText('Add Server')).not.toBeInTheDocument();
  });

  // ── Routing Rules tab ──────────────────────────────────────────────

  it('switches to Routing Rules tab when clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    const routingTab = await screen.findByText('Routing Rules');
    await user.click(routingTab);
    // Should no longer show MCP content
    expect(screen.queryByText('Add Server')).not.toBeInTheDocument();
  });

  // ── Integration status badges ──────────────────────────────────────

  it('shows Disconnected status badge', async () => {
    const user = userEvent.setup();
    mockFetchIntegrations.mockResolvedValue({
      integrations: [
        createIntegration({
          id: 'int-1',
          platform: 'discord',
          displayName: 'Disc Bot',
          status: 'disconnected',
        }),
      ],
      total: 1,
      running: 0,
    });
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['discord'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    await screen.findByText('Disc Bot');
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('shows Error status badge', async () => {
    const user = userEvent.setup();
    mockFetchIntegrations.mockResolvedValue({
      integrations: [
        createIntegration({
          id: 'int-1',
          platform: 'slack',
          displayName: 'Broken Slack',
          status: 'error',
          errorMessage: 'Token expired',
        }),
      ],
      total: 1,
      running: 0,
    });
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['slack'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    await screen.findByText('Broken Slack');
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Token expired')).toBeInTheDocument();
  });

  // ── Connected count ────────────────────────────────────────────────

  it('shows connected count for integrations list', async () => {
    const user = userEvent.setup();
    mockFetchIntegrations.mockResolvedValue({
      integrations: createIntegrationList(),
      total: 3,
      running: 1,
    });
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['telegram', 'discord', 'slack'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    await screen.findByText('Friday Telegram');
    expect(screen.getByText('3 Connected')).toBeInTheDocument();
  });

  // ── NetBox Write gate ──────────────────────────────────────────────

  it('shows NetBox Write toggle as disabled when Network Tools disabled', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });
    mockFetchMcpConfig.mockResolvedValue({
      ...DEFAULT_MCP_CONFIG,
      exposeNetworkTools: false,
    });
    renderComponent();
    await expandYeomanCard();
    expect(await screen.findByText('NetBox Write')).toBeInTheDocument();
    expect(screen.getByText('Enable Network Tools first')).toBeInTheDocument();
  });

  // ── Local server tool count filtering ──────────────────────────────

  it('shows tool count on local server card', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });
    mockFetchMcpTools.mockResolvedValue({
      tools: [
        {
          name: 'basic_tool',
          description: 'A tool',
          serverId: 'local',
          serverName: 'YEOMAN MCP',
          inputSchema: {},
        },
      ],
      total: 1,
    });
    renderComponent();
    const toolCountEls = await screen.findAllByText('1 tools');
    expect(toolCountEls.length).toBeGreaterThan(0);
  });

  // ── Twingate Remote Access section ─────────────────────────────────

  it('shows Twingate Remote Access heading', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });
    renderComponent();
    await expandYeomanCard();
    expect(await screen.findByText('Twingate Remote Access')).toBeInTheDocument();
    expect(screen.getByText('Twingate Zero-Trust Tunnel')).toBeInTheDocument();
  });

  // ── Feature toggle note ────────────────────────────────────────────

  it('shows feature toggle info note', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });
    renderComponent();
    await expandYeomanCard();
    expect(
      await screen.findByText(/Feature toggles control which tool categories/)
    ).toBeInTheDocument();
  });

  // ── Config snippet display ─────────────────────────────────────────

  it('shows config snippet after key generation', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });
    renderComponent();
    await expandYeomanCard();
    await screen.findByText(/New key generated/);
    expect(screen.getByText('Config snippet')).toBeInTheDocument();
    // Should show the mcpServers JSON config
    expect(screen.getByText(/mcpServers/)).toBeInTheDocument();
  });

  // ── MCP tab with both local and external ───────────────────────────

  it('renders both local server card and external server cards', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        LOCAL_SERVER,
        {
          id: 'ext-1',
          name: 'Remote MCP',
          transport: 'sse',
          enabled: true,
          command: null,
          args: [],
          description: 'A remote server',
          url: 'https://remote.example.com/sse',
          env: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 2,
    });
    renderComponent();
    expect(await screen.findByText('YEOMAN MCP')).toBeInTheDocument();
    expect(screen.getByText('Remote MCP')).toBeInTheDocument();
    expect(screen.getByText('Configured Servers')).toBeInTheDocument();
  });

  // ── External server shows command for stdio ────────────────────────

  it('shows command for stdio external server', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        {
          id: 'ext-1',
          name: 'Stdio Server',
          transport: 'stdio',
          enabled: true,
          command: 'node',
          args: ['server.js'],
          description: '',
          url: null,
          env: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });
    renderComponent();
    expect(await screen.findByText('Stdio Server')).toBeInTheDocument();
    expect(screen.getByText('node')).toBeInTheDocument();
  });

  // ── External server shows URL for non-stdio ───────────────────────

  it('shows URL for SSE external server', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        {
          id: 'ext-1',
          name: 'SSE Server',
          transport: 'sse',
          enabled: true,
          command: null,
          args: [],
          description: '',
          url: 'https://sse.example.com',
          env: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });
    renderComponent();
    expect(await screen.findByText('SSE Server')).toBeInTheDocument();
    expect(screen.getByText('https://sse.example.com')).toBeInTheDocument();
  });

  // ── Server description display ─────────────────────────────────────

  it('shows server description for external server', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        {
          id: 'ext-1',
          name: 'Described Server',
          transport: 'stdio',
          enabled: true,
          command: 'npx',
          args: [],
          description: 'This is a test description',
          url: null,
          env: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });
    renderComponent();
    expect(await screen.findByText('This is a test description')).toBeInTheDocument();
  });

  // ── OAuth Provider Setup (unconfigured providers) ──────────────────

  it('shows OAuth Provider Setup when providers not configured', async () => {
    const user = userEvent.setup();
    mockFetchOAuthConfig.mockResolvedValue({
      providers: [],
    });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const oauthTab = await screen.findByText('OAuth');
    await user.click(oauthTab);

    expect(await screen.findByText('OAuth Provider Setup')).toBeInTheDocument();
    expect(
      screen.getByText(/Enter OAuth client credentials for providers not yet configured/)
    ).toBeInTheDocument();
  });

  // ── Multiple providers in OAuth ────────────────────────────────────

  it('shows multiple connected OAuth accounts', async () => {
    const user = userEvent.setup();
    mockFetchOAuthTokens.mockResolvedValue([
      {
        id: 'tok-1',
        provider: 'google',
        email: 'user1@gmail.com',
        userId: 'u1',
        scopes: 'email',
        expiresAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'tok-2',
        provider: 'github',
        email: 'user2@github.com',
        userId: 'u2',
        scopes: 'repo',
        expiresAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const oauthTab = await screen.findByText('OAuth');
    await user.click(oauthTab);

    expect(await screen.findByText('user1@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('user2@github.com')).toBeInTheDocument();
  });

  // ── IMAP/SMTP availability ─────────────────────────────────────────

  it('shows IMAP/SMTP Connect button when email platform available', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['email'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const emailTab = screen.getByText('Email');
    await user.click(emailTab);

    // Should show Available badge and Connect button
    const availableBadges = await screen.findAllByText('Available');
    expect(availableBadges.length).toBeGreaterThan(0);
    const connectBtns = screen.getAllByText('Connect');
    expect(connectBtns.length).toBeGreaterThan(0);
  });

  it('shows Coming Soon for IMAP/SMTP when not available', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: [] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const emailTab = screen.getByText('Email');
    await user.click(emailTab);

    expect(await screen.findByText('Coming Soon')).toBeInTheDocument();
  });

  // ── Twitter / X platform ───────────────────────────────────────────

  it('shows Twitter / X in available platforms under Messaging', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['twitter'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);

    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Twitter / X')).toBeInTheDocument();
  });

  // ── DevOps platforms ───────────────────────────────────────────────

  it('shows GitHub in DevOps available platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['github'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const devopsTab = screen.getByText('DevOps');
    await user.click(devopsTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('shows GitLab in DevOps available platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['gitlab'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const devopsTab = screen.getByText('DevOps');
    await user.click(devopsTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('GitLab')).toBeInTheDocument();
  });

  it('shows Jira in DevOps available platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['jira'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const devopsTab = screen.getByText('DevOps');
    await user.click(devopsTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Jira')).toBeInTheDocument();
  });

  it('shows AWS in DevOps available platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['aws'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const devopsTab = screen.getByText('DevOps');
    await user.click(devopsTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('AWS')).toBeInTheDocument();
  });

  it('shows Azure DevOps in DevOps available platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['azure'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const devopsTab = screen.getByText('DevOps');
    await user.click(devopsTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Azure DevOps')).toBeInTheDocument();
  });

  // ── Messaging platforms (additional) ───────────────────────────────

  it('shows WhatsApp in available messaging platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['whatsapp'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
  });

  it('shows Signal in available messaging platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['signal'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Signal')).toBeInTheDocument();
  });

  it('shows Microsoft Teams in available messaging platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['teams'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Microsoft Teams')).toBeInTheDocument();
  });

  it('shows iMessage in available messaging platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['imessage'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('iMessage')).toBeInTheDocument();
  });

  it('shows Google Chat in available messaging platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['googlechat'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Google Chat')).toBeInTheDocument();
  });

  it('shows Slack in available messaging platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['slack'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Slack')).toBeInTheDocument();
  });

  // ── Webhook integration ────────────────────────────────────────────

  it('shows Webhook in available messaging platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['webhook'] });
    renderComponent();
    const intTab = await screen.findByText('Integrations');
    await user.click(intTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Webhook')).toBeInTheDocument();
  });

  // ── Ecosystem services ──────────────────────────────────────────

  it('renders ecosystem services section with fetched data', async () => {
    vi.mocked(api.fetchEcosystemServices).mockResolvedValue([
      {
        name: 'ifran',
        label: 'Ifran',
        enabled: true,
        status: 'connected',
        url: 'http://localhost:8420',
      },
    ] as any);
    renderComponent();
    // Ecosystem Services heading should appear
    const heading = await screen.findByText('Ecosystem Services');
    expect(heading).toBeInTheDocument();
  });

  it('handles ecosystem service fetch failure gracefully', async () => {
    vi.mocked(api.fetchEcosystemServices).mockRejectedValue(new Error('Network error'));
    const { container } = renderComponent();
    // Should render without crashing — page mounts successfully
    expect(container.querySelector('div')).toBeTruthy();
  });
});
