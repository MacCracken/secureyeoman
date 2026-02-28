// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectionsPage } from './ConnectionsPage';
import { createIntegrationList } from '../test/mocks';

vi.mock('../api/client', () => ({
  fetchMcpServers: vi.fn(),
  addMcpServer: vi.fn(),
  deleteMcpServer: vi.fn(),
  patchMcpServer: vi.fn(),
  fetchMcpTools: vi.fn(),
  fetchMcpConfig: vi.fn(),
  updateMcpConfig: vi.fn(),
  fetchSecurityPolicy: vi.fn(),
  fetchIntegrations: vi.fn(),
  fetchAvailablePlatforms: vi.fn(),
  createIntegration: vi.fn(),
  startIntegration: vi.fn(),
  stopIntegration: vi.fn(),
  deleteIntegration: vi.fn(),
  testIntegration: vi.fn(),
  fetchOAuthConfig: vi.fn(),
  fetchOAuthTokens: vi.fn(),
  revokeOAuthToken: vi.fn(),
  refreshOAuthToken: vi.fn(),
  createApiKey: vi.fn(),
  fetchApiKeys: vi.fn(),
  revokeApiKey: vi.fn(),
}));

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

describe('ConnectionsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchMcpServers.mockResolvedValue({ servers: [], total: 0 });
    mockFetchMcpTools.mockResolvedValue({ tools: [], total: 0 });
    mockFetchMcpConfig.mockResolvedValue({
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
      proxyStrategy: 'round-robin',
      proxyDefaultCountry: '',
      exposeSecurityTools: false,
      allowedTargets: [],
      exposeGmail: false,
      exposeTwitter: false,
    });
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
    mockFetchSecurityPolicy.mockResolvedValue({
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
      allowAdvancedEditor: false, allowTrainingExport: false,
    } as never);
  });

  it('renders the Connections header', async () => {
    renderComponent();
    expect(await screen.findByText('Connections')).toBeInTheDocument();
  });

  it('renders MCP, Integrations, and Routing Rules tabs', async () => {
    renderComponent();
    expect(await screen.findByText('MCP')).toBeInTheDocument();
    expect(screen.getByText('Integrations')).toBeInTheDocument();
    expect(screen.getByText('Routing Rules')).toBeInTheDocument();
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
      servers: [
        {
          id: 'local',
          name: 'YEOMAN MCP',
          transport: 'stdio',
          enabled: true,
          command: 'secureyeoman',
          args: ['mcp-server'],
          description: 'Local MCP',
          url: null,
          env: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowTwingate: false,
      allowNetBoxWrite: false,
      allowNetworkTools: false,
      allowOrgIntent: false,
      allowIntentEditor: false,
      allowCodeEditor: true,
      allowAdvancedEditor: false, allowTrainingExport: false,
    } as never);

    renderComponent();
    expect(
      await screen.findByText('Enable Twingate in Security settings first')
    ).toBeInTheDocument();
  });

  it('shows Twingate description when allowTwingate is true', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [
        {
          id: 'local',
          name: 'YEOMAN MCP',
          transport: 'stdio',
          enabled: true,
          command: 'secureyeoman',
          args: ['mcp-server'],
          description: 'Local MCP',
          url: null,
          env: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowTwingate: true,
      allowNetBoxWrite: false,
      allowNetworkTools: false,
      allowOrgIntent: false,
      allowIntentEditor: false,
      allowCodeEditor: true,
      allowAdvancedEditor: false, allowTrainingExport: false,
    } as never);

    renderComponent();
    expect(
      await screen.findByText('Agents can reach private MCP servers and resources via Twingate')
    ).toBeInTheDocument();
  });

  // ── Connection Setup section ────────────────────────────────────────

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

  it('shows Connect your MCP client section for LocalServerCard', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });
    renderComponent();
    expect(await screen.findByText('Connect your MCP client')).toBeInTheDocument();
    expect(screen.getByText('http://localhost:18789/mcp/v1')).toBeInTheDocument();
  });

  it('auto-generates a key on mount and shows new key banner', async () => {
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });
    renderComponent();
    expect(await screen.findByText(/New key generated/)).toBeInTheDocument();
    expect(mockCreateApiKey).toHaveBeenCalledWith({ name: 'YEOMAN MCP', role: 'operator' });
  });

  it('shows existing keys listing with revoke button', async () => {
    const user = userEvent.setup();
    mockFetchApiKeys.mockResolvedValue({
      keys: [{ id: 'key-1', name: 'YEOMAN MCP', role: 'operator', prefix: 'sck_abcd', createdAt: '2026-02-27T00:00:00.000Z' }],
    } as never);
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });

    renderComponent();
    expect(await screen.findByText(/sck_abcd/)).toBeInTheDocument();
    const revokeBtn = screen.getByTitle('Revoke key');
    await user.click(revokeBtn);
    expect(mockRevokeApiKey).toHaveBeenCalledWith('key-1');
  });

  it('shows revealed token after clicking reveal button', async () => {
    const user = userEvent.setup();
    mockFetchMcpServers.mockResolvedValue({ servers: [LOCAL_SERVER], total: 1 });

    renderComponent();
    await screen.findByText(/New key generated/);
    const revealBtn = screen.getByTitle('Reveal token');
    await user.click(revealBtn);
    expect(screen.getByText('sck_auto_generated')).toBeInTheDocument();
  });
});
