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
  // Phase 89 — profile skills
  fetchProfileSkills: vi.fn().mockResolvedValue({ skills: [] }),
  addProfileSkill: vi.fn().mockResolvedValue(undefined),
  removeProfileSkill: vi.fn().mockResolvedValue(undefined),
  fetchMarketplaceSkills: vi.fn().mockResolvedValue({ skills: [], total: 0 }),
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
    </MemoryRouter>
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
    mockFetchAgentProfiles.mockResolvedValue(MOCK_PROFILES);
    mockFetchActiveDelegations.mockResolvedValue(MOCK_ACTIVE_DELEGATIONS);
    mockFetchDelegations.mockResolvedValue({
      ...MOCK_DELEGATIONS,
      total: MOCK_DELEGATIONS.delegations.length,
    });
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
    renderComponent();
    expect(await screen.findByText('Delegation Not Enabled')).toBeInTheDocument();
  });

  it('shows enabled state when allowSubAgents policy is true', async () => {
    mockFetchAgentConfig.mockResolvedValue({
      config: { enabled: false },
      allowedBySecurityPolicy: true,
    });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: true,
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

  it('hides Swarms tab when allowSwarms is false', async () => {
    renderComponent();
    await screen.findByText('Active');
    expect(screen.queryByText('Swarms')).not.toBeInTheDocument();
  });

  it('shows Swarms tab immediately after Active when allowSwarms is true', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: true,
      allowA2A: false,
      allowSwarms: true,
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
    renderComponent();
    const tabs = await screen.findAllByRole('button', { name: /Active|Swarms|History|Profiles/i });
    const labels = tabs.map((t) => t.textContent?.trim());
    const activeIdx = labels.findIndex((l) => l === 'Active');
    const swarmsIdx = labels.findIndex((l) => l === 'Swarms');
    expect(swarmsIdx).toBeGreaterThan(-1);
    expect(swarmsIdx).toBe(activeIdx + 1);
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
    expect(
      await screen.findByPlaceholderText('Describe the task for the sub-agent...')
    ).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  // ── Delegate form fields ────────────────────────────────────────

  it('shows profile selector with available profiles in delegate form', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('Delegate Task'));
    await waitFor(() => {
      // The profiles should be listed in the select
      const option1 = screen.getByText('researcher (built-in)');
      const option2 = screen.getByText('coder');
      expect(option1).toBeInTheDocument();
      expect(option2).toBeInTheDocument();
    });
  });

  it('shows context textarea in delegate form', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('Delegate Task'));
    expect(screen.getByPlaceholderText('Additional context...')).toBeInTheDocument();
  });

  it('disables delegate button when task is empty', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('Delegate Task'));
    await waitFor(() => {
      const delegateBtn = screen.getByText('Delegate');
      expect(delegateBtn.closest('button')).toBeDisabled();
    });
  });

  it('can close delegate form with X button', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('Delegate Task'));
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('Describe the task for the sub-agent...')
      ).toBeInTheDocument();
    });
    // Click the header "Delegate Task" button again to toggle off
    const delegateBtns = screen.getAllByText('Delegate Task');
    // The first one is the header button
    await user.click(delegateBtns[0]);
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText('Describe the task for the sub-agent...')
      ).not.toBeInTheDocument();
    });
  });

  // ── Profiles tab — new profile form ──────────────────────────────

  it('opens new profile form when New Profile is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('Profiles'));
    await screen.findByText('New Profile');
    await user.click(screen.getByText('New Profile'));
    await waitFor(() => {
      expect(screen.getByText('New Agent Profile')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g. reviewer')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('What this agent specializes in')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('You are a...')).toBeInTheDocument();
    });
  });

  it('shows max token budget field in new profile form', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('Profiles'));
    await screen.findByText('New Profile');
    await user.click(screen.getByText('New Profile'));
    await waitFor(() => {
      expect(screen.getByText('Max Token Budget')).toBeInTheDocument();
      expect(screen.getByDisplayValue('50000')).toBeInTheDocument();
    });
  });

  it('shows allowed tools textarea in new profile form', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('Profiles'));
    await screen.findByText('New Profile');
    await user.click(screen.getByText('New Profile'));
    await waitFor(() => {
      expect(screen.getByText('Allowed Tools')).toBeInTheDocument();
    });
  });

  it('Create button disabled when name and prompt are empty', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('Profiles'));
    await screen.findByText('New Profile');
    await user.click(screen.getByText('New Profile'));
    await waitFor(() => {
      expect(screen.getByText('Create').closest('button')).toBeDisabled();
    });
  });

  // ── Profile details ────────────────────────────────────────────

  it('shows token budget and model on profile cards', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('Profiles'));
    await waitFor(() => {
      expect(screen.getByText('50,000 tokens')).toBeInTheDocument();
      expect(screen.getByText('Model: gpt-4')).toBeInTheDocument();
    });
  });

  it('shows "All tools" for profiles with empty allowedTools', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('Profiles'));
    await waitFor(() => {
      expect(screen.getByText('All tools')).toBeInTheDocument();
    });
  });

  it('shows tool pattern count for profiles with specific tools', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('Profiles'));
    await waitFor(() => {
      expect(screen.getByText('1 tool pattern')).toBeInTheDocument();
    });
  });

  // ── Active delegation details ──────────────────────────────────

  it('shows elapsed time for active delegation', async () => {
    renderComponent();
    await screen.findByText('researcher');
    expect(screen.getByText('30s')).toBeInTheDocument();
  });

  // ── History tab — status filter ────────────────────────────────

  it('shows status filter dropdown in history tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('History'));
    await waitFor(() => {
      expect(screen.getByText('All statuses')).toBeInTheDocument();
    });
  });

  it('shows token count in history items', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('History'));
    await waitFor(() => {
      expect(screen.getByText('7,000 tokens')).toBeInTheDocument();
    });
  });

  // ── Empty active delegations with profiles ─────────────────────

  it('shows profile shortcuts in empty active delegations state', async () => {
    mockFetchActiveDelegations.mockResolvedValue({ delegations: [] });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('No active delegations')).toBeInTheDocument();
    });
    // Should show buttons for first 4 profiles
    expect(screen.getAllByText('researcher').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('coder').length).toBeGreaterThanOrEqual(1);
  });

  // ── Description text ───────────────────────────────────────────

  it('shows swarm description text', async () => {
    renderComponent();
    await screen.findByText('Active');
    expect(screen.getByText(/Swarm infers task complexity/)).toBeInTheDocument();
  });

  // ── Skills section on profiles ─────────────────────────────────

  it('shows Skills section on profile cards', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('Profiles'));
    await waitFor(() => {
      const skillsBtns = screen.getAllByText(/Skills \(\d+\)/);
      expect(skillsBtns.length).toBeGreaterThan(0);
    });
  });

  // ── Delete profile ─────────────────────────────────────────────

  it('calls deleteAgentProfile when delete button is clicked on non-builtin profile', async () => {
    const user = userEvent.setup();
    mockDeleteAgentProfile.mockResolvedValue(undefined as never);
    renderComponent();
    await screen.findByText('Active');
    await user.click(screen.getByText('Profiles'));
    await screen.findByText('coder');
    const deleteBtn = screen.getByTitle('Delete profile');
    await user.click(deleteBtn);
    await waitFor(() => {
      expect(mockDeleteAgentProfile).toHaveBeenCalled();
    });
  });
});
