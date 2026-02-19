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
  fetchIntegrations: vi.fn(),
  fetchAvailablePlatforms: vi.fn(),
  createIntegration: vi.fn(),
  startIntegration: vi.fn(),
  stopIntegration: vi.fn(),
  deleteIntegration: vi.fn(),
  testIntegration: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchMcpServers = vi.mocked(api.fetchMcpServers);
const mockFetchMcpTools = vi.mocked(api.fetchMcpTools);
const mockFetchMcpConfig = vi.mocked(api.fetchMcpConfig);
const mockFetchIntegrations = vi.mocked(api.fetchIntegrations);
const mockFetchAvailablePlatforms = vi.mocked(api.fetchAvailablePlatforms);
const mockTestIntegration = vi.mocked(api.testIntegration);

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
      allowedUrls: [],
      webRateLimitPerMinute: 10,
      proxyEnabled: false,
      proxyProviders: [],
      proxyStrategy: 'round-robin',
      proxyDefaultCountry: '',
    });
    mockFetchIntegrations.mockResolvedValue({ integrations: [], total: 0, running: 0 });
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: [] });
  });

  it('renders the Connections header', async () => {
    renderComponent();
    expect(await screen.findByText('Connections')).toBeInTheDocument();
  });

  it('renders all three tabs', async () => {
    renderComponent();
    expect(await screen.findByText('Messaging')).toBeInTheDocument();
    expect(screen.getByText('MCP')).toBeInTheDocument();
    expect(screen.getByText('OAuth')).toBeInTheDocument();
  });

  it('shows Messaging tab content by default', async () => {
    renderComponent();
    expect(
      await screen.findByText('Manage integrations, MCP servers, and authentication')
    ).toBeInTheDocument();
  });

  it('switches to MCP tab when clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    const mcpTab = await screen.findByText('MCP');
    await user.click(mcpTab);

    expect(screen.getByText('Add Server')).toBeInTheDocument();
  });

  it('switches to OAuth tab when clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    const oauthTab = await screen.findByText('OAuth');
    await user.click(oauthTab);

    expect(screen.getByText(/Connect your account with OAuth providers/)).toBeInTheDocument();
  });

  it('displays OAuth providers when OAuth tab is active', async () => {
    const user = userEvent.setup();
    renderComponent();

    const oauthTab = await screen.findByText('OAuth');
    await user.click(oauthTab);

    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('shows empty state when no integrations connected', async () => {
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: [] });
    mockFetchIntegrations.mockResolvedValue({ integrations: [], total: 0, running: 0 });
    renderComponent();
    expect(await screen.findByText('No integrations connected yet')).toBeInTheDocument();
  });

  it('shows messaging integrations when available', async () => {
    mockFetchIntegrations.mockResolvedValue({
      integrations: createIntegrationList(),
      total: 3,
      running: 1,
    });
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['telegram', 'discord'] });

    renderComponent();
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
    mockFetchIntegrations.mockResolvedValue({
      integrations: [
        {
          id: '1',
          platform: 'google_oauth',
          displayName: 'Google',
          status: 'connected',
          messageCount: 0,
          config: {},
          enabled: true,
        },
      ],
      total: 1,
      running: 1,
    });

    renderComponent();

    const oauthTab = await screen.findByText('OAuth');
    await user.click(oauthTab);

    expect(screen.getByText('Connected OAuth Providers')).toBeInTheDocument();
    expect(screen.getAllByText('Google').length).toBeGreaterThan(0);
  });

  it('shows Test button for each integration', async () => {
    mockFetchIntegrations.mockResolvedValue({
      integrations: createIntegrationList(),
      total: 3,
      running: 1,
    });
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['telegram', 'discord', 'slack'] });

    renderComponent();
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
    // QQ is a messaging platform — open the picker on the default Messaging sub-tab
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('QQ')).toBeInTheDocument();
  });

  it('shows DingTalk in available platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['dingtalk'] });
    renderComponent();
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('DingTalk')).toBeInTheDocument();
  });

  it('shows Line in available platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['line'] });
    renderComponent();
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Line')).toBeInTheDocument();
  });

  it('shows Figma MCP featured server on MCP tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    const mcpTab = await screen.findByText('MCP');
    await user.click(mcpTab);
    expect(screen.getByText('Figma')).toBeInTheDocument();
  });

  it('shows Stripe MCP featured server on MCP tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    const mcpTab = await screen.findByText('MCP');
    await user.click(mcpTab);
    expect(screen.getByText('Stripe')).toBeInTheDocument();
  });

  it('shows Zapier MCP featured server on MCP tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    const mcpTab = await screen.findByText('MCP');
    await user.click(mcpTab);
    expect(screen.getByText('Zapier')).toBeInTheDocument();
  });

  it('shows Linear in available platforms', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['linear'] });
    renderComponent();
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
    const mcpTab = await screen.findByText('MCP');
    await user.click(mcpTab);
    expect(screen.getByText('Linear')).toBeInTheDocument();
  });

  // ── Productivity sub-tab ──────────────────────────────────

  it('renders the Productivity sub-tab', async () => {
    renderComponent();
    expect(await screen.findByText('Productivity')).toBeInTheDocument();
  });

  it('does not render a Calendar sub-tab', async () => {
    renderComponent();
    await screen.findByText('Messaging'); // wait for render
    expect(screen.queryByRole('button', { name: /^Calendar$/i })).not.toBeInTheDocument();
  });

  it('shows Notion in available platforms under Productivity', async () => {
    const user = userEvent.setup();
    mockFetchAvailablePlatforms.mockResolvedValue({ platforms: ['notion'] });
    renderComponent();
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
    const productivityTab = await screen.findByText('Productivity');
    await user.click(productivityTab);
    const addBtn = await screen.findByText('Add Integration');
    await user.click(addBtn);
    expect(screen.getByText('Google Calendar')).toBeInTheDocument();
  });
});
