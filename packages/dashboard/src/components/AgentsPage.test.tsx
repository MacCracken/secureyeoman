// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AgentsPage } from './AgentsPage';

vi.mock('../api/client', () => ({
  fetchAgentConfig: vi.fn(),
  fetchSecurityPolicy: vi.fn(),
  fetchA2AConfig: vi.fn(),
  // SubAgentsPage dependencies
  fetchAgentProfiles: vi.fn(),
  fetchDelegations: vi.fn(),
  fetchActiveDelegations: vi.fn(),
  cancelDelegation: vi.fn(),
  delegateTask: vi.fn(),
  createAgentProfile: vi.fn(),
  deleteAgentProfile: vi.fn(),
  fetchDelegationMessages: vi.fn(),
  // A2APage dependencies
  fetchA2APeers: vi.fn(),
  addA2APeer: vi.fn(),
  removeA2APeer: vi.fn(),
  updateA2ATrust: vi.fn(),
  discoverA2APeers: vi.fn(),
  fetchA2ACapabilities: vi.fn(),
  delegateA2ATask: vi.fn(),
  fetchA2AMessages: vi.fn(),
  // MultimodalPage dependencies
  fetchMultimodalJobs: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchAgentConfig = vi.mocked(api.fetchAgentConfig);
const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);
const mockFetchA2AConfig = vi.mocked(api.fetchA2AConfig);
const mockFetchAgentProfiles = vi.mocked(api.fetchAgentProfiles);
const mockFetchActiveDelegations = vi.mocked(api.fetchActiveDelegations);
const mockFetchDelegations = vi.mocked(api.fetchDelegations);
const mockFetchA2APeers = vi.mocked(api.fetchA2APeers);
const mockFetchA2ACapabilities = vi.mocked(api.fetchA2ACapabilities);
const mockFetchA2AMessages = vi.mocked(api.fetchA2AMessages);
const mockFetchMultimodalJobs = vi.mocked(api.fetchMultimodalJobs);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <AgentsPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const DEFAULT_POLICY = {
  allowSubAgents: true,
  allowA2A: true,
  allowExtensions: false,
  allowExecution: true,
  allowProactive: false,
  allowExperiments: false,
  allowMultimodal: true,
};

describe('AgentsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchAgentConfig.mockResolvedValue({
      config: { enabled: true },
      allowedBySecurityPolicy: true,
    });
    mockFetchSecurityPolicy.mockResolvedValue(DEFAULT_POLICY);
    mockFetchA2AConfig.mockResolvedValue({ config: { enabled: true } });
    // SubAgentsPage data
    mockFetchAgentProfiles.mockResolvedValue({ profiles: [] });
    mockFetchActiveDelegations.mockResolvedValue({ delegations: [] });
    mockFetchDelegations.mockResolvedValue({ delegations: [], total: 0 });
    // A2APage data
    mockFetchA2APeers.mockResolvedValue({ peers: [] });
    mockFetchA2ACapabilities.mockResolvedValue({ capabilities: [] });
    mockFetchA2AMessages.mockResolvedValue({ messages: [], total: 0 });
    // MultimodalPage data
    mockFetchMultimodalJobs.mockResolvedValue({ jobs: [], total: 0 });
  });

  // ── Header ──────────────────────────────────────────────────

  it('renders the Agents heading', async () => {
    renderComponent();
    expect(await screen.findByText('Agents')).toBeInTheDocument();
  });

  // ── Disabled State ──────────────────────────────────────────

  it('shows disabled message when no agent features are enabled', async () => {
    mockFetchAgentConfig.mockResolvedValue({
      config: { enabled: false },
      allowedBySecurityPolicy: false,
    });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowMultimodal: false,
    });
    mockFetchA2AConfig.mockResolvedValue({ config: { enabled: false } });
    renderComponent();
    expect(await screen.findByText('Agent Features Not Enabled')).toBeInTheDocument();
  });

  it('shows agents page when only multimodal is enabled', async () => {
    mockFetchAgentConfig.mockResolvedValue({
      config: { enabled: false },
      allowedBySecurityPolicy: false,
    });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowMultimodal: true,
    });
    mockFetchA2AConfig.mockResolvedValue({ config: { enabled: false } });
    renderComponent();
    // Wait for multimodal content to appear (job viewer)
    expect(await screen.findByText('Jobs')).toBeInTheDocument();
    // Should not show the disabled message
    expect(screen.queryByText('Agent Features Not Enabled')).not.toBeInTheDocument();
  });

  // ── Tab Visibility ──────────────────────────────────────────

  it('shows all three tabs when all features are enabled', async () => {
    renderComponent();
    expect(await screen.findByText('Multimodal')).toBeInTheDocument();
    expect(screen.getByText('Sub-Agents')).toBeInTheDocument();
    expect(screen.getByText('A2A Network')).toBeInTheDocument();
  });

  it('hides Multimodal tab when allowMultimodal is false', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      ...DEFAULT_POLICY,
      allowMultimodal: false,
    });
    renderComponent();
    expect(await screen.findByText('Sub-Agents')).toBeInTheDocument();
    expect(screen.queryByText('Multimodal')).not.toBeInTheDocument();
  });

  it('hides Sub-Agents tab when sub-agents are disabled', async () => {
    mockFetchAgentConfig.mockResolvedValue({
      config: { enabled: false },
      allowedBySecurityPolicy: false,
    });
    mockFetchSecurityPolicy.mockResolvedValue({
      ...DEFAULT_POLICY,
      allowSubAgents: false,
    });
    renderComponent();
    expect(await screen.findByText('Multimodal')).toBeInTheDocument();
    expect(screen.queryByText('Sub-Agents')).not.toBeInTheDocument();
  });

  it('hides A2A tab when A2A is disabled', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      ...DEFAULT_POLICY,
      allowA2A: false,
    });
    mockFetchA2AConfig.mockResolvedValue({ config: { enabled: false } });
    renderComponent();
    expect(await screen.findByText('Sub-Agents')).toBeInTheDocument();
    expect(screen.queryByText('A2A Network')).not.toBeInTheDocument();
  });

  // ── Single Section ──────────────────────────────────────────

  it('renders single section directly without tabs when only one is enabled', async () => {
    mockFetchAgentConfig.mockResolvedValue({
      config: { enabled: false },
      allowedBySecurityPolicy: false,
    });
    mockFetchSecurityPolicy.mockResolvedValue({
      ...DEFAULT_POLICY,
      allowSubAgents: false,
      allowA2A: false,
      allowMultimodal: true,
    });
    mockFetchA2AConfig.mockResolvedValue({ config: { enabled: false } });
    renderComponent();
    // Should show multimodal content directly (no tab bar)
    await screen.findByText('Agents');
    // No tab buttons when single section
    expect(screen.queryByRole('button', { name: 'Multimodal' })).not.toBeInTheDocument();
  });

  // ── Tab Switching ───────────────────────────────────────────

  it('defaults to Sub-Agents tab', async () => {
    renderComponent();
    // Sub-Agents tab content (Active delegations area)
    expect(await screen.findByText('No active delegations')).toBeInTheDocument();
  });

  it('switches to Multimodal tab on click', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Sub-Agents');
    await user.click(screen.getByText('Multimodal'));
    expect(await screen.findByText('Jobs')).toBeInTheDocument();
  });

  it('switches to A2A tab on click', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('A2A Network');
    await user.click(screen.getByText('A2A Network'));
    expect(await screen.findByText('No peers connected')).toBeInTheDocument();
  });
});
