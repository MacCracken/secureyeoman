// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { A2APage } from './A2APage';

vi.mock('../api/client', () => ({
  fetchA2APeers: vi.fn(),
  addA2APeer: vi.fn(),
  removeA2APeer: vi.fn(),
  updateA2ATrust: vi.fn(),
  discoverA2APeers: vi.fn(),
  fetchA2ACapabilities: vi.fn(),
  delegateA2ATask: vi.fn(),
  fetchA2AMessages: vi.fn(),
  fetchA2AConfig: vi.fn(),
  fetchSecurityPolicy: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchA2AConfig = vi.mocked(api.fetchA2AConfig);
const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);
const mockFetchA2APeers = vi.mocked(api.fetchA2APeers);
const mockFetchA2ACapabilities = vi.mocked(api.fetchA2ACapabilities);
const mockFetchA2AMessages = vi.mocked(api.fetchA2AMessages);
const mockRemoveA2APeer = vi.mocked(api.removeA2APeer);
const mockDiscoverA2APeers = vi.mocked(api.discoverA2APeers);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <A2APage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const MOCK_PEERS = {
  peers: [
    {
      id: 'peer-1',
      name: 'Research Agent',
      url: 'https://research.example.com',
      trustLevel: 'trusted',
      status: 'online',
      lastSeen: Date.now() - 5000,
      capabilities: [
        { name: 'web-search', description: 'Search the web', version: '1.0' },
        { name: 'summarize', description: 'Summarize text', version: '1.0' },
      ],
    },
    {
      id: 'peer-2',
      name: 'Code Agent',
      url: 'https://code.example.com',
      trustLevel: 'verified',
      status: 'offline',
      lastSeen: Date.now() - 300000,
      capabilities: [],
    },
  ],
};

const MOCK_CAPABILITIES = {
  capabilities: [
    { name: 'chat', description: 'Natural language chat', version: '2.0' },
    { name: 'code-review', description: 'Review code changes', version: '1.0' },
  ],
};

const MOCK_MESSAGES = {
  messages: [
    {
      id: 'msg-1',
      fromPeerId: 'peer-1',
      toPeerId: 'local',
      type: 'request',
      payload: { task: 'Research quantum computing' },
      timestamp: Date.now() - 10000,
    },
    {
      id: 'msg-2',
      fromPeerId: 'local',
      toPeerId: 'peer-1',
      type: 'response',
      payload: 'Results found',
      timestamp: Date.now() - 5000,
    },
  ],
};

describe('A2APage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchA2AConfig.mockResolvedValue({ config: { enabled: true } });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: true,
      allowA2A: true,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowStorybook: false,
      allowMultimodal: false,
    });
    mockFetchA2APeers.mockResolvedValue(MOCK_PEERS);
    mockFetchA2ACapabilities.mockResolvedValue(MOCK_CAPABILITIES);
    mockFetchA2AMessages.mockResolvedValue({
      ...MOCK_MESSAGES,
      total: MOCK_MESSAGES.messages.length,
    });
  });

  // ── Rendering ──────────────────────────────────────────────

  it('renders the heading', async () => {
    renderComponent();
    expect(await screen.findByText('A2A Protocol')).toBeInTheDocument();
  });

  it('shows disabled state when config and security policy both disallow', async () => {
    mockFetchA2AConfig.mockResolvedValue({ config: { enabled: false } });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowStorybook: false,
      allowMultimodal: false,
    });
    renderComponent();
    expect(await screen.findByText('A2A Protocol Not Enabled')).toBeInTheDocument();
  });

  it('shows enabled state when only security policy allows', async () => {
    mockFetchA2AConfig.mockResolvedValue({ config: { enabled: false } });
    renderComponent();
    expect(await screen.findByText('Peers')).toBeInTheDocument();
    expect(screen.getByText('Discover')).toBeInTheDocument();
  });

  it('shows enabled state when only config.enabled is true', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowStorybook: false,
      allowMultimodal: false,
    });
    renderComponent();
    expect(await screen.findByText('Peers')).toBeInTheDocument();
    expect(screen.getByText('Discover')).toBeInTheDocument();
  });

  // ── Tabs ───────────────────────────────────────────────────

  it('renders Peers, Capabilities, and Messages tabs', async () => {
    renderComponent();
    expect(await screen.findByText('Peers')).toBeInTheDocument();
    expect(screen.getAllByText('Capabilities').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Messages')).toBeInTheDocument();
  });

  // ── Peers Tab ──────────────────────────────────────────────

  it('shows connected peers with trust levels', async () => {
    renderComponent();
    expect(await screen.findByText('Research Agent')).toBeInTheDocument();
    expect(screen.getByText('Code Agent')).toBeInTheDocument();
    expect(screen.getByText('trusted')).toBeInTheDocument();
    expect(screen.getByText('verified')).toBeInTheDocument();
  });

  it('shows peer status badges', async () => {
    renderComponent();
    expect(await screen.findByText('online')).toBeInTheDocument();
    expect(screen.getByText('offline')).toBeInTheDocument();
  });

  it('shows peer URLs', async () => {
    renderComponent();
    expect(await screen.findByText('https://research.example.com')).toBeInTheDocument();
    expect(screen.getByText('https://code.example.com')).toBeInTheDocument();
  });

  it('shows peer capabilities as badges', async () => {
    renderComponent();
    await screen.findByText('Research Agent');
    expect(screen.getByText('web-search')).toBeInTheDocument();
    expect(screen.getByText('summarize')).toBeInTheDocument();
  });

  it('shows empty peers state', async () => {
    mockFetchA2APeers.mockResolvedValue({ peers: [] });
    renderComponent();
    expect(await screen.findByText('No peers connected')).toBeInTheDocument();
  });

  it('shows Add Peer button', async () => {
    renderComponent();
    expect(await screen.findByText('Add Peer')).toBeInTheDocument();
  });

  it('can remove a peer', async () => {
    mockRemoveA2APeer.mockResolvedValue(undefined as never);
    renderComponent();
    await screen.findByText('Research Agent');
    const removeButtons = screen.getAllByTitle('Remove peer');
    fireEvent.click(removeButtons[0]);
    await waitFor(() => {
      expect(mockRemoveA2APeer).toHaveBeenCalled();
      expect(mockRemoveA2APeer.mock.calls[0][0]).toBe('peer-1');
    });
  });

  it('can change trust level', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Research Agent');
    const trustButtons = screen.getAllByTitle('Change trust level');
    await user.click(trustButtons[0]);
    expect(screen.getByDisplayValue('trusted')).toBeInTheDocument();
  });

  // ── Capabilities Tab ───────────────────────────────────────

  it('shows local capabilities when Capabilities tab is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Research Agent');
    // Click on the Capabilities tab specifically
    const tabs = screen.getAllByText('Capabilities');
    // The tab is the one in the tab bar (button element)
    const tabButton = tabs.find((el) => el.closest('button'));
    await user.click(tabButton!);
    expect(await screen.findByText('Local Capabilities')).toBeInTheDocument();
    expect(screen.getByText('chat')).toBeInTheDocument();
    expect(screen.getByText('code-review')).toBeInTheDocument();
  });

  it('shows empty capabilities state', async () => {
    const user = userEvent.setup();
    mockFetchA2ACapabilities.mockResolvedValue({ capabilities: [] });
    renderComponent();
    await screen.findByText('Research Agent');
    const tabs = screen.getAllByText('Capabilities');
    const tabButton = tabs.find((el) => el.closest('button'));
    await user.click(tabButton!);
    expect(await screen.findByText('No capabilities registered')).toBeInTheDocument();
  });

  it('shows peer capabilities selector', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Research Agent');
    const tabs = screen.getAllByText('Capabilities');
    const tabButton = tabs.find((el) => el.closest('button'));
    await user.click(tabButton!);
    expect(await screen.findByText('Peer Capabilities')).toBeInTheDocument();
  });

  // ── Messages Tab ───────────────────────────────────────────

  it('shows messages when Messages tab is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Research Agent');
    await user.click(screen.getByText('Messages'));
    expect(await screen.findByText('request')).toBeInTheDocument();
    expect(screen.getByText('response')).toBeInTheDocument();
  });

  it('shows empty messages state', async () => {
    const user = userEvent.setup();
    mockFetchA2AMessages.mockResolvedValue({ messages: [], total: 0 });
    renderComponent();
    await screen.findByText('Research Agent');
    await user.click(screen.getByText('Messages'));
    expect(await screen.findByText('No messages')).toBeInTheDocument();
  });

  // ── Discover & Delegate ────────────────────────────────────

  it('calls discover when Discover button is clicked', async () => {
    const user = userEvent.setup();
    mockDiscoverA2APeers.mockResolvedValue(undefined as never);
    renderComponent();
    const discoverBtn = await screen.findByText('Discover');
    await user.click(discoverBtn);
    await waitFor(() => {
      expect(mockDiscoverA2APeers).toHaveBeenCalled();
    });
  });

  it('opens Delegate Task inline form when button is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Research Agent');
    // Find the Delegate Task button
    const delegateButtons = screen.getAllByText('Delegate Task');
    await user.click(delegateButtons[0]);
    expect(await screen.findByText('Delegate Task to Peer')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Describe the task to delegate...')).toBeInTheDocument();
  });
});
