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
  fetchMcpConfig: vi.fn(),
  fetchActivePersonality: vi.fn(),
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
  fetchMultimodalConfig: vi.fn(),
  // BrowserAutomationPage / WebPage dependencies
  fetchBrowserSessions: vi.fn(),
  closeBrowserSession: vi.fn(),
  updateMcpConfig: vi.fn(),
  // VectorMemoryExplorerPage dependencies
  fetchPersonalities: vi.fn(),
  fetchMemories: vi.fn(),
  fetchKnowledge: vi.fn(),
  searchSimilar: vi.fn(),
  addMemory: vi.fn(),
  deleteMemory: vi.fn(),
  deleteKnowledge: vi.fn(),
  reindexBrain: vi.fn(),
  // KnowledgeBaseTab dependencies (Phase 82)
  listDocuments: vi.fn().mockResolvedValue({ documents: [], total: 0 }),
  deleteDocument: vi.fn(),
  uploadDocument: vi.fn(),
  ingestUrl: vi.fn(),
  ingestText: vi.fn(),
  ingestGithubWiki: vi.fn(),
  fetchKnowledgeHealth: vi.fn().mockResolvedValue({
    totalDocuments: 0,
    totalChunks: 0,
    byFormat: {},
    recentQueryCount: 0,
    avgTopScore: null,
    lowCoverageQueries: 0,
  }),
  getAccessToken: vi.fn().mockReturnValue(null),
}));

import * as api from '../api/client';

const mockFetchAgentConfig = vi.mocked(api.fetchAgentConfig);
const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);
const mockFetchA2AConfig = vi.mocked(api.fetchA2AConfig);
const mockFetchActivePersonality = vi.mocked(api.fetchActivePersonality);
const mockFetchAgentProfiles = vi.mocked(api.fetchAgentProfiles);
const mockFetchActiveDelegations = vi.mocked(api.fetchActiveDelegations);
const mockFetchDelegations = vi.mocked(api.fetchDelegations);
const mockFetchA2APeers = vi.mocked(api.fetchA2APeers);
const mockFetchA2ACapabilities = vi.mocked(api.fetchA2ACapabilities);
const mockFetchA2AMessages = vi.mocked(api.fetchA2AMessages);
const mockFetchMultimodalJobs = vi.mocked(api.fetchMultimodalJobs);
const mockFetchBrowserSessions = vi.mocked(api.fetchBrowserSessions);
const mockFetchMemories = vi.mocked(api.fetchMemories);
const mockFetchKnowledge = vi.mocked(api.fetchKnowledge);

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
  allowSwarms: false,
  allowExtensions: false,
  allowExecution: true,
  allowProactive: false,
  allowExperiments: false,
  allowStorybook: false,
  allowMultimodal: true,
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
    mockFetchActivePersonality.mockResolvedValue({
      personality: null,
    });
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
    vi.mocked(api.fetchMultimodalConfig).mockResolvedValue({
      enabled: true,
      providers: {
        tts: { active: 'openai', available: ['openai'] },
        stt: { active: 'openai', available: ['openai'] },
      },
    });
    // BrowserAutomationPage data
    mockFetchBrowserSessions.mockResolvedValue({ sessions: [], total: 0 });
    // VectorMemoryExplorerPage data
    vi.mocked(api.fetchPersonalities).mockResolvedValue({ personalities: [] });
    mockFetchMemories.mockResolvedValue({ memories: [] });
    mockFetchKnowledge.mockResolvedValue({ knowledge: [] });
  });

  // ── Header ──────────────────────────────────────────────────

  it('renders the Agents heading', async () => {
    renderComponent();
    expect(await screen.findByText('Agents')).toBeInTheDocument();
  });

  it('renders the page description in the multi-tab view', async () => {
    renderComponent();
    // Wait for page to settle (multiple tabs visible)
    await screen.findByText('Multimodal');
    expect(
      screen.getByText('Sub-agent delegation, A2A networking, multimodal tools, and vector memory')
    ).toBeInTheDocument();
  });

  it('renders the page description in the single-tab view', async () => {
    // Only Vector Memory is always enabled; disable all others
    mockFetchSecurityPolicy.mockResolvedValue({
      ...DEFAULT_POLICY,
      allowSubAgents: false,
      allowA2A: false,
      allowMultimodal: false,
      allowDesktopControl: false,
      allowCamera: false,
    });
    mockFetchAgentConfig.mockResolvedValue({
      config: { enabled: false },
      allowedBySecurityPolicy: false,
    });
    mockFetchA2AConfig.mockResolvedValue({ config: { enabled: false } });
    renderComponent();
    // Single section — description still rendered in the wrapper
    await screen.findByText('Agents');
    expect(
      screen.getByText('Sub-agent delegation, A2A networking, multimodal tools, and vector memory')
    ).toBeInTheDocument();
  });

  // ── Tab Visibility ──────────────────────────────────────────

  it('shows core tabs when features are enabled', async () => {
    renderComponent();
    expect(await screen.findByText('Multimodal')).toBeInTheDocument();
    expect(screen.getByText('Swarm')).toBeInTheDocument();
    expect(screen.getByText('A2A Network')).toBeInTheDocument();
    expect(screen.getByText('Vector Memory')).toBeInTheDocument();
  });

  it('shows Web tab when personality has web MCP features', async () => {
    mockFetchActivePersonality.mockResolvedValue({
      personality: {
        id: 'p1',
        name: 'Test',
        isActive: true,
        body: { mcpFeatures: { exposeBrowser: true } },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as any,
    });
    renderComponent();
    expect(await screen.findByText('Web')).toBeInTheDocument();
  });

  it('hides Web tab when personality has no web MCP features', async () => {
    mockFetchActivePersonality.mockResolvedValue({
      personality: {
        id: 'p1',
        name: 'Test',
        isActive: true,
        body: { mcpFeatures: { exposeGit: true } },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as any,
    });
    renderComponent();
    expect(await screen.findByText('Multimodal')).toBeInTheDocument();
    expect(screen.queryByText('Web')).not.toBeInTheDocument();
  });

  it('hides Multimodal tab when allowMultimodal is false', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      ...DEFAULT_POLICY,
      allowMultimodal: false,
      allowDesktopControl: false,
      allowCamera: false,
    });
    renderComponent();
    expect(await screen.findByText('Swarm')).toBeInTheDocument();
    expect(screen.queryByText('Multimodal')).not.toBeInTheDocument();
  });

  it('hides Swarm tab when sub-agents are disabled', async () => {
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
    expect(screen.queryByText('Swarm')).not.toBeInTheDocument();
  });

  it('hides A2A tab when A2A is disabled', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      ...DEFAULT_POLICY,
      allowA2A: false,
    });
    mockFetchA2AConfig.mockResolvedValue({ config: { enabled: false } });
    renderComponent();
    expect(await screen.findByText('Swarm')).toBeInTheDocument();
    expect(screen.queryByText('A2A Network')).not.toBeInTheDocument();
  });

  // ── Tab Switching ───────────────────────────────────────────

  it('defaults to Vector Memory tab', async () => {
    renderComponent();
    // Vector Memory tab is the default — check for Semantic Search
    expect((await screen.findAllByText('Semantic Search')).length).toBeGreaterThan(0);
  });

  it('switches to Multimodal tab on click', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Swarm');
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

  it('switches to Vector Memory tab on click', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Vector Memory');
    await user.click(screen.getByText('Vector Memory'));
    expect((await screen.findAllByText('Semantic Search')).length).toBeGreaterThan(0);
  });
});
