// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SubAgentsPage } from './SubAgentsPage';

vi.mock('../api/client', () => ({
  fetchAgentProfiles: vi.fn(),
  fetchDelegations: vi.fn(),
  fetchActiveDelegations: vi.fn(),
  cancelDelegation: vi.fn(),
  delegateTask: vi.fn(),
  createAgentProfile: vi.fn(),
  deleteAgentProfile: vi.fn(),
  fetchDelegationMessages: vi.fn(),
  fetchAgentConfig: vi.fn(),
  fetchSecurityPolicy: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchAgentConfig = vi.mocked(api.fetchAgentConfig);
const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);
const mockFetchAgentProfiles = vi.mocked(api.fetchAgentProfiles);
const mockFetchActiveDelegations = vi.mocked(api.fetchActiveDelegations);
const mockFetchDelegations = vi.mocked(api.fetchDelegations);
const mockCancelDelegation = vi.mocked(api.cancelDelegation);
const mockDeleteAgentProfile = vi.mocked(api.deleteAgentProfile);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <SubAgentsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const MOCK_PROFILES = {
  profiles: [
    {
      id: 'p1',
      name: 'researcher',
      description: 'Research specialist',
      systemPrompt: 'You are a researcher',
      maxTokenBudget: 50000,
      allowedTools: ['web_search'],
      defaultModel: 'gpt-4',
      isBuiltin: true,
    },
    {
      id: 'p2',
      name: 'coder',
      description: 'Code assistant',
      systemPrompt: 'You are a coder',
      maxTokenBudget: 100000,
      allowedTools: [],
      defaultModel: null,
      isBuiltin: false,
    },
  ],
};

const MOCK_ACTIVE_DELEGATIONS = {
  delegations: [
    {
      delegationId: 'del-1',
      profileId: 'p1',
      profileName: 'researcher',
      task: 'Find information about quantum computing',
      status: 'running',
      depth: 0,
      tokensUsed: 12000,
      tokenBudget: 50000,
      startedAt: Date.now() - 30000,
      elapsedMs: 30000,
    },
  ],
};

const MOCK_DELEGATIONS = {
  delegations: [
    {
      id: 'del-hist-1',
      parentDelegationId: null,
      profileId: 'p1',
      task: 'Summarize article',
      context: null,
      status: 'completed',
      result: 'Summary of the article...',
      error: null,
      depth: 0,
      maxDepth: 3,
      tokensUsedPrompt: 5000,
      tokensUsedCompletion: 2000,
      tokenBudget: 50000,
      timeoutMs: 300000,
      createdAt: Date.now() - 60000,
      startedAt: Date.now() - 55000,
      completedAt: Date.now() - 50000,
      initiatedBy: null,
      correlationId: null,
    },
  ],
};

describe('SubAgentsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchAgentConfig.mockResolvedValue({
      config: { enabled: true },
      allowedBySecurityPolicy: true,
    });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: true,
      allowA2A: false,
      allowExtensions: false,
      allowExecution: true, allowProactive: false, allowExperiments: false, allowMultimodal: false,
    });
    mockFetchAgentProfiles.mockResolvedValue(MOCK_PROFILES);
    mockFetchActiveDelegations.mockResolvedValue(MOCK_ACTIVE_DELEGATIONS);
    mockFetchDelegations.mockResolvedValue({ ...MOCK_DELEGATIONS, total: MOCK_DELEGATIONS.delegations.length });
  });

  // ── Rendering ──────────────────────────────────────────────

  it('renders the heading', async () => {
    renderComponent();
    expect(await screen.findByText('Sub-Agents')).toBeInTheDocument();
  });

  it('shows disabled state when config.enabled is false and security policy disallows', async () => {
    mockFetchAgentConfig.mockResolvedValue({
      config: { enabled: false },
      allowedBySecurityPolicy: false,
    });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowExtensions: false,
      allowExecution: true, allowProactive: false, allowExperiments: false, allowMultimodal: false,
    });
    renderComponent();
    expect(await screen.findByText('Delegation Not Enabled')).toBeInTheDocument();
  });

  it('shows enabled state when only agentConfig.allowedBySecurityPolicy is true', async () => {
    mockFetchAgentConfig.mockResolvedValue({
      config: { enabled: false },
      allowedBySecurityPolicy: true,
    });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowExtensions: false,
      allowExecution: true, allowProactive: false, allowExperiments: false, allowMultimodal: false,
    });
    renderComponent();
    expect(await screen.findByText('Active')).toBeInTheDocument();
  });

  it('shows enabled state when only securityPolicy.allowSubAgents is true', async () => {
    mockFetchAgentConfig.mockResolvedValue({
      config: { enabled: false },
      allowedBySecurityPolicy: false,
    });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: true,
      allowA2A: false,
      allowExtensions: false,
      allowExecution: true, allowProactive: false, allowExperiments: false, allowMultimodal: false,
    });
    renderComponent();
    expect(await screen.findByText('Active')).toBeInTheDocument();
  });

  it('shows enabled state when only config.enabled is true', async () => {
    mockFetchAgentConfig.mockResolvedValue({
      config: { enabled: true },
      allowedBySecurityPolicy: false,
    });
    renderComponent();
    expect(await screen.findByText('Active')).toBeInTheDocument();
  });

  // ── Tabs ───────────────────────────────────────────────────

  it('renders Active, History, and Profiles tabs', async () => {
    renderComponent();
    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
    expect(screen.getByText('Profiles')).toBeInTheDocument();
  });

  // ── Active Delegations Tab ─────────────────────────────────

  it('shows active delegations with status and profile name', async () => {
    renderComponent();
    expect(await screen.findByText('researcher')).toBeInTheDocument();
    expect(screen.getByText('Find information about quantum computing')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('shows token usage bar for active delegations', async () => {
    renderComponent();
    await screen.findByText('researcher');
    expect(screen.getByText(/12,000.*50,000.*tokens/)).toBeInTheDocument();
  });

  it('shows empty state when no active delegations', async () => {
    mockFetchActiveDelegations.mockResolvedValue({ delegations: [] });
    renderComponent();
    expect(await screen.findByText('No active delegations')).toBeInTheDocument();
  });

  it('can cancel an active delegation', async () => {
    mockCancelDelegation.mockResolvedValue(undefined as never);
    renderComponent();
    await screen.findByText('researcher');
    const cancelBtn = screen.getByTitle('Cancel delegation');
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(mockCancelDelegation).toHaveBeenCalled();
      expect(mockCancelDelegation.mock.calls[0][0]).toBe('del-1');
    });
  });

  // ── History Tab ────────────────────────────────────────────

  it('shows delegation history when History tab is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('History'));
    expect(await screen.findByText('Summarize article')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('shows empty state in history when no delegations exist', async () => {
    const user = userEvent.setup();
    mockFetchDelegations.mockResolvedValue({ delegations: [], total: 0 });
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('History'));
    expect(await screen.findByText('No delegations found')).toBeInTheDocument();
  });

  // ── Profiles Tab ───────────────────────────────────────────

  it('shows agent profiles when Profiles tab is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('Profiles'));
    expect(await screen.findByText('researcher')).toBeInTheDocument();
    expect(screen.getByText('coder')).toBeInTheDocument();
    expect(screen.getByText('Research specialist')).toBeInTheDocument();
  });

  it('shows builtin lock icon on builtin profiles', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('Profiles'));
    await screen.findByText('researcher');
    expect(screen.getByLabelText('Built-in profile')).toBeInTheDocument();
  });

  it('shows delete button only on non-builtin profiles', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('Profiles'));
    await screen.findByText('coder');
    const deleteButtons = screen.getAllByTitle('Delete profile');
    expect(deleteButtons).toHaveLength(1);
  });

  it('shows New Profile button on Profiles tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('Profiles'));
    expect(await screen.findByText('New Profile')).toBeInTheDocument();
  });

  // ── Delegate Task Dialog ───────────────────────────────────

  it('opens Delegate Task inline form when button is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('Delegate Task'));
    expect(await screen.findByPlaceholderText('Describe the task for the sub-agent...')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });
});
