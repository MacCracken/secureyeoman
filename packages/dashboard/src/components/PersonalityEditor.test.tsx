// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PersonalityEditor } from './PersonalityEditor';

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

vi.mock('../api/client', () => ({
  fetchPersonalities: vi.fn(),
  createPersonality: vi.fn(),
  updatePersonality: vi.fn(),
  deletePersonality: vi.fn(),
  activatePersonality: vi.fn(),
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
  getAccessToken: vi.fn().mockReturnValue(null),
}));

// Stub WebSocket so useCollabEditor doesn't try to open real sockets in tests
vi.stubGlobal('WebSocket', class {
  static OPEN = 1;
  static CLOSED = 3;
  binaryType = 'arraybuffer';
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  send() {}
  close() { this.onclose?.(); }
});

import * as api from '../api/client';

const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);
const mockFetchSkills = vi.mocked(api.fetchSkills);
const mockFetchKnowledge = vi.mocked(api.fetchKnowledge);
const mockFetchExternalSyncStatus = vi.mocked(api.fetchExternalSyncStatus);
const mockFetchExternalBrainConfig = vi.mocked(api.fetchExternalBrainConfig);
const mockFetchPassions = vi.mocked(api.fetchPassions);
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
  traits: { formality: 'balanced', humor: 'subtle', verbosity: 'concise' },
  sex: 'unspecified' as const,
  voice: '',
  preferredLanguage: '',
  defaultModel: null,
  modelFallbacks: [],
  includeArchetypes: true,
  isActive: false,
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
    allowDynamicTools: false,
    sandboxDynamicTools: false,
    allowAnomalyDetection: false,
    sandboxGvisor: false,
    sandboxWasm: false,
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
    expect(screen.getByText('Community')).toBeInTheDocument();
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
