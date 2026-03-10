// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PersonalityEditor, PersonalityView } from './PersonalityEditor';
import { createSoulConfig } from '../test/mocks';

// ── Capture navigate calls ──────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Mock API client ─────────────────────────────────────────────────

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchPersonalities: vi.fn(),
    createPersonality: vi.fn(),
    updatePersonality: vi.fn(),
    deletePersonality: vi.fn(),
    activatePersonality: vi.fn(),
    enablePersonality: vi.fn(),
    disablePersonality: vi.fn(),
    setDefaultPersonality: vi.fn(),
    clearDefaultPersonality: vi.fn(),
    fetchPromptPreview: vi.fn(),
    fetchModelInfo: vi.fn(),
    fetchPassions: vi.fn(),
    createPassion: vi.fn(),
    deletePassion: vi.fn(),
    fetchInspirations: vi.fn(),
    createInspiration: vi.fn(),
    deleteInspiration: vi.fn(),
    fetchPains: vi.fn(),
    createPainEntry: vi.fn(),
    deletePain: vi.fn(),
    fetchKnowledge: vi.fn(),
    learnKnowledge: vi.fn(),
    updateKnowledge: vi.fn(),
    deleteKnowledge: vi.fn(),
    fetchHeartbeatTasks: vi.fn(),
    updateHeartbeatTask: vi.fn(),
    fetchExternalSyncStatus: vi.fn(),
    fetchExternalBrainConfig: vi.fn(),
    updateExternalBrainConfig: vi.fn(),
    triggerExternalSync: vi.fn(),
    fetchSkills: vi.fn(),
    fetchMcpConfig: vi.fn(),
    fetchSecurityPolicy: vi.fn(),
    fetchSoulConfig: vi.fn(),
    getAccessToken: vi.fn().mockReturnValue(null),
  };
});

// Stub WebSocket so useCollabEditor doesn't try to open real sockets in tests
vi.stubGlobal(
  'WebSocket',
  class {
    static OPEN = 1;
    static CLOSED = 3;
    binaryType = 'arraybuffer';
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: (() => void) | null = null;
    send() {}
    close() {
      this.onclose?.();
    }
  }
);

import * as api from '../api/client';

const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);
const mockFetchSkills = vi.mocked(api.fetchSkills);
const mockFetchKnowledge = vi.mocked(api.fetchKnowledge);
const mockFetchExternalSyncStatus = vi.mocked(api.fetchExternalSyncStatus);
const mockFetchExternalBrainConfig = vi.mocked(api.fetchExternalBrainConfig);
const mockFetchPassions = vi.mocked(api.fetchPassions);
const mockFetchSoulConfig = vi.mocked(api.fetchSoulConfig);
const mockSetDefaultPersonality = vi.mocked(api.setDefaultPersonality);
const mockClearDefaultPersonality = vi.mocked(api.clearDefaultPersonality);
const mockFetchInspirations = vi.mocked(api.fetchInspirations);
const mockFetchPains = vi.mocked(api.fetchPains);
const mockFetchHeartbeatTasks = vi.mocked(api.fetchHeartbeatTasks);
const mockFetchModelInfo = vi.mocked(api.fetchModelInfo);
const mockFetchMcpConfig = vi.mocked(api.fetchMcpConfig);
const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);

// ── Helpers ─────────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <PersonalityEditor />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const MOCK_PERSONALITY = {
  id: 'p1',
  name: 'TestPersonality',
  description: 'A test personality',
  systemPrompt: '',
  traits: { formality: 'balanced', humor: 'dry', verbosity: 'concise' },
  sex: 'unspecified' as const,
  voice: '',
  preferredLanguage: '',
  defaultModel: null,
  modelFallbacks: [],
  includeArchetypes: true,
  injectDateTime: false,
  empathyResonance: false,
  avatarUrl: null,
  isActive: false,
  isDefault: false,
  body: {
    enabled: false,
    capabilities: [],
    heartEnabled: true,
    creationConfig: {
      skills: false,
      tasks: false,
      personalities: false,
      subAgents: false,
      customRoles: false,
      experiments: false,
    },
    proactiveConfig: {},
    mcpFeatures: {},
    integrations: [],
    mcpServers: [],
    securityPolicyId: null,
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const DEFAULT_SKILL = {
  id: 's1',
  name: 'TestSkill',
  description: 'A skill',
  instructions: '',
  tools: [],
  triggerPatterns: [],
  enabled: true,
  source: 'user' as const,
  status: 'active' as const,
  usageCount: 0,
  lastUsedAt: null,
  personalityId: 'p1',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// ── beforeEach ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  mockNavigate.mockReset();
  mockFetchPersonalities.mockResolvedValue({ personalities: [] });
  mockFetchSoulConfig.mockResolvedValue(createSoulConfig());
  mockSetDefaultPersonality.mockResolvedValue({ personality: MOCK_PERSONALITY as never });
  mockClearDefaultPersonality.mockResolvedValue({ success: true });
  mockFetchSkills.mockResolvedValue({ skills: [] });
  mockFetchKnowledge.mockResolvedValue({ knowledge: [] });
  mockFetchExternalSyncStatus.mockResolvedValue({ configured: false });
  mockFetchExternalBrainConfig.mockResolvedValue({ configured: false });
  mockFetchPassions.mockResolvedValue({ passions: [] });
  mockFetchInspirations.mockResolvedValue({ inspirations: [] });
  mockFetchPains.mockResolvedValue({ pains: [] });
  mockFetchHeartbeatTasks.mockResolvedValue({ tasks: [] });
  mockFetchModelInfo.mockResolvedValue({ models: [] } as any);
  mockFetchMcpConfig.mockResolvedValue({} as any);
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

// ── Tests ───────────────────────────────────────────────────────────

describe('PersonalityEditor', () => {
  it('renders personality list without crashing', async () => {
    renderComponent();
    expect(await screen.findByText('Personalities')).toBeInTheDocument();
  });

  it('clicking Edit opens editing form for a personality', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    await waitFor(() => {
      expect(screen.getByDisplayValue(MOCK_PERSONALITY.name)).toBeInTheDocument();
    });
  });

  it('Brain section shows skills for the personality', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    mockFetchSkills.mockResolvedValue({ skills: [DEFAULT_SKILL] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    // Open Brain section
    const brainHeader = await screen.findByText('Brain - Intellect');
    await user.click(brainHeader);

    // Open Skills sub-section
    const skillsHeader = await screen.findByText('Skills');
    await user.click(skillsHeader);

    expect(await screen.findByText(DEFAULT_SKILL.name)).toBeInTheDocument();
  });

  it('Brain section shows empty state when no skills are associated', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    mockFetchSkills.mockResolvedValue({
      skills: [{ ...DEFAULT_SKILL, personalityId: 'other-id' }],
    });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    const brainHeader = await screen.findByText('Brain - Intellect');
    await user.click(brainHeader);

    const skillsHeader = await screen.findByText('Skills');
    await user.click(skillsHeader);

    expect(
      await screen.findByText(/No skills are associated with this personality yet\./)
    ).toBeInTheDocument();
    expect(screen.getByText('Skills Marketplace')).toBeInTheDocument();
  });

  it('Brain section shows Community link when allowCommunityGitFetch is enabled', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    mockFetchSkills.mockResolvedValue({
      skills: [{ ...DEFAULT_SKILL, personalityId: 'other-id' }],
    });
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
      allowCommunityGitFetch: true,
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
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    const brainHeader = await screen.findByText('Brain - Intellect');
    await user.click(brainHeader);

    const skillsHeader = await screen.findByText('Skills');
    await user.click(skillsHeader);

    expect(screen.getByText('Skills Marketplace')).toBeInTheDocument();
    expect(screen.getByText('Community')).toBeInTheDocument();
  });

  it('Active Hours section appears inside Brain section', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    // Open Brain section
    const brainHeader = await screen.findByText('Brain - Intellect');
    await user.click(brainHeader);

    // Active Hours should be visible inside the Brain section
    expect(await screen.findByText('Active Hours')).toBeInTheDocument();
  });

  it('Active Hours toggle enables time fields', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    const brainHeader = await screen.findByText('Brain - Intellect');
    await user.click(brainHeader);

    const activeHoursHeader = await screen.findByText('Active Hours');
    await user.click(activeHoursHeader);

    // Time inputs should not be visible before enabling
    expect(screen.queryByLabelText(/Start/)).not.toBeInTheDocument();

    // Toggle enable
    const toggle = await screen.findByRole('checkbox', { name: /enable active hours/i });
    await user.click(toggle);

    // Time inputs should now appear
    expect(await screen.findByText('Start (UTC)')).toBeInTheDocument();
    expect(screen.getByText('End (UTC)')).toBeInTheDocument();
  });

  it('clicking Edit on a skill navigates with openSkillId state', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    mockFetchSkills.mockResolvedValue({ skills: [DEFAULT_SKILL] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    const brainHeader = await screen.findByText('Brain - Intellect');
    await user.click(brainHeader);

    const skillsHeader = await screen.findByText('Skills');
    await user.click(skillsHeader);

    const skillEditBtn = await screen.findByTitle('Edit skill');
    await user.click(skillEditBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/skills', {
      state: { openSkillId: DEFAULT_SKILL.id },
    });
  });
});

// ── Resources "Enable all" + A2A/Swarms policy gating ────────────────
// Opens Body > Resources > Orchestration so both the "Enable all" toggle
// (at the Resources level) and the Orchestration items are reachable.

async function openResourcesOrchestration(user: ReturnType<typeof userEvent.setup>) {
  const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
  await user.click(editBtn);
  const bodyHeader = await screen.findByText('Body - Endowments');
  await user.click(bodyHeader);
  const resourcesHeader = await screen.findByText('Resources');
  await user.click(resourcesHeader);
  const orchestrationHeader = await screen.findByText('Orchestration');
  await user.click(orchestrationHeader);
}

describe('PersonalityEditor — Resources "Enable all" A2A/Swarms gating', () => {
  it('enables A2A when policy allows it and "Enable all" is clicked', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: true,
      allowA2A: true,
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
    const user = userEvent.setup();
    renderComponent();
    await openResourcesOrchestration(user);

    const enableAllToggle = await screen.findByRole('checkbox', {
      name: /enable all orchestration/i,
    });
    await user.click(enableAllToggle);

    // Sub-Agent Delegation must be enabled before A2A sub-toggle appears
    const subAgentsToggle = await screen.findByRole('checkbox', { name: /sub-agent delegation/i });
    expect(subAgentsToggle).toBeChecked();

    // A2A Networks sub-toggle should now be checked
    const a2aToggle = await screen.findByRole('checkbox', { name: /a2a networks/i });
    expect(a2aToggle).toBeChecked();
  });

  it('enables Agent Swarms when policy allows it and "Enable all" is clicked', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: true,
      allowA2A: false,
      allowSwarms: true,
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
    const user = userEvent.setup();
    renderComponent();
    await openResourcesOrchestration(user);

    const enableAllToggle = await screen.findByRole('checkbox', {
      name: /enable all orchestration/i,
    });
    await user.click(enableAllToggle);

    const swarmsToggle = await screen.findByRole('checkbox', { name: /agent swarms/i });
    expect(swarmsToggle).toBeChecked();
  });

  it('does NOT enable A2A when policy blocks it even if "Enable all" is clicked', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: true,
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
    const user = userEvent.setup();
    renderComponent();
    await openResourcesOrchestration(user);

    const enableAllToggle = await screen.findByRole('checkbox', {
      name: /enable all orchestration/i,
    });
    await user.click(enableAllToggle);

    const a2aToggle = await screen.findByRole('checkbox', { name: /a2a networks/i });
    expect(a2aToggle).not.toBeChecked();
  });

  it('does NOT enable Agent Swarms when policy blocks it even if "Enable all" is clicked', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: true,
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
    const user = userEvent.setup();
    renderComponent();
    await openResourcesOrchestration(user);

    const enableAllToggle = await screen.findByRole('checkbox', {
      name: /enable all orchestration/i,
    });
    await user.click(enableAllToggle);

    const swarmsToggle = await screen.findByRole('checkbox', { name: /agent swarms/i });
    expect(swarmsToggle).not.toBeChecked();
  });
});

// ── Protostasis toggle ───────────────────────────────────────────────

describe('PersonalityEditor — default personality toggle', () => {
  it('default toggle is unchecked and enabled for a non-default personality', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    const toggle = await screen.findByRole('checkbox', { name: /default personality/i });
    expect(toggle).not.toBeChecked();
    expect(toggle).not.toBeDisabled();
  });

  it('default toggle is checked and enabled for a default personality (can be unchecked)', async () => {
    const defaultPersonality = { ...MOCK_PERSONALITY, isDefault: true };
    mockFetchPersonalities.mockResolvedValue({ personalities: [defaultPersonality] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${defaultPersonality.name}`);
    await user.click(editBtn);

    const toggle = await screen.findByRole('checkbox', { name: /default personality/i });
    expect(toggle).toBeChecked();
    expect(toggle).not.toBeDisabled();
  });

  it('unchecking default toggle calls clearDefaultPersonality', async () => {
    const defaultPersonality = { ...MOCK_PERSONALITY, isDefault: true };
    mockFetchPersonalities.mockResolvedValue({ personalities: [defaultPersonality] });
    mockClearDefaultPersonality.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${defaultPersonality.name}`);
    await user.click(editBtn);

    const toggle = await screen.findByRole('checkbox', { name: /default personality/i });
    expect(toggle).toBeChecked();

    await user.click(toggle);

    await waitFor(() => {
      expect(mockClearDefaultPersonality).toHaveBeenCalled();
    });
  });
});

// ── Org Intent toggle in Brain section ──────────────────────────────

describe('PersonalityEditor — Organizational Intent toggle', () => {
  it.todo(
    'Org Intent shows not-enabled state when allowIntentEditor is off — needs collapsible section test fix'
  );

  it('Org Intent toggle is enabled when both allowOrgIntent and exposeOrgIntentTools are true', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
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
      allowOrgIntent: true,
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
    mockFetchMcpConfig.mockResolvedValue({ exposeOrgIntentTools: true } as any);

    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    const brainHeader = await screen.findByText('Brain - Intellect');
    await user.click(brainHeader);

    const toggle = await screen.findByRole('checkbox', { name: /organizational intent signal/i });
    expect(toggle).not.toBeDisabled();
    expect(
      screen.getByText('Allow this personality to read live org intent signals')
    ).toBeInTheDocument();
  });

  // ── Phase 119: New Brain Section Controls ─────────────────────

  it('shows reasoning effort presets in Brain section', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    const brainHeader = await screen.findByText('Brain - Intellect');
    await user.click(brainHeader);

    const reasoningHeader = await screen.findByText('Reasoning Effort');
    await user.click(reasoningHeader);

    expect(screen.getByText(/Controls OpenAI reasoning effort/)).toBeInTheDocument();
    expect(screen.getByText('Enable reasoning effort')).toBeInTheDocument();
  });

  it('shows cost budget inputs in Brain section', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    const brainHeader = await screen.findByText('Brain - Intellect');
    await user.click(brainHeader);

    const costHeader = await screen.findByText('Cost Budget');
    await user.click(costHeader);

    expect(screen.getByText('Daily limit (USD)')).toBeInTheDocument();
    expect(screen.getByText('Monthly limit (USD)')).toBeInTheDocument();
  });

  it('shows context overflow strategy selector in Brain section', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    const brainHeader = await screen.findByText('Brain - Intellect');
    await user.click(brainHeader);

    const overflowHeader = await screen.findByText('Context Overflow');
    await user.click(overflowHeader);

    expect(screen.getByText('Summarise')).toBeInTheDocument();
    expect(screen.getByText('Truncate')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });
});

describe('PersonalityEditor — delete button', () => {
  it('delete button is enabled for non-active, non-archetype personality', async () => {
    const personality = {
      ...MOCK_PERSONALITY,
      isActive: false,
      isDefault: false,
    };
    mockFetchPersonalities.mockResolvedValue({ personalities: [personality] });
    renderComponent();
    const deleteBtn = await screen.findByLabelText(`Delete personality ${personality.name}`);
    expect(deleteBtn).not.toBeDisabled();
  });

  it('delete button is enabled for default but non-active personality', async () => {
    const personality = {
      ...MOCK_PERSONALITY,
      isActive: false,
      isDefault: true,
    };
    mockFetchPersonalities.mockResolvedValue({ personalities: [personality] });
    renderComponent();
    const deleteBtn = await screen.findByLabelText(`Delete personality ${personality.name}`);
    expect(deleteBtn).not.toBeDisabled();
  });

  it('delete button is disabled for active personality', async () => {
    const personality = {
      ...MOCK_PERSONALITY,
      isActive: true,
      isDefault: false,
    };
    mockFetchPersonalities.mockResolvedValue({ personalities: [personality] });
    renderComponent();
    const deleteBtn = await screen.findByLabelText(
      'Cannot delete active personality — deactivate first'
    );
    expect(deleteBtn).toBeDisabled();
  });
});

describe('PersonalityEditor — Disposition', () => {
  it('shows core traits (formality, humor, verbosity) by default', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    // Soul section is defaultOpen — wait for it to render
    await screen.findByText('Soul — Essence');

    // Core traits visible
    expect(screen.getByText('Formality')).toBeInTheDocument();
    expect(screen.getByText('Humor')).toBeInTheDocument();
    expect(screen.getByText('Verbosity')).toBeInTheDocument();

    // Core options visible
    expect(screen.getByText('casual')).toBeInTheDocument();
    expect(screen.getByText('formal')).toBeInTheDocument();
    expect(screen.getByText('witty')).toBeInTheDocument();
  });

  it('shows Advanced traits toggle', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    // Soul section is defaultOpen — wait for it to render
    await screen.findByText('Soul — Essence');

    expect(screen.getByText('Advanced traits')).toBeInTheDocument();
  });

  it('expanding Advanced traits reveals emotional, cognitive, professional categories', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    // Soul section is defaultOpen — wait for it to render
    await screen.findByText('Soul — Essence');

    // Advanced traits hidden initially
    expect(screen.queryByText('Warmth')).not.toBeInTheDocument();

    // Expand advanced
    await user.click(screen.getByText('Advanced traits'));

    // Category headers
    expect(screen.getByText('Emotional')).toBeInTheDocument();
    expect(screen.getByText('Cognitive')).toBeInTheDocument();
    expect(screen.getByText('Professional')).toBeInTheDocument();

    // Advanced trait labels
    expect(screen.getByText('Warmth')).toBeInTheDocument();
    expect(screen.getByText('Creativity')).toBeInTheDocument();
    expect(screen.getByText('Autonomy')).toBeInTheDocument();
    expect(screen.getByText('Directness')).toBeInTheDocument();
  });

  it('can select an advanced trait option', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    // Soul section is defaultOpen — wait for it to render
    await screen.findByText('Soul — Essence');

    await user.click(screen.getByText('Advanced traits'));

    // Select "effusive" for warmth
    const effusiveBtn = screen.getByText('effusive');
    await user.click(effusiveBtn);
    expect(effusiveBtn).toHaveClass('bg-primary');
  });

  it('shows Custom trait section with add inputs', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    // Soul section is defaultOpen — wait for it to render
    await screen.findByText('Soul — Essence');

    await user.click(screen.getByText('Advanced traits'));

    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('trait name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('value')).toBeInTheDocument();
    expect(screen.getByText('+ Add')).toBeInTheDocument();
  });
});

describe('PersonalityEditor — personality list cards', () => {
  it('shows description on personality card', async () => {
    const withDesc = { ...MOCK_PERSONALITY, description: 'My test assistant personality' };
    mockFetchPersonalities.mockResolvedValue({ personalities: [withDesc] });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('My test assistant personality')).toBeInTheDocument();
    });
  });

  it('shows trait tags on personality card', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('formality: balanced')).toBeInTheDocument();
      expect(screen.getByText('humor: dry')).toBeInTheDocument();
    });
    // Should show +1 for the third trait
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('shows sex badge when not unspecified', async () => {
    const withSex = { ...MOCK_PERSONALITY, sex: 'female' as const };
    mockFetchPersonalities.mockResolvedValue({ personalities: [withSex] });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('female')).toBeInTheDocument();
    });
  });

  it('shows model provider badge when defaultModel set', async () => {
    const withModel = {
      ...MOCK_PERSONALITY,
      defaultModel: { provider: 'anthropic', model: 'claude-3.5-sonnet' },
    };
    mockFetchPersonalities.mockResolvedValue({ personalities: [withModel] });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('anthropic')).toBeInTheDocument();
    });
  });

  it('shows empty state when no personalities exist', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('No personalities yet')).toBeInTheDocument();
      expect(screen.getByText('Create your first personality to get started')).toBeInTheDocument();
    });
  });

  it('shows Preview Prompt button on personality card', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Preview Prompt')).toBeInTheDocument();
    });
  });

  it('shows export button on personality card', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    renderComponent();
    await waitFor(() => {
      expect(
        screen.getByLabelText(`Export personality ${MOCK_PERSONALITY.name}`)
      ).toBeInTheDocument();
    });
  });

  it('shows enable button for disabled personality', async () => {
    const disabled = { ...MOCK_PERSONALITY, isActive: false, enabled: false };
    mockFetchPersonalities.mockResolvedValue({ personalities: [disabled] });
    renderComponent();
    await waitFor(() => {
      expect(
        screen.getByLabelText(`Enable personality ${MOCK_PERSONALITY.name}`)
      ).toBeInTheDocument();
    });
  });

  it('shows Spirit - Pathos section in editor', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    await screen.findByText('Soul — Essence');
    expect(screen.getByText('Spirit - Pathos')).toBeInTheDocument();
  });

  it('shows Spirit section with Passions, Inspirations and Pain Points', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    await screen.findByText('Spirit - Pathos');
    await user.click(screen.getByText('Spirit - Pathos'));

    await waitFor(() => {
      expect(screen.getByText('Passions')).toBeInTheDocument();
      expect(screen.getByText('Inspirations')).toBeInTheDocument();
      expect(screen.getByText('Pain Points')).toBeInTheDocument();
    });
  });

  it('shows Morphogenesis and Empathy Resonance toggles in Spirit section', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    await screen.findByText('Spirit - Pathos');
    await user.click(screen.getByText('Spirit - Pathos'));

    await waitFor(() => {
      expect(screen.getByText('Morphogenesis')).toBeInTheDocument();
      expect(screen.getByText('Empathy Resonance')).toBeInTheDocument();
    });
  });

  it('shows Brain section thinking controls', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    const brainHeader = await screen.findByText('Brain - Intellect');
    await user.click(brainHeader);

    await waitFor(() => {
      expect(screen.getByText('Omnipresent Mind')).toBeInTheDocument();
      expect(screen.getByText('System Prompt Confidentiality')).toBeInTheDocument();
      expect(screen.getByText('Knowledge Retrieval Mode')).toBeInTheDocument();
      expect(screen.getByText('Chronoception')).toBeInTheDocument();
    });
  });

  it('shows knowledge retrieval mode buttons (RAG, Notebook, Hybrid)', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    const brainHeader = await screen.findByText('Brain - Intellect');
    await user.click(brainHeader);

    await waitFor(() => {
      expect(screen.getByText('RAG')).toBeInTheDocument();
      expect(screen.getByText('Notebook')).toBeInTheDocument();
      expect(screen.getByText('Hybrid')).toBeInTheDocument();
    });
  });

  it('shows Default Model selector in Brain section', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    mockFetchModelInfo.mockResolvedValue({
      available: {
        anthropic: [{ model: 'claude-3.5-sonnet' }],
        openai: [{ model: 'gpt-4o' }],
      },
    } as any);
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    const brainHeader = await screen.findByText('Brain - Intellect');
    await user.click(brainHeader);

    await waitFor(() => {
      expect(screen.getByText('Default Model')).toBeInTheDocument();
      expect(screen.getByText('Use system default')).toBeInTheDocument();
    });
  });

  it('shows Model Fallbacks section in Brain', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    const user = userEvent.setup();
    renderComponent();

    const editBtn = await screen.findByLabelText(`Edit personality ${MOCK_PERSONALITY.name}`);
    await user.click(editBtn);

    const brainHeader = await screen.findByText('Brain - Intellect');
    await user.click(brainHeader);

    await waitFor(() => {
      expect(screen.getByText('Model Fallbacks')).toBeInTheDocument();
      expect(screen.getByText(/Ordered list of fallback models/)).toBeInTheDocument();
    });
  });
});

// ── PersonalityView tests ──────────────────────────────────────────────

const mockPromptPreview = vi.mocked(api.fetchPromptPreview);

function renderPersonalityView() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <PersonalityView />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('PersonalityView', () => {
  it('renders the personalities heading and subtitle', async () => {
    renderPersonalityView();
    expect(await screen.findByText('Personalities')).toBeInTheDocument();
    expect(screen.getByText('Define the agents that power your assistant')).toBeInTheDocument();
  });

  it('shows New Personality button', async () => {
    renderPersonalityView();
    expect(await screen.findByText('New Personality')).toBeInTheDocument();
  });

  it('shows loading state', async () => {
    mockFetchPersonalities.mockReturnValue(new Promise(() => {}));
    renderPersonalityView();
    expect(await screen.findByText('Loading...')).toBeInTheDocument();
  });

  it('shows empty state when no personalities', async () => {
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByText('No personalities yet')).toBeInTheDocument();
      expect(screen.getByText('Create your first personality to get started')).toBeInTheDocument();
    });
  });

  it('renders personality cards with name', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByText(MOCK_PERSONALITY.name)).toBeInTheDocument();
    });
  });

  it('shows Active badge on active personality', async () => {
    const active = { ...MOCK_PERSONALITY, isActive: true };
    mockFetchPersonalities.mockResolvedValue({ personalities: [active] });
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });
  });

  it('shows Default badge on default personality', async () => {
    const defaultP = { ...MOCK_PERSONALITY, isDefault: true };
    mockFetchPersonalities.mockResolvedValue({ personalities: [defaultP] });
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByText('Default')).toBeInTheDocument();
    });
  });

  it('shows description on personality card', async () => {
    const withDesc = { ...MOCK_PERSONALITY, description: 'A powerful assistant' };
    mockFetchPersonalities.mockResolvedValue({ personalities: [withDesc] });
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByText('A powerful assistant')).toBeInTheDocument();
    });
  });

  it('shows trait tags on personality card', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByText('formality: balanced')).toBeInTheDocument();
      expect(screen.getByText('humor: dry')).toBeInTheDocument();
    });
  });

  it('shows +N for additional traits beyond 2', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByText('+1')).toBeInTheDocument();
    });
  });

  it('shows sex badge when not unspecified', async () => {
    const withSex = { ...MOCK_PERSONALITY, sex: 'male' as const };
    mockFetchPersonalities.mockResolvedValue({ personalities: [withSex] });
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByText('male')).toBeInTheDocument();
    });
  });

  it('shows model provider badge when defaultModel set', async () => {
    const withModel = {
      ...MOCK_PERSONALITY,
      defaultModel: { provider: 'openai', model: 'gpt-4o' },
    };
    mockFetchPersonalities.mockResolvedValue({ personalities: [withModel] });
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByText('openai')).toBeInTheDocument();
    });
  });

  it('shows Preview Prompt button', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByText('Preview Prompt')).toBeInTheDocument();
    });
  });

  it('shows prompt preview when Preview Prompt clicked', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    mockPromptPreview.mockResolvedValue({
      prompt: 'You are a test assistant',
      charCount: 25,
      estimatedTokens: 7,
      tools: [],
    } as any);
    const user = userEvent.setup();
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByText('Preview Prompt')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Preview Prompt'));
    await waitFor(() => {
      expect(screen.getByText('System Prompt Preview')).toBeInTheDocument();
      expect(screen.getByText('You are a test assistant')).toBeInTheDocument();
      expect(screen.getByText('25 chars')).toBeInTheDocument();
      expect(screen.getByText('~7 tokens')).toBeInTheDocument();
    });
  });

  it('toggles prompt preview off with Hide Preview', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    mockPromptPreview.mockResolvedValue({
      prompt: 'You are a test assistant',
      charCount: 25,
      estimatedTokens: 7,
      tools: [],
    } as any);
    const user = userEvent.setup();
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByText('Preview Prompt')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Preview Prompt'));
    await waitFor(() => {
      expect(screen.getByText('Hide Preview')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Hide Preview'));
    await waitFor(() => {
      expect(screen.getByText('Preview Prompt')).toBeInTheDocument();
      expect(screen.queryByText('System Prompt Preview')).not.toBeInTheDocument();
    });
  });

  it('shows Enable button for disabled personality', async () => {
    const disabled = { ...MOCK_PERSONALITY, isActive: false };
    mockFetchPersonalities.mockResolvedValue({ personalities: [disabled] });
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByTitle(`Enable ${MOCK_PERSONALITY.name}`)).toBeInTheDocument();
    });
  });

  it('shows Disable button for active non-default personality', async () => {
    const active = { ...MOCK_PERSONALITY, isActive: true, isDefault: false };
    mockFetchPersonalities.mockResolvedValue({ personalities: [active] });
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByTitle(`Disable ${MOCK_PERSONALITY.name}`)).toBeInTheDocument();
    });
  });

  it('navigates to edit page when Edit clicked', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    const user = userEvent.setup();
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByTitle(`Edit ${MOCK_PERSONALITY.name}`)).toBeInTheDocument();
    });
    await user.click(screen.getByTitle(`Edit ${MOCK_PERSONALITY.name}`));
    expect(mockNavigate).toHaveBeenCalledWith(`/personality/${MOCK_PERSONALITY.id}/edit`);
  });

  it('navigates to new personality page when New clicked', async () => {
    const user = userEvent.setup();
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByText('New Personality')).toBeInTheDocument();
    });
    await user.click(screen.getByText('New Personality'));
    expect(mockNavigate).toHaveBeenCalledWith('/personality/new');
  });

  it('shows delete button disabled for active personality', async () => {
    const active = { ...MOCK_PERSONALITY, isActive: true };
    mockFetchPersonalities.mockResolvedValue({ personalities: [active] });
    renderPersonalityView();
    await waitFor(() => {
      const deleteBtn = screen.getByTitle('Deactivate this personality before deleting');
      expect(deleteBtn).toBeDisabled();
    });
  });

  it('shows delete button enabled for inactive personality', async () => {
    const inactive = { ...MOCK_PERSONALITY, isActive: false };
    mockFetchPersonalities.mockResolvedValue({ personalities: [inactive] });
    renderPersonalityView();
    await waitFor(() => {
      const deleteBtn = screen.getByTitle(`Delete ${MOCK_PERSONALITY.name}`);
      expect(deleteBtn).not.toBeDisabled();
    });
  });

  it('shows star button to set default for non-default personality', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByTitle(`Set ${MOCK_PERSONALITY.name} as default`)).toBeInTheDocument();
    });
  });

  it('shows star button to remove default for default personality', async () => {
    const defaultP = { ...MOCK_PERSONALITY, isDefault: true };
    mockFetchPersonalities.mockResolvedValue({ personalities: [defaultP] });
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByTitle('Remove as default')).toBeInTheDocument();
    });
  });

  it('renders multiple personalities', async () => {
    const p1 = { ...MOCK_PERSONALITY, id: 'p1', name: 'Alpha' };
    const p2 = { ...MOCK_PERSONALITY, id: 'p2', name: 'Beta', isActive: true };
    mockFetchPersonalities.mockResolvedValue({ personalities: [p1, p2] });
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });
  });

  it('shows prompt preview with tools count when tools exist', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
    mockPromptPreview.mockResolvedValue({
      prompt: 'System prompt here',
      charCount: 18,
      estimatedTokens: 5,
      tools: ['tool1', 'tool2', 'tool3'],
    } as any);
    const user = userEvent.setup();
    renderPersonalityView();
    await waitFor(() => {
      expect(screen.getByText('Preview Prompt')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Preview Prompt'));
    await waitFor(() => {
      expect(screen.getByText('3 tools')).toBeInTheDocument();
    });
  });
});
